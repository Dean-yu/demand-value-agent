/* eslint-disable no-console */
// 用真实 LLM 跑一个 mock，捕获是哪个 skill 报"Prompt is too long"。
// 需要 .env.local 已经配好。

import { readFileSync, existsSync } from "node:fs";

// 手动加载 .env.local（避免依赖 dotenv）
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
import { commodityQualityTask } from "../src/lib/mock/commodityQualityTask.ts";

(async () => {
  __resetProviderSingleton();
  const llm = await getLLMProvider();
  console.log(`provider = ${llm.name}, isMock = ${llm.isMock}`);
  if (llm.isMock) {
    console.log("Mock provider — won't reproduce real-API error. Aborting.");
    return;
  }

  // 拦截 generateJSON，把每次调用前的 prompt 长度、调用结果（成功/失败 + 错误信息）都记下来
  const originalGenerateJSON = llm.generateJSON.bind(llm);
  (llm as any).generateJSON = async (params: any) => {
    const skillMatch = (params.userPrompt ?? "").match(/\[\[SKILL:([^\]]+)\]\]/);
    const skill = skillMatch ? skillMatch[1] : "unknown";
    const chars = (params.userPrompt ?? "").length;
    const sysChars = (params.systemPrompt ?? "").length;
    process.stdout.write(`[probe] skill=${skill} userChars=${chars} sysChars=${sysChars} ... `);
    try {
      const t0 = Date.now();
      const result = await originalGenerateJSON(params);
      const ms = Date.now() - t0;
      console.log(`OK (${ms}ms)`);
      return result;
    } catch (e: any) {
      console.log(`FAIL: ${e?.message ?? e}`);
      throw e;
    }
  };

  try {
    const result = await runAgent(commodityQualityTask, { onProgress: () => {} });
    console.log(`\nfinal decision = ${result.assessment.finalDecision}`);
  } catch (e: any) {
    console.log(`runAgent threw: ${e?.message ?? e}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
