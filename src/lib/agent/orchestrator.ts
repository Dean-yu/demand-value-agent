// =============================================================================
// 任务价值评估 Agent —— Orchestrator
// 顺序调度 8 个 Skill，沿途累积 shared context；最后做评分 + 决策 + 报告。
// 预留 conflictReflection / rerunWithAdditionalContext 钩子供后续多轮反思扩展。
// =============================================================================

import { getLLMProvider } from "../llm/provider";
import { fieldLevelAnalysisSkill } from "../skills/fieldLevelAnalysisSkill";
import { historicalQualitySkill } from "../skills/historicalQualitySkill";
import { humanEffortEstimationSkill } from "../skills/humanEffortEstimationSkill";
import { machineAuditCoverageSkill } from "../skills/machineAuditCoverageSkill";
import { machineAuditTrialSkill } from "../skills/machineAuditTrialSkill";
import { reportGenerationSkill } from "../skills/reportGenerationSkill";
import { ruleJudgabilitySkill } from "../skills/ruleJudgabilitySkill";
import { sampleSegmentationSkill } from "../skills/sampleSegmentationSkill";
import type { SkillContext } from "../skills/skillTypes";
import { strategyGenerationSkill } from "../skills/strategyGenerationSkill";
import { taskGoalSkill } from "../skills/taskGoalSkill";
import {
  buildCoreVerdict,
  buildDecisionNarrative,
  buildHumanWorkVerdict,
  decideFinal
} from "./decision";
import { computeValueScore } from "./scoring";
import type {
  AgentRunResult,
  EvaluationTask,
  FieldLevelAnalysisOutput,
  FinalTaskValueAssessment,
  HistoricalQualityOutput,
  HumanEffortEstimationOutput,
  MachineAuditCoverageOutput,
  MachineAuditTrialOutput,
  RuleJudgabilityOutput,
  SampleSegmentationOutput,
  SkillRun,
  StrategyOutput,
  TaskGoalOutput
} from "./types";

export type SkillProgressEvent = {
  type: "skill_started" | "skill_completed";
  run: SkillRun;
};

export interface OrchestratorOptions {
  onProgress?: (e: SkillProgressEvent) => void;
}

/**
 * 顺序执行 8 个 Skill，并产出最终评估结果。
 */
