/* eslint-disable no-console */
// 测量每个 Skill 调用 LLM 时的 userPrompt 长度（chars + 估算 tokens）。
// 用 mock provider 跑一遍 3 个 mock，把所有 userPrompt 长度打出来。

process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.LLM_BASE_URL = "";
process.env.LLM_MODEL = "";

import { runAgent } from "../src/lib/agent/orchestrator.ts";
import { __resetProviderSingleton, getLLMProvider } from "../src/lib/llm/provider.ts";
import { commodityQualityTask } from "../src/lib/mock/commodityQualityTask.ts";
import { consistencyModelEvalTask } from "../src/lib/mock/consistencyModelEvalTask.ts";
import { puCotLabelingTask } from "../src/lib/mock/puCotLabelingTask.ts";

const records: Array<{ task: string; skill: string; chars: number; estTokens: number; sysChars: number }> = [];

async function runForTask(name: string, task: any) {
  __resetProviderSingleton();
  const llm = await getLLMProvider();
  // monkey-patch
  const originalGenerateJSON = llm.generateJSON.bind(llm);
  (llm as any).generateJSON = async (params: any) => {
    const skillMatch = (params.userPrompt ?? "").match(/\[\[SKILL:([^\]]+)\]\]/);
    const skill = skillMatch ? skillMatch[1] : "unknown";
    const chars = (params.userPrompt ?? "").length;
    const sysChars = (params.systemPrompt ?? "").length;
    records.push({
      task: name,
      skill,
      chars,
      estTokens: Math.round(chars / 2.2),  // 中英混合粗略估算
      sysChars
    });
    return originalGenerateJSON(params);
  };
  console.log(`\n--- ${name} (samples=${task.sampleData?.length ?? 0}) ---`);
  await runAgent(task, {
    onProgress: (_e) => {}
  });
}

(async () => {
  await runForTask("commodity (240 samples)", commodityQualityTask);
  await runForTask("consistency", consistencyModelEvalTask);
  await runForTask("pu_cot (150 samples)", puCotLabelingTask);

  console.log("\n========= prompt sizes =========");
  console.log(
    ["task", "skill", "userChars", "estTokens", "sysChars"].join("\t")
  );
  for (const r of records) {
    console.log([r.task, r.skill, r.chars, r.estTokens, r.sysChars].join("\t"));
  }
  console.log("\n========= max per skill =========");
  const maxBySkill = new Map<string, number>();
  for (const r of records) {
    maxBySkill.set(r.skill, Math.max(maxBySkill.get(r.skill) ?? 0, r.chars));
  }
  for (const [skill, max] of [...maxBySkill.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${skill}\t${max}\t~${Math.round(max / 2.2)} tokens`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
