// Skill 通用类型 —— 所有 Skill 模块共用
import type { LLMProvider } from "../llm/provider";
import type { EvaluationTask, SkillRun } from "../agent/types";

export interface SkillContext {
  task: EvaluationTask;
  llm: LLMProvider;
  /** Skill 之间共享中间结果，便于后续 Skill 复用前序 Skill 输出 */
  shared: Record<string, any>;
}

export interface SkillModule<TOutput = any> {
  /** 唯一 name —— 用于 mock provider 路由 / Agent 流程展示 */
  name: string;
  /** 中文展示名 */
  title: string;
  description: string;
  /** input schema 简述（仅用于展示 / mock 路由） */
  inputSchema: string;
  /** 输出 JSON schema 字段说明 */
  outputSchema: string;
  /** Skill 主体逻辑 —— 完成所有计算并 (可选) 调用 LLM 包装结果 */
  run(ctx: SkillContext): Promise<{
    run: SkillRun;
    output: TOutput;
  }>;
}

/** 公共：构造一个 SkillRun 起点 */
export function startRun(name: string, title: string): SkillRun {
  return {
    id: name,
    name: title,
    status: "running",
    startedAt: new Date().toISOString(),
    summary: "",
    keyFindings: [],
    warnings: [],
    output: undefined
  };
}

/** 公共：完成 SkillRun */
export function finishRun(
  run: SkillRun,
  patch: Partial<SkillRun>
): SkillRun {
  return {
    ...run,
    ...patch,
    endedAt: new Date().toISOString(),
    status: patch.status ?? "completed"
  };
}
