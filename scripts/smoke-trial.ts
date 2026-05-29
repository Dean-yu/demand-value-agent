/* eslint-disable no-console */
// Mock-mode smoke test focused on the new trial flow (mock provider can't run real trial).
process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.LLM_BASE_URL = "";
process.env.LLM_MODEL = "";

import { runAgent } from "../src/lib/agent/orchestrator.ts";
import { commodityQualityTask } from "../src/lib/mock/commodityQualityTask.ts";
import { consistencyModelEvalTask } from "../src/lib/mock/consistencyModelEvalTask.ts";
import { puCotLabelingTask } from "../src/lib/mock/puCotLabelingTask.ts";

const tasks = [
  { name: "commodityQuality", task: commodityQualityTask },
  { name: "consistencyEval", task: consistencyModelEvalTask },
  { name: "puCotLabeling", task: puCotLabelingTask }
];

let allOk = true;
for (const { name, task } of tasks) {
  console.log(`\n=========== ${name} (${task.title}) ===========`);
  const { assessment, skills } = await runAgent(task);
  const trial = assessment.machineAuditTrial;
  const cv = assessment.coreVerdict;
  const trialSkill = skills.find((s) => s.id === "machine_audit_trial");
  const has37 = (assessment.detailedReportMarkdown ?? "").includes("## 3.7 机审 Trial 实测");
  const has37Exec =
    (assessment.executiveSummaryMarkdown ?? "").includes("未做真实 Trial") ||
    (assessment.executiveSummaryMarkdown ?? "").includes("真实 Trial 准确率");

  console.log("  final decision  :", assessment.finalDecision);
  console.log("  Q1 verdict      :", cv?.worthLabeling.verdict, "|", cv?.worthLabeling.headline);
  console.log("  Q1 reasons[0]   :", cv?.worthLabeling.reasons[0]);
  console.log("  Q2 mode         :", cv?.labelingMode.mode, "|", cv?.labelingMode.headline);
  console.log("  Q2 reasons      :");
  for (const r of cv?.labelingMode.reasons.slice(0, 4) ?? []) console.log("     -", r);
  console.log(
    "  Q3 sample split :",
    cv?.scaleSplit.machineAutoCount,
    "/",
    cv?.scaleSplit.aiAssistCount,
    "/",
    cv?.scaleSplit.humanCount,
    "/",
    cv?.scaleSplit.excludeCount,
    " (total",
    cv?.scaleSplit.totalSamples + ")"
  );
  console.log("  trial attempted :", trial?.attempted, "succeeded:", trial?.succeeded);
  console.log("  trial reason    :", trial?.failure_reason ?? "(none)");
  console.log("  trial skill     :", trialSkill?.status, "|", (trialSkill?.summary ?? "").slice(0, 80));
  console.log("  detailed §3.7   :", has37 ? "OK" : "MISSING");
  console.log("  executive §Q2   :", has37Exec ? "OK" : "MISSING");

  const checks: Array<[string, boolean]> = [
    ["trial.attempted === true", trial?.attempted === true],
    ["trial.succeeded === false (mock)", trial?.succeeded === false],
    [
      "trial.failure_reason non-empty",
      typeof trial?.failure_reason === "string" && trial.failure_reason.length > 0
    ],
    ["trialSkill status === warning", trialSkill?.status === "warning"],
    ["coreVerdict Q1 set", Boolean(cv?.worthLabeling.headline)],
    ["coreVerdict Q2 set", Boolean(cv?.labelingMode.headline)],
    ["coreVerdict Q3 totalSamples typeof number", typeof cv?.scaleSplit.totalSamples === "number"],
    ["detailed report contains §3.7", has37],
    ["executive summary mentions trial in Q2", has37Exec]
  ];
  for (const [label, ok] of checks) {
    if (!ok) {
      console.log("  [FAIL]", label);
      allOk = false;
    }
  }
}

console.log(allOk ? "\nALL SMOKE CHECKS PASSED ✅" : "\nSOME CHECKS FAILED ❌");
process.exit(allOk ? 0 : 1);
