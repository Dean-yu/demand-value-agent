"use client";

import type {
  BoundaryCaseItem,
  FieldFlow,
  FieldLevelAnalysisOutput,
  FinalTaskValueAssessment,
  HumanWorkVerdict,
  JudgeField
} from "@/lib/agent/types";
import clsx from "clsx";
import ScoreGauge from "./ScoreGauge";
import ScoreBars from "./ScoreBars";
import SampleSegmentBars from "./SampleSegmentBars";
import HumanEffortChart from "./HumanEffortChart";

interface Props {
  assessment?: FinalTaskValueAssessment;
}

export default function DecisionPanel({ assessment }: Props) {
  if (!assessment) {
    return (
      <div className="text-sm text-ink-500 leading-relaxed">
        运行 Agent 后会在这里展示：
        <ul className="list-disc list-inside mt-2 space-y-0.5 text-[13px]">
          <li>
            <span className="font-medium text-ink-700">是否需要人工 / 做什么 / 做多少</span>
            （题目级 AI vs 人工拆分 + 疑难样本）
          </li>
          <li>0–100 综合价值评分（7 维度雷达分布）</li>
          <li>最终决策（机审优先 / 试点 / 改造 / 人工主判 / 谨慎 / 不建议）</li>
          <li>样本六分层占比、人工减量空间、机审承接比例</li>
          <li>关键原因 / 风险与缺口 / 下一步行动</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ★ 头牌：是否需要人工 / 做什么 / 做多少 */}
      <HumanWorkVerdictCard verdict={assessment.humanWork} />

      {/* 决策 + 总分 */}
      <div className="rounded-xl bg-gradient-to-br from-brand-50 to-accent-500/5 border border-brand-200 p-4">
        <div className="text-[11px] text-brand-700 font-medium uppercase tracking-wide">
          Final Decision
        </div>
        <div className="text-2xl font-bold gradient-text mt-1">{assessment.finalDecision}</div>
        <div className="mt-3 flex items-center gap-3">
          <ScoreGauge score={assessment.valueScore.totalScore} />
          <div className="flex-1">
            <div className="text-[11px] text-ink-500">综合价值评分</div>
            <div className="text-3xl font-bold text-ink-900">
              {assessment.valueScore.totalScore}
              <span className="text-sm text-ink-500 ml-1">/ 100</span>
            </div>
          </div>
        </div>
      </div>

      <Section title="题目级 AI vs 人工拆分">
        <FieldAnalysisTable analysis={assessment.fieldAnalysis} />
      </Section>

      <Section title="Top 疑难 / 边界样本（建议优先安排人工）">
        <BoundaryCasesList items={assessment.boundaryCaseRanking} />
      </Section>

      <Section title="评分维度">
        <ScoreBars dimensions={assessment.valueScore.dimensions} />
      </Section>

      <Section title="样本六分层">
        <SampleSegmentBars sampleStrategy={assessment.sampleStrategy} />
      </Section>

      <Section title="人工投入对比">
        <HumanEffortChart effort={assessment.humanEffortEstimate} />
      </Section>

      <Section title="数据产出目标">
        <ListBlock items={assessment.dataOutputGoals} empty="未识别到明确的数据产出目标" />
      </Section>

      <Section title="关键原因">
        <ListBlock items={assessment.keyReasons} empty="无" />
      </Section>

      <Section title="风险与缺口">
        <ListBlock items={assessment.risksAndGaps} empty="未发现重要风险" tone="warn" />
      </Section>

      <Section title="下一步行动">
        <ListBlock items={assessment.nextStepPlan} empty="无" tone="info" />
      </Section>

      <Section title="机审能力概览">
        <MachineSummary m={assessment.machineAuditAssessment} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-ink-700 mb-2">{title}</div>
      {children}
    </div>
  );
}

