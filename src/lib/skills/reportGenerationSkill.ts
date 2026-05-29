import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  CoreVerdict,
  FieldLevelAnalysisOutput,
  FinalDecision,
  HistoricalQualityOutput,
  HumanEffortEstimationOutput,
  HumanWorkVerdict,
  MachineAuditCoverageOutput,
  MachineAuditTrialOutput,
  ReportOutput,
  RuleJudgabilityOutput,
  SampleSegmentationOutput,
  StrategyOutput,
  TaskGoalOutput,
  ValueScore
} from "../agent/types";

const SKILL_NAME = "task_value_report";

/**
 * Skill 8：任务价值评估报告生成
 *
 * 生成两份 Markdown：老板版一页结论 + 详细评估报告。
 * 报告结构必须严格满足 spec 中的章节要求，且数值与前序 Skill 保持一致。
 */
export const reportGenerationSkill: SkillModule<ReportOutput> = {
  name: SKILL_NAME,
  title: "任务价值评估报告生成",
  description: "生成老板版一页结论 + 详细评估报告（Markdown）",
  inputSchema: "{ all previous skill outputs, finalDecision, valueScore }",
  outputSchema: `{
  executive_summary_markdown: string,
  detailed_report_markdown: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const taskGoal = ctx.shared.taskGoal as TaskGoalOutput | undefined;
    const ruleJudge = ctx.shared.ruleJudgability as RuleJudgabilityOutput | undefined;
    const seg = ctx.shared.sampleSegmentation as SampleSegmentationOutput | undefined;
    const hist = ctx.shared.historicalQuality as HistoricalQualityOutput | undefined;
    const mac = ctx.shared.machineAuditCoverage as MachineAuditCoverageOutput | undefined;
    const eff = ctx.shared.humanEffort as HumanEffortEstimationOutput | undefined;
    const strat = ctx.shared.strategy as StrategyOutput | undefined;
    const decision = ctx.shared.finalDecision as FinalDecision | undefined;
    const score = ctx.shared.valueScore as ValueScore | undefined;
    const keyReasons = (ctx.shared.keyReasons as string[] | undefined) ?? [];
    const risksAndGaps = (ctx.shared.risksAndGaps as string[] | undefined) ?? [];
    const nextStepPlan = (ctx.shared.nextStepPlan as string[] | undefined) ?? [];
    const humanWork = ctx.shared.humanWork as HumanWorkVerdict | undefined;
    const coreVerdict = ctx.shared.coreVerdict as CoreVerdict | undefined;
    const fieldAnalysis = ctx.shared.fieldAnalysis as
      | FieldLevelAnalysisOutput
      | undefined;
    const trial = ctx.shared.machineAuditTrial as
      | MachineAuditTrialOutput
      | undefined;

    const executive = renderExecutiveSummary({
      title: t.title,
      decision,
      coreVerdict,
      keyReasons,
      taskGoal,
      seg,
      eff,
      strat,
      risksAndGaps,
      nextStepPlan,
      humanWork,
      fieldAnalysis,
      trial
    });
    const detailed = renderDetailedReport({
      task: t,
      taskGoal,
      ruleJudge,
      seg,
      hist,
      mac,
      eff,
      strat,
      score,
      decision,
      coreVerdict,
      keyReasons,
      risksAndGaps,
      nextStepPlan,
      humanWork,
      fieldAnalysis,
      trial
    });

    const payload: ReportOutput = {
      executive_summary_markdown: executive,
      detailed_report_markdown: detailed
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n请基于以下结构生成两份 Markdown 报告：\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let output: ReportOutput;
    try {
      output = await ctx.llm.generateJSON<ReportOutput>({
        systemPrompt:
          "你是「任务价值评估报告生成」Skill。请输出严格 JSON：executive_summary_markdown / detailed_report_markdown。报告中数值必须与 payload 一致。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch {
      output = payload;
    }
    // 保底：若 LLM 输出明显残缺，回落确定性版本
    if (!output.executive_summary_markdown || output.executive_summary_markdown.length < 80) {
      output.executive_summary_markdown = executive;
    }
    if (!output.detailed_report_markdown || output.detailed_report_markdown.length < 200) {
      output.detailed_report_markdown = detailed;
    }

    return {
      run: finishRun(run, {
        status: "completed",
        summary: `已生成老板版一页结论与详细评估报告（共 ${output.detailed_report_markdown.length} 字）`,
        keyFindings: ["老板版报告已生成", "详细报告已生成"],
        warnings: [],
        output
      }),
      output
    };
  }
};

// =============================================================================
// 报告渲染
// =============================================================================

function renderExecutiveSummary(args: {
  title: string;
  decision: FinalDecision | undefined;
  coreVerdict?: CoreVerdict;
  keyReasons: string[];
  taskGoal?: TaskGoalOutput;
  seg?: SampleSegmentationOutput;
  eff?: HumanEffortEstimationOutput;
  strat?: StrategyOutput;
  risksAndGaps: string[];
  nextStepPlan: string[];
  humanWork?: HumanWorkVerdict;
  fieldAnalysis?: FieldLevelAnalysisOutput;
  trial?: MachineAuditTrialOutput;
}): string {
  const {
    title,
    decision,
    coreVerdict,
    keyReasons,
    taskGoal,
    seg,
    eff,
    strat,
    risksAndGaps,
    nextStepPlan,
    humanWork,
    fieldAnalysis,
    trial
  } = args;
  const segs = seg?.sample_value_segments;
  const total = seg?.sample_count ?? 0;

  return [
    `# 任务价值评估结论`,
    ``,
    `> ${title || "未命名任务"}`,
    ``,
    `## 一句话结论`,
    `本任务建议：**${decision ?? "—"}**。`,
    `核心原因：${keyReasons.length > 0 ? keyReasons[0] : "—"}。`,
    ``,
    `## 核心三问`,
    `### Q1：需不需要标？`,
    `**${coreVerdict?.worthLabeling.headline ?? "—"}**（${coreVerdict?.worthLabeling.verdict ?? "—"}）`,
    ...(coreVerdict?.worthLabeling.reasons ?? []).slice(0, 4).map((r) => `- ${r}`),
    ``,
    `### Q2：机器标还是人工标？`,
    `**${coreVerdict?.labelingMode.headline ?? "—"}**（${coreVerdict?.labelingMode.mode ?? "—"}）`,
    ...(coreVerdict?.labelingMode.reasons ?? []).slice(0, 4).map((r) => `- ${r}`),
    ...(trial && trial.attempted
      ? trial.succeeded
        ? [`- 真实 Trial 准确率 **${pct(trial.overall_accuracy)}** @ ${trial.trial_sample_count} 条`]
        : [`- 未做真实 Trial（${trial.failure_reason ?? "未知原因"}），Q2 为启发式估算`]
      : []),
    ``,
    `### Q3：各占多少？`,
    coreVerdict
      ? `**样本拆分（共 ${coreVerdict.scaleSplit.totalSamples} 条）**：机审直接 ${coreVerdict.scaleSplit.machineAutoCount} ｜ AI 预标+人工核对 ${coreVerdict.scaleSplit.aiAssistCount} ｜ 必须人工 ${coreVerdict.scaleSplit.humanCount} ｜ 排除 ${coreVerdict.scaleSplit.excludeCount}`
      : `**样本拆分**：—`,
    coreVerdict
      ? `**题目拆分（共 ${coreVerdict.scaleSplit.totalQuestions} 个）**：机器/AI 承接 ${coreVerdict.scaleSplit.machineQuestionCount} ｜ AI 辅助 ${coreVerdict.scaleSplit.aiAssistQuestionCount} ｜ 必须人工 ${coreVerdict.scaleSplit.humanQuestionCount}`
      : `**题目拆分**：—`,
    coreVerdict
      ? `**人力对比**：优化后 ${coreVerdict.scaleSplit.personDays} 人天 vs 全人工 ${coreVerdict.scaleSplit.baselinePersonDays} 人天`
      : `**人力对比**：—`,
    ``,
    `## 是否需要人工 / 做什么 / 做多少`,
    `**${humanWork?.headline ?? "（暂无人工必要性结论）"}**`,
    ``,
    `- 人工强度：${humanWork?.level ?? "—"}`,
    `- 人工要做的事：`,
    ...(humanWork?.whatHumanDoes ?? []).slice(0, 5).map((s) => `  - ${s}`),
    `- AI / 机审承担的事：`,
    ...(humanWork?.whatAIDoes ?? []).slice(0, 5).map((s) => `  - ${s}`),
    `- 人工标注规模：约 **${humanWork?.estimatedHumanSampleCount ?? "—"}** 条 / **${humanWork?.estimatedPersonDays ?? "—"}** 人天`,
    ``,
    `## 题目级 AI vs 人工拆分`,
    ...(fieldAnalysis && fieldAnalysis.fields.length > 0
      ? buildFieldTable(fieldAnalysis)
      : ["（题目级分析尚未生成）"]),
    ``,
    `## 关键判断`,
    `| 判断项 | 结论 |`,
    `| --- | --- |`,
    `| 数据产出目标 | ${(taskGoal?.data_output_goals ?? []).join("、") || "—"} |`,
    `| 建议人工重点标注 | ${countAndPct(segs?.high_value_human_labeling?.count, total)} |`,
    `| 边界 Case（人工双标） | ${countAndPct(segs?.boundary_cases?.count, total)} |`,
    `| 建议机审免审 | ${countAndPct(segs?.machine_auto?.count, total)} |`,
    `| 建议 AI 预标 + 人工确认 | ${countAndPct(segs?.ai_prelabel_human_confirm?.count, total)} |`,
    `| 人工兜底 | ${countAndPct(segs?.human_fallback?.count, total)} |`,
    `| 暂不建议投入 | ${countAndPct(segs?.not_recommended?.count, total)} |`,
    `| 全人工预计投入 | ${eff?.baseline_human_effort.estimated_person_days ?? "—"} 人天 |`,
    `| 优化后预计投入 | ${eff?.optimized_human_effort.estimated_person_days ?? "—"} 人天 |`,
    `| 人工减量空间 | ${eff?.reduction_space.human_hour_reduction_ratio ?? "—"} |`,
    `| 继续投入建议 | ${decision ?? "—"} |`,
    ``,
    `## 数据产出目标`,
    `本任务建议主要产出：`,
    ...(taskGoal?.data_output_goals ?? []).map((g, i) => `${i + 1}. ${g}`),
    ``,
    `## 样本投入策略`,
    `- 机审免审：${segs?.machine_auto?.reason ?? "—"}`,
    `- AI 预标 + 人工确认：${segs?.ai_prelabel_human_confirm?.reason ?? "—"}`,
    `- 人工重点标注：${segs?.high_value_human_labeling?.reason ?? "—"}`,
    `- 边界 Case：${segs?.boundary_cases?.reason ?? "—"}`,
    `- 暂不建议投入：${segs?.not_recommended?.reason ?? "—"}`,
    ``,
    `## 人工投入规模`,
    `- 全人工模式：预计 ${eff?.baseline_human_effort.estimated_total_hours ?? "—"} 小时 / ${eff?.baseline_human_effort.estimated_person_days ?? "—"} 人天`,
    `- 优化后模式：预计 ${eff?.optimized_human_effort.estimated_total_hours ?? "—"} 小时 / ${eff?.optimized_human_effort.estimated_person_days ?? "—"} 人天`,
    `- 减量空间：${eff?.reduction_space.human_hour_reduction_ratio ?? "—"}`,
    ``,
    `## 主要风险`,
    ...(risksAndGaps.length > 0
      ? risksAndGaps.slice(0, 5).map((r, i) => `${i + 1}. ${r}`)
      : ["1. 暂未发现重大风险"]),
    ``,
    `## 下一步建议`,
    ...(nextStepPlan.length > 0
      ? nextStepPlan.slice(0, 5).map((r, i) => `${i + 1}. ${r}`)
      : [
          `1. 先用 ${strat?.pilot_plan.pilot_sample_size ?? 200} 条样本试点`,
          `2. 重点验证 ${(strat?.pilot_plan.acceptance_metrics ?? []).slice(0, 2).join("、") || "质检通过率与争议率"}`,
          `3. 达到放量条件后再大规模投入`
        ])
  ].join("\n");
}

