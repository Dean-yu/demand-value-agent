import type { SkillContext, SkillModule } from "./skillTypes";
import { finishRun, startRun } from "./skillTypes";
import type {
  BoundaryCaseItem,
  CategoryTrialResult,
  HistoricalLabelRecord,
  MachineAuditRecord,
  MachineAuditTrialOutput,
  QualityResultRecord,
  SampleRecord,
  SampleSegmentationOutput,
  SampleSegmentJSON
} from "../agent/types";

const SKILL_NAME = "sample_pool_segmentation";

const HIGH_CONF = 0.9;
const MID_CONF = 0.7;

interface SegBuckets {
  high_value_human_labeling: SampleRecord[];
  boundary_cases: SampleRecord[];
  machine_auto: SampleRecord[];
  ai_prelabel_human_confirm: SampleRecord[];
  human_fallback: SampleRecord[];
  not_recommended: SampleRecord[];
}

/**
 * Skill 3：样本池画像与价值分层
 *
 * 关键判定（顺序很重要，先匹配的优先归类）：
 *   1) 字段缺失严重 / 重复样本 → not_recommended
 *   2) 历史 quality 标记错误 → boundary_cases / human_fallback
 *   3) 机审高置信 + 历史一致 + 规则可判 → machine_auto
 *   4) 机审中置信 / 规则可解释 → ai_prelabel_human_confirm
 *   5) 机审低置信 / 历史高错 → human_fallback
 *   6) hard / 边界 / 难例 → boundary_cases
 *   7) 其余偏 high_value_human_labeling
 */
