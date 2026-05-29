import type { LLMGenerateParams, LLMProvider } from "./provider";

/**
 * MockLLMProvider — 无 API Key 时使用。
 *
 * Skill 调度方会在 userPrompt 中嵌入：
 *   [[SKILL:<skill_name>]]
 *   [[PAYLOAD]]{…JSON…}[[/PAYLOAD]]
 * Mock 根据 SKILL 类型 + 已计算好的 payload，返回一份与 spec schema 一致的伪 LLM 输出。
 *
 * 这样设计的好处：
 *  - Skill 内部把所有可计算的数值（数量、比例、分布、命中样本 ID）都算出来，传给 LLM；
 *  - Mock 只负责把这些数值"包成"模型该返回的 JSON 形态；
 *  - 真实 LLM 接入后，行为也是同一接口，输出会更有解释力。
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateText(params: LLMGenerateParams): Promise<string> {
    return `[mock] ${(params.userPrompt ?? "").slice(0, 80)}…`;
  }

  async generateJSON<T = unknown>(params: LLMGenerateParams): Promise<T> {
    const prompt = params.userPrompt ?? "";
    const skill = matchSkill(prompt);
    const payload = matchPayload(prompt);

    // 模拟一点延时，便于前端展示 Agent 流程
    await delay(180 + Math.random() * 280);

    switch (skill) {
      case "task_goal_and_data_output":
        return mockTaskGoal(payload) as T;
      case "rule_judgability":
        return mockRuleJudgability(payload) as T;
      case "field_level_analysis":
        return mockFieldLevelAnalysis(payload) as T;
      case "sample_pool_segmentation":
        return mockSampleSegmentation(payload) as T;
      case "historical_quality_baseline":
        return mockHistoricalQuality(payload) as T;
      case "machine_audit_coverage":
        return mockMachineAudit(payload) as T;
      case "human_effort_estimation":
        return mockHumanEffort(payload) as T;
      case "task_investment_strategy":
        return mockStrategy(payload) as T;
      case "task_value_report":
        return mockReport(payload) as T;
      // 机审 trial 在 mock 下不可能跑成功，但 trial skill 已经做了 isMock 短路，
      // 这里只是兜底，避免有人在外部直接调起对应 SKILL 名时返回空对象。
      case "machine_audit_trial_draft":
        return {
          trial_system_prompt: "",
          trial_user_template: "",
          label_space: [],
          prompt_design_rationale: "mock provider 无法起草真实 trial prompt"
        } as T;
      case "machine_audit_trial_predict":
        return { predictions: [] } as T;
      default:
        return {} as T;
    }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function matchSkill(prompt: string): string {
  const m = prompt.match(/\[\[SKILL:([a-zA-Z_]+)\]\]/);
  return m?.[1] ?? "";
}

function matchPayload(prompt: string): any {
  const m = prompt.match(/\[\[PAYLOAD\]\]([\s\S]*?)\[\[\/PAYLOAD\]\]/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

// =============================================================================
// 各 Skill 的 mock 实现 —— 输出与 types.ts 中定义的 *Output 一一对应
// =============================================================================

function mockTaskGoal(p: any) {
  const taskType: string = p?.taskType ?? "audit";
  const demand: string = p?.demandDescription ?? "";
  const goalsByType: Record<string, string[]> = {
    audit: ["规则Case库", "HIS库", "质检错例集", "机审验证集"],
    labeling: ["模型训练集", "模型评测集", "规则Case库"],
    evaluation: ["模型评测集", "准确率评测集", "边界样本集"],
    quality_inspection: ["质检错例集", "HIS库"],
    model_accuracy_eval: ["准确率评测集", "错例集", "规则边界Case"],
    model_recall_eval: ["召回率评测集", "漏判错例集"],
    training_data_building: ["模型训练集", "增量训练集"],
    other: ["规则Case库", "模型训练集"]
  };
  const usageByType: Record<string, string[]> = {
    audit: ["业务治理", "规则迭代", "机审优化"],
    labeling: ["模型优化", "算法评测"],
    evaluation: ["算法评测", "上线把关"],
    quality_inspection: ["质量治理", "外包能力诊断"],
    model_accuracy_eval: ["算法评测", "上线决策"],
    model_recall_eval: ["算法评测", "召回兜底"],
    training_data_building: ["模型训练", "持续学习"],
    other: ["算法评测", "业务治理"]
  };
  const dataOutputGoals = goalsByType[taskType] ?? goalsByType.other;
  const downstream = usageByType[taskType] ?? usageByType.other;

  const reusabilityFromCount = pickByCount(p?.sampleCount ?? 0, ["低", "中", "高"]);

  const missing: string[] = [];
  if (!demand || demand.length < 20) missing.push("业务诉求描述偏短，需要补充任务最终用途");
  if (!p?.hasRuleDoc) missing.push("缺少规则文档或 SOP，难以判断标签清晰度");
  if (!p?.hasSamples) missing.push("缺少样本数据，无法对样本池做画像");

  const hasRule: boolean = !!p?.hasRuleDoc;
  const hasSamples: boolean = !!p?.hasSamples;
  const sampleCount: number = Number(p?.sampleCount ?? 0) || 0;
  const fitLevel: "可满足" | "部分满足" | "无法满足" =
    hasRule && hasSamples && sampleCount > 0
      ? "可满足"
      : hasSamples
        ? "部分满足"
        : "无法满足";
  const fitReason =
    fitLevel === "可满足"
      ? `已上传规则 + ${sampleCount} 条样本，足以产出 ${dataOutputGoals.join("、")}`
      : fitLevel === "部分满足"
        ? `样本已上传（${sampleCount} 条），但规则/SOP 不齐，仅能部分产出 ${dataOutputGoals.join("、")}`
        : "缺少样本或规则文档，无法稳定产出目标数据资产";

  return {
    task_goal: deriveTaskGoal(taskType, demand),
    task_type: taskType,
    data_output_goals: dataOutputGoals,
    downstream_usage: downstream,
    value_chain:
      "数据 → 任务沉淀 → 规则与机审能力优化 → 后续可复用为评测集 / 训练集 / Case 库",
    asset_reusability: reusabilityFromCount,
    missing_business_context: missing,
    summary: `任务类型为「${zhTaskType(taskType)}」，建议产出 ${dataOutputGoals.join("、")} 等数据资产，可服务于 ${downstream.join("、")}。`,
    demand_goal_data_fit: {
      fit_level: fitLevel,
      what_demand_needs: deriveTaskGoal(taskType, demand),
      what_data_produces: dataOutputGoals.join("、"),
      fit_reasoning: fitReason,
      expected_value: `服务于 ${downstream.join("、")}`
    }
  };
}

function deriveTaskGoal(taskType: string, demand: string): string {
  const head = demand?.slice(0, 60) ?? "";
  const map: Record<string, string> = {
    audit: `通过审核任务沉淀稳定的规则 Case 与机审验证样本，长期目标是支撑业务治理与机审能力建设`,
    labeling: `通过标注任务构建模型训练集 / 评测集，支撑算法迭代`,
    evaluation: `对当前模型/规则做准确率评估，识别错例与边界样本`,
    quality_inspection: `通过质检沉淀错例与外包能力诊断`,
    model_accuracy_eval: `生成模型准确率评测集，并沉淀错例与规则边界 Case`,
    model_recall_eval: `生成模型召回率评测集，识别漏判模式`,
    training_data_building: `构建模型训练集，提升模型识别能力`,
    other: `按业务诉求形成可被下游链路复用的数据资产`
  };
  return head ? `${map[taskType] ?? map.other}（业务上下文：${head}…）` : (map[taskType] ?? map.other);
}

function zhTaskType(t: string): string {
  return (
    {
      audit: "审核",
      labeling: "标注",
      evaluation: "评测",
      quality_inspection: "质检",
      model_accuracy_eval: "模型准确率评测",
      model_recall_eval: "模型召回率评测",
      training_data_building: "训练数据构建",
      other: "其他"
    } as Record<string, string>
  )[t] ?? t;
}

function pickByCount<T>(n: number, levels: T[]): T {
  if (n >= 200) return levels[2];
  if (n >= 50) return levels[1];
  return levels[0];
}

// -----------------------------------------------------------------------------

function mockRuleJudgability(p: any) {
  const ruleText: string = (p?.ruleText ?? "").slice(0, 5000);
  const hasRules = ruleText.length > 50;
  const conflicts: string[] = [];
  const subjective: string[] = [];
  const machineRules: string[] = [];
  const aiRules: string[] = [];
  const humanRules: string[] = [];

  // 简单基于关键字的启发式
  // 注意：检测"是否存在规则冲突"时要避免被「冲突 = 0」「冲突率 < 5%」「无冲突」等
  //       描述阈值/指标的句子误伤；这些是在度量"冲突有多少"，不是声明"规则之间冲突"。
  // 同时跳过 markdown 标题行 / 表头分隔行（| --- |）/ 章节编号行（## 一、二）—— 这些是结构性文本，
  //   不是规则内容本身。
  const rawLines = ruleText
    .split(/[\n。；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lines = rawLines.filter((ln) => {
    if (/^#{1,6}\s/.test(ln)) return false; // markdown 标题
    if (/^\|.*\|$/.test(ln) && /---/.test(ln)) return false; // 表头分隔
    if (/^\|.+\|.+\|$/.test(ln) && /题型|规则|备注|表头|description|说明/.test(ln) === false && ln.split("|").length <= 6) {
      // 普通表格行不一定都跳，但若没有规则内容，也别误归到 humanRules
    }
    return true;
  });

  const isMetricMentionOfConflict = (ln: string): boolean => {
    // 形如「信息冲突 = 0」「冲突率 < 5%」「冲突数量」「无冲突」「冲突 ≥ 1」等指标描述
    return (
      /(冲突|矛盾)\s*[=＝]\s*[0０]/.test(ln) ||
      /(冲突|矛盾)(率|数量|占比|个数|总量|场景)/.test(ln) ||
      /无\s*(冲突|矛盾)/.test(ln) ||
      /(冲突|矛盾)\s*[<≤＜]\s*\d/.test(ln) ||
      /(冲突|矛盾)\s*[≥>＞]\s*\d/.test(ln)
    );
  };
  const isRealConflictDeclaration = (ln: string): boolean => {
    // 真正的"规则之间存在冲突"的描述：通常带"规则 / 口径 / 标签 / 作业员 / 判定 / 理解"等主体
    return (
      /(规则|口径|标签|作业员|判定|理解|执行|认定|表述).{0,8}(冲突|矛盾|不一致|二选一|互斥|分歧|模糊)/.test(
        ln
      ) ||
      /(存在|出现|具有|有).{0,4}(冲突|矛盾|不一致|分歧)/.test(ln)
    );
  };

  for (const ln of lines) {
    if (/(必须|不允许|禁止|且|或)/.test(ln) && /(=|≥|<=|>=|大于|小于|包含)/.test(ln)) {
      machineRules.push(ln.slice(0, 60));
    } else if (/(图片|图文|主图|标题|摘要|一致)/.test(ln)) {
      aiRules.push(ln.slice(0, 60));
    } else if (/(主观|经验|根据情况|综合判断|视情况|拍板|资深|高级|核对边界)/.test(ln)) {
      subjective.push(ln.slice(0, 60));
      humanRules.push(ln.slice(0, 60));
    } else if (
      (/(冲突|矛盾|二选一|不一致|分歧|模糊)/.test(ln) && !isMetricMentionOfConflict(ln) && isRealConflictDeclaration(ln))
    ) {
      conflicts.push(ln.slice(0, 60));
    } else if (ln.length < 10) {
      // skip noise
    } else {
      // 兜底：含"应该 / 建议 / 尽量 / 视情况 / 慎重 / 易混淆"的偏经验
      if (/(应该|建议|尽量|视情况|慎重|易混淆|备注|填空|填写)/.test(ln)) {
        humanRules.push(ln.slice(0, 60));
      }
    }
  }

  // 限制长度，避免 mock 输出太冗长
  const cap = (arr: string[]) => arr.slice(0, 6);
  const machineList = cap(machineRules);
  const aiList = cap(aiRules);
  const humanList = cap(humanRules);
  const conflictList = cap(conflicts);
  const subjectiveList = cap(subjective);

  let judgability: "高" | "中" | "低" = "中";
  if (machineList.length >= 4 && humanList.length <= 2) judgability = "高";
  else if (humanList.length >= 4 || conflictList.length >= 2) judgability = "低";
  else if (!hasRules) judgability = "低";

  let clarity: "高" | "中" | "低" = hasRules ? "中" : "低";
  if (hasRules && machineList.length >= 3 && conflictList.length === 0) clarity = "高";

  const risks: string[] = [];
  if (!hasRules) risks.push("规则文档缺失，无法评估标签边界稳定性");
  if (conflictList.length > 0) risks.push("规则之间存在冲突或表述不一致，先行补齐再放量");
  if (humanList.length > 4) risks.push("主观判断点偏多，外包稳定性有风险");

  return {
    judgability_level: judgability,
    rule_clarity: clarity,
    rule_conflicts: conflictList,
    subjective_judgement_points: subjectiveList,
    machine_readable_rule_points: machineList,
    ai_assisted_rule_points: aiList,
    human_required_rule_points: humanList,
    risk_points: risks,
    summary: `规则可判定性为「${judgability}」，规则清晰度「${clarity}」。机器可识别要点 ${machineList.length} 条，AI 可辅助要点 ${aiList.length} 条，人工经验要点 ${humanList.length} 条。`
  };
}

// -----------------------------------------------------------------------------

function mockSampleSegmentation(p: any) {
  // payload 期望已计算好的 segments 与分布
  return {
    sample_count: p?.sample_count ?? 0,
    sample_distribution: p?.sample_distribution ?? {
      category_distribution: {},
      label_distribution: {},
      risk_type_distribution: {},
      difficulty_distribution: {}
    },
    sample_quality_issues: p?.sample_quality_issues ?? [],
    sample_value_segments: p?.sample_value_segments ?? {
      high_value_human_labeling: emptySeg("高价值人工标注"),
      boundary_cases: emptySeg("边界 Case"),
      machine_auto: emptySeg("机审免审"),
      ai_prelabel_human_confirm: emptySeg("AI 预标 + 人工确认"),
      human_fallback: emptySeg("人工兜底"),
      not_recommended: emptySeg("暂不建议投入")
    },
    boundary_case_ranking: p?.boundary_case_ranking ?? [],
    recommended_labeling_scope:
      p?.recommended_labeling_scope ??
      "建议优先人工重点标注：高价值样本 + 边界样本 + 历史高错样本 + 机审低置信样本",
    summary: p?.summary ?? "已根据机审置信度、历史标注稳定性与样本难度提示完成 6 段分层。"
  };
}

function mockFieldLevelAnalysis(p: any) {
  // 题目（判定维度）的启发式打分已在 TS 侧完成，这里仅做轻量包装
  const fields = p?.candidate_questions ?? p?.candidate_fields ?? [];
  const auto = (fields as any[]).filter((f) => f?.suggestedFlow === "machine_auto");
  const prefill = (fields as any[]).filter((f) => f?.suggestedFlow === "ai_prefill");
  const assist = (fields as any[]).filter((f) => f?.suggestedFlow === "ai_assist");
  const human = (fields as any[]).filter((f) => f?.suggestedFlow === "human_only");
  const ai_dominant_count = auto.length + prefill.length;
  const human_required_count = human.length;

  const what_ai_does: string[] = [];
  if (auto.length) what_ai_does.push(`机审直接判定：${auto.map((f) => f.name).join("、")}`);
  if (prefill.length) what_ai_does.push(`AI 预填，人工只需确认：${prefill.map((f) => f.name).join("、")}`);
  if (assist.length) what_ai_does.push(`AI 给出候选 + 人工核对：${assist.map((f) => f.name).join("、")}`);
  if (!what_ai_does.length) what_ai_does.push("当前题目集 AI 难以稳定承接");

  const what_human_does: string[] = [];
  if (human.length) what_human_does.push(`核心人工判定：${human.map((f) => f.name).join("、")}`);
  if (assist.length) what_human_does.push(`核对 AI 结果：${assist.map((f) => f.name).join("、")}`);
  what_human_does.push("聚焦边界 / 高错样本，沉淀规则 Case 库");

  return {
    fields,
    ai_dominant_count,
    human_required_count,
    what_ai_does,
    what_human_does,
    summary: `识别 ${fields.length} 个判定题目，AI 主导 ${ai_dominant_count} 个，人工必判 ${human_required_count} 个。`
  };
}

function emptySeg(name: string) {
  return {
    count: 0,
    ratio: 0,
    criteria: [],
    reason: `当前 ${name} 段无足够依据，回落为 0`,
    sample_ids: []
  };
}

// -----------------------------------------------------------------------------

function mockHistoricalQuality(p: any) {
  return {
    historical_label_distribution: p?.historical_label_distribution ?? {},
    quality_baseline: p?.quality_baseline ?? {
      agreement_rate: "—",
      quality_pass_rate: "—",
      high_error_labels: [],
      unstable_labels: []
    },
    human_labeling_risks: p?.human_labeling_risks ?? [],
    unstable_rule_points: p?.unstable_rule_points ?? [],
    historical_result_reusability:
      p?.historical_result_reusability ?? ("中" as "高" | "中" | "低"),
    summary: p?.summary ?? "历史标注与质检结果分析完成，已识别质量基线与可复用性。"
  };
}

// -----------------------------------------------------------------------------

function mockMachineAudit(p: any) {
  return {
    machine_coverage: p?.machine_coverage ?? "0%",
    high_confidence_auto_ratio: p?.high_confidence_auto_ratio ?? "0%",
    prelabel_candidate_ratio: p?.prelabel_candidate_ratio ?? "0%",
    human_fallback_ratio: p?.human_fallback_ratio ?? "0%",
    machine_strength_labels: p?.machine_strength_labels ?? [],
    machine_weakness_labels: p?.machine_weakness_labels ?? [],
    machine_error_patterns: p?.machine_error_patterns ?? [],
    machine_capability_judgement: p?.machine_capability_judgement ?? "已有机审能力暂不可用，建议先做评测集校准。",
    recommended_thresholds: p?.recommended_thresholds ?? {
      auto_threshold: 0.9,
      prelabel_threshold: 0.7,
      fallback_threshold: 0.7
    },
    summary: p?.summary ?? "已结合机审置信度与历史标注一致性评估机审承接潜力。"
  };
}

// -----------------------------------------------------------------------------

function mockHumanEffort(p: any) {
  return {
    baseline_human_effort: p?.baseline_human_effort ?? {
      full_manual_sample_count: 0,
      estimated_time_per_item_seconds: 45,
      estimated_total_hours: 0,
      estimated_person_days: 0,
      estimated_people_needed: 0
    },
    optimized_human_effort: p?.optimized_human_effort ?? {
      machine_auto_count: 0,
      ai_prelabel_count: 0,
      human_required_count: 0,
      quality_sampling_count: 0,
      estimated_total_hours: 0,
      estimated_person_days: 0,
      estimated_people_needed: 0
    },
    reduction_space: p?.reduction_space ?? {
      sample_reduction_ratio: "0%",
      human_hour_reduction_ratio: "0%",
      reduction_reason: []
    },
    summary: p?.summary ?? "已完成全人工与优化两套口径的人工投入测算。"
  };
}

// -----------------------------------------------------------------------------

function mockStrategy(p: any) {
  return p?.strategy ?? {
    data_production_strategy: {
      target_dataset: ["规则 Case 库", "评测集"],
      sample_selection_strategy: "优先纳入边界样本与机审低置信样本，过滤无业务闭环样本",
      labeling_strategy: "高价值样本人工双标 + 抽检；中等样本 AI 预标 + 人工确认；低价值样本机审免审",
      quality_strategy: "全量任务 10% 抽检 + 高错标签提升至 20%",
      machine_audit_strategy: "高置信免审 + 中置信预标 + 低置信兜底"
    },
    human_machine_collaboration: {
      machine_auto: ["规则明确 + 机审高置信 + 历史一致"],
      ai_prelabel_human_confirm: ["规则可解释 + 中等置信"],
      human_focus: ["高价值样本", "边界样本", "机审低置信样本"],
      exclude_or_hold: ["字段缺失严重 / 重复样本 / 无业务闭环样本"]
    },
    pilot_plan: {
      pilot_sample_size: 200,
      pilot_duration: "3天",
      acceptance_metrics: ["质检通过率 ≥ 90%", "样本边界争议率 ≤ 10%", "人均日产量 ≥ 历史基线 80%"]
    },
    scale_plan: {
      scale_condition: ["试点 KPI 达标", "规则补齐", "机审准确率验证通过"],
      scale_risks: ["机审历史准确率不稳定", "外包对边界规则把握不到位"],
      required_improvements: ["补齐规则文档", "建立 HIS 库回流机制", "规范化质检话术"]
    },
    summary: "已生成投入策略与人机分工建议，含试点与放量条件。"
  };
}

// -----------------------------------------------------------------------------

function mockReport(p: any) {
  return {
    executive_summary_markdown:
      p?.executive_summary_markdown ?? "# 任务价值评估结论\n\n（mock）请配置真实 LLM 以获得更丰富表达。",
    detailed_report_markdown:
      p?.detailed_report_markdown ?? "# 任务价值评估报告\n\n（mock）请配置真实 LLM 以获得更丰富表达。"
  };
}
