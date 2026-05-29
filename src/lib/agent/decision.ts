// =============================================================================
// 决策规则 —— 核心三问：
//   Q1 值不值得标？  Q2 机器还是人标？  Q3 各占多少？
// 不再使用「改造后投入 / 谨慎投入」等模糊中间态
// =============================================================================

import type {
  CategoryTrialResult,
  CoreVerdict,
  EvaluationTask,
  FieldLevelAnalysisOutput,
  FinalDecision,
  HistoricalQualityOutput,
  HumanEffortEstimationOutput,
  HumanWorkVerdict,
  MachineAuditCoverageOutput,
  MachineAuditTrialOutput,
  RuleJudgabilityOutput,
  SampleSegmentationOutput,
  TaskGoalOutput,
  ValueScore
} from "./types";

export interface DecisionSignals {
  taskGoal?: TaskGoalOutput;
  ruleJudgability?: RuleJudgabilityOutput;
  historicalQuality?: HistoricalQualityOutput;
  fieldAnalysis?: FieldLevelAnalysisOutput;
  segmentation?: SampleSegmentationOutput;
  machineAudit?: MachineAuditCoverageOutput;
  humanEffort?: HumanEffortEstimationOutput;
  /** 真实机审 trial 输出；succeeded=true 时 Q2/Q3 直接由它驱动 */
  machineAuditTrial?: MachineAuditTrialOutput;
}

// -----------------------------------------------------------------------------
// 总决策：主轴优先 + ±2 分边界带，直接回答"值不值得标 + 谁来标"
//
// 新版思路（替代原硬阈值堆叠）：
//   价值轴 = dataOutputValue (0-20) + businessValue (0-15)，满分 35
//     ≥ 24  → 值得标
//     12-24 → 中间值，需结合能力轴
//     < 12  → 暂不建议标·价值不足
//   能力轴 = ruleJudgability (0-15) + machineAuditPotential (0-15)，满分 30
//     ≥ 22  → 机器为主
//     14-22 → 人机协同
//     < 14  → 人工为主
//   边界带 = 任意切换点 ±2 分内 → 给出 confidence "倾向 X，可能为 Y"
//
// 高优覆盖：
//   - fit_level=无法满足 → 直接价值不足
//   - 历史资产可复用度高 + 价值轴一般 → 无需重标
//   - trial.succeeded → trial.recommended_mode 强制覆盖能力轴判定
// -----------------------------------------------------------------------------

export interface DecideFinalResult {
  decision: FinalDecision;
  /** 置信度提示：当价值/能力轴落在 ±2 分边界带时给出 */
  confidence?: string;
}

const VALUE_AXIS_HIGH = 24; // 价值轴 ≥ 24 → 值得标
const VALUE_AXIS_LOW = 12; // 价值轴 < 12 → 价值不足
const CAPABILITY_AXIS_HIGH = 22; // 能力轴 ≥ 22 → 机器为主
const CAPABILITY_AXIS_MID = 14; // 能力轴 ≥ 14 → 人机协同（< 14 → 人工为主）
const BAND = 2; // 切换点 ±2 分内视为边界带

