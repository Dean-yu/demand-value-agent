import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  HistoricalQualityOutput,
  HumanEffortEstimationOutput,
  MachineAuditCoverageOutput,
  RuleJudgabilityOutput,
  SampleSegmentationOutput,
  StrategyOutput,
  TaskGoalOutput
} from "../agent/types";

const SKILL_NAME = "task_investment_strategy";

/**
 * Skill 7：任务投入策略生成
 * 把前面所有分析转成可执行的投入策略：数据生产 / 人机分工 / 试点 / 放量。
 */
export const strategyGenerationSkill: SkillModule<StrategyOutput> = {
  name: SKILL_NAME,
  title: "任务投入策略生成",
  description: "结合任务目标 / 规则 / 样本 / 历史质量 / 机审能力，生成可执行的投入策略",
  inputSchema:
    "{ taskGoal, ruleJudgability, sampleSegmentation, historicalQuality, machineAudit, humanEffort }",
  outputSchema: `{
  data_production_strategy, human_machine_collaboration, pilot_plan, scale_plan, summary
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const taskGoal = ctx.shared.taskGoal as TaskGoalOutput | undefined;
    const ruleJudge = ctx.shared.ruleJudgability as RuleJudgabilityOutput | undefined;
    const seg = ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined;
    const hist = ctx.shared.historicalQuality as HistoricalQualityOutput | undefined;
    const macA = ctx.shared.machineAuditCoverage as MachineAuditCoverageOutput | undefined;
    const eff = ctx.shared.humanEffort as HumanEffortEstimationOutput | undefined;

    // 兜底数据
    const dataset = taskGoal?.data_output_goals ?? ["规则Case库", "评测集"];
    const segs = seg?.sample_value_segments;
    const machineCount = segs?.machine_auto?.count ?? 0;
    const aiCount = segs?.ai_prelabel_human_confirm?.count ?? 0;
    const humanCount =
      (segs?.high_value_human_labeling?.count ?? 0) +
      (segs?.boundary_cases?.count ?? 0) +
      (segs?.human_fallback?.count ?? 0);

    const payload: StrategyOutput = {
      data_production_strategy: {
        target_dataset: dataset,
        sample_selection_strategy: buildSampleSelection(seg, hist),
        labeling_strategy: buildLabelingStrategy(seg, ruleJudge),
        quality_strategy: buildQualityStrategy(hist, ctx.task.capacityParams.qualitySamplingRatio ?? 0.1),
        machine_audit_strategy: buildMachineAuditStrategy(macA)
      },
      human_machine_collaboration: {
        machine_auto: buildMachineAutoCriteria(macA),
        ai_prelabel_human_confirm: ["机审中置信样本", "规则可解释样本"],
        human_focus: [
          "高价值人工标注样本",
          "边界 Case",
          "机审低置信 / 历史高错样本",
          "可沉淀规则 Case 的样本"
        ],
        exclude_or_hold: [
          "字段缺失严重样本",
          "重复 / 无业务闭环样本",
          ...(ruleJudge?.rule_conflicts ?? []).slice(0, 2).map((c) => `规则冲突相关样本：${c.slice(0, 30)}`)
        ]
      },
      pilot_plan: {
        pilot_sample_size: pickPilotSize(seg?.sample_count ?? 0),
        pilot_duration: ctx.task.capacityParams.targetDeliveryDays
          ? `${Math.max(2, Math.min(5, Math.floor(ctx.task.capacityParams.targetDeliveryDays / 2)))} 天`
          : "3 天",
        acceptance_metrics: [
          "质检通过率 ≥ 90%",
          "样本边界争议率 ≤ 10%",
          `机审免审准确率 ≥ ${(macA?.recommended_thresholds?.auto_threshold ?? 0.9) * 100}%`,
          "AI 预标人工修正率 ≤ 15%"
        ]
      },
      scale_plan: {
        scale_condition: buildScaleConditions(macA, hist, ruleJudge),
        scale_risks: buildScaleRisks(ruleJudge, hist, macA),
        required_improvements: buildRequiredImprovements(ruleJudge, hist, taskGoal)
      },
      summary:
        `投入策略：机审承接 ${machineCount} / AI 预标 ${aiCount} / 人工 ${humanCount}；` +
        `先小规模试点验证，再按指标条件放量`
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n基于上述各 Skill 结果，生成投入策略 JSON：\n` +
      `[[PAYLOAD]]${JSON.stringify({ strategy: payload })}[[/PAYLOAD]]`;

    let output: StrategyOutput;
    try {
      output = await ctx.llm.generateJSON<StrategyOutput>({
        systemPrompt:
          "你是「任务投入策略生成」Skill，请严格输出 JSON，可在 reason 文字层面优化但保留结构与数值。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch {
      output = payload;
    }

    return {
      run: finishRun(run, {
        status: "completed",
        summary: output.summary,
        keyFindings: [
          `数据产出：${output.data_production_strategy.target_dataset.join("、")}`,
          `试点规模：${output.pilot_plan.pilot_sample_size} 条 / ${output.pilot_plan.pilot_duration}`,
          `放量条件：${(output.scale_plan.scale_condition ?? []).slice(0, 2).join("；")}`
        ],
        warnings: output.scale_plan.scale_risks ?? [],
        output
      }),
      output
    };
  }
};

function buildSampleSelection(
  seg: SampleSegmentationOutput | undefined,
  hist: HistoricalQualityOutput | undefined
): string {
  const parts = [
    "优先纳入：高价值样本、边界 Case、机审低置信样本、历史高错样本",
    "过滤：字段缺失、重复样本、无业务闭环样本"
  ];
  if (hist?.quality_baseline?.high_error_labels?.length) {
    parts.push(
      `重点覆盖高错标签：${hist.quality_baseline.high_error_labels.slice(0, 3).join("、")}`
    );
  }
  if ((seg?.sample_value_segments?.boundary_cases?.count ?? 0) > 0) {
    parts.push("边界样本独立纳入规则 Case 库 + 用于外包培训");
  }
  return parts.join("；");
}

function buildLabelingStrategy(
  seg: SampleSegmentationOutput | undefined,
  rule: RuleJudgabilityOutput | undefined
): string {
  const lines = [
    "高价值样本：人工双标 + 抽检",
    "边界 Case：人工双标 + 专家复核",
    "AI 预标候选：AI 预标 + 人工确认",
    "机审免审：机审高置信 + 历史一致即免审"
  ];
  if ((rule?.judgability_level ?? "中") === "低") {
    lines.unshift("规则可判定性偏低，先补齐规则文档再放量");
  }
  return lines.join("；");
}

function buildQualityStrategy(
  hist: HistoricalQualityOutput | undefined,
  defaultRatio: number
): string {
  const baseRatio = Math.round(defaultRatio * 100);
  const parts = [`全量任务 ${baseRatio}% 抽检`];
  if (hist?.quality_baseline?.high_error_labels?.length) {
    parts.push(`高错标签提升至 ${Math.min(30, baseRatio * 2)}% 抽检`);
  }
  if ((hist?.historical_result_reusability ?? "中") === "低") {
    parts.push("历史结果可复用性低，新增专家终审环节");
  }
  return parts.join("；");
}

function buildMachineAuditStrategy(mac: MachineAuditCoverageOutput | undefined): string {
  if (!mac) return "未提供机审，建议先做评测集校准再考虑接入";
  return (
    `高置信(≥${mac.recommended_thresholds.auto_threshold})免审；` +
    `中置信(${mac.recommended_thresholds.prelabel_threshold}~${mac.recommended_thresholds.auto_threshold})走 AI 预标；` +
    `低置信(<${mac.recommended_thresholds.fallback_threshold})走人工兜底`
  );
}

function buildMachineAutoCriteria(mac: MachineAuditCoverageOutput | undefined): string[] {
  const list = ["规则明确 + 机审高置信 + 历史一致"];
  if (mac?.machine_strength_labels?.length) {
    list.push(
      `机审强项标签：${mac.machine_strength_labels.slice(0, 3).join("、")}`
    );
  }
  return list;
}

function pickPilotSize(total: number): number {
  if (total >= 5000) return 500;
  if (total >= 1000) return 300;
  if (total >= 200) return 200;
  return Math.max(100, Math.min(total, 200));
}

function buildScaleConditions(
  mac: MachineAuditCoverageOutput | undefined,
  hist: HistoricalQualityOutput | undefined,
  rule: RuleJudgabilityOutput | undefined
): string[] {
  const list = [
    "试点 KPI 全部达标（质检通过率、争议率、人均日产量）"
  ];
  if (mac && mac.machine_weakness_labels.length === 0) {
    list.push("机审弱项标签数为 0，机审准确率验证通过");
  } else {
    list.push("机审弱项标签准确率经过定向修复");
  }
  if ((rule?.rule_conflicts?.length ?? 0) === 0) {
    list.push("规则文档无冲突 / 已统一口径");
  } else {
    list.push("规则冲突全部澄清并落版");
  }
  if (hist && hist.historical_result_reusability !== "低") {
    list.push("历史质检通过率 ≥ 90% 且持续 3 天稳定");
  }
  return list;
}

function buildScaleRisks(
  rule: RuleJudgabilityOutput | undefined,
  hist: HistoricalQualityOutput | undefined,
  mac: MachineAuditCoverageOutput | undefined
): string[] {
  const list: string[] = [];
  if ((rule?.rule_conflicts?.length ?? 0) > 0)
    list.push("规则文档存在冲突，外包稳定性风险");
  if ((rule?.judgability_level ?? "中") === "低")
    list.push("规则可判定性低，难以规模化稳定生产");
  if ((hist?.human_labeling_risks?.length ?? 0) > 0)
    list.push("历史人工标注存在不稳定标签，放量后错误率可能放大");
  if (mac && mac.machine_weakness_labels.length > 0)
    list.push("机审弱项标签可能误覆盖 → 需要人工兜底兜得住");
  return list;
}

function buildRequiredImprovements(
  rule: RuleJudgabilityOutput | undefined,
  hist: HistoricalQualityOutput | undefined,
  taskGoal: TaskGoalOutput | undefined
): string[] {
  const list: string[] = [];
  if ((rule?.rule_conflicts?.length ?? 0) > 0)
    list.push("补齐规则文档冲突，并出统一版");
  if ((taskGoal?.missing_business_context?.length ?? 0) > 0)
    list.push(`补齐业务上下文：${taskGoal!.missing_business_context.join("；")}`);
  if ((hist?.unstable_rule_points?.length ?? 0) > 0)
    list.push(`不稳定规则点专项培训：${hist!.unstable_rule_points.slice(0, 3).join("；")}`);
  if (list.length === 0) list.push("无重大改造项，可直接进入试点");
  return list;
}
