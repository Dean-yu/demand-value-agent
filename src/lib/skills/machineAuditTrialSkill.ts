// =============================================================================
// Skill：真实机审 trial 实测
//
// 这是 Q2/Q3 的核心驱动：根据已识别的规则要点和任务目标，
//   Step A. 用 LLM 草拟一份「通用机审」prompt（1 次 LLM 调用）
//   Step B. 在子样本（每类目 10 条、合计 ≤ 60 条）上批量跑机审，6 批 = 6 次 LLM 调用
//   Step C. TS 算 per-category accuracy（无 LLM）
//   Step D. 输出 + 失败回落（mock / 异常 / 没 gold label 时 succeeded=false）
//
// 输出 MachineAuditTrialOutput：
//   - succeeded=true → decision/sampleSegmentation 直接按 per_category.mode 外推
//   - succeeded=false → 下游回落到原启发式（保留向后兼容）
// =============================================================================

import type {
  CategoryTrialResult,
  MachineAuditTrialOutput,
  RuleJudgabilityOutput,
  SampleRecord,
  TaskGoalOutput
} from "../agent/types";
import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";

const SKILL_NAME = "machine_audit_trial";

// -------- 成本控制 --------
const PER_CATEGORY_CAP = 10;
const TOTAL_SAMPLE_CAP = 60;
const BATCH_SIZE = 10;

// -------- 阈值 --------
const ACC_MACHINE_AUTO = 0.9;
const ACC_AI_PRELABEL = 0.7;

interface TrialPromptDraft {
  trial_system_prompt: string;
  trial_user_template: string;
  label_space: string[];
  prompt_design_rationale: string;
}

interface SamplePrediction {
  sampleId: string;
  predicted_label: string;
  confidence?: number;
  brief_reason?: string;
}