export async function runAgent(
  task: EvaluationTask,
  options: OrchestratorOptions = {}
): Promise<AgentRunResult> {
  const llm = await getLLMProvider();
  const ctx: SkillContext = {
    task,
    llm,
    shared: {}
  };
  const runs: SkillRun[] = [];
  const onProgress = options.onProgress ?? (() => {});

  // -------------------------------------------------------------------------
  // 顺序流程
  // -------------------------------------------------------------------------
  const steps = [
    { skill: taskGoalSkill, key: "taskGoal" },
    { skill: ruleJudgabilitySkill, key: "ruleJudgability" },
    { skill: fieldLevelAnalysisSkill, key: "fieldAnalysis" },
    // 真实机审 trial 必须在 sampleSegmentation 之前，让分桶可以用 per-category mode
    { skill: machineAuditTrialSkill, key: "machineAuditTrial" },
    { skill: sampleSegmentationSkill, key: "sampleSegmentation" },
    { skill: historicalQualitySkill, key: "historicalQuality" },
    { skill: machineAuditCoverageSkill, key: "machineAuditCoverage" },
    { skill: humanEffortEstimationSkill, key: "humanEffort" },
    { skill: strategyGenerationSkill, key: "strategy" }
  ] as const;

  for (const step of steps) {
    const skill = step.skill;
    const startRun: SkillRun = {
      id: skill.name,
      name: skill.title,
      status: "running",
      startedAt: new Date().toISOString()
    };
    onProgress({ type: "skill_started", run: startRun });
    runs.push(startRun);

    try {
      const { run, output } = await skill.run(ctx);
      // 替换 runs 中的对应 entry
      const idx = runs.findIndex((r) => r.id === skill.name);
      if (idx >= 0) runs[idx] = run;
      ctx.shared[step.key] = output;
      onProgress({ type: "skill_completed", run });
    } catch (e: any) {
      const failed: SkillRun = {
        ...startRun,
        status: "failed",
        endedAt: new Date().toISOString(),
        summary: `${skill.title} 执行失败：${e?.message ?? "未知错误"}`,
        warnings: [String(e?.message ?? e)]
      };
      const idx = runs.findIndex((r) => r.id === skill.name);
      if (idx >= 0) runs[idx] = failed;
      onProgress({ type: "skill_completed", run: failed });
    }
  }

  // -------------------------------------------------------------------------
  // 评分 + 决策
  // -------------------------------------------------------------------------
  const decisionSignals = {
    taskGoal: ctx.shared.taskGoal as TaskGoalOutput | undefined,
    ruleJudgability: ctx.shared.ruleJudgability as RuleJudgabilityOutput | undefined,
    historicalQuality: ctx.shared.historicalQuality as HistoricalQualityOutput | undefined,
    fieldAnalysis: ctx.shared.fieldAnalysis as FieldLevelAnalysisOutput | undefined,
    segmentation: ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined,
    machineAudit: ctx.shared.machineAuditCoverage as MachineAuditCoverageOutput | undefined,
    humanEffort: ctx.shared.humanEffort as HumanEffortEstimationOutput | undefined,
    machineAuditTrial: ctx.shared.machineAuditTrial as MachineAuditTrialOutput | undefined
  };
  const score = computeValueScore({
    taskGoal: decisionSignals.taskGoal,
    ruleJudgability: decisionSignals.ruleJudgability,
    sampleSegmentation: decisionSignals.segmentation,
    historicalQuality: decisionSignals.historicalQuality,
    machineAudit: decisionSignals.machineAudit,
    humanEffort: decisionSignals.humanEffort
  });
  const decisionResult = decideFinal(score, decisionSignals);
  const decision = decisionResult.decision;
  const decisionConfidence = decisionResult.confidence;
  const coreVerdict = buildCoreVerdict({
    decision,
    score,
    signals: decisionSignals,
    task: ctx.task
  });

  // 汇集风险/缺口/改造来源
  const risksFromSkills: string[] = [];
  const gapsFromSkills: string[] = [];
  const collectWarnings = (output: any): string[] =>
    Array.isArray(output?.risk_points) ? output.risk_points : [];

  const ruleJudge = ctx.shared.ruleJudgability as RuleJudgabilityOutput | undefined;
  const hist = ctx.shared.historicalQuality as HistoricalQualityOutput | undefined;
  const seg = ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined;
  const mac = ctx.shared.machineAuditCoverage as MachineAuditCoverageOutput | undefined;
  const taskGoal = ctx.shared.taskGoal as TaskGoalOutput | undefined;

  if (ruleJudge?.rule_conflicts?.length)
    risksFromSkills.push(...ruleJudge.rule_conflicts.map((c) => `规则冲突：${c}`));
  if (ruleJudge?.risk_points?.length) risksFromSkills.push(...ruleJudge.risk_points);
  if (hist?.human_labeling_risks?.length) risksFromSkills.push(...hist.human_labeling_risks);
  if (seg?.sample_quality_issues?.length) risksFromSkills.push(...seg.sample_quality_issues);
  if (mac?.machine_weakness_labels?.length)
    risksFromSkills.push(`机审弱项标签：${mac.machine_weakness_labels.slice(0, 3).join("、")}`);

  if (taskGoal?.missing_business_context?.length)
    gapsFromSkills.push(...taskGoal.missing_business_context.map((g) => `业务上下文缺失：${g}`));

  const strategy = ctx.shared.strategy as StrategyOutput | undefined;
  const narrative = buildDecisionNarrative({
    decision,
    decisionConfidence,
    score,
    signals: {
      dataOutputGoals: taskGoal?.data_output_goals ?? [],
      samplePilot: strategy?.pilot_plan?.pilot_sample_size,
      pilotDuration: strategy?.pilot_plan?.pilot_duration,
      risksFromSkills,
      gapsFromSkills,
      requiredImprovements: strategy?.scale_plan?.required_improvements ?? []
    },
    evidence: decisionSignals
  });

  // 计算"是否需要人工 / 做什么 / 做多少"结论
  const fieldAnalysis =
    (ctx.shared.fieldAnalysis as FieldLevelAnalysisOutput | undefined) ??
    emptyFieldAnalysis();
  const humanEffortOut = ctx.shared.humanEffort as
    | HumanEffortEstimationOutput
    | undefined;
  const segOut0 = ctx.shared.sampleSegmentation as
    | SampleSegmentationOutput
    | undefined;
  const macOut0 = ctx.shared.machineAuditCoverage as
    | MachineAuditCoverageOutput
    | undefined;

  const humanWork = buildHumanWorkVerdict({
    decision,
    score,
    fieldAnalysis,
    humanEffort: humanEffortOut,
    segmentation: segOut0,
    machineAudit: macOut0,
    ruleJudgability: ruleJudge
  });

  // 把决策与评分写入 shared，供 reportGenerationSkill 使用
  ctx.shared.finalDecision = decision;
  ctx.shared.coreVerdict = coreVerdict;
  ctx.shared.valueScore = score;
  ctx.shared.keyReasons = narrative.keyReasons;
  ctx.shared.risksAndGaps = narrative.risksAndGaps;
  ctx.shared.nextStepPlan = narrative.nextStepPlan;
  ctx.shared.humanWork = humanWork;

  // 报告 Skill 单独跑（依赖前面所有结果）
  const reportSkill = reportGenerationSkill;
  const reportStart: SkillRun = {
    id: reportSkill.name,
    name: reportSkill.title,
    status: "running",
    startedAt: new Date().toISOString()
  };
  onProgress({ type: "skill_started", run: reportStart });
  runs.push(reportStart);
  let reportOutput: { executive_summary_markdown: string; detailed_report_markdown: string };
  try {
    const r = await reportSkill.run(ctx);
    const idx = runs.findIndex((x) => x.id === reportSkill.name);
    if (idx >= 0) runs[idx] = r.run;
    reportOutput = r.output;
    onProgress({ type: "skill_completed", run: r.run });
  } catch (e: any) {
    reportOutput = {
      executive_summary_markdown: `# 任务价值评估结论\n\n报告生成失败：${e?.message ?? ""}`,
      detailed_report_markdown: ""
    };
    const failed: SkillRun = {
      ...reportStart,
      status: "failed",
      endedAt: new Date().toISOString(),
      summary: "报告生成失败：" + (e?.message ?? "")
    };
    const idx = runs.findIndex((x) => x.id === reportSkill.name);
    if (idx >= 0) runs[idx] = failed;
    onProgress({ type: "skill_completed", run: failed });
  }

  // -------------------------------------------------------------------------
  // 组装 FinalTaskValueAssessment
  // -------------------------------------------------------------------------
  const segOut = ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined;
  const eff = ctx.shared.humanEffort as HumanEffortEstimationOutput | undefined;
  const macOut = ctx.shared.machineAuditCoverage as MachineAuditCoverageOutput | undefined;

  const trialOut = ctx.shared.machineAuditTrial as MachineAuditTrialOutput | undefined;
  const assessment: FinalTaskValueAssessment = {
    finalDecision: decision,
    decisionConfidence,
    coreVerdict,
    valueScore: score,
    dataOutputGoals: taskGoal?.data_output_goals ?? [],
    sampleStrategy: toSampleStrategy(segOut),
    humanEffortEstimate: toHumanEffort(eff),
    machineAuditAssessment: toMachineAudit(macOut),
    fieldAnalysis,
    humanWork,
    boundaryCaseRanking: segOut?.boundary_case_ranking ?? [],
    historicalReusability: hist?.historical_result_reusability ?? "—",
    assetReusability: taskGoal?.asset_reusability ?? "—",
    keyReasons: narrative.keyReasons,
    risksAndGaps: narrative.risksAndGaps,
    nextStepPlan: narrative.nextStepPlan,
    machineAuditTrial: trialOut,
    executiveSummaryMarkdown: reportOutput.executive_summary_markdown,
    detailedReportMarkdown: reportOutput.detailed_report_markdown
  };

  return {
    task: { ...task, status: "completed" },
    skills: runs,
    assessment
  };
}

