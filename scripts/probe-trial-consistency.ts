/* eslint-disable no-console */
// 用真实 LLM 在升级后的 consistencyModelEvalTask 上跑一次完整 agent，
// 重点观察 machine_audit_trial skill 是否能跑通：
//   - 是否抽到 ≤ 60 条样本
//   - per_category accuracy 是否算出来
//   - overall_accuracy ∈ [0,1]
//   - 报告 3.7 章节是否生成
// 用法：node --experimental-strip-types --no-warnings --loader=./scripts/ts-resolver.mjs scripts/probe-trial-consistency.ts

import { readFileSync, existsSync } from "node:fs";

const envPath = "/Users/dean/demand-value-agent/.env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}

import { runAgent } from "../src/lib/agent/orchestrator.ts";
import { __resetProviderSingleton, getLLMProvider } from "../src/lib/llm/provider.ts";
import { consistencyModelEvalTask } from "../src/lib/mock/consistencyModelEvalTask.ts";

(async () => {
  __resetProviderSingleton();
  const llm = await getLLMProvider();
  console.log(`provider = ${llm.name}, isMock = ${llm.isMock}`);
  if (llm.isMock) {
    console.log("Mock provider detected — set LLM_PROVIDER=openai-compatible in .env.local. Aborting.");
    return;
  }

  // 简单计时拦截
  const t00 = Date.now();
  const originalGenerateJSON = llm.generateJSON.bind(llm);
  (llm as any).generateJSON = async (params: any) => {
    const skill = (params.userPrompt ?? "").match(/\[\[SKILL:([^\]]+)\]\]/)?.[1] ?? "unknown";
    const chars = (params.userPrompt ?? "").length;
    process.stdout.write(`[probe] skill=${skill} chars=${chars} ... `);
    const t0 = Date.now();
    try {
      const r = await originalGenerateJSON(params);
      console.log(`OK ${Date.now() - t0}ms`);
      return r;
    } catch (e: any) {
      console.log(`FAIL ${Date.now() - t0}ms: ${e?.message ?? e}`);
      throw e;
    }
  };

  try {
    const result = await runAgent(consistencyModelEvalTask, { onProgress: () => {} });
    const a = result.assessment;
    const trial = a.machineAuditTrial;
    console.log(`\n=== 运行汇总 (耗时 ${Date.now() - t00}ms) ===`);
    console.log(`final decision : ${a.finalDecision}`);
    console.log(`Q1 verdict     : ${a.coreVerdict?.worthLabeling.verdict} | ${a.coreVerdict?.worthLabeling.headline}`);
    console.log(`Q2 mode        : ${a.coreVerdict?.labelingMode.mode} | ${a.coreVerdict?.labelingMode.headline}`);
    console.log(`Q3 split       : ${a.coreVerdict?.scaleSplit.machineAutoCount} / ${a.coreVerdict?.scaleSplit.aiAssistCount} / ${a.coreVerdict?.scaleSplit.humanCount} / ${a.coreVerdict?.scaleSplit.excludeCount} (of ${a.coreVerdict?.scaleSplit.totalSamples})`);
    console.log(`\n--- trial ---`);
    console.log(`attempted      : ${trial?.attempted}`);
    console.log(`succeeded      : ${trial?.succeeded}`);
    console.log(`trial_samples  : ${trial?.trial_sample_count}`);
    console.log(`overall_acc    : ${trial?.overall_accuracy}`);
    console.log(`recommend mode : ${trial?.recommended_mode}`);
    console.log(`failure_reason : ${trial?.failure_reason ?? "(none)"}`);
    if (trial?.per_category?.length) {
      console.log(`\n--- per_category ---`);
      for (const c of trial.per_category) {
        console.log(`  ${c.category.padEnd(10)} | n=${String(c.sampleCount).padStart(3)} | acc=${(c.accuracy * 100).toFixed(1).padStart(5)}% | ${c.mode}`);
      }
    }
    console.log(`\n--- report 3.7 ---`);
    const md = a.detailedReportMarkdown ?? "";
    const idx = md.indexOf("## 3.7 机审 Trial 实测");
    if (idx >= 0) {
      const end = md.indexOf("\n## ", idx + 5);
      const block = end > 0 ? md.slice(idx, end) : md.slice(idx, idx + 1800);
      console.log(block);
    } else {
      console.log("(missing)");
    }
  } catch (e: any) {
    console.log(`runAgent threw: ${e?.message ?? e}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