export function decideFinal(
  score: ValueScore,
  signals: DecisionSignals = {}
): DecideFinalResult {
  const d = score.dimensions;
  const taskGoal = signals.taskGoal;
  const hist = signals.historicalQuality;
  const fa = signals.fieldAnalysis;
  const fit = taskGoal?.demand_goal_data_fit;
  const trial = signals.machineAuditTrial;

  const valueAxis = d.dataOutputValue + d.businessValue; // 0-35
  const capabilityAxis = d.ruleJudgability + d.machineAuditPotential; // 0-30

  const reuseStrong =
    hist?.historical_result_reusability === "高" &&
    (taskGoal?.asset_reusability === "高" || taskGoal?.asset_reusability === "中");

  // ⓪ 需求↔数据彻底不匹配 → 直接价值不足（fit_level=无法满足）
  if (fit?.fit_level === "无法满足") {
    return { decision: "暂不建议标·价值不足" };
  }

  // ① 价值轴极低 → 价值不足
  if (valueAxis < VALUE_AXIS_LOW) {
    const conf =
      Math.abs(valueAxis - VALUE_AXIS_LOW) <= BAND
        ? `价值轴 ${valueAxis}/35 接近临界（${VALUE_AXIS_LOW}），如能补齐数据产出目标可重新评估`
        : undefined;
    return { decision: "暂不建议标·价值不足", confidence: conf };
  }

  // ② 历史资产可直接复用 → 无需重标
  //    条件：历史结果可复用度高 + 资产可复用度高/中 + 价值轴中段以下
  if (reuseStrong && valueAxis < VALUE_AXIS_HIGH) {
    return { decision: "无需重标·复用历史资产" };
  }

  // ③ 真实 trial 成功 → 直接以 trial 推荐为准（覆盖能力轴启发式）
  if (trial?.succeeded && trial.recommended_mode) {
    // trial 路径仍带 confidence：当 trial overall_accuracy 落在 65-72% 或 87-93% 边界时
    let conf: string | undefined;
    const acc = trial.overall_accuracy;
    if (acc >= 0.65 && acc < 0.72)
      conf = `Trial accuracy ${(acc * 100).toFixed(1)}% 在 70% 临界附近，AI 预标 vs 人工兜底之间需观察`;
    else if (acc >= 0.87 && acc < 0.93)
      conf = `Trial accuracy ${(acc * 100).toFixed(1)}% 在 90% 临界附近，机审免审 vs 预标之间需小批验证`;
    return { decision: trial.recommended_mode, confidence: conf };
  }

  // ④ 能力轴判定（启发式）
  let modeDecision: FinalDecision;
  let modeConfidence: string | undefined;

  // 题目级"必须人工"占比 ≥ 50% → 人工为主（题目级硬约束优先于能力轴）
  const humanRequiredRatio =
    fa && fa.fields.length > 0 ? fa.human_required_count / fa.fields.length : 0;
  if (humanRequiredRatio >= 0.5) {
    modeDecision = "人工为主";
    if (humanRequiredRatio < 0.6)
      modeConfidence = `必须人工题目占 ${(humanRequiredRatio * 100).toFixed(0)}% 接近 50% 临界，部分题目仍可尝试 AI 预标`;
  } else if (capabilityAxis >= CAPABILITY_AXIS_HIGH) {
    modeDecision = "机器为主";
    if (capabilityAxis - CAPABILITY_AXIS_HIGH <= BAND)
      modeConfidence = `能力轴 ${capabilityAxis}/30 刚过 ${CAPABILITY_AXIS_HIGH} 临界，建议保留人工兜底通道`;
  } else if (capabilityAxis >= CAPABILITY_AXIS_MID) {
    modeDecision = "人机协同";
    if (CAPABILITY_AXIS_HIGH - capabilityAxis <= BAND)
      modeConfidence = `能力轴 ${capabilityAxis}/30 接近"机器为主"临界（${CAPABILITY_AXIS_HIGH}），跑通 trial 后可上调机审比例`;
    else if (capabilityAxis - CAPABILITY_AXIS_MID <= BAND)
      modeConfidence = `能力轴 ${capabilityAxis}/30 接近"人工为主"临界（${CAPABILITY_AXIS_MID}），高错样本仍需人工兜底`;
  } else {
    modeDecision = "人工为主";
    if (CAPABILITY_AXIS_MID - capabilityAxis <= BAND)
      modeConfidence = `能力轴 ${capabilityAxis}/30 接近"人机协同"临界（${CAPABILITY_AXIS_MID}），规则补齐后可尝试 AI 预标`;
  }

  // 价值轴边界带追加 confidence（与能力轴 confidence 合并）
  if (valueAxis < VALUE_AXIS_HIGH && valueAxis - VALUE_AXIS_LOW <= BAND * 2) {
    const valueConf = `价值轴 ${valueAxis}/35 仅勉强成立，建议先做 ${signals.fieldAnalysis ? "100" : "50"} 条小批摸底`;
    modeConfidence = modeConfidence ? `${modeConfidence}；${valueConf}` : valueConf;
  }

  return { decision: modeDecision, confidence: modeConfidence };
}

// -----------------------------------------------------------------------------
// 三问核心结论
// -----------------------------------------------------------------------------