function renderDetailedReport(args: {
  task: SkillContext["task"];
  taskGoal?: TaskGoalOutput;
  ruleJudge?: RuleJudgabilityOutput;
  seg?: SampleSegmentationOutput;
  hist?: HistoricalQualityOutput;
  mac?: MachineAuditCoverageOutput;
  eff?: HumanEffortEstimationOutput;
  strat?: StrategyOutput;
  score?: ValueScore;
  decision?: FinalDecision;
  coreVerdict?: CoreVerdict;
  keyReasons: string[];
  risksAndGaps: string[];
  nextStepPlan: string[];
  humanWork?: HumanWorkVerdict;
  fieldAnalysis?: FieldLevelAnalysisOutput;
  trial?: MachineAuditTrialOutput;
}): string {
  const {
    task,
    taskGoal,
    ruleJudge,
    seg,
    hist,
    mac,
    eff,
    strat,
    score,
    decision,
    coreVerdict,
    keyReasons,
    risksAndGaps,
    nextStepPlan,
    humanWork,
    fieldAnalysis,
    trial
  } = args;
  const total = seg?.sample_count ?? task.sampleData?.length ?? 0;

  const lines: string[] = [];
  lines.push(`# 任务价值评估报告`);
  lines.push("");
  lines.push(`> 任务：${task.title || "未命名"} ｜ 任务类型：${task.taskType} ｜ 评估时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  lines.push("");

  // 0  核心三问（先讲结论，再讲依据）
  lines.push(`## 0. 核心结论（三问）`);
  lines.push(`- **最终决策**：**${decision ?? "—"}**`);
  if (coreVerdict) {
    lines.push("");
    lines.push(`### Q1 需不需要标？ → **${coreVerdict.worthLabeling.verdict}**`);
    lines.push(`> ${coreVerdict.worthLabeling.headline}`);
    for (const r of coreVerdict.worthLabeling.reasons) lines.push(`- ${r}`);
    lines.push("");
    lines.push(`### Q2 机器还是人标？ → **${coreVerdict.labelingMode.mode}**`);
    lines.push(`> ${coreVerdict.labelingMode.headline}`);
    for (const r of coreVerdict.labelingMode.reasons) lines.push(`- ${r}`);
    lines.push("");
    lines.push(`### Q3 各占多少？`);
    const s = coreVerdict.scaleSplit;
    lines.push(`| 维度 | 数量 | 占比 |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(
      `| 机审直接产出 | ${s.machineAutoCount} 条 | ${pct(safeRatio(s.machineAutoCount, s.totalSamples))} |`
    );
    lines.push(
      `| AI 预标 + 人工核对 | ${s.aiAssistCount} 条 | ${pct(safeRatio(s.aiAssistCount, s.totalSamples))} |`
    );
    lines.push(
      `| 必须人工 | ${s.humanCount} 条 | ${pct(safeRatio(s.humanCount, s.totalSamples))} |`
    );
    lines.push(
      `| 排除 | ${s.excludeCount} 条 | ${pct(safeRatio(s.excludeCount, s.totalSamples))} |`
    );
    lines.push(`| 样本总计 | ${s.totalSamples} 条 | 100% |`);
    lines.push("");
    lines.push(`**题目级承接**：机器/AI ${s.machineQuestionCount} 个 ｜ AI 辅助 ${s.aiAssistQuestionCount} 个 ｜ 必须人工 ${s.humanQuestionCount} 个 ｜ 共 ${s.totalQuestions} 个`);
    lines.push("");
    lines.push(`**人力对比**：优化后 ${s.personDays} 人天 vs 全人工 ${s.baselinePersonDays} 人天（减量 ${pct(safeRatio(Math.max(0, s.baselinePersonDays - s.personDays), s.baselinePersonDays))}）`);
  } else {
    lines.push("（核心三问结论尚未生成）");
  }
  lines.push("");

  // 1
  lines.push(`## 1. 任务背景与评估范围`);
  lines.push(`- 业务诉求：${task.demandDescription || "—"}`);
  lines.push(`- 任务类型：${task.taskType}`);
  lines.push(`- 样本规模：${total}`);
  lines.push(`- 上传材料：${(task.files ?? []).map((f) => f.name).join("、") || "—"}`);
  lines.push("");

  // 2
  lines.push(`## 2. 数据产出目标分析`);
  lines.push(`- 任务目标：${taskGoal?.task_goal ?? "—"}`);
  lines.push(`- 数据产出目标：${(taskGoal?.data_output_goals ?? []).join("、") || "—"}`);
  lines.push(`- 下游使用：${(taskGoal?.downstream_usage ?? []).join("、") || "—"}`);
  lines.push(`- 价值闭环：${taskGoal?.value_chain ?? "—"}`);
  lines.push(`- 资产可复用性：${taskGoal?.asset_reusability ?? "—"}`);
  if ((taskGoal?.missing_business_context?.length ?? 0) > 0) {
    lines.push(`- ⚠️ 业务上下文缺失：`);
    for (const m of taskGoal!.missing_business_context) lines.push(`  - ${m}`);
  }
  lines.push("");

  // 3
  lines.push(`## 3. 规则可判定性与任务难度`);
  lines.push(`- 可判定性：${ruleJudge?.judgability_level ?? "—"} ｜ 规则清晰度：${ruleJudge?.rule_clarity ?? "—"}`);
  lines.push(`- 机器可判规则点：${(ruleJudge?.machine_readable_rule_points ?? []).length} 条`);
  lines.push(`- AI 辅助规则点：${(ruleJudge?.ai_assisted_rule_points ?? []).length} 条`);
  lines.push(`- 人工经验规则点：${(ruleJudge?.human_required_rule_points ?? []).length} 条`);
  if ((ruleJudge?.rule_conflicts?.length ?? 0) > 0) {
    lines.push(`- ⚠️ 规则冲突：`);
    for (const c of ruleJudge!.rule_conflicts) lines.push(`  - ${c}`);
  }
  if ((ruleJudge?.risk_points?.length ?? 0) > 0) {
    lines.push(`- 风险点：`);
    for (const c of ruleJudge!.risk_points) lines.push(`  - ${c}`);
  }
  lines.push("");

  // 3.5 题目级 AI vs 人工拆分
  lines.push(`## 3.5 题目级 AI vs 人工拆分`);
  if (fieldAnalysis && fieldAnalysis.fields.length > 0) {
    lines.push(...buildFieldTable(fieldAnalysis));
    lines.push("");
    lines.push(`- AI 主导题目数：${fieldAnalysis.ai_dominant_count}`);
    lines.push(`- 必须人工题目数：${fieldAnalysis.human_required_count}`);
    if (fieldAnalysis.what_ai_does.length) {
      lines.push(`- AI 能做的事：`);
      for (const s of fieldAnalysis.what_ai_does) lines.push(`  - ${s}`);
    }
    if (fieldAnalysis.what_human_does.length) {
      lines.push(`- 人工必须做的事：`);
      for (const s of fieldAnalysis.what_human_does) lines.push(`  - ${s}`);
    }
  } else {
    lines.push("（题目级分析尚未生成）");
  }
  lines.push("");

  // 3.6 人工必要性结论
  lines.push(`## 3.6 是否需要人工 / 做什么 / 做多少`);
  if (humanWork) {
    lines.push(`- **${humanWork.headline}**`);
    lines.push(`- 人工强度：${humanWork.level}`);
    lines.push(
      `- 人工标注规模：${humanWork.estimatedHumanSampleCount} 条 / ${humanWork.estimatedPersonDays} 人天`
    );
    if (humanWork.priorityFocus.length) {
      lines.push(`- 重点投入：`);
      for (const s of humanWork.priorityFocus) lines.push(`  - ${s}`);
    }
    lines.push(`- 综合判断：${humanWork.rationale}`);
  } else {
    lines.push("（暂无人工必要性结论）");
  }
  lines.push("");

  // 3.7 机审 Trial 实测
  lines.push(`## 3.7 机审 Trial 实测（真实 LLM 跑通用机审）`);
  if (trial && trial.attempted) {
    if (trial.succeeded) {
      lines.push(`- ✅ 已完成真实 trial：在 ${trial.trial_sample_count} 条样本上用通用机审 prompt 真实预测一次，并和 gold label 对比`);
      lines.push(`- 总体准确率：**${pct(trial.overall_accuracy)}**`);
      lines.push(`- 推荐承接方式：**${trial.recommended_mode}**`);
      lines.push(`- 候选标签空间：${trial.label_space.slice(0, 12).join("、")}${trial.label_space.length > 12 ? `…（共 ${trial.label_space.length}）` : ""}`);
      lines.push("");
      lines.push(`### Trial Prompt 摘要`);
      lines.push("```");
      lines.push(trimText(trial.trial_system_prompt, 200));
      lines.push("---");
      lines.push(trimText(trial.trial_user_template, 200));
      lines.push("```");
      lines.push("");
      if (trial.per_category.length > 0) {
        lines.push(`### 按类目准确率拆分`);
        lines.push(`| 类目 | 样本数 | 准确率 | 推荐承接 | 依据 |`);
        lines.push(`| --- | --- | --- | --- | --- |`);
        for (const c of trial.per_category) {
          lines.push(
            `| ${c.category} | ${c.sampleCount} | ${pct(c.accuracy)} | ${modeLabel(c.mode)} | ${c.reason} |`
          );
        }
        lines.push("");
      }
      lines.push(`> 结论：以上 per-category mode 已被外推到全样本(参见 Q3「各占多少」与第 4 节样本池画像)，是「机器/预标/人工」拆分的真实依据。`);
    } else {
      lines.push(`- ⚠️ 已尝试但未跑通真实 trial`);
      lines.push(`- 失败原因：${trial.failure_reason ?? "未知"}`);
      lines.push(`- 影响：Q2「机器/人工」结论与第 4 节样本拆分回落到启发式估算(机审置信度 + 历史一致性)`);
    }
  } else {
    lines.push(`- 未尝试真实 trial(可能因为 mock provider / 样本无 gold label / 关闭了 LLM_TRIAL_ENABLED)`);
    lines.push(`- 当前 Q2 与样本拆分基于启发式：规则可判定性 + 已有机审 confidence`);
  }
  lines.push("");

  // 4
  lines.push(`## 4. 样本池画像与价值分层`);
  if (seg) {
    lines.push(`| 段位 | 数量 | 占比 | 主要依据 |`);
    lines.push(`| --- | --- | --- | --- |`);
    const segs = seg.sample_value_segments;
    const order: Array<[string, keyof typeof segs]> = [
      ["高价值人工标注", "high_value_human_labeling"],
      ["边界 Case", "boundary_cases"],
      ["机审免审", "machine_auto"],
      ["AI 预标 + 人工确认", "ai_prelabel_human_confirm"],
      ["人工兜底", "human_fallback"],
      ["暂不建议投入", "not_recommended"]
    ];
    for (const [name, key] of order) {
      const s = segs[key];
      lines.push(`| ${name} | ${s.count} | ${pct(s.ratio)} | ${s.criteria.join("；")} |`);
    }
    lines.push("");
    if ((seg.sample_quality_issues ?? []).length > 0) {
      lines.push(`⚠️ 样本质量问题：`);
      for (const q of seg.sample_quality_issues) lines.push(`- ${q}`);
      lines.push("");
    }
    // Top 疑难样本
    if ((seg.boundary_case_ranking ?? []).length > 0) {
      lines.push(`### Top 疑难/边界样本（建议优先安排人工）`);
      lines.push(`| # | 样本 ID | 类目 | 标签 | 疑难度 | 原因 |`);
      lines.push(`| --- | --- | --- | --- | --- | --- |`);
      seg.boundary_case_ranking.slice(0, 10).forEach((it, i) => {
        lines.push(
          `| ${i + 1} | ${it.sampleId} | ${it.category ?? "—"} | ${it.label ?? "—"} | ${it.score} | ${it.reasons.join("；")} |`
        );
      });
      lines.push("");
    }
  } else {
    lines.push("（样本数据不足，无法分层）");
  }
  lines.push("");

  // 5
  lines.push(`## 5. 历史标注结果与质量基线`);
  if (hist) {
    lines.push(`- 一致率：${hist.quality_baseline.agreement_rate}`);
    lines.push(`- 质检通过率：${hist.quality_baseline.quality_pass_rate}`);
    lines.push(`- 高错标签：${hist.quality_baseline.high_error_labels.join("、") || "—"}`);
    lines.push(`- 不稳定标签：${hist.quality_baseline.unstable_labels.join("、") || "—"}`);
    lines.push(`- 历史结果可复用性：${hist.historical_result_reusability}`);
    if (hist.unstable_rule_points.length > 0) {
      lines.push(`- 不稳定规则点：`);
      for (const r of hist.unstable_rule_points) lines.push(`  - ${r}`);
    }
  } else {
    lines.push("（暂无历史标注 / 质检数据）");
  }
  lines.push("");

  // 6
  lines.push(`## 6. 已有机审能力覆盖度`);
  if (mac) {
    lines.push(`- 机审覆盖率：${mac.machine_coverage}`);
    lines.push(`- 高置信免审：${mac.high_confidence_auto_ratio}`);
    lines.push(`- 中置信预标：${mac.prelabel_candidate_ratio}`);
    lines.push(`- 低置信兜底：${mac.human_fallback_ratio}`);
    lines.push(`- 强项标签：${mac.machine_strength_labels.join("、") || "—"}`);
    lines.push(`- 弱项标签：${mac.machine_weakness_labels.join("、") || "—"}`);
    if (mac.machine_error_patterns.length > 0) {
      lines.push(`- 错误模式：`);
      for (const p of mac.machine_error_patterns) lines.push(`  - ${p}`);
    }
    lines.push(`- 机审能力判断：${mac.machine_capability_judgement}`);
  } else {
    lines.push("（暂无机审结果）");
  }
  lines.push("");

  // 7
  lines.push(`## 7. 人工投入规模测算`);
  if (eff) {
    lines.push(`| 模式 | 全人工 | 优化后 |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| 人工总耗时 | ${eff.baseline_human_effort.estimated_total_hours} h | ${eff.optimized_human_effort.estimated_total_hours} h |`);
    lines.push(`| 人天 | ${eff.baseline_human_effort.estimated_person_days} | ${eff.optimized_human_effort.estimated_person_days} |`);
    lines.push(`| 预计人数 | ${eff.baseline_human_effort.estimated_people_needed} | ${eff.optimized_human_effort.estimated_people_needed} |`);
    lines.push("");
    lines.push(`- 减量空间：${eff.reduction_space.human_hour_reduction_ratio}`);
    if (eff.reduction_space.reduction_reason.length > 0) {
      lines.push(`- 减量来源：`);
      for (const r of eff.reduction_space.reduction_reason) lines.push(`  - ${r}`);
    }
  }
  lines.push("");

  // 8
  lines.push(`## 8. 人机分工与减量空间`);
  if (strat) {
    lines.push(`- 机审承接条件：${strat.human_machine_collaboration.machine_auto.join("；")}`);
    lines.push(`- AI 预标范围：${strat.human_machine_collaboration.ai_prelabel_human_confirm.join("；")}`);
    lines.push(`- 人工聚焦：${strat.human_machine_collaboration.human_focus.join("；")}`);
    lines.push(`- 暂缓 / 排除：${strat.human_machine_collaboration.exclude_or_hold.join("；")}`);
  }
  lines.push("");

  // 9
  lines.push(`## 9. 任务价值评分`);
  if (score) {
    lines.push(`- 综合得分：**${score.totalScore}/100**`);
    lines.push(`| 维度 | 得分 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 数据产出价值 (20) | ${score.dimensions.dataOutputValue} |`);
    lines.push(`| 业务价值 (15) | ${score.dimensions.businessValue} |`);
    lines.push(`| 规则可判定性 (15) | ${score.dimensions.ruleJudgability} |`);
    lines.push(`| 样本池价值 (15) | ${score.dimensions.sampleValue} |`);
    lines.push(`| 机审减量潜力 (15) | ${score.dimensions.machineAuditPotential} |`);
    lines.push(`| 人工减量价值 (10) | ${score.dimensions.humanReductionValue} |`);
    lines.push(`| 交付风险可控性 (10) | ${score.dimensions.deliveryRiskControl} |`);
  }
  lines.push(`- 最终决策：**${decision ?? "—"}**`);
  if (keyReasons.length > 0) {
    lines.push(`- 关键原因：`);
    for (const r of keyReasons) lines.push(`  - ${r}`);
  }
  lines.push("");

  // 10
  lines.push(`## 10. 风险与补齐建议`);
  if (risksAndGaps.length > 0) {
    for (const r of risksAndGaps) lines.push(`- ${r}`);
  } else {
    lines.push(`- 暂未发现重大风险`);
  }
  lines.push("");

  // 11
  lines.push(`## 11. 试点方案`);
  if (strat) {
    lines.push(`- 试点样本量：${strat.pilot_plan.pilot_sample_size}`);
    lines.push(`- 试点周期：${strat.pilot_plan.pilot_duration}`);
    lines.push(`- 验收指标：`);
    for (const m of strat.pilot_plan.acceptance_metrics) lines.push(`  - ${m}`);
  }
  lines.push("");

  // 12
  lines.push(`## 12. 放量建议`);
  if (strat) {
    lines.push(`- 放量条件：`);
    for (const c of strat.scale_plan.scale_condition) lines.push(`  - ${c}`);
    lines.push(`- 放量风险：`);
    for (const c of strat.scale_plan.scale_risks) lines.push(`  - ${c}`);
    lines.push(`- 必要改造：`);
    for (const c of strat.scale_plan.required_improvements) lines.push(`  - ${c}`);
  }
  if (nextStepPlan.length > 0) {
    lines.push("");
    lines.push(`### 推荐 Next Step`);
    for (const n of nextStepPlan) lines.push(`- ${n}`);
  }

  return lines.join("\n");
}

function pct(r: number | undefined): string {
  if (r === undefined) return "—";
  return (r * 100).toFixed(1) + "%";
}

function safeRatio(n: number, total: number): number {
  if (!total || total <= 0) return 0;
  return n / total;
}

function countAndPct(c: number | undefined, total: number): string {
  if (c === undefined) return "—";
  if (!total) return `${c} 条`;
  return `${c} 条 / ${((c / total) * 100).toFixed(1)}%`;
}

function flowLabel(f: string): string {
  return (
    {
      machine_auto: "机审直接判",
      ai_prefill: "AI 预填 / 人工确认",
      ai_assist: "AI 辅助 / 人工核对",
      human_only: "必须人工"
    } as Record<string, string>
  )[f] ?? f;
}

function modeLabel(m: string): string {
  return (
    {
      machine_auto: "机审直接",
      ai_prelabel: "AI 预标 + 人工确认",
      human_required: "必须人工"
    } as Record<string, string>
  )[m] ?? m;
}

function trimText(s: string | undefined, max: number): string {
  if (!s) return "—";
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max) + "…";
}

function buildFieldTable(fa: FieldLevelAnalysisOutput): string[] {
  const lines: string[] = [];
  lines.push(`| 题目 | 难度 | AI 能力 | 推荐承接 | 估算人工占比 | 说明 |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const f of fa.fields) {
    lines.push(
      `| ${f.name}${f.isCoreField ? " ⭐" : ""} | ${f.difficulty} | ${f.aiCapability} | ${flowLabel(f.suggestedFlow)} | ${(f.estimatedHumanRatio * 100).toFixed(0)}% | ${f.reason} |`
    );
  }
  return lines;
}
