import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type { RuleJudgabilityOutput } from "../agent/types";

const SKILL_NAME = "rule_judgability";

/**
 * Skill 2：规则可判定性与任务难度评估
 * 判断规则是否清楚，标签边界是否稳定，哪些适合机审，哪些必须人工。
 */
export const ruleJudgabilitySkill: SkillModule<RuleJudgabilityOutput> = {
  name: SKILL_NAME,
  title: "规则可判定性与任务难度评估",
  description:
    "基于规则文档/SOP/培训手册，把规则拆分为机器可判 / AI 可辅助 / 人工经验三类，并识别冲突、风险点",
  inputSchema: "{ files: [rule_doc | sop_doc | training_manual] }",
  outputSchema: `{
  judgability_level: '高'|'中'|'低',
  rule_clarity: '高'|'中'|'低',
  rule_conflicts: string[],
  subjective_judgement_points: string[],
  machine_readable_rule_points: string[],
  ai_assisted_rule_points: string[],
  human_required_rule_points: string[],
  risk_points: string[],
  summary: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const ruleFiles = t.files.filter(
      (f) =>
        f.role === "rule_doc" ||
        f.role === "sop_doc" ||
        f.role === "training_manual"
    );
    const ruleText = ruleFiles
      .map((f) => `## ${f.name}\n${(f.contentText ?? "").trim()}`)
      .join("\n\n");

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n` +
      (ruleFiles.length === 0
        ? "未上传任何规则 / SOP / 培训手册文档。请基于业务诉求兜底判断规则可判定性。\n"
        : `已上传 ${ruleFiles.length} 份规则相关文档，下面是合并文本：\n\n${ruleText.slice(0, 6000)}\n\n`) +
      `请将规则拆分为机器可判 / AI 可辅助 / 人工经验三类，并识别冲突、缺口与风险点。\n` +
      `[[PAYLOAD]]${JSON.stringify({
        ruleText: ruleText.slice(0, 6000),
        demandDescription: t.demandDescription
      })}[[/PAYLOAD]]`;

    let output: RuleJudgabilityOutput;
    try {
      output = await ctx.llm.generateJSON<RuleJudgabilityOutput>({
        systemPrompt:
          "你是「规则可判定性评估」Skill。重点是对规则做四分：机器可判 / AI 辅助 / 人工经验 / 规则缺口。严格输出 JSON。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch (e: any) {
      return {
        run: finishRun(run, {
          status: "failed",
          summary: "规则可判定性评估失败",
          warnings: [String(e?.message ?? e)]
        }),
        output: empty()
      };
    }

    const findings: string[] = [];
    findings.push(`可判定性：${output.judgability_level}，清晰度：${output.rule_clarity}`);
    findings.push(
      `机器可判 ${output.machine_readable_rule_points.length} 条 / AI 辅助 ${output.ai_assisted_rule_points.length} 条 / 人工经验 ${output.human_required_rule_points.length} 条`
    );

    const warnings = [...output.rule_conflicts, ...output.risk_points];
    return {
      run: finishRun(run, {
        status: warnings.length >= 2 ? "warning" : "completed",
        summary: output.summary,
        keyFindings: findings,
        warnings,
        output
      }),
      output
    };
  }
};

function empty(): RuleJudgabilityOutput {
  return {
    judgability_level: "低",
    rule_clarity: "低",
    rule_conflicts: [],
    subjective_judgement_points: [],
    machine_readable_rule_points: [],
    ai_assisted_rule_points: [],
    human_required_rule_points: [],
    risk_points: ["规则文档缺失或解析失败"],
    summary: "执行失败，回落为低可判定性"
  };
}