export const sampleSegmentationSkill: SkillModule<SampleSegmentationOutput> = {
  name: SKILL_NAME,
  title: "样本池画像与价值分层",
  description:
    "结合样本难度提示、机审置信度、历史标注一致性，把样本分为 6 段并给出重点标注范围",
  inputSchema:
    "{ sampleData, historicalLabels?, qualityResults?, machineAuditResults? }",
  outputSchema: `{
  sample_count: number,
  sample_distribution: { category_distribution, label_distribution, risk_type_distribution, difficulty_distribution },
  sample_quality_issues: string[],
  sample_value_segments: { high_value_human_labeling, boundary_cases, machine_auto, ai_prelabel_human_confirm, human_fallback, not_recommended },
  recommended_labeling_scope: string,
  summary: string
}`,

  async run(ctx: SkillContext) {
    const run = startRun(SKILL_NAME, this.title);
    const t = ctx.task;
    const samples = t.sampleData ?? [];
    const histMap = byId(t.historicalLabels);
    const qaMap = byId(t.qualityResults);
    const macMap = byId(t.machineAuditResults);
    const trial = ctx.shared.machineAuditTrial as
      | MachineAuditTrialOutput
      | undefined;
    const trialModeByCat = buildTrialModeMap(trial);

    if (samples.length === 0) {
      const empty: SampleSegmentationOutput = {
        sample_count: 0,
        sample_distribution: {
          category_distribution: {},
          label_distribution: {},
          risk_type_distribution: {},
          difficulty_distribution: {}
        },
        sample_quality_issues: ["未上传样本数据，无法分层；建议补齐样本"],
        sample_value_segments: {
          high_value_human_labeling: emptySeg(),
          boundary_cases: emptySeg(),
          machine_auto: emptySeg(),
          ai_prelabel_human_confirm: emptySeg(),
          human_fallback: emptySeg(),
          not_recommended: emptySeg()
        },
        boundary_case_ranking: [],
        recommended_labeling_scope: "信息不足",
        summary: "样本数据为空，无法完成分层"
      };
      return {
        run: finishRun(run, {
          status: "warning",
          summary: empty.summary,
          warnings: empty.sample_quality_issues,
          output: empty
        }),
        output: empty
      };
    }

    // 分布统计
    const categoryDist: Record<string, number> = {};
    const labelDist: Record<string, number> = {};
    const riskDist: Record<string, number> = {};
    const difficultyDist: Record<string, number> = {};

    // 字段完整度 / 重复检测
    const seenSig = new Set<string>();
    const dupCount = { v: 0 };
    const incompleteCount = { v: 0 };

    const buckets: SegBuckets = {
      high_value_human_labeling: [],
      boundary_cases: [],
      machine_auto: [],
      ai_prelabel_human_confirm: [],
      human_fallback: [],
      not_recommended: []
    };

    // 历史高错标签集合：用于 highValueScore
    const histHighErrorLabels = new Set<string>();
    const histHighErrorRaw =
      (ctx.shared.historicalQuality as any)?.quality_baseline?.high_error_labels ?? [];
    for (const raw of histHighErrorRaw) {
      // 形如 "标签A(错误率 25.0%)" → 提取主标签
      const m = String(raw).match(/^([^(]+)/);
      if (m) histHighErrorLabels.add(m[1].trim());
    }

    for (const s of samples) {
      // 分布
      bump(categoryDist, s.category ?? "未分类");
      bump(labelDist, s.label ?? "未标签");
      bump(riskDist, s.riskType ?? "未标记");
      bump(difficultyDist, s.difficultyHint ?? "unknown");

      // 字段完整度
      const isIncomplete = isFieldsIncomplete(s);
      if (isIncomplete) incompleteCount.v++;

      // 重复检测（基于 raw 字段拼接的简易签名）
      const sig = simpleSig(s);
      const isDup = seenSig.has(sig);
      if (!isDup) seenSig.add(sig);
      if (isDup) dupCount.v++;

      // 关联三表
      const m = macMap.get(s.id) as MachineAuditRecord | undefined;
      const h = histMap.get(s.id) as HistoricalLabelRecord | undefined;
      const q = qaMap.get(s.id) as QualityResultRecord | undefined;

      // ============================================================
      // 多信号叠加打分（替代原线性 if/else，避免 boundary/highValue/notRec 长期为 0）
      // 阈值版分桶：每个样本算 4 维分数 → 决定落桶
      // ============================================================
      const conf = m?.confidence ?? -1; // -1 = 没有机审记录
      const errType = q?.errorType ?? "";
      const isMisLabel = q?.isCorrect === false && errType.length > 0;
      const isBoundaryError = /(边界|歧义|争议|主观)/.test(errType);

      // boundaryScore：边界 / 难例 / 历史质检争议
      let boundaryScore = 0;
      if (s.difficultyHint === "hard") boundaryScore += 3;
      if (isMisLabel && isBoundaryError) boundaryScore += 3;
      if (m?.historicalAgreement === false) boundaryScore += 2;
      if (conf >= 0.5 && conf < 0.7) boundaryScore += 1;
      if (h?.taskRound === "second_label" || h?.taskRound === "final_review")
        boundaryScore += 2;

      // highValueScore：高错标签 / 没机审 / 二复审历史
      let highValueScore = 0;
      if (s.label && histHighErrorLabels.has(s.label)) highValueScore += 3;
      if (!m) highValueScore += 1;
      if (h?.taskRound === "second_label") highValueScore += 2;
      if (s.difficultyHint === "medium" && !m) highValueScore += 1;

      // noRecommendScore：字段缺失 / 重复 / 文本太短
      let noRecommendScore = 0;
      if (isIncomplete) noRecommendScore += 5;
      if (isDup) noRecommendScore += 5;
      const rawText = JSON.stringify(s.raw ?? {});
      if (rawText.length < 12) noRecommendScore += 3;

      // machineCapableScore：机审高/中置信 + 历史一致
      let machineCapableScore = 0;
      if (conf >= HIGH_CONF && (m?.historicalAgreement ?? false)) machineCapableScore += 5;
      else if (conf >= HIGH_CONF) machineCapableScore += 4;
      else if (conf >= MID_CONF) machineCapableScore += 3;

      // -------- 决策顺序（threshold 版）--------
      // 1) 严重异常 → 直接 not_recommended
      if (noRecommendScore >= 5) {
        buckets.not_recommended.push(s);
        continue;
      }

      // ★ 真实 trial 成功时：trial 信号优先，但 boundary/highValue 仍可上浮
      if (trial?.succeeded && trialModeByCat) {
        const cat = s.category ?? "未分类";
        const trialMode = trialModeByCat.get(cat) ?? "human_required";

        // boundary / highValue 优先级高于 trial 普通分桶，确保用于规则沉淀的样本不被淹没
        if (boundaryScore >= 4) {
          buckets.boundary_cases.push(s);
          continue;
        }
        if (highValueScore >= 4) {
          buckets.high_value_human_labeling.push(s);
          continue;
        }
        // 历史质检明确判错的样本：争议性 → boundary，其余 → 兜底
        if (isMisLabel) {
          if (isBoundaryError || s.difficultyHint === "hard") buckets.boundary_cases.push(s);
          else buckets.human_fallback.push(s);
          continue;
        }
        if (trialMode === "machine_auto") {
          buckets.machine_auto.push(s);
        } else if (trialMode === "ai_prelabel") {
          buckets.ai_prelabel_human_confirm.push(s);
        } else {
          buckets.human_fallback.push(s);
        }
        continue;
      }

      // 非 trial 路径：boundary / highValue 同样优先于机审 confidence 分桶
      if (boundaryScore >= 4) {
        buckets.boundary_cases.push(s);
        continue;
      }
      if (highValueScore >= 4) {
        buckets.high_value_human_labeling.push(s);
        continue;
      }

      // 历史质检明确判定为错且未修复
      if (isMisLabel) {
        if (isBoundaryError || s.difficultyHint === "hard") buckets.boundary_cases.push(s);
        else buckets.human_fallback.push(s);
        continue;
      }

      // 按 machineCapableScore 分到机审三桶
      if (machineCapableScore >= 5) {
        buckets.machine_auto.push(s);
        continue;
      }
      if (machineCapableScore >= 3) {
        buckets.ai_prelabel_human_confirm.push(s);
        continue;
      }
      if (conf >= 0 && conf < MID_CONF) {
        buckets.human_fallback.push(s);
        continue;
      }
      // 难例（非 boundary 强信号）→ boundary 兜底
      if (s.difficultyHint === "hard") {
        buckets.boundary_cases.push(s);
        continue;
      }
      // 默认进高价值人工（无机审信息且 highValueScore < 4）
      buckets.high_value_human_labeling.push(s);
    }

    const total = samples.length;
    const segments = {
      high_value_human_labeling: toSeg(buckets.high_value_human_labeling, total, [
        "无机审结果或机审为空",
        "中等难度且尚未沉淀"
      ], "高价值人工标注样本：进入训练集 / 评测集 / 规则 Case 库"),
      boundary_cases: toSeg(buckets.boundary_cases, total, [
        "历史标记为边界争议",
        "难度提示 hard"
      ], "边界 Case：用于规则沉淀与外包培训，必须人工双标"),
      machine_auto: toSeg(buckets.machine_auto, total, [
        `机审置信度 ≥ ${HIGH_CONF}`,
        "历史人工 / 机审一致"
      ], "机审高置信 + 历史一致，可机审免审"),
      ai_prelabel_human_confirm: toSeg(buckets.ai_prelabel_human_confirm, total, [
        `机审置信度 ${MID_CONF}~${HIGH_CONF}`
      ], "AI 预标 + 人工确认，节约人工耗时"),
      human_fallback: toSeg(buckets.human_fallback, total, [
        `机审置信度 < ${MID_CONF}`,
        "历史质检判定为错"
      ], "机审低置信 / 高错样本：必须人工兜底"),
      not_recommended: toSeg(buckets.not_recommended, total, [
        "字段缺失严重",
        "样本签名重复"
      ], "字段缺失或重复样本：不建议继续投入人工")
    };

    const issues: string[] = [];
    if (dupCount.v > 0) issues.push(`检测到 ${dupCount.v} 条重复样本，建议去重`);
    if (incompleteCount.v > 0)
      issues.push(`检测到 ${incompleteCount.v} 条字段缺失样本，影响标注稳定性`);
    if (samples.length < 30)
      issues.push("样本量过小，建议先补齐再做规模生产");

    const recommended =
      `优先纳入：高价值样本 (${segments.high_value_human_labeling.count})、` +
      `边界样本 (${segments.boundary_cases.count})、` +
      `人工兜底 (${segments.human_fallback.count})；` +
      `合计 ${
        segments.high_value_human_labeling.count +
        segments.boundary_cases.count +
        segments.human_fallback.count
      } 条`;

    // 疑难/边界样本排序：合并 boundary + human_fallback + high_value 中的难例
    const ranking = buildBoundaryRanking(samples, macMap, histMap, qaMap);

    const payload = {
      sample_count: total,
      sample_distribution: {
        category_distribution: categoryDist,
        label_distribution: labelDist,
        risk_type_distribution: riskDist,
        difficulty_distribution: difficultyDist
      },
      sample_quality_issues: issues,
      sample_value_segments: segments,
      boundary_case_ranking: ranking,
      recommended_labeling_scope: recommended,
      summary: summarizeSegments(segments, total)
    };

    const userPrompt =
      `[[SKILL:${SKILL_NAME}]]\n` +
      `已对 ${total} 条样本完成分层。请基于以下数据细化每段的「reason / criteria」并给出重点标注范围。\n` +
      `[[PAYLOAD]]${JSON.stringify(payload)}[[/PAYLOAD]]`;

    let output: SampleSegmentationOutput;
    try {
      output = await ctx.llm.generateJSON<SampleSegmentationOutput>({
        systemPrompt:
          "你是「样本池画像与价值分层」Skill。已经收到分段后的统计数据，你要做的是把统计结果包成 JSON 输出。",
        userPrompt,
        schemaHint: this.outputSchema
      });
    } catch (e: any) {
      output = payload as SampleSegmentationOutput;
      run.warnings?.push("LLM 调用失败，使用确定性结果回落：" + (e?.message ?? ""));
    }

    // 即使 LLM 改写过，也要把 sample_ids 等关键字段以确定性结果为准
    output = mergeDeterministic(output, payload);

    const findings: string[] = [
      `机审免审 ${segments.machine_auto.count} (${pct(segments.machine_auto.ratio)})`,
      `AI 预标 ${segments.ai_prelabel_human_confirm.count} (${pct(segments.ai_prelabel_human_confirm.ratio)})`,
      `人工重点 ${segments.high_value_human_labeling.count + segments.boundary_cases.count + segments.human_fallback.count}`,
      `不建议投入 ${segments.not_recommended.count}`
    ];

    return {
      run: finishRun(run, {
        status: issues.length > 0 ? "warning" : "completed",
        summary: output.summary,
        keyFindings: findings,
        warnings: issues,
        output
      }),
      output
    };
  }
};

function buildTrialModeMap(
  trial: MachineAuditTrialOutput | undefined
): Map<string, CategoryTrialResult["mode"]> | undefined {
  if (!trial?.succeeded || !trial.per_category?.length) return undefined;
  const m = new Map<string, CategoryTrialResult["mode"]>();
  for (const c of trial.per_category) m.set(c.category, c.mode);
  return m;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function byId<T extends { sampleId: string }>(arr?: T[]): Map<string, T> {
  const m = new Map<string, T>();
  if (!arr) return m;
  for (const it of arr) m.set(it.sampleId, it);
  return m;
}

function isFieldsIncomplete(s: SampleRecord): boolean {
  const raw = s.raw ?? {};
  const values = Object.values(raw);
  if (values.length === 0) return true;
  const empties = values.filter(
    (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")
  ).length;
  return empties / values.length >= 0.5;
}

function simpleSig(s: SampleRecord): string {
  const raw = s.raw ?? {};
  const text = Object.entries(raw)
    .filter(([_, v]) => typeof v === "string" || typeof v === "number")
    .map(([k, v]) => `${k}:${String(v).slice(0, 40)}`)
    .sort()
    .join("|");
  return text;
}

function toSeg(
  arr: SampleRecord[],
  total: number,
  criteria: string[],
  reason: string
): SampleSegmentJSON {
  return {
    count: arr.length,
    ratio: total === 0 ? 0 : Number((arr.length / total).toFixed(4)),
    criteria,
    reason,
    sample_ids: arr.slice(0, 50).map((s) => s.id)
  };
}

function emptySeg(): SampleSegmentJSON {
  return { count: 0, ratio: 0, criteria: [], reason: "", sample_ids: [] };
}

function summarizeSegments(
  segs: SampleSegmentationOutput["sample_value_segments"],
  total: number
): string {
  return (
    `共 ${total} 条样本，` +
    `机审免审 ${pct(segs.machine_auto.ratio)}，` +
    `AI 预标 ${pct(segs.ai_prelabel_human_confirm.ratio)}，` +
    `人工兜底 ${pct(segs.human_fallback.ratio)}，` +
    `边界 Case ${pct(segs.boundary_cases.ratio)}，` +
    `高价值人工 ${pct(segs.high_value_human_labeling.ratio)}，` +
    `不建议投入 ${pct(segs.not_recommended.ratio)}`
  );
}

function pct(r: number): string {
  return (r * 100).toFixed(1) + "%";
}

function mergeDeterministic(
  fromLLM: SampleSegmentationOutput,
  truth: SampleSegmentationOutput
): SampleSegmentationOutput {
  const merged: SampleSegmentationOutput = {
    ...truth,
    sample_quality_issues: fromLLM.sample_quality_issues?.length
      ? fromLLM.sample_quality_issues
      : truth.sample_quality_issues,
    recommended_labeling_scope:
      fromLLM.recommended_labeling_scope || truth.recommended_labeling_scope,
    summary: fromLLM.summary || truth.summary,
    // 永远以 TS 算的为准
    boundary_case_ranking: truth.boundary_case_ranking ?? []
  };
  // 把 LLM 写的 reason / criteria 混入，但保留 count / ratio / sample_ids
  for (const k of Object.keys(truth.sample_value_segments) as Array<
    keyof typeof truth.sample_value_segments
  >) {
    const fromSeg = fromLLM.sample_value_segments?.[k];
    const trueSeg = truth.sample_value_segments[k];
    merged.sample_value_segments[k] = {
      count: trueSeg.count,
      ratio: trueSeg.ratio,
      sample_ids: trueSeg.sample_ids,
      criteria: fromSeg?.criteria?.length ? fromSeg.criteria : trueSeg.criteria,
      reason: fromSeg?.reason || trueSeg.reason
    };
  }
  return merged;
}

// ============================================================================
// 疑难/边界样本评分排序
// ============================================================================

function buildBoundaryRanking(
  samples: SampleRecord[],
  macMap: Map<string, MachineAuditRecord>,
  histMap: Map<string, HistoricalLabelRecord>,
  qaMap: Map<string, QualityResultRecord>
): BoundaryCaseItem[] {
  const items: BoundaryCaseItem[] = [];

  for (const s of samples) {
    let score = 0;
    const reasons: string[] = [];

    const m = macMap.get(s.id);
    const q = qaMap.get(s.id);
    const h = histMap.get(s.id);

    // 机审低置信
    if (m?.confidence !== undefined && m.confidence < 0.7) {
      score += (0.7 - m.confidence) * 10; // 最大 7
      reasons.push(`机审置信度 ${m.confidence.toFixed(2)}`);
    }
    if (m?.historicalAgreement === false) {
      score += 3;
      reasons.push("机审与历史人工不一致");
    }
    // 历史标错
    if (q?.isCorrect === false) {
      score += 4;
      reasons.push(
        `质检判定为错${q.errorType ? `（${q.errorType}）` : ""}`
      );
    }
    if (q?.errorType && /(边界|歧义|争议|主观)/.test(q.errorType)) {
      score += 3;
      reasons.push(`错误类型属于争议性：${q.errorType}`);
    }
    // 难度提示
    if (s.difficultyHint === "hard") {
      score += 4;
      reasons.push("难度提示：hard");
    } else if (s.difficultyHint === "medium") {
      score += 1;
    }
    // 二复审历史 → 隐含边界
    if (h?.taskRound === "second_label" || h?.taskRound === "final_review") {
      score += 1;
      reasons.push(h.taskRound === "final_review" ? "进入终审" : "曾被二复审");
    }

    if (score > 0) {
      items.push({
        sampleId: s.id,
        category: s.category,
        label: s.label,
        score: Number(score.toFixed(2)),
        reasons
      });
    }
  }

  items.sort((a, b) => b.score - a.score);
  return items.slice(0, 30);
}
