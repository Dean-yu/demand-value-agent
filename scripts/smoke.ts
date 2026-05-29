/* eslint-disable no-console */
// 用 node --experimental-strip-types 直接跑（Node ≥22.6）。
// 避开 sandbox 端口绑定限制：直接调用 orchestrator，不开 HTTP server。

process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.LLM_BASE_URL = "";
process.env.LLM_MODEL = "";

import { runAgent } from "../src/lib/agent/orchestrator.ts";
import { commodityQualityTask } from "../src/lib/mock/commodityQualityTask.ts";
import { consistencyModelEvalTask } from "../src/lib/mock/consistencyModelEvalTask.ts";
import { puCotLabelingTask } from "../src/lib/mock/puCotLabelingTask.ts";

async function smoke(name: string, task: any) {
  console.log(`\n=========== ${name} ===========`);
  const events: string[] = [];
  const t0 = Date.now();
  const result = await runAgent(task, {
    onProgress: (e) => {
      events.push(`${e.type} ${e.run.id} ${e.run.status}`);
    }
  });
  const ms = Date.now() - t0;
  console.log(`elapsed = ${ms}ms`);
  console.log(`skills events = ${events.length}`);
  console.log(`final decision = ${result.assessment.finalDecision}`);
  console.log(`total score = ${result.assessment.valueScore.totalScore}`);
  console.log(`dimensions:`, result.assessment.valueScore.dimensions);
  console.log(`dataOutputGoals:`, result.assessment.dataOutputGoals);
  console.log(`keyReasons:`, result.assessment.keyReasons);
  console.log(`risksAndGaps (${result.assessment.risksAndGaps.length}):`);
  for (const r of result.assessment.risksAndGaps.slice(0, 5)) console.log(`  - ${r}`);
  console.log(`nextStepPlan:`);
  for (const r of result.assessment.nextStepPlan) console.log(`  → ${r}`);
  const segs = result.assessment.sampleStrategy.segments;
  console.log(`segments:`);
  for (const k of Object.keys(segs) as (keyof typeof segs)[]) {
    const s = segs[k];
    console.log(`  ${k}: count=${s.count} ratio=${s.ratio.toFixed(3)}`);
  }
  console.log(`humanEffort baseline=${result.assessment.humanEffortEstimate.baseline.totalHours}h opt=${result.assessment.humanEffortEstimate.optimized.totalHours}h reduction=${(result.assessment.humanEffortEstimate.reduction.hourReductionRatio * 100).toFixed(1)}%`);
  console.log(`machineCoverage=${(result.assessment.machineAuditAssessment.machineCoverageRatio * 100).toFixed(1)}%`);
  console.log(`fieldAnalysis: ai_dominant=${result.assessment.fieldAnalysis.ai_dominant_count} human_required=${result.assessment.fieldAnalysis.human_required_count} total=${result.assessment.fieldAnalysis.fields.length}`);
  const trial = result.assessment.machineAuditTrial;
  console.log(`trial: attempted=${trial?.attempted} succeeded=${trial?.succeeded} acc=${trial?.overall_accuracy?.toFixed(3) ?? "—"} mode=${trial?.recommended_mode ?? "—"} cats=${trial?.per_category?.length ?? 0}`);
  console.log(`decisionConfidence: ${result.assessment.decisionConfidence ?? "(none)"}`);
  console.log(`Q1 worthLabeling.reasons:`);
  for (const r of result.assessment.coreVerdict.worthLabeling.reasons.slice(0, 6)) console.log(`  • ${r}`);
  console.log(`Q2 labelingMode.reasons:`);
  for (const r of result.assessment.coreVerdict.labelingMode.reasons.slice(0, 6)) console.log(`  • ${r}`);
  console.log(`executive summary length=${result.assessment.executiveSummaryMarkdown.length}`);
  console.log(`detailed report length=${result.assessment.detailedReportMarkdown.length}`);
  console.log(`---- executive summary preview ----`);
  console.log(result.assessment.executiveSummaryMarkdown.slice(0, 600));
}

(async () => {
  await smoke("商品质量审核", commodityQualityTask);
  await smoke("一致性模型评测", consistencyModelEvalTask);
  await smoke("PU生产CoT标注", puCotLabelingTask);
  console.log("\nSMOKE OK");
})().catch((e) => {
  console.error("SMOKE FAILED", e);
  process.exit(1);
});
