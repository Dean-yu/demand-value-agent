import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  HumanEffortEstimationOutput,
  MachineAuditTrialOutput,
  SampleSegmentationOutput
} from "../agent/types";

const SKILL_NAME = "human_effort_estimation";

/**
 * Skill 6：人工投入规模测算
 * 基于样本分层结果 + 产能参数，计算全人工 vs 优化后的两套人工投入规模与减量空间。
 *
 * fullManualHours = totalSampleCount * avgManualSecondsPerItem / 3600
 *
 * optimizedHours 由 6 项叠加：
 *   1. machine_auto    × 0
 *   2. ai_prelabel     × avgPrelabelConfirmSecondsPerItem
 *   3. human_required  × avgManualSecondsPerItem
 *   4. quality_sampling × avgManualSecondsPerItem
 *   5. callback：AI 预标拉回二标 = ai_prelabel × (1 - trial.overall_accuracy 或默认 25%) × manualSec
 *   6. samplingFollowup：抽检命中错样本二次复议 = quality_sampling × 15% × manualSec
 *   7. training：一次性培训成本 = optPeople × 0.5 day × effectiveWorkHoursPerPersonDay × 3600
 *
 * 这套公式比"只算预标 + 必标 + 抽检"更接近真实生产经验，减量比例不会虚高到 50%+。
 */