export function buildCoreVerdict(args: {
  decision: FinalDecision;
  score: ValueScore;
  signals: DecisionSignals;
  /** 用于 Q3 trial 外推：按 category 把全样本分桶 */
  task?: EvaluationTask;
}): CoreVerdict {
  const { decision, score, signals, task } = args;
  const d = score.dimensions;
  const taskGoal = signals.taskGoal;
  const hist = signals.historicalQuality;
  const fa = signals.fieldAnalysis;
  const seg = signals.segmentation;
  const eff = signals.humanEffort;
  const mac = signals.machineAudit;
  const fit = taskGoal?.demand_goal_data_fit;
  const trial = signals.machineAuditTrial;
  const trialOk = !!trial?.succeeded;

  // ============ Q1：需不需要标 ============
  // 主线：demand_goal_data_fit（业务诉求 + 拟定方案 + 样本数据 → 能否产出 → 价值）
  let worthVerdict: CoreVerdict["worthLabeling"]["verdict"];
  let worthHeadline: string;
  const worthReasons: string[] = [];

  switch (decision) {
    case "无需重标·复用历史资产":
      worthVerdict = "无需重标";
      worthHeadline = "存量标注/历史资产可直接复用，本次无需重标";
      if (fit?.fit_reasoning) worthReasons.push(fit.fit_reasoning);
      worthReasons.push(
        `历史标注结果可复用度：${hist?.historical_result_reusability ?? "高"}`
      );
      if (taskGoal?.asset_reusability)
        worthReasons.push(`数据资产可复用度：${taskGoal.asset_reusability}`);
      worthReasons.push(`综合得分 ${score.totalScore}/100，已无新增价值缺口`);
      break;

    case "暂不建议标·价值不足":
      worthVerdict = "暂不建议标";
      worthHeadline =
        fit?.fit_level === "无法满足"
          ? `暂不建议标 — ${fit.fit_reasoning}`
          : "数据产出与业务价值不足，暂不建议投入标注";
      if (fit?.fit_reasoning) worthReasons.push(fit.fit_reasoning);
      if (fit?.expected_value) worthReasons.push(`预期价值：${fit.expected_value}`);
      worthReasons.push(
        `数据产出价值 ${d.dataOutputValue}/20、业务价值 ${d.businessValue}/15`
      );
      if ((taskGoal?.data_output_goals?.length ?? 0) === 0)
        worthReasons.push("缺少明确的数据产出目标");
      if ((taskGoal?.missing_business_context?.length ?? 0) > 0)
        worthReasons.push(
          `业务上下文缺失：${taskGoal!.missing_business_context.slice(0, 2).join("、")}`
        );
      break;

    case "暂不建议标·待补齐前置":
      worthVerdict = "暂不建议标";
      worthHeadline = "目标本身有价值，但前置条件不齐，先补齐再决定是否投入";
      if (fit?.fit_reasoning) worthReasons.push(fit.fit_reasoning);
      if ((taskGoal?.missing_business_context?.length ?? 0) > 0)
        worthReasons.push(
          `业务上下文缺失：${taskGoal!.missing_business_context.slice(0, 2).join("、")}`
        );
      if ((signals.ruleJudgability?.rule_conflicts?.length ?? 0) > 0)
        worthReasons.push(
          `规则冲突：${signals.ruleJudgability!.rule_conflicts.slice(0, 2).join("；")}`
        );
      worthReasons.push(
        `规则可判定性 ${d.ruleJudgability}/15 偏低，强行标注会带来高错率与重做风险`
      );
      break;

    default:
      // 机器为主 / 人机协同 / 人工为主 → 都值得标
      worthVerdict = "值得标";
      if (fit && fit.fit_level !== "无法满足") {
        worthHeadline = `值得标 — ${fit.what_demand_needs} 可通过 ${fit.what_data_produces} 满足`;
        worthReasons.push(fit.fit_reasoning);
        if (fit.expected_value) worthReasons.push(`预期价值：${fit.expected_value}`);
      } else if ((taskGoal?.data_output_goals?.length ?? 0) > 0) {
        worthHeadline = `值得标 — 有 ${taskGoal!.data_output_goals.length} 项数据产出目标可承接`;
      } else {
        worthHeadline = `值得标 — 综合得分 ${score.totalScore}/100，价值闭环可建立`;
      }
      if ((taskGoal?.data_output_goals?.length ?? 0) > 0)
        worthReasons.push(
          `数据产出目标：${taskGoal!.data_output_goals.slice(0, 3).join("、")}`
        );
      worthReasons.push(
        `数据产出 ${d.dataOutputValue}/20 + 业务价值 ${d.businessValue}/15 = 价值轴 ${d.dataOutputValue + d.businessValue}/35`
      );
      // 历史质量证据（至少 1 条来自 historicalQuality）
      const passRate = hist?.quality_baseline?.quality_pass_rate;
      const passRateNum = parsePctSafe(passRate);
      if (passRateNum !== null && passRateNum < 80)
        worthReasons.push(
          `历史质检通过率 ${passRate} 偏低，建议先做规则补丁再大规模重标`
        );
      const highErr = hist?.quality_baseline?.high_error_labels ?? [];
      if (highErr.length >= 2)
        worthReasons.push(
          `高错标签集中：${highErr.slice(0, 2).join("、")}（其原始标注空间值得重做）`
        );
      else if (highErr.length === 1)
        worthReasons.push(`高错标签：${highErr[0]} 需要重点关注`);
      if (hist?.historical_result_reusability)
        worthReasons.push(
          `历史标注可复用度：${hist.historical_result_reusability}（增量价值仍需重标）`
        );
      // ⚠️ 前置缺口转为 caveat 而非阻断：基于现有入参仍给出结论，缺口同时明示
      if ((taskGoal?.missing_business_context?.length ?? 0) > 0)
        worthReasons.push(
          `⚠️ 业务上下文待补齐（不阻断）：${taskGoal!.missing_business_context
            .slice(0, 3)
            .join("、")}`
        );
      if ((signals.ruleJudgability?.rule_conflicts?.length ?? 0) > 0)
        worthReasons.push(
          `⚠️ 规则冲突待澄清（不阻断）：${signals
            .ruleJudgability!.rule_conflicts.slice(0, 2)
            .join("；")}`
        );
      if (d.ruleJudgability < 6)
        worthReasons.push(
          `⚠️ 规则可判定性 ${d.ruleJudgability}/15 偏低，落地需配套培训 + 边界 Case 库`
        );
      break;
  }

  // ============ Q2：机器还是人标 ============
  // 主线：真实 trial 成功 → 直接用 trial 结果覆盖；否则回落到 decision 启发式
  let mode: CoreVerdict["labelingMode"]["mode"];
  let modeHeadline: string;
  const modeReasons: string[] = [];

  // segs 在 Q2 与 Q3 都要读，提前在此声明避免 TDZ
  const segs = seg?.sample_value_segments;

  if (
    trialOk &&
    decision !== "无需重标·复用历史资产" &&
    decision !== "暂不建议标·价值不足" &&
    decision !== "暂不建议标·待补齐前置"
  ) {
    // Trial 成功，直接以 trial 为准
    mode = trial!.recommended_mode;
    const accPct = (trial!.overall_accuracy * 100).toFixed(1);
    modeHeadline = `${mode} — Trial 在 ${trial!.trial_sample_count} 条样本上 accuracy=${accPct}%`;
    modeReasons.push(
      `Trial 在 ${trial!.trial_sample_count} 条样本上的整体 accuracy=${accPct}%`
    );
    const machineCats = trial!.per_category.filter((c) => c.mode === "machine_auto");
    const prelabelCats = trial!.per_category.filter((c) => c.mode === "ai_prelabel");
    const humanCats = trial!.per_category.filter((c) => c.mode === "human_required");
    modeReasons.push(
      `可机审类目 ${machineCats.length} / 需 AI 预标 ${prelabelCats.length} / 必须人工 ${humanCats.length}`
    );
    // Q3 证据：把每个 mode 取 1-2 个类目带出准确率，让结论卡能反向追溯到 trial 数字
    const fmtCat = (c: CategoryTrialResult) =>
      `${c.category} ${(c.accuracy * 100).toFixed(0)}%`;
    if (machineCats.length > 0)
      modeReasons.push(
        `机审类目：${machineCats.slice(0, 3).map(fmtCat).join("、")}`
      );
    if (prelabelCats.length > 0)
      modeReasons.push(
        `AI 预标类目：${prelabelCats.slice(0, 3).map(fmtCat).join("、")}`
      );
    if (humanCats.length > 0)
      modeReasons.push(
        `必须人工类目：${humanCats.slice(0, 3).map(fmtCat).join("、")}`
      );
  } else {
    // 没做 trial / trial 失败 / Q1 已否决：沿用启发式
    switch (decision) {
      case "机器为主":
        mode = "机器为主";
        modeHeadline = "机器/AI 可直接承接主路径，人工只兜底高错样本";
        break;
      case "人工为主":
        mode = "人工为主";
        modeHeadline = "规则需经验判定 / 机审弱，以人工为主、AI 辅助预填";
        break;
      case "人机协同":
        mode = "人机协同";
        modeHeadline = "AI 预标 + 人工核对，机器与人工互补";
        break;
      default:
        mode = "暂不投入";
        modeHeadline = decision.startsWith("无需重标")
          ? "无需新增标注投入"
          : "暂不投入新增标注，先补齐前置";
        break;
    }
    if (trial?.attempted && !trial.succeeded && trial.failure_reason) {
      modeReasons.push(`未做 trial：${trial.failure_reason}（沿用启发式判断）`);
    }
    modeReasons.push(
      `机审承接潜力 ${d.machineAuditPotential}/15、规则可判定性 ${d.ruleJudgability}/15`
    );
    if (fa && fa.fields.length > 0) {
      modeReasons.push(
        `题目级拆分：AI 主导 ${fa.ai_dominant_count} / 必须人工 ${fa.human_required_count} / 共 ${fa.fields.length}`
      );
    }
    // 机审能力评估：弱项 / 强项标签
    if ((mac?.machine_weakness_labels?.length ?? 0) > 0)
      modeReasons.push(
        `机审弱项：${mac!.machine_weakness_labels.slice(0, 2).join("、")} → 必须人工兜底`
      );
    if ((mac?.machine_strength_labels?.length ?? 0) > 0)
      modeReasons.push(
        `机审强项：${mac!.machine_strength_labels.slice(0, 1).join("、")} → 可信任直出`
      );
    // 样本池分桶（Q3 启发式来源）
    if (segs && (seg?.sample_count ?? 0) > 0) {
      const total = seg!.sample_count;
      const mAuto = segs.machine_auto?.count ?? 0;
      const mPre = segs.ai_prelabel_human_confirm?.count ?? 0;
      const mHuman =
        (segs.human_fallback?.count ?? 0) +
        (segs.boundary_cases?.count ?? 0) +
        (segs.high_value_human_labeling?.count ?? 0);
      modeReasons.push(
        `样本池分桶：机审 ${pct(mAuto / total)} / 预标 ${pct(mPre / total)} / 人工 ${pct(mHuman / total)}（来自启发式分层）`
      );
    }
    if (mac?.machine_capability_judgement)
      modeReasons.push(`机审判断：${mac.machine_capability_judgement}`);
  }

  // ============ Q3：各占多少 ============
  // segs 已在 Q2 顶部声明
  let totalSamples = seg?.sample_count ?? 0;
  let machineAutoCount = segs?.machine_auto?.count ?? 0;
  let aiAssistCount = segs?.ai_prelabel_human_confirm?.count ?? 0;
  let humanCount =
    (segs?.high_value_human_labeling?.count ?? 0) +
    (segs?.boundary_cases?.count ?? 0) +
    (segs?.human_fallback?.count ?? 0);
  let excludeCount = segs?.not_recommended?.count ?? 0;

  // 当 trial 成功且有任务样本时，按 per_category.mode 直接外推到全样本
  if (trialOk && task && (task.sampleData?.length ?? 0) > 0) {
    const extrapolated = extrapolateByCategory(
      task,
      trial!.per_category,
      segs?.not_recommended?.sample_ids ?? []
    );
    totalSamples = extrapolated.totalSamples;
    machineAutoCount = extrapolated.machineAutoCount;
    aiAssistCount = extrapolated.aiAssistCount;
    humanCount = extrapolated.humanCount;
    excludeCount = extrapolated.excludeCount;
  }

  const totalQuestions = fa?.fields.length ?? 0;
  const machineQuestionCount = (fa?.fields ?? []).filter(
    (f) => f.suggestedFlow === "machine_auto" || f.suggestedFlow === "ai_prefill"
  ).length;
  const aiAssistQuestionCount = (fa?.fields ?? []).filter(
    (f) => f.suggestedFlow === "ai_assist"
  ).length;
  const humanQuestionCount = (fa?.fields ?? []).filter(
    (f) => f.suggestedFlow === "human_only"
  ).length;

  const machineCarryRatio =
    totalSamples > 0 ? (machineAutoCount + aiAssistCount) / totalSamples : 0;
  const humanRatio = totalSamples > 0 ? humanCount / totalSamples : 0;

  const personDays = eff?.optimized_human_effort?.estimated_person_days ?? 0;
  const baselinePersonDays = eff?.baseline_human_effort?.estimated_person_days ?? 0;

  return {
    worthLabeling: {
      verdict: worthVerdict,
      headline: worthHeadline,
      reasons: dedupe(worthReasons)
    },
    labelingMode: {
      mode,
      headline: modeHeadline,
      reasons: dedupe(modeReasons)
    },
    scaleSplit: {
      totalSamples,
      machineAutoCount,
      aiAssistCount,
      humanCount,
      excludeCount,
      totalQuestions,
      machineQuestionCount,
      aiAssistQuestionCount,
      humanQuestionCount,
      machineCarryRatio,
      humanRatio,
      personDays,
      baselinePersonDays
    }
  };
}

