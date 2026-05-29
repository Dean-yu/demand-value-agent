import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type { DemandGoalDataFit, TaskGoalOutput } from "../agent/types";

const SKILL_NAME = "task_goal_and_data_output";

/**
 * Skill 1：任务目标与数据产出目标识别
 * 识别任务到底是为了什么，以及最终应该产出什么数据资产。
 */
export const taskGoalSkill: SkillModule<TaskGoalOutput> = {
  name: SKILL_NAME,
  title: "任务目标与数据产出目标识别",
  description:
    "结合业务诉求 + 任务类型 + 已上传材料，识别任务最终应该产出什么数据资产，是否能进入算法 / 业务治理 / 规则迭代闭环",
  inputSchema:
    "{ task: { taskType, demandDescription, files, sampleData? }, capacity }",
  outputSchema: `{
  task_goal: string,
  task_type: string,
  data_output_goals: string[],
  downstream_usage: string[],
  value_chain: string,
  asset_reusability: '高'|'中'|'低',
  missing_business_context: string[],
  summary: string,
  demand_goal_data_fit: {
    fit_level: '可满足'|'部分满足'|'无法满足',
    what_data_produces: string,
    what_demand_needs: string,
    fit_reasoning: string,
    expected_value: string
  }
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const hasRuleDoc = t.files.some(
      (f) => f.role === "rule_doc" || f.role === "sop_doc" || f.role === "training_manual"
    );
    const hasSamples = (t.sampleData?.length ?? 0) > 0;
    const sampleCount = t.sampleData?.length ?? t.capacityParams.totalSampleCount ?? 0;
    const sampleFieldsHint = describeSampleFields(t.sampleData?.[0]);
    const labelSpacePreview = previewLabels(t.sampleData);

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n` +
      `任务标题：${t.title}\n` +
      `任务类型：${t.taskType}\n` +
      `业务诉求：${t.demandDescription}\n\n` +
      `拟定标注方案要点：\n` +
      `- 已上传规则/SOP/培训手册：${hasRuleDoc ? "是" : "否"}\n` +
      `- 已上传样本：${hasSamples ? `${sampleCount} 条` : "否"}\n` +
      (sampleFieldsHint ? `- 单样本可见字段：${sampleFieldsHint}\n` : "") +
      (labelSpacePreview.length
        ? `- 已有 gold label 候选（去重）：${labelSpacePreview.join("、")}\n`
        : "") +
      `\n请基于以上信息，识别本任务真正的目标与最终应该产出的数据资产，并指出业务上下文缺失项。\n` +
      `另外请输出 demand_goal_data_fit —— 也就是「业务诉求 + 拟定标注方案 + 样本数据 → 能不能产出目标 → 带来什么价值」这条因果链：\n` +
      `  - fit_level：可满足 / 部分满足 / 无法满足\n` +
      `  - what_demand_needs：业务方真正想拿到什么（一句话）\n` +
      `  - what_data_produces：拟定标注 + 现有样本能产出什么（一句话）\n` +
      `  - fit_reasoning：能/不能产出 → 因此值得/不值得标（一句话）\n` +
      `  - expected_value：一句话商业价值\n` +
      `[[PAYLOAD]]${JSON.stringify({
        taskType: t.taskType,
        demandDescription: t.demandDescription,
        hasRuleDoc,
        hasSamples,
        sampleCount,
        sampleFieldsHint,
        labelSpacePreview
      })}[[/PAYLOAD]]`;

    let output: TaskGoalOutput;
    try {
      output = await ctx.llm.generateJSON<TaskGoalOutput>({
        systemPrompt:
          "你是任务价值评估 Agent 的「任务目标识别」Skill，必须严格输出 JSON。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch (e: any) {
      return {
        run: finishRun(run, {
          status: "failed",
          summary: "任务目标识别失败：" + (e?.message ?? "未知错误"),
          warnings: [String(e?.message ?? e)]
        }),
        output: emptyOutput(t.taskType)
      };
    }

    // 兜底：如果模型没返回 demand_goal_data_fit，根据已有信号补一份
    if (!output.demand_goal_data_fit) {
      output.demand_goal_data_fit = inferFit(output, hasRuleDoc, hasSamples, sampleCount);
    }

    const findings: string[] = [];
    if (output.data_output_goals?.length) {
      findings.push(`数据产出目标：${output.data_output_goals.join("、")}`);
    }
    if (output.asset_reusability) {
      findings.push(`资产可复用性：${output.asset_reusability}`);
    }
    if (output.demand_goal_data_fit) {
      findings.push(
        `诉求↔数据匹配：${output.demand_goal_data_fit.fit_level} — ${output.demand_goal_data_fit.fit_reasoning}`
      );
    }
    const warnings = output.missing_business_context ?? [];

    return {
      run: finishRun(run, {
        status: warnings.length > 0 ? "warning" : "completed",
        summary: output.summary,
        keyFindings: findings,
        warnings,
        output
      }),
      output
    };
  }
};

function emptyOutput(taskType: string): TaskGoalOutput {
  return {
    task_goal: "信息不足",
    task_type: taskType,
    data_output_goals: [],
    downstream_usage: [],
    value_chain: "—",
    asset_reusability: "低",
    missing_business_context: ["执行失败，未能识别任务目标"],
    summary: "任务目标识别失败",
    demand_goal_data_fit: {
      fit_level: "无法满足",
      what_demand_needs: "未识别业务诉求",
      what_data_produces: "未识别样本与方案",
      fit_reasoning: "任务目标识别失败，无法判定诉求与数据是否匹配",
      expected_value: "—"
    }
  };
}

function describeSampleFields(s?: { textFields?: Record<string, string>; raw?: Record<string, any> }): string {
  if (!s) return "";
  const fields = new Set<string>();
  if (s.textFields) {
    for (const k of Object.keys(s.textFields)) fields.add(k);
  }
  if (s.raw) {
    for (const k of Object.keys(s.raw)) fields.add(k);
  }
  return Array.from(fields).slice(0, 12).join("、");
}

function previewLabels(samples?: Array<{ label?: string }>): string[] {
  if (!samples) return [];
  const set = new Set<string>();
  for (const s of samples) {
    if (s.label && s.label.trim()) set.add(s.label.trim());
    if (set.size >= 12) break;
  }
  return Array.from(set);
}

function inferFit(
  o: TaskGoalOutput,
  hasRuleDoc: boolean,
  hasSamples: boolean,
  sampleCount: number
): DemandGoalDataFit {
  const goals = o.data_output_goals?.join("、") || "—";
  const dataReady = hasRuleDoc && hasSamples && sampleCount > 0;
  const fitLevel: DemandGoalDataFit["fit_level"] = dataReady
    ? "可满足"
    : hasSamples
      ? "部分满足"
      : "无法满足";
  const reason =
    fitLevel === "可满足"
      ? `规则 + ${sampleCount} 条样本可支撑产出 ${goals}`
      : fitLevel === "部分满足"
        ? `样本已上传，但规则/上下文不齐，仅能部分产出 ${goals}`
        : "缺少样本或规则，无法稳定产出目标数据资产";
  return {
    fit_level: fitLevel,
    what_demand_needs: o.task_goal || "未识别业务诉求",
    what_data_produces: goals,
    fit_reasoning: reason,
    expected_value:
      o.downstream_usage?.length > 0
        ? `服务于 ${o.downstream_usage.join("、")}`
        : "服务于业务治理与算法迭代"
  };
}
