// 直接 fetch 探测：构造一个典型的 task_value_report 大小的 prompt，看 API 怎么回。
// 不依赖 TypeScript，避开 parameter-property 限制。
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

const apiKey = process.env.LLM_API_KEY;
const baseUrl = process.env.LLM_BASE_URL;
const model = process.env.LLM_MODEL;

if (!apiKey || !baseUrl || !model) {
  console.error("Missing LLM_API_KEY / LLM_BASE_URL / LLM_MODEL");
  process.exit(1);
}

async function probe(label, userPromptChars, withJsonFormat) {
  // 构造一个用 N 个中文字 + 大量 JSON 模拟的 prompt
  const filler = "评测".repeat(Math.max(0, Math.floor(userPromptChars / 2) - 50));
  const userPrompt =
    `[[SKILL:probe]]\n请输出一个简单 JSON：{"ok":true,"echo":"OK"}。\n` +
    `下面是垫字（${userPromptChars} chars）：\n${filler}`;

  const body = {
    model,
    messages: [
      { role: "system", content: "请严格输出 JSON。" },
      { role: "user", content: userPrompt }
    ]
  };
  if (withJsonFormat) {
    body.response_format = { type: "json_object" };
  }

  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  process.stdout.write(`[probe] ${label} userChars=${userPrompt.length} jsonFmt=${withJsonFormat} ... `);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`HTTP ${res.status}: ${errText.slice(0, 500)}`);
      return;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    console.log(`OK content=${content.slice(0, 80)}`);
  } catch (e) {
    console.log(`THREW: ${e?.message ?? e}`);
  }
}

(async () => {
  // 不同大小的 prompt 都试一下，找门槛
  await probe("tiny", 200, false);
  await probe("tiny+json", 200, true);
  await probe("medium-5k", 5000, true);
  await probe("medium-10k", 10000, true);
  await probe("medium-20k", 20000, true);
  await probe("large-40k", 40000, true);
  await probe("huge-100k", 100000, true);
})();
