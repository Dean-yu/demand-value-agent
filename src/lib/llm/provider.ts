// =============================================================================
// LLM Provider — 统一抽象（Mock / OpenAI 兼容）
// =============================================================================

export interface LLMGenerateParams {
  systemPrompt?: string;
  userPrompt: string;
  /** 用 JSON Schema 片段或字段说明帮助 LLM 输出严格结构 */
  schemaHint?: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly isMock: boolean;

  generateJSON<T = unknown>(params: LLMGenerateParams): Promise<T>;
  generateText(params: LLMGenerateParams): Promise<string>;
}

let providerSingleton: LLMProvider | null = null;

export async function getLLMProvider(): Promise<LLMProvider> {
  if (providerSingleton) return providerSingleton;

  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  const providerName = (process.env.LLM_PROVIDER ?? "").toLowerCase().trim();

  if (apiKey && baseUrl && model && providerName !== "mock") {
    const { OpenAICompatibleProvider } = await import("./openAICompatibleProvider");
    providerSingleton = new OpenAICompatibleProvider({ apiKey, baseUrl, model });
  } else {
    const { MockLLMProvider } = await import("./mockProvider");
    providerSingleton = new MockLLMProvider();
  }

  // eslint-disable-next-line no-console
  console.log(
    `[LLM] using ${providerSingleton.name} provider (mock=${providerSingleton.isMock}` +
      `${providerName ? `, configured=${providerName}` : ""})`
  );
  return providerSingleton;
}

/** 测试用：重置单例（不在 prod 调用） */
export function __resetProviderSingleton() {
  providerSingleton = null;
}