export const machineAuditTrialSkill: SkillModule<MachineAuditTrialOutput> = {
  name: SKILL_NAME,
  title: "真实机审 Trial 实测",
  description:
    "根据规则要点起草一份通用机审 prompt，在每类目 10 条样本上实跑机审，按 per-category 准确率推断机器/预标/人工三段比例",
  inputSchema:
    "{ taskGoal, ruleJudgability, sampleData[*]: { id, category, label, textFields } }",
  outputSchema: `{
  attempted: boolean,
  succeeded: boolean,
  trial_system_prompt: string,
  trial_user_template: string,
  label_space: string[],
  trial_sample_count: number,
  overall_accuracy: number,
  per_category: [{ category, sampleCount, matchCount, accuracy, mode, reason }],
  recommended_mode: '机器为主' | '人机协同' | '人工为主',
  failure_reason?: string,
  summary: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const samples = ctx.task.sampleData ?? [];
    const ruleOut = ctx.shared.ruleJudgability as
      | RuleJudgabilityOutput
      | undefined;
    const goalOut = ctx.shared.taskGoal as TaskGoalOutput | undefined;

    // ---------- 前置：什么时候不跑 ----------
    const trialEnabled =
      (process.env.LLM_TRIAL_ENABLED ?? "true").toLowerCase() !== "false";
    if (!trialEnabled) {
      return fallback(run, "环境变量 LLM_TRIAL_ENABLED=false，跳过真实 trial");
    }
    if (samples.length === 0) {
      return fallback(run, "样本为空，无法做 trial");
    }
    // 优先用 trialGoldLabel，没有则回退 label
    const goldOf = (s: SampleRecord): string =>
      (s.trialGoldLabel ?? s.label ?? "").trim();
    const labeled = samples.filter((s) => goldOf(s).length > 0);
    if (labeled.length < 5) {
      return fallback(
        run,
        `带 gold label 的样本仅 ${labeled.length} 条（<5），无法做有效准确率统计`
      );
    }

    // ---------- 抽样：每类目 ≤10、总 ≤60 ----------
    const selected = pickSamples(labeled, PER_CATEGORY_CAP, TOTAL_SAMPLE_CAP);
    if (selected.length === 0) {
      return fallback(run, "按类目抽样后无可用样本");
    }
    const labelSpace = dedupe(
      labeled.map((s) => goldOf(s)).filter(Boolean)
    ).slice(0, 40);

    const isMockMode = ctx.llm.isMock;

    // ---------- Step A：起草 trial prompt ----------
    let draft: TrialPromptDraft;
    if (isMockMode) {
      // mock 模式不调 LLM，使用占位 prompt（仍跑 per-category 统计）
      draft = mockDraftTrialPrompt(labelSpace);
    } else {
      try {
        draft = await draftTrialPrompt(ctx, ruleOut, goalOut, labelSpace);
      } catch (e: any) {
        return fallback(run, `Step A 起草 trial prompt 失败：${e?.message ?? e}`);
      }
    }

    // ---------- Step B：批量跑预测（mock 走伪 trial，不调 LLM） ----------
    const allPredictions = new Map<string, SamplePrediction>();
    if (isMockMode) {
      // 用类目固定目标 accuracy + 样本 hash 排序，合成确定性预测
      const synth = synthesizeMockPredictions(selected, labelSpace, goldOf);
      for (const p of synth) allPredictions.set(p.sampleId, p);
    } else {
      const batches: SampleRecord[][] = chunk(selected, BATCH_SIZE);
      try {
        for (let i = 0; i < batches.length; i++) {
          const preds = await runTrialBatch(ctx, draft, batches[i], i + 1, batches.length);
          for (const p of preds) {
            allPredictions.set(p.sampleId, p);
          }
        }
      } catch (e: any) {
        return fallback(run, `Step B 批量 trial 失败：${e?.message ?? e}`);
      }
    }

    // ---------- Step C：算 per-category accuracy ----------
    const perCategoryMap = new Map<
      string,
      { samples: number; match: number }
    >();
    let overallMatch = 0;
    let overallSamples = 0;
    for (const s of selected) {
      const pred = allPredictions.get(s.id);
      const cat = s.category ?? "未分类";
      const bucket = perCategoryMap.get(cat) ?? { samples: 0, match: 0 };
      bucket.samples += 1;
      if (pred && normalizeLabel(pred.predicted_label) === normalizeLabel(goldOf(s))) {
        bucket.match += 1;
        overallMatch += 1;
      }
      overallSamples += 1;
      perCategoryMap.set(cat, bucket);
    }

    const perCategory: CategoryTrialResult[] = [];
    for (const [category, { samples: cnt, match }] of perCategoryMap) {
      const acc = cnt === 0 ? 0 : match / cnt;
      const mode = classifyMode(acc);
      perCategory.push({
        category,
        sampleCount: cnt,
        matchCount: match,
        accuracy: Number(acc.toFixed(4)),
        mode,
        reason: explainMode(acc, cnt, match, mode)
      });
    }
    perCategory.sort((a, b) => b.accuracy - a.accuracy);

    const overallAccuracy =
      overallSamples === 0 ? 0 : Number((overallMatch / overallSamples).toFixed(4));
    const recommendedMode = pickOverallMode(perCategory, overallAccuracy);

    const modeSuffix = isMockMode ? "（mock 合成）" : "";
    const output: MachineAuditTrialOutput = {
      attempted: true,
      succeeded: true,
      trial_system_prompt: draft.trial_system_prompt,
      trial_user_template: draft.trial_user_template,
      label_space: draft.label_space,
      trial_sample_count: overallSamples,
      overall_accuracy: overallAccuracy,
      per_category: perCategory,
      recommended_mode: recommendedMode,
      summary:
        `已在 ${overallSamples} 条样本上完成机审 trial${modeSuffix}，` +
        `整体 accuracy=${(overallAccuracy * 100).toFixed(1)}%；` +
        `推荐 ${recommendedMode}。`
    };

    return {
      run: finishRun(run, {
        status: "completed",
        summary: output.summary,
        keyFindings: [
          `trial 样本 ${overallSamples} 条 / ${perCategory.length} 个类目`,
          `整体 accuracy ${(overallAccuracy * 100).toFixed(1)}%`,
          `机审 ${perCategory.filter((c) => c.mode === "machine_auto").length} 类目 / ` +
            `预标 ${perCategory.filter((c) => c.mode === "ai_prelabel").length} 类目 / ` +
            `人工 ${perCategory.filter((c) => c.mode === "human_required").length} 类目`
        ],
        output
      }),
      output
    };
  }
};

// =============================================================================
// 内部实现
// =============================================================================

function fallback(
  run: ReturnType<typeof startRun>,
  reason: string
): { run: ReturnType<typeof finishRun>; output: MachineAuditTrialOutput } {
  const out: MachineAuditTrialOutput = {
    attempted: true,
    succeeded: false,
    trial_system_prompt: "",
    trial_user_template: "",
    label_space: [],
    trial_sample_count: 0,
    overall_accuracy: 0,
    per_category: [],
    recommended_mode: "人机协同",
    failure_reason: reason,
    summary: `未做真实 trial：${reason}（下游沿用启发式判断）`
  };
  return {
    run: finishRun(run, {
      status: "warning",
      summary: out.summary,
      warnings: [reason],
      output: out
    }),
    output: out
  };
}

function pickSamples(
  labeled: SampleRecord[],
  perCategoryCap: number,
  totalCap: number
): SampleRecord[] {
  // 按 category 分桶（无 category 的归到 "未分类"）
  const buckets = new Map<string, SampleRecord[]>();
  for (const s of labeled) {
    const cat = s.category ?? "未分类";
    const arr = buckets.get(cat) ?? [];
    arr.push(s);
    buckets.set(cat, arr);
  }
  const result: SampleRecord[] = [];
  // 先尽量保证每个 category 都到 cap
  for (const [, arr] of buckets) {
    const slice = arr.slice(0, perCategoryCap);
    for (const s of slice) {
      if (result.length >= totalCap) break;
      result.push(s);
    }
    if (result.length >= totalCap) break;
  }
  return result;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function normalizeLabel(s: string): string {
  return (s ?? "").toString().trim().toLowerCase();
}

function classifyMode(acc: number): CategoryTrialResult["mode"] {
  if (acc >= ACC_MACHINE_AUTO) return "machine_auto";
  if (acc >= ACC_AI_PRELABEL) return "ai_prelabel";
  return "human_required";
}

function explainMode(
  acc: number,
  cnt: number,
  match: number,
  mode: CategoryTrialResult["mode"]
): string {
  const pct = (acc * 100).toFixed(1);
  if (mode === "machine_auto") {
    return `${cnt} 条样本中 ${match} 条匹配（acc=${pct}% ≥ 90%），可机审直接产出`;
  }
  if (mode === "ai_prelabel") {
    return `${cnt} 条样本中 ${match} 条匹配（acc=${pct}%，70%–90%），适合 AI 预标 + 人工核对`;
  }
  return `${cnt} 条样本中 ${match} 条匹配（acc=${pct}% < 70%），必须人工标注`;
}

function pickOverallMode(
  perCategory: CategoryTrialResult[],
  overallAccuracy: number
): MachineAuditTrialOutput["recommended_mode"] {
  if (perCategory.length === 0) {
    if (overallAccuracy >= ACC_MACHINE_AUTO) return "机器为主";
    if (overallAccuracy >= ACC_AI_PRELABEL) return "人机协同";
    return "人工为主";
  }
  const machineCnt = perCategory.filter((c) => c.mode === "machine_auto").length;
  const aiCnt = perCategory.filter((c) => c.mode === "ai_prelabel").length;
  const humanCnt = perCategory.filter((c) => c.mode === "human_required").length;
  // 多数 mode 决定整体
  if (machineCnt >= aiCnt + humanCnt) return "机器为主";
  if (humanCnt >= machineCnt + aiCnt) return "人工为主";
  return "人机协同";
}

// ---------- Step A：起草 prompt ----------
async function draftTrialPrompt(
  ctx: SkillContext,
  ruleOut: RuleJudgabilityOutput | undefined,
  goalOut: TaskGoalOutput | undefined,
  labelSpace: string[]
): Promise<TrialPromptDraft> {
  const ruleSummary = {
    machine_readable_rule_points: (ruleOut?.machine_readable_rule_points ?? []).slice(0, 10),
    ai_assisted_rule_points: (ruleOut?.ai_assisted_rule_points ?? []).slice(0, 10),
    human_required_rule_points: (ruleOut?.human_required_rule_points ?? []).slice(0, 10),
    subjective_judgement_points: (ruleOut?.subjective_judgement_points ?? []).slice(0, 8),
    rule_conflicts: (ruleOut?.rule_conflicts ?? []).slice(0, 5)
  };
  const goalSummary = {
    task_goal: goalOut?.task_goal ?? "",
    data_output_goals: goalOut?.data_output_goals ?? [],
    asset_reusability: goalOut?.asset_reusability ?? "—"
  };

  const userPrompt =
    `[[SKILL:${SKILL_NAME}_draft]]\n` +
    `你将要为下面这个任务起草一份「通用机审」prompt，用于让 LLM 在样本上做一次试标。\n\n` +
    `任务目标：\n${JSON.stringify(goalSummary, null, 2)}\n\n` +
    `已识别的规则要点：\n${JSON.stringify(ruleSummary, null, 2)}\n\n` +
    `候选标签空间（trial 的输出必须是其中之一）：\n${JSON.stringify(labelSpace)}\n\n` +
    `请输出 JSON：\n` +
    `{\n` +
    `  "trial_system_prompt": "给试标 LLM 的 system 提示词（中文，简短直接）",\n` +
    `  "trial_user_template": "单条样本的 user 模板。可包含 {{textFields}} 和 {{category}} 占位符（TS 会替换）。要求模板里清晰说明：1) 任务背景；2) 输出 JSON 格式（含 sampleId, predicted_label, confidence, brief_reason）；3) 标签必须从 label_space 选",\n` +
    `  "label_space": [候选标签],\n` +
    `  "prompt_design_rationale": "一句话解释 prompt 的设计依据"\n` +
    `}`;

  const raw = await ctx.llm.generateJSON<Partial<TrialPromptDraft>>({
    systemPrompt:
      "你是「机审 trial prompt 起草师」。严格输出 JSON，不要任何额外解释或 markdown 包裹。",
    userPrompt,
    schemaHint:
      `{ trial_system_prompt: string, trial_user_template: string, label_space: string[], prompt_design_rationale: string }`
  });

  // 兜底补全，避免后续 step 拿到空模板
  const trialSys =
    (raw.trial_system_prompt ?? "").trim() ||
    "你是一名通用机审员，请基于给定规则与样本，从候选标签中挑选最贴切的一个。严格输出 JSON。";
  const trialTpl =
    (raw.trial_user_template ?? "").trim() ||
    [
      "请对以下样本做机审判定。",
      "类目：{{category}}",
      "样本内容：{{textFields}}",
      "请输出 JSON：{\"sampleId\":\"<样本ID>\",\"predicted_label\":\"<标签>\",\"confidence\":<0-1>,\"brief_reason\":\"<一句话理由>\"}"
    ].join("\n");
  const ls = Array.isArray(raw.label_space) && raw.label_space.length > 0 ? raw.label_space : labelSpace;
  return {
    trial_system_prompt: trialSys,
    trial_user_template: trialTpl,
    label_space: ls,
    prompt_design_rationale: (raw.prompt_design_rationale ?? "").trim()
  };
}

// ---------- Step B：批量预测 ----------
async function runTrialBatch(
  ctx: SkillContext,
  draft: TrialPromptDraft,
  batchSamples: SampleRecord[],
  batchIdx: number,
  batchTotal: number
): Promise<SamplePrediction[]> {
  // 把每条样本压成一份「textFields + category」摘要，限制单样本长度避免 prompt 爆炸
  const lines = batchSamples.map((s) => {
    const textFields = serializeTextFields(s);
    return {
      sampleId: s.id,
      category: s.category ?? "未分类",
      textFields
    };
  });

  const userPrompt =
    `[[SKILL:${SKILL_NAME}_predict]]\n` +
    `通用机审 batch ${batchIdx}/${batchTotal}。\n` +
    `候选标签空间（必须从中选一个）：\n${JSON.stringify(draft.label_space)}\n\n` +
    `请对下面 ${lines.length} 条样本，按 prompt 设计逐条机审。\n` +
    `==== 单样本 user 模板（仅供你参考其判定要求）====\n${draft.trial_user_template}\n==== 模板结束 ====\n\n` +
    `样本数据 JSON 数组：\n${JSON.stringify(lines)}\n\n` +
    `请严格输出 JSON：\n` +
    `{ "predictions": [ { "sampleId": string, "predicted_label": string, "confidence"?: number, "brief_reason"?: string }, ... ] }`;

  const raw = await ctx.llm.generateJSON<{ predictions?: any[] }>({
    systemPrompt: draft.trial_system_prompt,
    userPrompt,
    schemaHint: `{ predictions: [{ sampleId: string, predicted_label: string, confidence?: number, brief_reason?: string }] }`
  });

  const arr = Array.isArray(raw?.predictions) ? raw.predictions : [];
  return arr
    .filter((it) => it && typeof it === "object" && typeof it.sampleId === "string")
    .map((it) => ({
      sampleId: String(it.sampleId),
      predicted_label: String(it.predicted_label ?? ""),
      confidence:
        typeof it.confidence === "number" ? Math.max(0, Math.min(1, it.confidence)) : undefined,
      brief_reason: typeof it.brief_reason === "string" ? it.brief_reason : undefined
    }));
}

function serializeTextFields(s: SampleRecord): string {
  // 把 textFields / raw 压成一份纯文本，单样本控制在 ~800 chars 以内
  const parts: string[] = [];
  if (s.textFields) {
    for (const [k, v] of Object.entries(s.textFields)) {
      if (v == null) continue;
      parts.push(`${k}: ${String(v).slice(0, 200)}`);
    }
  }
  if (parts.length === 0 && s.raw) {
    for (const [k, v] of Object.entries(s.raw)) {
      if (v == null) continue;
      if (typeof v === "object") continue;
      parts.push(`${k}: ${String(v).slice(0, 200)}`);
      if (parts.join("\n").length > 800) break;
    }
  }
  let text = parts.join("\n");
  if (text.length > 800) text = text.slice(0, 800) + "…";
  return text;
}

// =============================================================================
// Mock 模式：占位 prompt + 合成预测（用于 mock smoke 走通整条链路）
// =============================================================================

/** 给 mock 模式准备一份占位 prompt，让 trial.system/user 字段不为空 */
function mockDraftTrialPrompt(labelSpace: string[]): TrialPromptDraft {
  return {
    trial_system_prompt:
      "你是一名通用机审员（mock 模式占位）。基于规则与样本，从候选标签中挑选最贴切的一个。",
    trial_user_template: [
      "【mock】请基于规则给样本打标签。",
      "类目：{{category}}",
      "样本：{{textFields}}",
      "请输出 JSON：{\"sampleId\":\"<样本ID>\",\"predicted_label\":\"<标签>\"}"
    ].join("\n"),
    label_space: labelSpace,
    prompt_design_rationale:
      "mock provider 走伪 trial：用 gold label 加可控扰动模拟，便于 smoke 验证整条链路"
  };
}

/**
 * mock 模式合成预测：
 *  - 每个 category 取一个目标 accuracy（基于 hash 取 0.95 / 0.78 / 0.62 三档）
 *  - 该类目内按 sample.id hash 排序，前 (target_acc * count) 条返回 gold，其余返回随机错标
 *  - 这样 per-category accuracy 落到 [machine_auto, ai_prelabel, human_required] 三个 mode
 */
function synthesizeMockPredictions(
  selected: SampleRecord[],
  labelSpace: string[],
  goldOf: (s: SampleRecord) => string
): SamplePrediction[] {
  // 按 category 分桶
  const byCategory = new Map<string, SampleRecord[]>();
  for (const s of selected) {
    const cat = s.category ?? "未分类";
    const arr = byCategory.get(cat) ?? [];
    arr.push(s);
    byCategory.set(cat, arr);
  }

  const accuracyTargets = [0.95, 0.78, 0.62]; // machine_auto / ai_prelabel / human_required
  const out: SamplePrediction[] = [];

  for (const [cat, list] of byCategory) {
    const targetAcc = accuracyTargets[hash32(cat) % accuracyTargets.length];
    // 按 sample.id 哈希排序，得到稳定顺序
    const sorted = [...list].sort((a, b) => hash32(a.id) - hash32(b.id));
    const matchCutoff = Math.round(sorted.length * targetAcc);

    sorted.forEach((s, idx) => {
      const gold = goldOf(s);
      let predicted: string;
      if (idx < matchCutoff || gold === "") {
        // 命中：返回 gold（gold 为空时也用 gold 占位，反正 normalize 后两侧都是 ""）
        predicted = gold;
      } else {
        // 未命中：从 label_space 中挑一个非 gold 的标签
        const others = labelSpace.filter((l) => normalizeLabel(l) !== normalizeLabel(gold));
        predicted = others.length > 0 ? others[hash32(s.id) % others.length] : gold;
      }
      out.push({
        sampleId: s.id,
        predicted_label: predicted,
        confidence: idx < matchCutoff ? 0.9 : 0.55,
        brief_reason: "[mock] 合成预测"
      });
    });
  }

  return out;
}

/** 32-bit FNV-1a 哈希，纯函数确定性，避免引入额外依赖 */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
