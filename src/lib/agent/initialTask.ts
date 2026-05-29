import type { EvaluationTask } from "./types";

export function makeEmptyTask(): EvaluationTask {
  return {
    id: `task_${Date.now()}`,
    title: "",
    taskType: "audit",
    demandDescription: "",
    files: [],
    sampleData: [],
    historicalLabels: [],
    qualityResults: [],
    machineAuditResults: [],
    capacityParams: {
      avgManualSecondsPerItem: 60,
      avgPrelabelConfirmSecondsPerItem: 25,
      qualitySamplingRatio: 0.1,
      effectiveWorkHoursPerPersonDay: 6
    },
    createdAt: new Date().toISOString(),
    status: "draft"
  };
}