/**
 * 按 trial.per_category 外推到全样本：
 *   - 命中 not_recommended 的样本 → excludeCount
 *   - 其余按 sample.category 在 trial 中的 mode 归类
 *   - trial 中未出现的 category → 默认 human_required
 */
function extrapolateByCategory(
  task: EvaluationTask,
  perCategory: CategoryTrialResult[],
  excludedIds: string[]
): {
  totalSamples: number;
  machineAutoCount: number;
  aiAssistCount: number;
  humanCount: number;
  excludeCount: number;
} {
  const modeByCat = new Map<string, CategoryTrialResult["mode"]>();
  for (const c of perCategory) modeByCat.set(c.category, c.mode);
  const excluded = new Set(excludedIds);
  let machineAutoCount = 0;
  let aiAssistCount = 0;
  let humanCount = 0;
  let excludeCount = 0;
  const samples = task.sampleData ?? [];
  for (const s of samples) {
    if (excluded.has(s.id)) {
      excludeCount += 1;
      continue;
    }
    const cat = s.category ?? "未分类";
    const m = modeByCat.get(cat) ?? "human_required";
    if (m === "machine_auto") machineAutoCount += 1;
    else if (m === "ai_prelabel") aiAssistCount += 1;
    else humanCount += 1;
  }
  return {
    totalSamples: samples.length,
    machineAutoCount,
    aiAssistCount,
    humanCount,
    excludeCount
  };
}

