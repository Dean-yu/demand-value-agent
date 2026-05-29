// =============================================================================
// 价值评分模型 —— 7 维度，满分 100
// =============================================================================

import type {
  HistoricalQualityOutput,
  HumanEffortEstimationOutput,
  MachineAuditCoverageOutput,
  RuleJudgabilityOutput,
  SampleSegmentationOutput,
  TaskGoalOutput,
  ValueScore
} from "./types";

interface ScoringInput {
  taskGoal?: TaskGoalOutput;
  ruleJudgability?: RuleJudgabilityOutput;
  sampleSegmentation?: SampleSegmentationOutput;
  historicalQuality?: HistoricalQualityOutput;
  machineAudit?: MachineAuditCoverageOutput;
  humanEffort?: HumanEffortEstimationOutput;
}

/**
 * 维度分配：
 * - 数据产出价值 0-20
 * - 业务价值 0-15
 * - 规则可判定性 0-15
 * - 样本池价值 0-15
 * - 机审减量潜力 0-15
 * - 人工减量价值 0-10
 * - 交付风险可控性 0-10
 */
export function computeValueScore(input: ScoringInput): ValueScore {
  const dataOutputValue = scoreDataOutputValue(input.taskGoal); // 0-20
  const businessValue = scoreBusinessValue(input.taskGoal); // 0-15
  const ruleJudgability = scoreRuleJudgability(input.ruleJudgability); // 0-15
  const sampleValue = scoreSampleValue(input.sampleSegmentation); // 0-15
  const machineAuditPotential = scoreMachineAuditPotential(input.machineAudit); // 0-15
  const humanReductionValue = scoreHumanReductionValue(input.humanEffort); // 0-10
  const deliveryRiskControl = scoreDeliveryRiskControl(input); // 0-10

  const total =
    dataOutputValue +
    businessValue +
    ruleJudgability +
    sampleValue +
    machineAuditPotential +
    humanReductionValue +
    deliveryRiskControl;

  return {
    totalScore: Math.round(total),
    dimensions: {
      dataOutputValue: round(dataOutputValue),
      businessValue: round(businessValue),
      ruleJudgability: round(ruleJudgability),
      sampleValue: round(sampleValue),
      machineAuditPotential: round(machineAuditPotential),
      humanReductionValue: round(humanReductionValue),
      deliveryRiskControl: round(deliveryRiskControl)
    }
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// -----------------------------------------------------------------------------

function scoreDataOutputValue(g: TaskGoalOutput | undefined): number {
  if (!g) return 4;
  let s = 8;
  const goals = g.data_output_goals?.length ?? 0;
  if (goals >= 3) s += 6;
  else if (goals >= 2) s += 4;
  else if (goals >= 1) s += 2;
  else s -= 2;

  if (g.asset_reusability === "高") s += 4;
  else if (g.asset_reusability === "中") s += 2;

  if ((g.missing_business_context?.length ?? 0) >= 3) s -= 4;
  else if ((g.missing_business_context?.length ?? 0) >= 1) s -= 2;

  return clamp(s, 0, 20);
}

function scoreBusinessValue(g: TaskGoalOutput | undefined): number {
  if (!g) return 5;
  let s = 8;
  const usage = g.downstream_usage?.length ?? 0;
  if (usage >= 3) s += 5;
  else if (usage >= 2) s += 3;
  else if (usage >= 1) s += 1;

  if (g.value_chain && g.value_chain.length >= 10) s += 2;
  if ((g.missing_business_context?.length ?? 0) >= 2) s -= 2;
  return clamp(s, 0, 15);
}

function scoreRuleJudgability(r: RuleJudgabilityOutput | undefined): number {
  if (!r) return 4;
  let s = 4;
  if (r.judgability_level === "高") s += 7;
  else if (r.judgability_level === "中") s += 4;

  if (r.rule_clarity === "高") s += 3;
  else if (r.rule_clarity === "中") s += 1;

  if ((r.rule_conflicts?.length ?? 0) >= 2) s -= 3;
  else if ((r.rule_conflicts?.length ?? 0) >= 1) s -= 1;

  if ((r.machine_readable_rule_points?.length ?? 0) >= 3) s += 1;
  if ((r.human_required_rule_points?.length ?? 0) >= 5) s -= 1;
  return clamp(s, 0, 15);
}

function scoreSampleValue(s: SampleSegmentationOutput | undefined): number {
  if (!s) return 4;
  const segs = s.sample_value_segments;
  const high = segs?.high_value_human_labeling?.ratio ?? 0;
  const boundary = segs?.boundary_cases?.ratio ?? 0;
  const notRec = segs?.not_recommended?.ratio ?? 0;

  let v = 4;
  v += Math.min(6, Math.round(high * 12)); // 高价值占比贡献 0-6
  v += Math.min(4, Math.round(boundary * 8)); // 边界占比贡献 0-4
  v -= Math.min(4, Math.round(notRec * 6)); // 不建议占比扣 0-4
  if (s.sample_count >= 200) v += 2;
  else if (s.sample_count < 30) v -= 2;
  if ((s.sample_quality_issues?.length ?? 0) >= 2) v -= 2;
  return clamp(v, 0, 15);
}

function scoreMachineAuditPotential(m: MachineAuditCoverageOutput | undefined): number {
  if (!m) return 2;
  const high = parsePct(m.high_confidence_auto_ratio);
  const mid = parsePct(m.prelabel_candidate_ratio);
  const weakness = m.machine_weakness_labels?.length ?? 0;
  const strength = m.machine_strength_labels?.length ?? 0;

  let v = 2;
  v += Math.min(8, Math.round(high * 14)); // 高置信占比贡献 0-8
  v += Math.min(4, Math.round(mid * 6)); // 中置信占比贡献 0-4
  v += Math.min(2, strength); // 强项标签每个 +1，最多 +2
  v -= Math.min(3, weakness); // 弱项标签每个 -1，最多 -3
  return clamp(v, 0, 15);
}

function scoreHumanReductionValue(e: HumanEffortEstimationOutput | undefined): number {
  if (!e) return 2;
  const r = parsePct(e.reduction_space.human_hour_reduction_ratio);
  let v = Math.round(r * 12);
  // 减量过低时基线给 1 分
  if (v < 1) v = 1;
  return clamp(v, 0, 10);
}

function scoreDeliveryRiskControl(input: ScoringInput): number {
  let v = 7;
  const r = input.ruleJudgability;
  const h = input.historicalQuality;
  const s = input.sampleSegmentation;
  const m = input.machineAudit;

  if ((r?.rule_conflicts?.length ?? 0) >= 1) v -= 2;
  if ((r?.judgability_level ?? "中") === "低") v -= 2;

  if (h?.historical_result_reusability === "低") v -= 2;
  else if (h?.historical_result_reusability === "高") v += 1;

  if ((s?.sample_quality_issues?.length ?? 0) >= 2) v -= 1;
  if ((m?.machine_weakness_labels?.length ?? 0) >= 3) v -= 1;
  return clamp(v, 0, 10);
}

function parsePct(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = Number(m[1]);
  return v > 1 ? v / 100 : v;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
