import type { LLMGenerateParams, LLMProvider } from "./provider";

/**
 * 适配 OpenAI 风格 /chat/completions 接口的 Provider。
 * 通过环境变量 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 配置。
 * 不在代码里写死任何密钥。
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai_compatible";
  readonly isMock = false;

  private readonly cfg: { apiKey: string; baseUrl: string; model: string };

  constructor(cfg: { apiKey: string; baseUrl: string; model: string }) {
    this.cfg = cfg;
  }

  async generateJSON<T>(params: LLMGenerateParams): Promise<T> {
    const sys = params.systemPrompt
      ? params.systemPrompt + "\n\n请严格输出可被 JSON.parse 解析的 JSON。"
      : "请严格输出可被 JSON.parse 解析的 JSON，不要带任何解释或 Markdown。";
    const user = params.schemaHint
      ? `${params.userPrompt}\n\n[OUTPUT SCHEMA]\n${params.schemaHint}`
      : params.userPrompt;
    const text = await this.callChat(sys, user, true);
    return parseJsonLoose<T>(text);
  }

  async generateText(params: LLMGenerateParams): Promise<string> {
    return this.callChat(params.systemPrompt ?? "", params.userPrompt, false);
  }

  private async callChat(
    systemPrompt: string,
    userPrompt: string,
    forceJson: boolean
  ): Promise<string> {
    const url = this.cfg.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const body: any = {
      model: this.cfg.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: userPrompt }
      ]
    };
    // 部分模型（如 claude-opus-4-7）不接受 temperature；用 env 显式开启
    const tempEnv = process.env.LLM_TEMPERATURE?.trim();
    if (tempEnv && !Number.isNaN(Number(tempEnv))) {
      body.temperature = Number(tempEnv);
    }
    if (forceJson) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
}

function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  // 直接 parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // 尝试从 ```json … ``` / ``` … ``` 中抽取
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        return JSON.parse(fence[1]) as T;
      } catch {
        /* fallthrough */
      }
    }
    // 尝试从首个 { 到末尾 } 截取
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    throw new Error("LLM 返回内容不是合法 JSON：" + trimmed.slice(0, 200));
  }
}