// -----------------------------------------------------------------------------
// 关键原因 / 风险 / 下一步
// -----------------------------------------------------------------------------

/**
 * 重写后的"关键原因 / 风险 / 下一步"
 *
 * 设计思路（与旧版本的差异）：
 *   旧：switch(FinalDecision) → 写死短语，每个任务都长得一样
 *   新："信号驱动" — keyReasons 从 5 个证据源拼出，nextStepPlan 把动作 + 数字组合起来
 *
 * keyReasons 优先级（去重后取前 5 条）：
 *   1) trial 主结论（如果 succeeded）：accuracy + 类目分布
 *   2) 历史质量：quality_pass_rate + high_error_labels 前 2 个
 *   3) 机审能力：strength/weakness labels
 *   4) 数据产出：fit_reasoning（一句话因果）
 *   5) 风险：rule_conflicts / 主观点 前 1-2 条
 *
 * nextStepPlan 按 FinalDecision 给出"动作 + 数字"组合，且数字必须来自 signals
 */
export function buildDecisionNarrative(args: {
  decision: FinalDecision;
  decisionConfidence?: string;
  score: ValueScore;
  signals: {
    dataOutputGoals: string[];
    samplePilot?: number;
    pilotDuration?: string;
    risksFromSkills: string[];
    gapsFromSkills: string[];
    requiredImprovements: string[];
  };
  /** 各 Skill 的原始输出，用于抽取证据数字 */
  evidence?: DecisionSignals;
}): {
  keyReasons: string[];
  risksAndGaps: string[];
  nextStepPlan: string[];
} {
  const { decision, decisionConfidence, score, signals, evidence } = args;
  const risks: string[] = [...signals.risksFromSkills];
  const gaps: string[] = [...signals.gapsFromSkills];

  // ============ keyReasons：5 个证据源 ============
  const reasons: string[] = [];

  // 1) trial 主结论
  reasons.push(...pickTrialReasons(evidence));

  // 2) 历史质量
  reasons.push(...pickQualityReasons(evidence));

  // 3) 机审能力
  reasons.push(...pickCapabilityReasons(evidence));

  // 4) 数据产出（fit_reasoning）
  const fit = evidence?.taskGoal?.demand_goal_data_fit;
  if (fit?.fit_reasoning) reasons.push(fit.fit_reasoning);

  // 5) 风险
  const ruleConflicts = evidence?.ruleJudgability?.rule_conflicts ?? [];
  if (ruleConflicts.length > 0)
    reasons.push(`规则冲突待澄清：${ruleConflicts.slice(0, 1).join("；")}`);
  const subjective = evidence?.ruleJudgability?.subjective_judgement_points ?? [];
  if (subjective.length > 0 && reasons.length < 5)
    reasons.push(`主观判定点：${subjective.slice(0, 2).join("、")}`);

  // 价值不足分支：补强一句价值轴诊断
  if (decision === "暂不建议标·价值不足") {
    const d = score.dimensions;
    reasons.unshift(
      `价值轴 ${d.dataOutputValue + d.businessValue}/35（数据产出 ${d.dataOutputValue}/20 + 业务价值 ${d.businessValue}/15）偏低`
    );
  }
  // 历史复用分支：明确"无新增价值"
  if (decision === "无需重标·复用历史资产") {
    reasons.unshift(
      `历史标注资产可直接复用，本次无新增价值缺口（综合 ${score.totalScore}/100）`
    );
  }
  // 边界带 confidence 加进去（让结论卡能看出"边界态"）
  if (decisionConfidence) reasons.push(`置信度：${decisionConfidence}`);

  // ============ nextStepPlan：动作 + 来自 signals 的数字 ============
  const next = buildNextStepPlan(decision, signals, evidence);

  // 兜底
  if (reasons.length === 0) reasons.push("综合分析得出当前决策");
  if (next.length === 0) next.push("等待补充材料后再做下一步规划");

  // 取前 5 条 reasons（去重）
  return {
    keyReasons: dedupe(reasons).slice(0, 5),
    risksAndGaps: dedupe([...risks, ...gaps]),
    nextStepPlan: next
  };
}

