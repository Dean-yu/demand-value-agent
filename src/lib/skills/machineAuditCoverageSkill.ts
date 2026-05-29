import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  HistoricalLabelRecord,
  MachineAuditCoverageOutput,
  MachineAuditRecord,
  QualityResultRecord
} from "../agent/types";

const SKILL_NAME = "machine_audit_coverage";

const HIGH_CONF = 0.9;
const MID_CONF = 0.7;

/**
 * Skill 5：已有机审能力覆盖度评估
 * 把机审 vs 历史标注 / 质检结果交叉，估算高/中/低置信占比、强项 / 弱项标签、错误模式。
 */
export const machineAuditCoverageSkill: SkillModule<MachineAuditCoverageOutput> = {
  name: SKILL_NAME,
  title: "已有机审能力覆盖度评估",
  description:
    "对齐机审结果 + 历史标注 + 质检结果，给出机审免审 / 预标 / 兜底比例、机审强弱项与错误模式",
  inputSchema: "{ machineAuditResults?, historicalLabels?, qualityResults? }",
  outputSchema: `{
  machine_coverage, high_confidence_auto_ratio, prelabel_candidate_ratio, human_fallback_ratio,
  machine_strength_labels, machine_weakness_labels, machine_error_patterns,
  machine_capability_judgement, recommended_thresholds, summary
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const machine = t.machineAuditResults ?? [];
    const totalSamples = t.sampleData?.length ?? 0;

    if (machine.length === 0) {
      const empty: MachineAuditCoverageOutput = {
        machine_coverage: "0%",
        high_confidence_auto_ratio: "0%",
        prelabel_candidate_ratio: "0%",
        human_fallback_ratio: "100%",
        machine_strength_labels: [],
        machine_weakness_labels: [],
        machine_error_patterns: [],
        machine_capability_judgement:
          "未上传机审结果，本任务暂无机审承接能力，建议先做机审评测集校准",
        recommended_thresholds: {
          auto_threshold: 0.9,
          prelabel_threshold: 0.7,
          fallback_threshold: 0.7
        },
        summary: "未提供机审结果，机审覆盖率为 0"
      };
      return {
        run: finishRun(run, {
          status: "warning",
          summary: empty.summary,
          warnings: ["未提供机审结果"],
          output: empty
        }),
        output: empty
      };
    }

    const macMap = new Map<string, MachineAuditRecord>();
    for (const m of machine) macMap.set(m.sampleId, m);

    const histMap = new Map<string, HistoricalLabelRecord>();
    for (const h of t.historicalLabels ?? []) histMap.set(h.sampleId, h);

    const qaMap = new Map<string, QualityResultRecord>();
    for (const q of t.qualityResults ?? []) qaMap.set(q.sampleId, q);

    let highConf = 0;
    let midConf = 0;
    let lowConf = 0;
    const labelStat: Record<
      string,
      { match: number; mismatch: number; total: number }
    > = {};
    const errorPatternCnt: Record<string, number> = {};

    for (const m of machine) {
      const conf = m.confidence ?? 0;
      if (conf >= HIGH_CONF) highConf++;
      else if (conf >= MID_CONF) midConf++;
      else lowConf++;

      const lbl = m.machineLabel ?? "未知";
      labelStat[lbl] = labelStat[lbl] ?? { match: 0, mismatch: 0, total: 0 };
      labelStat[lbl].total++;

      const truth = qaMap.get(m.sampleId)?.finalLabel ?? histMap.get(m.sampleId)?.label;
      if (truth) {
        if (truth === m.machineLabel) labelStat[lbl].match++;
        else {
          labelStat[lbl].mismatch++;
          const pattern = `${m.machineLabel} → ${truth}`;
          errorPatternCnt[pattern] = (errorPatternCnt[pattern] ?? 0) + 1;
        }
      }
    }

    const denom = machine.length || 1;
    const highRatio = highConf / denom;
    const midRatio = midConf / denom;
    const lowRatio = lowConf / denom;
    const coverage = totalSamples > 0 ? machine.length / totalSamples : 1;

    // 强项标签：准确率 ≥ 90% 且样本量 ≥ 5
    const strength: string[] = [];
    const weakness: string[] = [];
    for (const [label, stat] of Object.entries(labelStat)) {
      if (stat.total < 3) continue;
      const acc = stat.match / stat.total;
      if (stat.total >= 5 && acc >= 0.9) {
        strength.push(`${label}(${(acc * 100).toFixed(1)}%, n=${stat.total})`);
      } else if (acc < 0.7) {
        weakness.push(`${label}(${(acc * 100).toFixed(1)}%, n=${stat.total})`);
      }
    }

    const errorPatterns = Object.entries(errorPatternCnt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}（${v} 次）`);

    let judgement = "";
    if (highRatio >= 0.4 && weakness.length === 0) {
      judgement = "已有机审能力可用于本任务，建议机审优先承接 + 中置信样本走 AI 预标。";
    } else if (highRatio >= 0.2) {
      judgement = "已有机审能力部分可用，建议机审承接高置信样本，中低置信样本仍以人工为主。";
    } else {
      judgement =
        "机审高置信占比偏低，本任务暂不适合大规模机审承接，建议先做机审评测集校准与阈值调优。";
    }

    const payload: MachineAuditCoverageOutput = {
      machine_coverage: pct(coverage),
      high_confidence_auto_ratio: pct(highRatio),
      prelabel_candidate_ratio: pct(midRatio),
      human_fallback_ratio: pct(lowRatio),
      machine_strength_labels: strength,
      machine_weakness_labels: weakness,
      machine_error_patterns: errorPatterns,
      machine_capability_judgement: judgement,
      recommended_thresholds: {
        auto_threshold: HIGH_CONF,
        prelabel_threshold: MID_CONF,
        fallback_threshold: MID_CONF
      },
      summary:
        `机审覆盖率 ${pct(coverage)}，高置信免审 ${pct(highRatio)}，` +
        `中置信预标 ${pct(midRatio)}，低置信兜底 ${pct(lowRatio)}`
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n基于已有机审统计结果，请输出 JSON：\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let output: MachineAuditCoverageOutput;
    try {
      output = await ctx.llm.generateJSON<MachineAuditCoverageOutput>({
        systemPrompt:
          "你是「机审能力覆盖度」Skill。比例与阈值已确定，请严格输出 JSON。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch {
      output = payload;
    }
    // 关键数值以计算结果为准
    output = {
      ...output,
      machine_coverage: payload.machine_coverage,
      high_confidence_auto_ratio: payload.high_confidence_auto_ratio,
      prelabel_candidate_ratio: payload.prelabel_candidate_ratio,
      human_fallback_ratio: payload.human_fallback_ratio,
      recommended_thresholds: payload.recommended_thresholds,
      machine_strength_labels: payload.machine_strength_labels,
      machine_weakness_labels: payload.machine_weakness_labels,
      machine_error_patterns: payload.machine_error_patterns
    };

    return {
      run: finishRun(run, {
        status: weakness.length >= 2 ? "warning" : "completed",
        summary: output.summary,
        keyFindings: [
          `高置信免审 ${output.high_confidence_auto_ratio}`,
          `中置信预标 ${output.prelabel_candidate_ratio}`,
          `低置信兜底 ${output.human_fallback_ratio}`,
          `机审强项 ${strength.length} 个 / 弱项 ${weakness.length} 个`
        ],
        warnings: weakness.length > 0 ? [`机审弱项标签：${weakness.join("、")}`] : [],
        output
      }),
      output
    };
  }
};

function pct(r: number): string {
  return (r * 100).toFixed(1) + "%";
}