export const humanEffortEstimationSkill: SkillModule<HumanEffortEstimationOutput> = {
  name: SKILL_NAME,
  title: "人工投入规模测算",
  description:
    "对比全人工 vs 机审/预标优化后两种模式的人工投入规模，并量化减量空间",
  inputSchema:
    "{ capacityParams, sampleSegmentation, totalSampleCount }",
  outputSchema: `{
  baseline_human_effort, optimized_human_effort, reduction_space, summary
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const cap = t.capacityParams;
    const seg = ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined;
    const trial = ctx.shared.machineAuditTrial as
      | MachineAuditTrialOutput
      | undefined;

    // 优先使用业务方申报的生产总量（cap.totalSampleCount）作为人工投入基线，
    // 当前样本池仅作为分桶比例的"代表样本"。当 totalSampleCount 缺失时回落到样本数。
    const segCount = seg?.sample_count ?? t.sampleData?.length ?? 0;
    const totalSamples =
      cap.totalSampleCount && cap.totalSampleCount > 0
        ? cap.totalSampleCount
        : segCount;
    const scale = segCount > 0 && totalSamples > segCount ? totalSamples / segCount : 1;

    const machineAutoCount = Math.round(
      (seg?.sample_value_segments?.machine_auto?.count ?? 0) * scale
    );
    const aiPrelabelCount = Math.round(
      (seg?.sample_value_segments?.ai_prelabel_human_confirm?.count ?? 0) * scale
    );
    // 人工必标：高价值人工 + 边界 case + 人工兜底
    const humanRequiredCount = Math.round(
      ((seg?.sample_value_segments?.high_value_human_labeling?.count ?? 0) +
        (seg?.sample_value_segments?.boundary_cases?.count ?? 0) +
        (seg?.sample_value_segments?.human_fallback?.count ?? 0)) *
        scale
    );
    const notRecommendedCount = Math.round(
      (seg?.sample_value_segments?.not_recommended?.count ?? 0) * scale
    );

    // 抽检：对机审 + 预标 + 人工三段都按比例抽检
    const samplingBase =
      machineAutoCount + aiPrelabelCount + humanRequiredCount;
    const qualitySamplingCount = Math.round(
      samplingBase * (cap.qualitySamplingRatio ?? 0.1)
    );

    const fullManualSampleCount = totalSamples;
    const fullSeconds = fullManualSampleCount * cap.avgManualSecondsPerItem;
    const fullHours = fullSeconds / 3600;
    const fullPersonDays = fullHours / Math.max(1, cap.effectiveWorkHoursPerPersonDay);
    const fullPeople = cap.targetDeliveryDays
      ? Math.ceil(fullPersonDays / cap.targetDeliveryDays)
      : Math.ceil(fullPersonDays / 5);

    // ============================================================
    // 6 项成本叠加（避免减量比例虚高到 50%+）
    // ============================================================
    // 基础三项：机审/预标/人工/抽检
    const baseOptSeconds =
      machineAutoCount * 0 +
      aiPrelabelCount * cap.avgPrelabelConfirmSecondsPerItem +
      humanRequiredCount * cap.avgManualSecondsPerItem +
      qualitySamplingCount * cap.avgManualSecondsPerItem;

    // 5) callback：AI 预标拉回二标。trial 成功时按 (1 - trial.overall_accuracy) 算，
    //    否则保守取 0.25（25% 错），按完整人工时长计入
    const aiPrelabelCallbackRate =
      trial?.succeeded && trial.overall_accuracy > 0
        ? Math.max(0, Math.min(0.6, 1 - trial.overall_accuracy))
        : 0.25;
    const aiPrelabelCallbackCount = Math.round(
      aiPrelabelCount * aiPrelabelCallbackRate
    );
    const callbackSeconds =
      aiPrelabelCallbackCount * cap.avgManualSecondsPerItem;

    // 6) samplingFollowup：抽检命中错样本的二次复议（默认抽检命中率 15%）
    const samplingFollowupCount = Math.round(qualitySamplingCount * 0.15);
    const samplingFollowupSeconds =
      samplingFollowupCount * cap.avgManualSecondsPerItem;

    // 先用基础成本估一遍人数（用于 training 成本 sizing），再叠加 training 二次得到最终
    const preTrainingSeconds =
      baseOptSeconds + callbackSeconds + samplingFollowupSeconds;
    const preTrainingPersonDays =
      preTrainingSeconds /
      3600 /
      Math.max(1, cap.effectiveWorkHoursPerPersonDay);
    const preTrainingPeople = cap.targetDeliveryDays
      ? Math.ceil(preTrainingPersonDays / cap.targetDeliveryDays)
      : Math.ceil(preTrainingPersonDays / 5);

    // 7) training：一次性培训成本 ≈ 0.5 人天 × 投入人数
    const trainingSeconds =
      preTrainingPeople *
      0.5 *
      cap.effectiveWorkHoursPerPersonDay *
      3600;

    const optSeconds =
      baseOptSeconds +
      callbackSeconds +
      samplingFollowupSeconds +
      trainingSeconds;
    const optHours = optSeconds / 3600;
    const optPersonDays = optHours / Math.max(1, cap.effectiveWorkHoursPerPersonDay);
    const optPeople = cap.targetDeliveryDays
      ? Math.ceil(optPersonDays / cap.targetDeliveryDays)
      : Math.ceil(optPersonDays / 5);

    const sampleReductionRatio =
      fullManualSampleCount > 0
        ? Math.max(
            0,
            1 - (humanRequiredCount + aiPrelabelCount + qualitySamplingCount) / fullManualSampleCount
          )
        : 0;
    // 减量比例不允许为负（训练/抽检/复议成本压过基线时视为「优化无收益」而非"反向"）
    const hourReductionRatio =
      fullHours > 0 ? Math.max(0, 1 - optHours / fullHours) : 0;

    const reductionReasons: string[] = [];
    if (machineAutoCount > 0)
      reductionReasons.push(`${machineAutoCount} 条机审免审样本完全省去人工`);
    if (aiPrelabelCount > 0)
      reductionReasons.push(`${aiPrelabelCount} 条 AI 预标样本耗时压缩为 ${cap.avgPrelabelConfirmSecondsPerItem}s/条`);
    if (notRecommendedCount > 0)
      reductionReasons.push(`${notRecommendedCount} 条不建议投入样本退出生产`);
    if (humanRequiredCount > 0)
      reductionReasons.push(
        `${humanRequiredCount} 条人工重点样本仍按 ${cap.avgManualSecondsPerItem}s/条 进入人工兜底`
      );
    // 三项额外成本，让减量比例落到更真实的 25-45% 区间
    if (aiPrelabelCallbackCount > 0)
      reductionReasons.push(
        `AI 预标拉回成本：${aiPrelabelCallbackCount} 条 ` +
          `(按${trial?.succeeded ? "trial 错误率" : "默认 25%"} 拉回)`
      );
    if (samplingFollowupCount > 0)
      reductionReasons.push(
        `抽检命中错样本二次复议：${samplingFollowupCount} 条 (按 15% 命中率)`
      );
    if (preTrainingPeople > 0)
      reductionReasons.push(
        `培训一次性投入：约 ${(preTrainingPeople * 0.5).toFixed(1)} 人天 (${preTrainingPeople} 人 × 0.5 天)`
      );

    const payload: HumanEffortEstimationOutput = {
      baseline_human_effort: {
        full_manual_sample_count: fullManualSampleCount,
        estimated_time_per_item_seconds: cap.avgManualSecondsPerItem,
        estimated_total_hours: round(fullHours),
        estimated_person_days: round(fullPersonDays),
        estimated_people_needed: fullPeople
      },
      optimized_human_effort: {
        machine_auto_count: machineAutoCount,
        ai_prelabel_count: aiPrelabelCount,
        human_required_count: humanRequiredCount,
        quality_sampling_count: qualitySamplingCount,
        estimated_total_hours: round(optHours),
        estimated_person_days: round(optPersonDays),
        estimated_people_needed: optPeople
      },
      reduction_space: {
        sample_reduction_ratio: pct(sampleReductionRatio),
        human_hour_reduction_ratio: pct(hourReductionRatio),
        reduction_reason: reductionReasons
      },
      summary:
        `全人工预计 ${round(fullPersonDays)} 人天 / ${round(fullHours)} 小时；` +
        `优化后预计 ${round(optPersonDays)} 人天 / ${round(optHours)} 小时；` +
        `人工小时减量空间 ${pct(hourReductionRatio)}`
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n请基于以下计算结果输出 JSON：\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let output: HumanEffortEstimationOutput;
    try {
      output = await ctx.llm.generateJSON<HumanEffortEstimationOutput>({
        systemPrompt:
          "你是「人工投入规模测算」Skill。所有数值均已计算完成，仅用于 JSON 包装。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch {
      output = payload;
    }
    // 数值始终以确定性计算为准
    output = {
      ...output,
      baseline_human_effort: payload.baseline_human_effort,
      optimized_human_effort: payload.optimized_human_effort,
      reduction_space: payload.reduction_space
    };

    return {
      run: finishRun(run, {
        status: "completed",
        summary: output.summary,
        keyFindings: [
          `全人工 ${output.baseline_human_effort.estimated_person_days} 人天`,
          `优化后 ${output.optimized_human_effort.estimated_person_days} 人天`,
          `减量空间 ${output.reduction_space.human_hour_reduction_ratio}`
        ],
        warnings: [],
        output
      }),
      output
    };
  }
};

function round(n: number): number {
  return Number(n.toFixed(2));
}

function pct(r: number): string {
  return (r * 100).toFixed(1) + "%";
}