// =============================================================================
// HumanWorkVerdictCard：是否需要人工 / 做什么 / 做多少
// =============================================================================
function HumanWorkVerdictCard({ verdict }: { verdict: HumanWorkVerdict | undefined }) {
  if (!verdict) {
    return (
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-[12px] text-ink-500">
        暂无人工必要性结论
      </div>
    );
  }
  const levelStyle: Record<HumanWorkVerdict["level"], string> = {
    核心人工: "bg-rose-50 text-rose-700 border-rose-200",
    兜底人工: "bg-amber-50 text-amber-800 border-amber-200",
    轻量校对: "bg-sky-50 text-sky-700 border-sky-200",
    几乎不需要: "bg-emerald-50 text-emerald-700 border-emerald-200"
  };
  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-white to-brand-50/40 p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-brand-700 font-semibold uppercase tracking-wide">
          是否需要人工 / 做什么 / 做多少
        </span>
        <span
          className={clsx(
            "text-[11px] px-2 py-0.5 rounded-full border font-medium",
            levelStyle[verdict.level]
          )}
        >
          {verdict.level}
        </span>
      </div>
      <div className="mt-2 text-[15px] font-bold text-ink-900 leading-snug">
        {verdict.headline}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat
          label="人工标注规模"
          value={`${verdict.estimatedHumanSampleCount}`}
          unit="条样本"
          tone="warn"
        />
        <Stat
          label="预计人工投入"
          value={`${verdict.estimatedPersonDays}`}
          unit="人天"
          tone="warn"
        />
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <BulletBlock
          title="人工要做的事"
          tone="human"
          items={verdict.whatHumanDoes}
          empty="—"
        />
        <BulletBlock
          title="AI / 机审承担的事"
          tone="ai"
          items={verdict.whatAIDoes}
          empty="—"
        />
      </div>
      {verdict.priorityFocus.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-ink-600 mb-1">优先关注</div>
          <ul className="space-y-1">
            {verdict.priorityFocus.map((p, i) => (
              <li
                key={i}
                className="text-[12px] text-ink-800 bg-white border border-ink-200 rounded-md px-2.5 py-1.5"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      {verdict.rationale && (
        <div className="mt-3 text-[11.5px] text-ink-500 leading-relaxed">
          <span className="font-medium text-ink-600">综合判断：</span>
          {verdict.rationale}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone
}: {
  label: string;
  value: string;
  unit: string;
  tone: "warn" | "info";
}) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 border-amber-200"
      : "bg-brand-50 border-brand-200";
  return (
    <div className={clsx("rounded-md border px-3 py-2", cls)}>
      <div className="text-[10.5px] text-ink-500">{label}</div>
      <div className="text-lg font-bold text-ink-900">
        {value}
        <span className="text-[11px] text-ink-500 ml-1 font-medium">{unit}</span>
      </div>
    </div>
  );
}

function BulletBlock({
  title,
  items,
  tone,
  empty
}: {
  title: string;
  items: string[];
  tone: "human" | "ai";
  empty: string;
}) {
  const cls =
    tone === "human"
      ? "border-rose-200 bg-rose-50/50"
      : "border-brand-200 bg-brand-50/50";
  const dotCls = tone === "human" ? "bg-rose-400" : "bg-brand-500";
  return (
    <div className={clsx("rounded-lg border p-2.5", cls)}>
      <div className="text-[11px] font-semibold text-ink-700 mb-1.5">{title}</div>
      {items.length === 0 ? (
        <div className="text-[12px] text-ink-400">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 6).map((it, i) => (
            <li key={i} className="text-[12px] text-ink-800 leading-relaxed flex gap-1.5">
              <span className={clsx("inline-block w-1 h-1 rounded-full mt-1.5 shrink-0", dotCls)} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// FieldAnalysisTable：字段级 AI vs 人工拆分
// =============================================================================
function FieldAnalysisTable({
  analysis
}: {
  analysis: FieldLevelAnalysisOutput | undefined;
}) {
  if (!analysis || analysis.fields.length === 0) {
    return (
      <div className="text-[12px] text-ink-400 border border-ink-200 rounded-md px-3 py-3 bg-ink-50">
        未识别到可分析题目，建议补充规则文档或历史标签空间
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-brand-200 bg-brand-50/60 p-2">
          <div className="text-[10.5px] text-ink-500">AI 主导题目</div>
          <div className="text-base font-bold text-brand-700">
            {analysis.ai_dominant_count}
            <span className="text-[11px] text-ink-500 ml-1 font-medium">个</span>
          </div>
        </div>
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-2">
          <div className="text-[10.5px] text-ink-500">必须人工题目</div>
          <div className="text-base font-bold text-rose-700">
            {analysis.human_required_count}
            <span className="text-[11px] text-ink-500 ml-1 font-medium">个</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-ink-50">
            <tr className="text-left text-[11px] text-ink-500">
              <th className="px-2 py-1.5 font-medium">题目</th>
              <th className="px-2 py-1.5 font-medium">难度</th>
              <th className="px-2 py-1.5 font-medium">AI 能力</th>
              <th className="px-2 py-1.5 font-medium">承接方</th>
              <th className="px-2 py-1.5 font-medium text-right">人工占比</th>
            </tr>
          </thead>
          <tbody>
            {analysis.fields.map((f) => (
              <FieldRow key={f.name} field={f} />
            ))}
          </tbody>
        </table>
      </div>
      {analysis.summary && (
        <div className="text-[11.5px] text-ink-500 leading-relaxed">{analysis.summary}</div>
      )}
    </div>
  );
}

function FieldRow({ field }: { field: JudgeField }) {
  return (
    <tr className="border-t border-ink-100 align-top">
      <td className="px-2 py-1.5 font-medium text-ink-900 whitespace-nowrap">
        {field.name}
        {field.isCoreField && <span className="text-amber-500 ml-1">★</span>}
      </td>
      <td className="px-2 py-1.5">
        <DifficultyBadge value={field.difficulty} />
      </td>
      <td className="px-2 py-1.5">
        <AICapabilityBadge value={field.aiCapability} />
      </td>
      <td className="px-2 py-1.5">
        <FlowBadge flow={field.suggestedFlow} />
        <div className="text-[10.5px] text-ink-500 mt-0.5 leading-snug max-w-[260px]">
          {field.reason}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-ink-800 font-medium tabular-nums">
        {Math.round(field.estimatedHumanRatio * 100)}%
      </td>
    </tr>
  );
}

function DifficultyBadge({ value }: { value: JudgeField["difficulty"] }) {
  const map: Record<JudgeField["difficulty"], string> = {
    高: "bg-rose-50 text-rose-700 border-rose-200",
    中: "bg-amber-50 text-amber-700 border-amber-200",
    低: "bg-emerald-50 text-emerald-700 border-emerald-200"
  };
  return (
    <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border", map[value])}>
      {value}
    </span>
  );
}

function AICapabilityBadge({ value }: { value: JudgeField["aiCapability"] }) {
  const map: Record<JudgeField["aiCapability"], string> = {
    强: "bg-emerald-50 text-emerald-700 border-emerald-200",
    中: "bg-sky-50 text-sky-700 border-sky-200",
    弱: "bg-amber-50 text-amber-700 border-amber-200",
    暂无: "bg-ink-100 text-ink-600 border-ink-200"
  };
  return (
    <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border", map[value])}>
      {value}
    </span>
  );
}

function FlowBadge({ flow }: { flow: FieldFlow }) {
  const map: Record<FieldFlow, { text: string; cls: string }> = {
    machine_auto: { text: "机审直接判", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ai_prefill: { text: "AI 预填", cls: "bg-brand-50 text-brand-700 border-brand-200" },
    ai_assist: { text: "AI 辅助 / 人工核对", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    human_only: { text: "必须人工", cls: "bg-rose-50 text-rose-700 border-rose-200" }
  };
  const v = map[flow];
  return (
    <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border font-medium", v.cls)}>
      {v.text}
    </span>
  );
}

// =============================================================================
// BoundaryCasesList：Top 疑难样本
// =============================================================================
function BoundaryCasesList({ items }: { items: BoundaryCaseItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-[12px] text-ink-400 border border-ink-200 rounded-md px-3 py-3 bg-ink-50">
        暂未识别到疑难 / 边界样本（可能样本量不足或缺少机审 / 历史数据）
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.slice(0, 10).map((it, i) => (
        <div
          key={it.sampleId}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink-400 w-5 text-right tabular-nums">{i + 1}.</span>
            <span className="text-[12px] font-mono font-semibold text-ink-900 truncate">
              {it.sampleId}
            </span>
            {it.category && (
              <span className="text-[10px] text-ink-500 bg-ink-50 border border-ink-200 px-1 rounded">
                {it.category}
              </span>
            )}
            {it.label && (
              <span className="text-[10px] text-brand-700 bg-brand-50 border border-brand-200 px-1 rounded">
                {it.label}
              </span>
            )}
            <span className="ml-auto text-[11px] font-bold text-rose-600 tabular-nums">
              {it.score.toFixed(1)}
            </span>
          </div>
          {it.reasons.length > 0 && (
            <div className="text-[11px] text-ink-500 mt-0.5 pl-7 leading-relaxed">
              {it.reasons.join("；")}
            </div>
          )}
        </div>
      ))}
      {items.length > 10 && (
        <div className="text-[11px] text-ink-400 text-center mt-1">
          仅显示 Top 10，共 {items.length} 条候选疑难样本
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 通用 ListBlock / MachineSummary
// =============================================================================
function ListBlock({
  items,
  empty,
  tone = "default"
}: {
  items: string[];
  empty: string;
  tone?: "default" | "warn" | "info";
}) {
  if (!items || items.length === 0) {
    return <div className="text-[12px] text-ink-400">{empty}</div>;
  }
  const toneCls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "info"
        ? "border-brand-200 bg-brand-50 text-brand-900"
        : "border-ink-200 bg-white text-ink-800";
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li
          key={i}
          className={`text-[12.5px] leading-relaxed border ${toneCls} rounded-md px-2.5 py-1.5`}
        >
          {it}
        </li>
      ))}
    </ul>
  );
}

function MachineSummary({ m }: { m: FinalTaskValueAssessment["machineAuditAssessment"] }) {
  const items: { label: string; value: string }[] = [
    { label: "整体覆盖率", value: pct(m.machineCoverageRatio) },
    { label: "高置信免审", value: pct(m.highConfidenceAutoRatio) },
    { label: "可作预标候选", value: pct(m.prelabelCandidateRatio) },
    { label: "需人工兜底", value: pct(m.humanFallbackRatio) }
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-md bg-white border border-ink-200 px-2 py-1.5 flex justify-between items-center"
          >
            <span className="text-[11px] text-ink-500">{it.label}</span>
            <span className="text-[13px] font-semibold text-ink-900">{it.value}</span>
          </div>
        ))}
      </div>
      {m.strengthLabels.length > 0 && (
        <div className="text-[12px]">
          <span className="text-ink-500">强项：</span>
          <span className="text-emerald-700">{m.strengthLabels.join("、")}</span>
        </div>
      )}
      {m.weaknessLabels.length > 0 && (
        <div className="text-[12px]">
          <span className="text-ink-500">弱项：</span>
          <span className="text-red-700">{m.weaknessLabels.join("、")}</span>
        </div>
      )}
      {m.judgement && <div className="text-[12px] text-ink-700 leading-relaxed">{m.judgement}</div>}
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round((n ?? 0) * 100)}%`;
}