// -----------------------------------------------------------------------------
// keyReasons 抽取工具：每个返回 0..2 条
// -----------------------------------------------------------------------------

function pickTrialReasons(evidence?: DecisionSignals): string[] {
  const trial = evidence?.machineAuditTrial;
  if (!trial?.succeeded) return [];
  const accPct = (trial.overall_accuracy * 100).toFixed(1);
  const machine = trial.per_category.filter((c) => c.mode === "machine_auto").length;
  const prelabel = trial.per_category.filter((c) => c.mode === "ai_prelabel").length;
  const human = trial.per_category.filter((c) => c.mode === "human_required").length;
  const out = [
    `Trial 实测：${trial.trial_sample_count} 条样本 accuracy=${accPct}%（${trial.recommended_mode}）`
  ];
  if (trial.per_category.length > 0)
    out.push(
      `类目分布：可机审 ${machine} / 需 AI 预标 ${prelabel} / 必须人工 ${human}`
    );
  return out;
}

function pickQualityReasons(evidence?: DecisionSignals): string[] {
  const hist = evidence?.historicalQuality;
  if (!hist) return [];
  const out: string[] = [];
  const passRate = hist.quality_baseline?.quality_pass_rate;
  const passRateNum = parsePctSafe(passRate);
  if (passRateNum !== null && passRateNum < 80) {
    out.push(`历史质检通过率 ${passRate} 偏低，需先做规则补丁`);
  } else if (passRateNum !== null) {
    out.push(`历史质检通过率 ${passRate}（基线可参考）`);
  }
  const highErr = hist.quality_baseline?.high_error_labels ?? [];
  if (highErr.length >= 2)
    out.push(`高错标签集中：${highErr.slice(0, 2).join("、")}`);
  else if (highErr.length === 1) out.push(`高错标签：${highErr[0]}`);
  return out.slice(0, 2);
}

function pickCapabilityReasons(evidence?: DecisionSignals): string[] {
  const mac = evidence?.machineAudit;
  if (!mac) return [];
  const out: string[] = [];
  const weak = mac.machine_weakness_labels ?? [];
  const strong = mac.machine_strength_labels ?? [];
  if (weak.length >= 2)
    out.push(`机审弱项：${weak.slice(0, 2).join("、")}（必须人工兜底）`);
  else if (weak.length === 1)
    out.push(`机审弱项：${weak[0]}（需人工兜底）`);
  if (strong.length >= 1)
    out.push(`机审强项：${strong.slice(0, 1).join("、")}（可信任直出）`);
  return out;
}

