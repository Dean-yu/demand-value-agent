import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type { HistoricalQualityOutput } from "../agent/types";

const SKILL_NAME = "historical_quality_baseline";

/**
 * Skill 4：历史标注结果与质量基线分析
 * 计算历史标签分布、质检通过率、人工 vs 终审一致率，识别高错标签 / 不稳定规则点。
 */
export const historicalQualitySkill: SkillModule<HistoricalQualityOutput> = {
  name: SKILL_NAME,
  title: "历史标注结果与质量基线分析",
  description:
    "结合历史标注 + 质检结果，形成质量基线（一致率 / 通过率 / 高错标签 / 不稳定标签 / 历史结果可复用性）",
  inputSchema: "{ historicalLabels?, qualityResults? }",
  outputSchema: `{
  historical_label_distribution: Record<string,number>,
  quality_baseline: { agreement_rate, quality_pass_rate, high_error_labels, unstable_labels },
  human_labeling_risks: string[],
  unstable_rule_points: string[],
  historical_result_reusability: '高'|'中'|'低',
  summary: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const histories = t.historicalLabels ?? [];
    const qa = t.qualityResults ?? [];

    if (histories.length === 0 && qa.length === 0) {
      const empty: HistoricalQualityOutput = {
        historical_label_distribution: {},
        quality_baseline: {
          agreement_rate: "—",
          quality_pass_rate: "—",
          high_error_labels: [],
          unstable_labels: []
        },
        human_labeling_risks: ["缺少历史标注与质检结果，无法形成质量基线"],
        unstable_rule_points: [],
        historical_result_reusability: "低",
        summary: "未提供历史标注 / 质检数据，本任务质量基线无法形成"
      };
      return {
        run: finishRun(run, {
          status: "warning",
          summary: empty.summary,
          warnings: empty.human_labeling_risks,
          output: empty
        }),
        output: empty
      };
    }

    // 标签分布
    const labelDist: Record<string, number> = {};
    for (const h of histories) {
      labelDist[h.label] = (labelDist[h.label] ?? 0) + 1;
    }

    // 一致率：原标 vs 终审标
    let consistentCnt = 0;
    let comparedCnt = 0;
    let passCnt = 0;
    let qaCnt = 0;
    const errorByLabel: Record<string, number> = {};
    const totalByLabel: Record<string, number> = {};
    const errorReasons: string[] = [];

    for (const q of qa) {
      qaCnt++;
      const label = q.originalLabel ?? "未知";
      totalByLabel[label] = (totalByLabel[label] ?? 0) + 1;
      if (q.originalLabel && q.finalLabel) {
        comparedCnt++;
        if (q.originalLabel === q.finalLabel) consistentCnt++;
      }
      if (q.isCorrect === true) passCnt++;
      if (q.isCorrect === false) {
        errorByLabel[label] = (errorByLabel[label] ?? 0) + 1;
        if (q.errorType) errorReasons.push(q.errorType);
        else if (q.qualityReason) errorReasons.push(q.qualityReason);
      }
    }

    const agreementRate = comparedCnt > 0 ? consistentCnt / comparedCnt : 0;
    const passRate = qaCnt > 0 ? passCnt / qaCnt : 0;

    // 高错标签：错误条数 ≥ 5 或错误率 > 20%
    const highErrorLabels: string[] = [];
    const unstableLabels: string[] = [];
    for (const [label, errCnt] of Object.entries(errorByLabel)) {
      const total = totalByLabel[label] ?? 0;
      const errRate = total > 0 ? errCnt / total : 0;
      if (errRate >= 0.2) highErrorLabels.push(`${label}(错误率 ${(errRate * 100).toFixed(1)}%)`);
      if (errRate >= 0.1 && errRate < 0.2)
        unstableLabels.push(`${label}(错误率 ${(errRate * 100).toFixed(1)}%)`);
    }

    // 不稳定规则点：从错误原因中聚合
    const reasonCount: Record<string, number> = {};
    for (const r of errorReasons) {
      reasonCount[r] = (reasonCount[r] ?? 0) + 1;
    }
    const unstableRulePoints = Object.entries(reasonCount)
      .filter(([_, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r, c]) => `${r}（出现 ${c} 次）`);

    const reusability: "高" | "中" | "低" =
      passRate >= 0.9 && agreementRate >= 0.9
        ? "高"
        : passRate >= 0.75 || agreementRate >= 0.8
          ? "中"
          : "低";

    const risks: string[] = [];
    if (passRate < 0.8) risks.push(`历史质检通过率仅 ${(passRate * 100).toFixed(1)}%，低于稳定基线`);
    if (agreementRate < 0.85 && comparedCnt > 0)
      risks.push(`原标与终审一致率仅 ${(agreementRate * 100).toFixed(1)}%，存在判定分歧`);
    if (highErrorLabels.length > 0)
      risks.push(`高错标签：${highErrorLabels.slice(0, 3).join("、")}`);

    const payload = {
      historical_label_distribution: labelDist,
      quality_baseline: {
        agreement_rate: comparedCnt > 0 ? `${(agreementRate * 100).toFixed(1)}%` : "—",
        quality_pass_rate: qaCnt > 0 ? `${(passRate * 100).toFixed(1)}%` : "—",
        high_error_labels: highErrorLabels,
        unstable_labels: unstableLabels
      },
      human_labeling_risks: risks,
      unstable_rule_points: unstableRulePoints,
      historical_result_reusability: reusability,
      summary:
        `历史质检通过率 ${qaCnt > 0 ? `${(passRate * 100).toFixed(1)}%` : "—"}，` +
        `一致率 ${comparedCnt > 0 ? `${(agreementRate * 100).toFixed(1)}%` : "—"}；` +
        `历史结果可复用性「${reusability}」`
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n请基于以下统计结果包装 JSON 输出：\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let output: HistoricalQualityOutput;
    try {
      output = await ctx.llm.generateJSON<HistoricalQualityOutput>({
        systemPrompt:
          "你是「历史标注质量基线」Skill。请严格输出 JSON，数值保持统计口径不变。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch {
      output = payload as HistoricalQualityOutput;
    }

    // 关键数值以确定性计算为准
    output = {
      ...output,
      historical_label_distribution: payload.historical_label_distribution,
      quality_baseline: payload.quality_baseline,
      historical_result_reusability: payload.historical_result_reusability
    };

    const findings = [
      `质检通过率 ${output.quality_baseline.quality_pass_rate}`,
      `一致率 ${output.quality_baseline.agreement_rate}`,
      `高错标签 ${highErrorLabels.length} 个 / 不稳定标签 ${unstableLabels.length} 个`
    ];

    return {
      run: finishRun(run, {
        status: risks.length >= 2 ? "warning" : "completed",
        summary: output.summary,
        keyFindings: findings,
        warnings: risks,
        output
      }),
      output
    };
  }
};