// -----------------------------------------------------------------------------
// 多轮反思预留钩子（v1 暂不调用，留接口给后续扩展）
// -----------------------------------------------------------------------------

/** 预留：检测 Skill 输出之间是否存在冲突 */
export function conflictReflection(_runs: SkillRun[]): string[] {
  return [];
}

/** 预留：补充上下文后再跑一遍 */
export async function rerunWithAdditionalContext(
  task: EvaluationTask,
  _additionalContext: Record<string, unknown>,
  options: OrchestratorOptions = {}
): Promise<AgentRunResult> {
  // v1：直接重新跑一遍
  return runAgent(task, options);
}

// -----------------------------------------------------------------------------
// 类型转换工具
// -----------------------------------------------------------------------------

function toSampleStrategy(seg: SampleSegmentationOutput | undefined) {
  if (!seg) {
    return {
      totalCount: 0,
      segments: {
        highValueHumanLabeling: emptySeg(),
        boundaryCases: emptySeg(),
        machineAuto: emptySeg(),
        aiPrelabelHumanConfirm: emptySeg(),
        humanFallback: emptySeg(),
        notRecommended: emptySeg()
      }
    };
  }
  const s = seg.sample_value_segments;
  return {
    totalCount: seg.sample_count,
    segments: {
      highValueHumanLabeling: convertSeg(s.high_value_human_labeling),
      boundaryCases: convertSeg(s.boundary_cases),
      machineAuto: convertSeg(s.machine_auto),
      aiPrelabelHumanConfirm: convertSeg(s.ai_prelabel_human_confirm),
      humanFallback: convertSeg(s.human_fallback),
      notRecommended: convertSeg(s.not_recommended)
    }
  };
}