function buildNextStepPlan(
  decision: FinalDecision,
  signals: {
    dataOutputGoals: string[];
    samplePilot?: number;
    pilotDuration?: string;
    risksFromSkills: string[];
    gapsFromSkills: string[];
    requiredImprovements: string[];
  },
  evidence?: DecisionSignals
): string[] {
  const next: string[] = [];
  const trial = evidence?.machineAuditTrial;
  const eff = evidence?.humanEffort?.optimized_human_effort;
  const histHighErr =
    evidence?.historicalQuality?.quality_baseline?.high_error_labels ?? [];

  switch (decision) {
    case "机器为主": {
      const validateN = trial?.succeeded
        ? trial.trial_sample_count * 2
        : (signals.samplePilot ?? 200);
      next.push(
        `先用 ${validateN} 条样本验证 trial 阈值稳定性，达标后接入机审免审主路径`
      );
      if (eff && eff.machine_auto_count > 0)
        next.push(
          `机审免审 ${eff.machine_auto_count} 条直接产出，人工聚焦剩余 ${eff.human_required_count} 条`
        );
      else
        next.push("把有限的人工产能集中投入到边界 Case 与机审弱项标签");
      const weak = evidence?.machineAudit?.machine_weakness_labels ?? [];
      if (weak.length > 0)
        next.push(`持续监控机审弱项：${weak.slice(0, 2).join("、")}`);
      break;
    }
    case "人机协同": {
      if (eff) {
        next.push(
          `AI 预标 ${eff.ai_prelabel_count} 条 + 人工核对 ${eff.human_required_count} 条 + 抽检 ${eff.quality_sampling_count} 条`
        );
      } else {
        next.push("AI 预标 + 人工核对，按效果再决定向机器为主或人工为主倾斜");
      }
      next.push(
        `先用 ${signals.samplePilot ?? 200} 条样本试点 ${signals.pilotDuration ?? "3 天"}，观察拉回率 / 抽检命中率`
      );
      if (signals.dataOutputGoals.length)
        next.push(`数据产出目标：${signals.dataOutputGoals.slice(0, 3).join("、")}`);
      break;
    }
    case "人工为主": {
      if (histHighErr.length > 0)
        next.push(
          `先把 ${histHighErr.length} 个高错标签做规则补丁：${histHighErr.slice(0, 2).join("、")}`
        );
      else next.push("以人工主判为主路径，AI 仅作辅助预标，不进入机审免审");
      next.push("优先安排经验型人工聚焦高价值样本与边界 Case，沉淀规则 Case 库");
      if (eff && eff.estimated_person_days > 0)
        next.push(
          `预计 ${eff.estimated_person_days} 人天 / ${eff.estimated_people_needed ?? "—"} 人；先小批试运行验证产能`
        );
      break;
    }
    case "暂不建议标·价值不足": {
      const fit = evidence?.taskGoal?.demand_goal_data_fit;
      if (fit?.fit_level && fit.fit_level !== "可满足") {
        next.push(
          `先把"需求 ↔ 数据"匹配度从「${fit.fit_level}」提到「可满足」（缺：${fit.what_demand_needs} ≠ ${fit.what_data_produces}）`
        );
      }
      next.push("与业务方对齐数据用途与价值闭环，重新评估是否值得标");
      next.push("如确需推进，建议先做 50~100 条小规模摸底再决定");
      break;
    }
    case "暂不建议标·待补齐前置": {
      // 列出 gapsFromSkills 前 2 项作为补齐清单
      if (signals.gapsFromSkills.length > 0) {
        next.push(
          `待补齐清单：${signals.gapsFromSkills.slice(0, 2).join("；")}`
        );
      }
      if (signals.requiredImprovements.length > 0)
        signals.requiredImprovements.slice(0, 2).forEach((i) => next.push(i));
      else
        next.push("补齐规则、统一冲突口径、定制外包培训案例后再启动试点");
      break;
    }
    case "无需重标·复用历史资产": {
      const reusable = evidence?.segmentation?.sample_count ?? 0;
      next.push(
        reusable > 0
          ? `复用 ${reusable} 条 历史质检通过样本 + 直接交付下游链路`
          : "直接复用历史标注结果，作为本次评测/训练的输入"
      );
      next.push("仅对历史高错 / 不稳定标签做小规模 review 即可");
      break;
    }
  }
  return next;
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = (s ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** 把 "85.0%" / "85%" / "0.85" 解析成 0..100 数值，失败返回 null */
function parsePctSafe(s: string | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  if (Number.isNaN(v)) return null;
  // 形如 "0.85" → 视为 85，> 1 直接当百分数原值
  return v > 1 ? v : v * 100;
}

/** ratio (0..1) → "X%" */
function pct(r: number): string {
  return (r * 100).toFixed(0) + "%";
}

// =============================================================================
// 人工必要性结论：是否需要人工 / 做什么 / 做多少
// =============================================================================

export function buildHumanWorkVerdict(args: {
  decision: FinalDecision;
  score: ValueScore;
  fieldAnalysis?: FieldLevelAnalysisOutput;
  humanEffort?: HumanEffortEstimationOutput;
  segmentation?: SampleSegmentationOutput;
  machineAudit?: MachineAuditCoverageOutput;
  ruleJudgability?: RuleJudgabilityOutput;
}): HumanWorkVerdict {
  const {
    decision,
    fieldAnalysis,
    humanEffort,
    segmentation,
    machineAudit,
    ruleJudgability
  } = args;

  // -------- 1) needsHuman + level 判断 --------
  const segs = segmentation?.sample_value_segments;
  const humanRequiredFields = fieldAnalysis?.human_required_count ?? 0;
  const aiAssistFields =
    fieldAnalysis?.fields?.filter((f) => f.suggestedFlow === "ai_assist").length ?? 0;
  const totalFields = fieldAnalysis?.fields?.length ?? 0;
  const totalSamples = segmentation?.sample_count ?? 0;

  const humanCount =
    (segs?.high_value_human_labeling?.count ?? 0) +
    (segs?.boundary_cases?.count ?? 0) +
    (segs?.human_fallback?.count ?? 0);
  const humanRatio = totalSamples === 0 ? 0 : humanCount / totalSamples;

  const personDays = humanEffort?.optimized_human_effort?.estimated_person_days ?? 0;

  let level: HumanWorkVerdict["level"];
  let needsHuman = true;

  if (
    decision === "暂不建议标·价值不足" ||
    decision === "无需重标·复用历史资产"
  ) {
    needsHuman = false;
    level = "几乎不需要";
  } else if (decision === "暂不建议标·待补齐前置") {
    // 投入前置补齐期间不投人工
    needsHuman = false;
    level = "几乎不需要";
  } else if (decision === "机器为主" && humanRatio < 0.2) {
    level = "轻量校对";
  } else if (decision === "人工为主") {
    level = "核心人工";
  } else if (humanRequiredFields > 0 || ruleJudgability?.judgability_level === "低") {
    level = "核心人工";
  } else if (humanRatio >= 0.5 || (totalFields > 0 && aiAssistFields >= totalFields / 2)) {
    level = "核心人工";
  } else if (humanRatio >= 0.2) {
    level = "兜底人工";
  } else {
    level = "轻量校对";
  }

  // -------- 2) 一句话回答 --------
  let headline: string;
  if (!needsHuman) {
    if (decision === "无需重标·复用历史资产") {
      headline = "无需新增人工 — 直接复用历史标注资产";
    } else if (decision === "暂不建议标·待补齐前置") {
      headline = "暂不投入人工 — 待规则/上下文补齐后再启动";
    } else {
      headline = "暂不投入人工 — 任务价值不足以支撑新增标注";
    }
  } else if (level === "核心人工") {
    headline = `必须人工 — 共 ${humanCount} 条样本需要人工核心判定，重点解决 ${humanRequiredFields} 个必须人工题目`;
  } else if (level === "兜底人工") {
    headline = `需要人工兜底 — 约 ${humanCount} 条样本需要人工校对，AI 可承担大部分预填工作`;
  } else {
    headline = `仅需轻量人工 — 机审/AI 已可承接主要工作，人工专注 ${humanCount} 条疑难样本即可`;
  }

  // -------- 3) 做什么 --------
  const whatHumanDoes: string[] = [];
  if (needsHuman) {
    if (fieldAnalysis?.what_human_does?.length) {
      whatHumanDoes.push(...fieldAnalysis.what_human_does);
    } else {
      whatHumanDoes.push("核对 AI 给出的判定结果，纠正错例");
    }
    if (humanCount > 0) {
      whatHumanDoes.push(
        `人工兜底 ${humanCount} 条疑难/边界样本（高价值 ${segs?.high_value_human_labeling?.count ?? 0} + 边界 ${segs?.boundary_cases?.count ?? 0} + 兜底 ${segs?.human_fallback?.count ?? 0}）`
      );
    }
    if (machineAudit?.machine_weakness_labels?.length) {
      whatHumanDoes.push(
        `重点处理机审弱项标签：${machineAudit.machine_weakness_labels.slice(0, 3).join("、")}`
      );
    }
  }

  const whatAIDoes: string[] = [];
  if (fieldAnalysis?.what_ai_does?.length) {
    whatAIDoes.push(...fieldAnalysis.what_ai_does);
  } else if (needsHuman) {
    whatAIDoes.push("对可结构化判定的题目直接给出结论，对类目/属性题目给出候选预填");
  }
  if (segs?.machine_auto?.count) {
    whatAIDoes.push(`机审免审 ${segs.machine_auto.count} 条（高置信 + 历史一致）`);
  }
  if (segs?.ai_prelabel_human_confirm?.count) {
    whatAIDoes.push(`AI 预标 ${segs.ai_prelabel_human_confirm.count} 条供人工快速确认`);
  }

  // -------- 4) 优先关注样本 --------
  const priorityFocus: string[] = [];
  if (needsHuman) {
    if (segs?.boundary_cases?.count) {
      priorityFocus.push(
        `边界 Case：${segs.boundary_cases.count} 条（用于规则沉淀 + 外包培训）`
      );
    }
    if (segs?.high_value_human_labeling?.count) {
      priorityFocus.push(
        `高价值人工：${segs.high_value_human_labeling.count} 条（直接进训练集 / Case 库）`
      );
    }
    if (segs?.human_fallback?.count) {
      priorityFocus.push(
        `人工兜底：${segs.human_fallback.count} 条（机审低置信 / 历史高错）`
      );
    }
    if ((segmentation?.boundary_case_ranking?.length ?? 0) > 0) {
      priorityFocus.push(
        `Top 疑难样本：已识别 ${segmentation!.boundary_case_ranking.length} 条，需优先安排专家复核`
      );
    }
  }

  // -------- 5) rationale --------
  const rationaleParts: string[] = [];
  rationaleParts.push(
    fieldAnalysis
      ? `题目级拆分：AI 主导 ${fieldAnalysis.ai_dominant_count} / 必须人工 ${fieldAnalysis.human_required_count} / 共 ${fieldAnalysis.fields.length} 题目`
      : "题目级拆分：信息不足"
  );
  rationaleParts.push(
    `样本结构：${segs?.machine_auto?.count ?? 0} 机审免审 / ${segs?.ai_prelabel_human_confirm?.count ?? 0} AI 预标 / ${humanCount} 人工`
  );
  if (humanEffort) {
    rationaleParts.push(
      `预计人工：${humanEffort.optimized_human_effort.estimated_person_days} 人天（vs 全人工 ${humanEffort.baseline_human_effort.estimated_person_days} 人天）`
    );
  }
  const rationale = rationaleParts.join("；");

  return {
    needsHuman,
    level,
    headline,
    whatHumanDoes: dedupe(whatHumanDoes),
    whatAIDoes: dedupe(whatAIDoes),
    estimatedHumanSampleCount: humanCount,
    estimatedPersonDays: personDays,
    priorityFocus,
    rationale
  };
}
