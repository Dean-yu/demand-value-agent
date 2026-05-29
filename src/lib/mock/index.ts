// 集中导出 + 提供按 id 取的工具
import type { EvaluationTask } from "../agent/types";
import { commodityQualityTask } from "./commodityQualityTask";
import { consistencyModelEvalTask } from "./consistencyModelEvalTask";
import { puCotLabelingTask } from "./puCotLabelingTask";

export const MOCK_TASKS: EvaluationTask[] = [
  commodityQualityTask,
  consistencyModelEvalTask,
  puCotLabelingTask
];

export interface MockTaskMeta {
  id: string;
  title: string;
  taskType: string;
  sampleCount: number;
  description: string;
}

export function listMockTasks(): MockTaskMeta[] {
  return MOCK_TASKS.map((t) => ({
    id: t.id,
    title: t.title,
    taskType: t.taskType,
    sampleCount: t.sampleData?.length ?? 0,
    description: t.demandDescription.slice(0, 120) + (t.demandDescription.length > 120 ? "…" : "")
  }));
}

export function getMockTaskById(id: string): EvaluationTask | undefined {
  return MOCK_TASKS.find((t) => t.id === id);
}
