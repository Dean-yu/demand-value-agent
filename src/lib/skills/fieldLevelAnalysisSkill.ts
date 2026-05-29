import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  EvaluationTask,
  FieldLevelAnalysisOutput,
  HistoricalLabelRecord,
  JudgeField,
  RuleJudgabilityOutput,
  TaskGoalOutput,
  TaskType
} from "../agent/types";

const SKILL_NAME = "field_level_analysis";

/**
 * Skill 3.5：题目级 AI vs 人工拆分
 *
 * 这里的"题目"指的是 **本次任务需要给出判定/标注的维度**，
 * 不是送审样本的原始数据字段（如 title/image/price）。
 *
 * 来源（按优先级）：
 *   1) ruleJudgability 的 machine / ai / human 三类规则要点 → 每条 = 一个题目
 *   2) historicalLabels 的标签空间 → 兜底题目（任务类型 + 标签集）
 *   3) 任务类型 + demandDescription 推断的固定题目集
 *
 * LLM 用来润色 reason；难度 / AI 能力 / 承接方式仍以 TS 启发式为骨架。
 */
export const fieldLevelAnalysisSkill: SkillModule<FieldLevelAnalysisOutput> = {
  name: SKILL_NAME,
  title: "题目级 AI/人工拆分",
  description: "从规则与标签空间识别本次任务需要判定的题目，逐题评估 AI 能力与人工必要性",
  inputSchema:
    "{ ruleJudgability, taskGoal, historicalLabels, task.taskType, task.demandDescription }",
  outputSchema: `{
  fields: [{ name, difficulty, aiCapability, suggestedFlow, estimatedHumanRatio, reason, isCoreField? }],
  ai_dominant_count: number,
  human_required_count: number,
  what_ai_does: string[],
  what_human_does: string[],
  summary: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const ruleJudge = ctx.shared.ruleJudgability as RuleJudgabilityOutput | undefined;
    const taskGoal = ctx.shared.taskGoal as TaskGoalOutput | undefined;

    // ----- 1) 收集"题目"候选 -----
    const candidates = collectQuestions(ruleJudge, t);

    if (candidates.length === 0) {
      const empty: FieldLevelAnalysisOutput = {
        fields: [],
        ai_dominant_count: 0,
        human_required_count: 0,
        what_ai_does: [],
        what_human_does: ["暂无规则文档与历史标签空间，无法识别本次任务的判定题目"],
        summary: "未识别到判定题目，无法做题目级 AI/人工拆分"
      };
      return {
        run: finishRun(run, {
          status: "warning",
          summary: empty.summary,
          warnings: ["未识别到题目"],
          output: empty
        }),
        output: empty
      };
    }

    // ----- 2) 启发式打分 -----
    const seedFields: JudgeField[] = candidates.map((c) => seedQuestionJudgement(c));

    // ----- 3) 调 LLM 润色 reason / what_xxx_does（数值仍以 TS 为准） -----
    const payload = {
      candidate_questions: seedFields,
      rule_machine: ruleJudge?.machine_readable_rule_points ?? [],
      rule_ai: ruleJudge?.ai_assisted_rule_points ?? [],
      rule_human: ruleJudge?.human_required_rule_points ?? [],
      rule_conflicts: ruleJudge?.rule_conflicts ?? [],
      task_type: t.taskType,
      task_goal: taskGoal?.task_goal ?? "",
      // 兼容旧字段名，方便 mock provider 透传
      candidate_fields: seedFields
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n` +
      `请基于本次任务的"判定题目"列表，逐题给出：` +
      `难度 / AI 能力 / 推荐承接方式 / 估算人工占比 / reason。\n` +
      `注意：题目指人工/AI 需要回答的判定维度（如"标题违禁词检查"、"图文一致性判定"），` +
      `不是送审样本的原始数据字段。\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let llmOutput: FieldLevelAnalysisOutput | null = null;
    try {
      llmOutput = await ctx.llm.generateJSON<FieldLevelAnalysisOutput>({
        systemPrompt:
          "你是「题目级 AI/人工拆分」Skill。题目指本次任务需要做出判定/标注的维度（来自规则与标签空间），不是送审字段。" +
          "请以严格 JSON 输出。数值字段（estimatedHumanRatio、ai_dominant_count、human_required_count）以传入数据为准。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch (e: any) {
      run.warnings?.push("LLM 调用失败：" + (e?.message ?? ""));
    }

    // ----- 4) 合并：以 TS seed 为骨架，仅吸收 LLM reason / what_xxx_does -----
    const fields = mergeFields(seedFields, llmOutput?.fields ?? []);
    const ai_dominant_count = fields.filter(
      (f) => f.suggestedFlow === "machine_auto" || f.suggestedFlow === "ai_prefill"
    ).length;
    const human_required_count = fields.filter((f) => f.suggestedFlow === "human_only").length;
    const ai_assist_count = fields.filter((f) => f.suggestedFlow === "ai_assist").length;

    const what_ai_does = pickList(llmOutput?.what_ai_does, buildWhatAIDoes(fields));
    const what_human_does = pickList(llmOutput?.what_human_does, buildWhatHumanDoes(fields));

    const summary =
      `共识别 ${fields.length} 个判定题目：` +
      `${ai_dominant_count} 个 AI/机审可主导，` +
      `${ai_assist_count} 个 AI 预填 + 人工核对，` +
      `${human_required_count} 个必须人工。`;

    const output: FieldLevelAnalysisOutput = {
      fields,
      ai_dominant_count,
      human_required_count,
      what_ai_does,
      what_human_does,
      summary: llmOutput?.summary?.trim() ? llmOutput.summary.trim() : summary
    };

    return {
      run: finishRun(run, {
        status: "completed",
        summary: output.summary,
        keyFindings: [
          `AI 主导题目 ${ai_dominant_count}`,
          `AI + 人工题目 ${ai_assist_count}`,
          `必须人工题目 ${human_required_count}`
        ],
        warnings:
          human_required_count >= fields.length / 2
            ? ["半数以上题目仍需人工，AI 减量空间有限"]
            : [],
        output
      }),
      output
    };
  }
};

// ============================================================================
// 题目候选收集
// ============================================================================

interface QuestionCandidate {
  /** 短标题（供 UI 展示），≤ 18 字 */
  name: string;
  /** 来源：machine / ai / human / fallback */
  bucket: "machine" | "ai" | "human" | "fallback";
  /** 与规则冲突命中 */
  matchedConflict: boolean;
  /** 规则原文（用作 reason 兜底） */
  ruleText?: string;
  /** 是否核心题目（来自高频规则 / 任务核心标签） */
  isCore: boolean;
}

function collectQuestions(
  ruleJudge: RuleJudgabilityOutput | undefined,
  task: EvaluationTask
): QuestionCandidate[] {
  const list: QuestionCandidate[] = [];
  const seen = new Set<string>();
  const conflicts = ruleJudge?.rule_conflicts ?? [];

  const addFromRule = (
    text: string,
    bucket: QuestionCandidate["bucket"],
    isCore: boolean
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const name = extractQuestionTitle(trimmed);
    if (!name) return;
    const key = name;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      name,
      bucket,
      matchedConflict: conflicts.some((c) => overlap(c, trimmed)),
      ruleText: trimmed,
      isCore
    });
  };

  // 规则三桶 —— slot-allocation：先按 quota 各取一份，再用剩余的桶回填。
  //   旧 quota 是 human=3 / ai=2 / machine=2，导致大多数任务"AI 主导题目数 ≤ 2"。
  //   改成 machine=3 / ai=2 / human=2，让机器/AI 题目能进 ai_dominant_count，
  //   人工题目仍至少保留 2 个名额。
  const machineItems = ruleJudge?.machine_readable_rule_points ?? [];
  const aiItems = ruleJudge?.ai_assisted_rule_points ?? [];
  const humanItems = [
    ...(ruleJudge?.human_required_rule_points ?? []),
    ...(ruleJudge?.subjective_judgement_points ?? [])
  ];

  const MAX_FIELDS = 6;
  const drawFromBucket = (
    items: string[],
    bucket: QuestionCandidate["bucket"],
    quota: number,
    isCore: boolean
  ) => {
    let drawn = 0;
    for (const t of items) {
      if (drawn >= quota) break;
      if (list.length >= MAX_FIELDS) break;
      const before = list.length;
      addFromRule(t, bucket, isCore);
      if (list.length > before) drawn++;
    }
  };
  // 初始 quota：机器 3 / AI 2 / 人工 2（合计 7，先满足主轴再让人工回填）
  drawFromBucket(machineItems, "machine", 3, true);
  drawFromBucket(aiItems, "ai", 2, true);
  drawFromBucket(humanItems, "human", 2, true);

  // 回填：未装满 MAX_FIELDS 时按 machine → ai → human 顺序补
  if (list.length < MAX_FIELDS) {
    drawFromBucket(machineItems, "machine", MAX_FIELDS - list.length, true);
  }
  if (list.length < MAX_FIELDS) {
    drawFromBucket(aiItems, "ai", MAX_FIELDS - list.length, true);
  }
  if (list.length < MAX_FIELDS) {
    drawFromBucket(humanItems, "human", MAX_FIELDS - list.length, true);
  }

  // 兜底：基于任务类型 + 标签空间补题目
  if (list.length < 3) {
    for (const fb of fallbackQuestions(task)) {
      if (seen.has(fb.name)) continue;
      seen.add(fb.name);
      list.push(fb);
      if (list.length >= MAX_FIELDS) break;
    }
  }

  return list.slice(0, MAX_FIELDS);
}

/** 从一句规则中提取一个短标题作为题目名 */
function extractQuestionTitle(text: string): string {
  let s = text.trim();
  // 去掉行首编号 / 项目符号
  s = s.replace(/^[\-•·\d\.\)）]+\s*/, "");
  // 取括号前
  const idxParen = s.search(/[（(]/);
  if (idxParen > 4) s = s.slice(0, idxParen);
  // 取首句
  const idxStop = s.search(/[，；。：]/);
  if (idxStop > 4) s = s.slice(0, idxStop);
  s = s.trim();
  // 提炼"XX判定 / XX检查 / XX审核"等模式
  const m = s.match(/([^\s]{2,12}(?:判定|审核|检查|识别|一致性|合规|过关|核对|复核|准确率|召回|覆盖|稳定性))/);
  if (m) return m[1];
  // 截断到 16 字
  if (s.length > 16) s = s.slice(0, 16) + "…";
  return s;
}

/** 简单字符串重叠：超过 4 个字符相同算命中 */
function overlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  const win = Math.min(6, Math.max(4, Math.floor(short.length / 3)));
  for (let i = 0; i + win <= short.length; i++) {
    const seg = short.slice(i, i + win);
    if (long.includes(seg)) return true;
  }
  return false;
}

function fallbackQuestions(task: EvaluationTask): QuestionCandidate[] {
  const list: QuestionCandidate[] = [];

  // 1) 任务类型 → 一个核心题目
  const typeQ = typeQuestion(task.taskType);
  if (typeQ) list.push(typeQ);

  // 2) 历史标签空间 → 把 distinct labels 折叠成"标签判定"题目
  const labels = distinctLabels(task.historicalLabels ?? [], task.sampleData ?? []);
  if (labels.length >= 2) {
    list.push({
      name: `${labels.slice(0, 2).join("/")} 标签判定`,
      bucket: "ai",
      matchedConflict: false,
      ruleText: `历史标签空间：${labels.join("、")}`,
      isCore: true
    });
  }

  // 3) 标准兜底题：异常/疑难
  list.push({
    name: "疑难 / 边界判定",
    bucket: "human",
    matchedConflict: false,
    ruleText: "任务中存在边界 Case 与规则冲突场景，必须人工最终拍板",
    isCore: false
  });

  return list;
}

function typeQuestion(taskType: TaskType): QuestionCandidate | null {
  switch (taskType) {
    case "audit":
      return {
        name: "通过 / 不通过 / 待复核",
        bucket: "ai",
        matchedConflict: false,
        ruleText: "审核任务核心题目：对每个样本给出最终结论",
        isCore: true
      };
    case "labeling":
      return {
        name: "标签产出",
        bucket: "ai",
        matchedConflict: false,
        ruleText: "标注任务核心题目：从标签空间中产出准确标签",
        isCore: true
      };
    case "quality_inspection":
      return {
        name: "质检通过 / 不通过",
        bucket: "machine",
        matchedConflict: false,
        ruleText: "质检任务核心题目：判定原标注是否正确",
        isCore: true
      };
    case "model_accuracy_eval":
      return {
        name: "模型预测正确性",
        bucket: "machine",
        matchedConflict: false,
        ruleText: "模型准确率评测核心题目",
        isCore: true
      };
    case "model_recall_eval":
      return {
        name: "模型预测覆盖度",
        bucket: "ai",
        matchedConflict: false,
        ruleText: "模型召回评测核心题目",
        isCore: true
      };
    case "training_data_building":
      return {
        name: "训练样本质量",
        bucket: "ai",
        matchedConflict: false,
        ruleText: "训练数据生产核心题目：保证样本可直接进训练集",
        isCore: true
      };
    case "evaluation":
      return {
        name: "效果评估结论",
        bucket: "ai",
        matchedConflict: false,
        ruleText: "评测任务核心题目",
        isCore: true
      };
    default:
      return null;
  }
}

function distinctLabels(
  hist: HistoricalLabelRecord[],
  samples: { label?: string }[]
): string[] {
  const set = new Set<string>();
  for (const h of hist ?? []) {
    if (h?.label) set.add(h.label);
  }
  for (const s of samples ?? []) {
    if (s?.label) set.add(s.label);
  }
  return Array.from(set).slice(0, 6);
}

// ============================================================================
// 启发式打分（题目 → 难度 / AI 能力 / Flow / humanRatio）
// ============================================================================

function seedQuestionJudgement(c: QuestionCandidate): JudgeField {
  // 题目语义启发
  const isImage = /图|视觉|清晰|主图|海报|缩略|画质/.test(c.name);
  const isSubjective = /描述|卖点|风格|建议|经验|主观|感受|质量|创意/.test(c.name);
  const isStructured = /价格|规格|sku|条形码|尺码|数量|数值|区间|阈值/.test(c.name);
  const isCategorical = /类目|分类|属性|品牌|国家|地域/.test(c.name);

  // 1. flow
  //   bucket=machine 非冲突非主观 → machine_auto / ai_prefill（强 AI 主导）
  //   bucket=ai 非冲突非主观，且不是图像/类目 → ai_prefill（也算 AI 主导）
  //   bucket=ai 命中图像/类目 → ai_assist（需要人工核对）
  //   bucket=human 或主观 → human_only
  let flow: JudgeField["suggestedFlow"];
  if (c.bucket === "machine" && !c.matchedConflict && !isSubjective) {
    flow = isStructured ? "machine_auto" : "ai_prefill";
  } else if (c.bucket === "human" || isSubjective) {
    flow = "human_only";
  } else if (c.bucket === "ai" && !c.matchedConflict && !isSubjective) {
    flow = isImage || isCategorical ? "ai_assist" : "ai_prefill";
  } else if (isImage || isCategorical) {
    flow = "ai_assist";
  } else if (isStructured) {
    flow = "machine_auto";
  } else {
    flow = "ai_prefill";
  }

  // 规则冲突命中 → 降级
  if (c.matchedConflict) {
    if (flow === "machine_auto") flow = "ai_prefill";
    else if (flow === "ai_prefill") flow = "ai_assist";
    else if (flow === "ai_assist") flow = "human_only";
  }

  // 2. AI 能力
  let aiCapability: JudgeField["aiCapability"];
  if (flow === "machine_auto") aiCapability = "强";
  else if (flow === "ai_prefill") aiCapability = "强";
  else if (flow === "ai_assist") aiCapability = "中";
  else aiCapability = "弱";

  // 3. 难度
  let difficulty: JudgeField["difficulty"];
  if (flow === "human_only" || isSubjective) difficulty = "高";
  else if (flow === "ai_assist" || c.matchedConflict) difficulty = "中";
  else difficulty = "低";

  // 4. humanRatio
  let humanRatio = 0.05;
  switch (flow) {
    case "machine_auto":
      humanRatio = 0.05;
      break;
    case "ai_prefill":
      humanRatio = 0.2;
      break;
    case "ai_assist":
      humanRatio = 0.5;
      break;
    case "human_only":
      humanRatio = 0.95;
      break;
  }
  if (c.matchedConflict) humanRatio = Math.min(0.98, humanRatio + 0.1);

  // 5. reason
  const conflictNote = c.matchedConflict ? "（命中已知规则冲突，需人工拍板）" : "";
  const reason =
    flow === "machine_auto"
      ? `「${c.name}」可直接走机审/规则判定，AI 能稳定承接${conflictNote}`
      : flow === "ai_prefill"
        ? `「${c.name}」语义清晰，AI 可直接预填，人工只需快速确认${conflictNote}`
        : flow === "ai_assist"
          ? `「${c.name}」属于图文/类目类，AI 可辅助但需人工核对边界${conflictNote}`
          : `「${c.name}」含主观判断或规则不稳定，必须人工最终拍板${conflictNote}`;

  return {
    name: c.name,
    difficulty,
    aiCapability,
    suggestedFlow: flow,
    estimatedHumanRatio: Number(humanRatio.toFixed(2)),
    reason,
    isCoreField: c.isCore
  };
}

function mergeFields(seed: JudgeField[], fromLLM: JudgeField[]): JudgeField[] {
  if (!fromLLM?.length) return seed;
  const lookup = new Map<string, JudgeField>();
  for (const f of fromLLM) lookup.set(f.name, f);
  return seed.map((s) => {
    const llm = lookup.get(s.name);
    if (!llm) return s;
    return {
      ...s,
      reason: (llm.reason && llm.reason.trim()) || s.reason
    };
  });
}

function pickList(fromLLM: string[] | undefined, fallback: string[]): string[] {
  if (Array.isArray(fromLLM) && fromLLM.length > 0) return fromLLM;
  return fallback;
}

function buildWhatAIDoes(fields: JudgeField[]): string[] {
  const list: string[] = [];
  const auto = fields.filter((f) => f.suggestedFlow === "machine_auto");
  const prefill = fields.filter((f) => f.suggestedFlow === "ai_prefill");
  const assist = fields.filter((f) => f.suggestedFlow === "ai_assist");
  if (auto.length)
    list.push(`机审直接判定：${auto.map((f) => f.name).join("、")}`);
  if (prefill.length)
    list.push(`AI 预填，人工只需确认：${prefill.map((f) => f.name).join("、")}`);
  if (assist.length)
    list.push(`AI 给出候选 + 人工核对：${assist.map((f) => f.name).join("、")}`);
  if (!list.length) list.push("当前题目集 AI 难以稳定承接");
  return list;
}

function buildWhatHumanDoes(fields: JudgeField[]): string[] {
  const list: string[] = [];
  const human = fields.filter((f) => f.suggestedFlow === "human_only");
  const assist = fields.filter((f) => f.suggestedFlow === "ai_assist");
  if (human.length) list.push(`核心人工判定：${human.map((f) => f.name).join("、")}`);
  if (assist.length) list.push(`核对 AI 结果：${assist.map((f) => f.name).join("、")}`);
  list.push("聚焦边界 / 高错样本，沉淀规则 Case 库");
  return list;
}