function convertSeg(seg: any) {
  return {
    count: seg?.count ?? 0,
    ratio: seg?.ratio ?? 0,
    sampleIds: seg?.sample_ids ?? [],
    criteria: seg?.criteria ?? [],
    reason: seg?.reason ?? ""
  };
}

function emptySeg() {
  return { count: 0, ratio: 0, sampleIds: [], criteria: [], reason: "" };
}

function toHumanEffort(eff: HumanEffortEstimationOutput | undefined) {
  if (!eff) {
    return {
      baseline: {
        fullManualSampleCount: 0,
        avgSecondsPerItem: 0,
        totalHours: 0,
        personDays: 0
      },
      optimized: {
        machineAutoCount: 0,
        aiPrelabelCount: 0,
        humanRequiredCount: 0,
        qualitySamplingCount: 0,
        totalHours: 0,
        personDays: 0
      },
      reduction: {
        sampleReductionRatio: 0,
        hourReductionRatio: 0,
        reason: []
      }
    };
  }
  return {
    baseline: {
      fullManualSampleCount: eff.baseline_human_effort.full_manual_sample_count,
      avgSecondsPerItem: eff.baseline_human_effort.estimated_time_per_item_seconds,
      totalHours: eff.baseline_human_effort.estimated_total_hours,
      personDays: eff.baseline_human_effort.estimated_person_days,
      estimatedPeopleNeeded: eff.baseline_human_effort.estimated_people_needed
    },
    optimized: {
      machineAutoCount: eff.optimized_human_effort.machine_auto_count,
      aiPrelabelCount: eff.optimized_human_effort.ai_prelabel_count,
      humanRequiredCount: eff.optimized_human_effort.human_required_count,
      qualitySamplingCount: eff.optimized_human_effort.quality_sampling_count,
      totalHours: eff.optimized_human_effort.estimated_total_hours,
      personDays: eff.optimized_human_effort.estimated_person_days,
      estimatedPeopleNeeded: eff.optimized_human_effort.estimated_people_needed
    },
    reduction: {
      sampleReductionRatio: parsePct(eff.reduction_space.sample_reduction_ratio),
      hourReductionRatio: parsePct(eff.reduction_space.human_hour_reduction_ratio),
      reason: eff.reduction_space.reduction_reason ?? []
    }
  };
}

function toMachineAudit(m: MachineAuditCoverageOutput | undefined) {
  if (!m) {
    return {
      machineCoverageRatio: 0,
      highConfidenceAutoRatio: 0,
      prelabelCandidateRatio: 0,
      humanFallbackRatio: 0,
      strengthLabels: [],
      weaknessLabels: [],
      errorPatterns: [],
      judgement: "未提供机审结果"
    };
  }
  return {
    machineCoverageRatio: parsePct(m.machine_coverage),
    highConfidenceAutoRatio: parsePct(m.high_confidence_auto_ratio),
    prelabelCandidateRatio: parsePct(m.prelabel_candidate_ratio),
    humanFallbackRatio: parsePct(m.human_fallback_ratio),
    strengthLabels: m.machine_strength_labels ?? [],
    weaknessLabels: m.machine_weakness_labels ?? [],
    errorPatterns: m.machine_error_patterns ?? [],
    judgement: m.machine_capability_judgement
  };
}

function parsePct(s: string): number {
  const m = (s ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = Number(m[1]);
  return v > 1 ? v / 100 : v;
}

function emptyFieldAnalysis(): FieldLevelAnalysisOutput {
  return {
    fields: [],
    ai_dominant_count: 0,
    human_required_count: 0,
    what_ai_does: [],
    what_human_does: ["未识别到判定题目，无法做拆分"],
    summary: "题目级分析无可用数据"
  };
}
