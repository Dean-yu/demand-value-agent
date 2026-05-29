"use client";

import { useState } from "react";
import clsx from "clsx";
import type {
  BoundaryCaseItem,
  CategoryTrialResult,
  CoreVerdict,
  FieldFlow,
  FieldLevelAnalysisOutput,
  FinalTaskValueAssessment,
  HumanWorkVerdict,
  JudgeField,
  MachineAuditTrialOutput
} from "@/lib/agent/types";
import ScoreGauge from "@/components/decision/ScoreGauge";
import SampleSegmentBars from "@/components/decision/SampleSegmentBars";
import HumanEffortChart from "@/components/decision/HumanEffortChart";
import Markdown from "@/components/Markdown";

interface Props {
  assessment?: FinalTaskValueAssessment;
  running: boolean;
}

type TabId = "verdict" | "fields" | "samples" | "score" | "report";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "verdict", label: "结论", icon: "📋" },
  { id: "fields", label: "题目拆分", icon: "🤖" },
  { id: "samples", label: "样本与产能", icon: "🔍" },
  { id: "score", label: "评分", icon: "📊" },
  { id: "report", label: "报告", icon: "📄" }
];

export default function ResultPanel({ assessment, running }: Props) {
  const [tab, setTab] = useState<TabId>("verdict");

  if (!assessment) {
    return <EmptyState running={running} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-1 pb-2 border-b border-ink-200/70 overflow-x-auto">
        {TABS.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </TabButton>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto pt-3 pr-1 -mr-1">
        {tab === "verdict" && <VerdictTab a={assessment} />}
        {tab === "fields" && <FieldsTab analysis={assessment.fieldAnalysis} />}
        {tab === "samples" && <SamplesTab a={assessment} />}
        {tab === "score" && <ScoreTab a={assessment} />}
        {tab === "report" && (
          <ReportInner
            executive={assessment.executiveSummaryMarkdown}
            detailed={assessment.detailedReportMarkdown}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 空态
// =============================================================================
function EmptyState({ running }: { running: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-10">
      <div className="relative w-20 h-20 mb-4">
        <div
          className={clsx(
            "absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 opacity-20",
            running && "animate-pulse"
          )}
        />
        <div className="absolute inset-2 rounded-xl bg-white border border-brand-200 grid place-items-center text-2xl">
          {running ? "⏳" : "🧭"}
        </div>
      </div>
      <div className="text-sm font-semibold text-ink-900">
        {running ? "Agent 正在评估中…" : "等待开始评估"}
      </div>
      <div className="text-[12px] text-ink-500 mt-1 leading-relaxed max-w-xs">
        {running
          ? "请稍候，左侧 Skill 节点会实时显示进度。"
          : "在左侧填写任务信息或点击「🧪 一键试用 Mock 示例」，再点开始评估。"}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-1.5 text-left max-w-xs w-full">
        <FeatureChip icon="📋" text="是否需要人工 / 做什么 / 做多少" />
        <FeatureChip icon="🤖" text="题目级 AI vs 人工拆分" />
        <FeatureChip icon="🔍" text="Top 疑难样本 + 六分层" />
        <FeatureChip icon="📊" text="0–100 分综合价值评分" />
        <FeatureChip icon="📄" text="老板版 + 详细评估报告" />
      </div>
    </div>
  );
}

function FeatureChip({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-ink-200 text-[12px] text-ink-700">
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

// =============================================================================
// Tab 1：结论（核心三问 + 人工必要性 + 评分）
// =============================================================================
function VerdictTab({ a }: { a: FinalTaskValueAssessment }) {
  return (
    <div className="space-y-4">
      <CoreVerdictCard verdict={a.coreVerdict} decision={a.finalDecision} score={a.valueScore.totalScore} />
      <HumanWorkVerdictCard verdict={a.humanWork} />
      <MachineAuditTrialCard trial={a.machineAuditTrial} />
      {a.dataOutputGoals.length > 0 && (
        <Section title="数据产出目标">
          <ChipRow items={a.dataOutputGoals} />
        </Section>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section title="关键原因">
          <CompactList items={a.keyReasons} empty="无" tone="default" />
        </Section>
        <Section title="下一步行动">
          <CompactList items={a.nextStepPlan} empty="无" tone="info" />
        </Section>
      </div>
      <Section title="风险与缺口">
        <CompactList items={a.risksAndGaps} empty="未发现重要风险" tone="warn" />
      </Section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 机审 Trial 实测卡（Q2 的真实证据）
// -----------------------------------------------------------------------------
function MachineAuditTrialCard({ trial }: { trial: MachineAuditTrialOutput | undefined }) {
  const [open, setOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  if (!trial) {
    return null;
  }
  // 头部 tone：跑通=brand，未跑=ink
  const isSuccess = trial.attempted && trial.succeeded;
  const isFailed = trial.attempted && !trial.succeeded;
  const headerTone = isSuccess
    ? "border-brand-200 bg-gradient-to-br from-brand-50/70 to-white"
    : isFailed
      ? "border-amber-200 bg-amber-50/40"
      : "border-ink-200 bg-ink-50/40";
  const accuracyTone =
    trial.overall_accuracy >= 0.9
      ? "text-emerald-700"
      : trial.overall_accuracy >= 0.7
        ? "text-brand-700"
        : "text-rose-700";
  return (
    <div className={clsx("rounded-xl border p-3", headerTone)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-base">🧪</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] text-brand-700 font-semibold uppercase tracking-wide">
            机审 Trial 实测(Q2 的真实证据)
          </div>
          <div className="text-[13.5px] font-bold text-ink-900 leading-snug">
            {isSuccess ? (
              <>
                真实跑了一次通用机审,准确率{" "}
                <span className={clsx("text-[16px]", accuracyTone)}>
                  {Math.round(trial.overall_accuracy * 100)}%
                </span>{" "}
                @ {trial.trial_sample_count} 条 · 推荐{trial.recommended_mode}
              </>
            ) : isFailed ? (
              <>已尝试但未跑通真实 trial(Q2/Q3 回落到启发式)</>
            ) : (
              <>未做真实 trial(mock 模式 / 无 gold label / 已关闭)</>
            )}
          </div>
        </div>
        <span className="text-[11px] text-ink-400 shrink-0">{open ? "收起 ▴" : "展开 ▾"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {isFailed && trial.failure_reason && (
            <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              失败原因:{trial.failure_reason}
            </div>
          )}
          {isSuccess && (
            <>
              {trial.label_space.length > 0 && (
                <div className="text-[11px] text-ink-600 leading-relaxed">
                  <span className="font-semibold text-ink-700">候选标签:</span>{" "}
                  {trial.label_space.slice(0, 16).join("、")}
                  {trial.label_space.length > 16 && (
                    <span className="text-ink-400">…共 {trial.label_space.length} 个</span>
                  )}
                </div>
              )}
              {trial.per_category.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
                  <table className="w-full text-[12px]">
                    <thead className="bg-ink-50/80 text-[10.5px] text-ink-500">
                      <tr className="text-left">
                        <th className="px-2 py-1.5 font-medium">类目</th>
                        <th className="px-2 py-1.5 font-medium text-right">样本</th>
                        <th className="px-2 py-1.5 font-medium text-right">准确率</th>
                        <th className="px-2 py-1.5 font-medium">推荐承接</th>
                        <th className="px-2 py-1.5 font-medium">依据</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trial.per_category.map((c) => (
                        <TrialRow key={c.category} row={c} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-[11px] text-ink-500 leading-relaxed bg-ink-50/60 border border-ink-200 rounded-md px-2.5 py-1.5">
                {trial.summary}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowPrompt((v) => !v)}
                  className="text-[11px] text-brand-700 hover:underline"
                >
                  {showPrompt ? "隐藏 Trial Prompt" : "查看 Trial Prompt（system + user 模板）"}
                </button>
                {showPrompt && (
                  <pre className="mt-1.5 text-[11px] bg-ink-900 text-ink-100 rounded-md px-2.5 py-2 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
                    {`[SYSTEM]\n${trial.trial_system_prompt}\n\n[USER TEMPLATE]\n${trial.trial_user_template}`}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrialRow({ row }: { row: CategoryTrialResult }) {
  const acc = row.accuracy;
  const accCls =
    acc >= 0.9
      ? "text-emerald-700 font-bold"
      : acc >= 0.7
        ? "text-brand-700 font-bold"
        : "text-rose-700 font-bold";
  const modeMap: Record<CategoryTrialResult["mode"], { label: string; cls: string }> = {
    machine_auto: { label: "机审直接", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ai_prelabel: { label: "AI 预标 + 人工", cls: "bg-brand-50 text-brand-700 border-brand-200" },
    human_required: { label: "必须人工", cls: "bg-rose-50 text-rose-700 border-rose-200" }
  };
  const mode = modeMap[row.mode];
  return (
    <tr className="border-t border-ink-100 align-top">
      <td className="px-2 py-1.5 text-ink-900 font-medium whitespace-nowrap">{row.category}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-ink-700">{row.sampleCount}</td>
      <td className={clsx("px-2 py-1.5 text-right tabular-nums", accCls)}>
        {Math.round(acc * 100)}%
      </td>
      <td className="px-2 py-1.5">
        <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border", mode.cls)}>
          {mode.label}
        </span>
      </td>
      <td className="px-2 py-1.5 text-[11px] text-ink-500 leading-snug">{row.reason}</td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// 核心三问大卡（首屏最重要的视觉锚点）
// -----------------------------------------------------------------------------
function CoreVerdictCard({
  verdict,
  decision,
  score
}: {
  verdict: CoreVerdict | undefined;
  decision: string;
  score: number;
}) {
  if (!verdict) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-4 text-[12px] text-ink-500">
        暂无核心三问结论
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-accent-500/5 p-3.5 shadow-panel">
      {/* 头：决策 + 分数 */}
      <div className="flex items-center gap-2.5">
        <ScoreGauge score={score} />
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] text-brand-700 font-semibold uppercase tracking-wide">
            Final Decision
          </div>
          <div className="text-[18px] font-bold gradient-text leading-tight">{decision}</div>
          <div className="text-[10.5px] text-ink-500 mt-0.5">
            综合价值评分 <span className="font-bold text-ink-900 text-[12px]">{score}</span>
            <span className="text-ink-400"> / 100</span>
          </div>
        </div>
      </div>

      {/* 三问主体 */}
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <VerdictQuadrant
          tag="Q1"
          title="需不需要标"
          verdictText={verdict.worthLabeling.verdict}
          headline={verdict.worthLabeling.headline}
          reasons={verdict.worthLabeling.reasons}
          tone={worthTone(verdict.worthLabeling.verdict)}
        />
        <VerdictQuadrant
          tag="Q2"
          title="机器标 / 人标"
          verdictText={verdict.labelingMode.mode}
          headline={verdict.labelingMode.headline}
          reasons={verdict.labelingMode.reasons}
          tone={modeTone(verdict.labelingMode.mode)}
        />
        <ScaleSplitQuadrant split={verdict.scaleSplit} />
      </div>
    </div>
  );
}

function worthTone(v: CoreVerdict["worthLabeling"]["verdict"]): "good" | "warn" | "mute" {
  return v === "值得标" ? "good" : v === "无需重标" ? "mute" : "warn";
}
function modeTone(m: CoreVerdict["labelingMode"]["mode"]): "good" | "warn" | "mute" | "info" {
  return m === "机器为主"
    ? "good"
    : m === "人机协同"
      ? "info"
      : m === "人工为主"
        ? "warn"
        : "mute";
}

function VerdictQuadrant({
  tag,
  title,
  verdictText,
  headline,
  reasons,
  tone
}: {
  tag: string;
  title: string;
  verdictText: string;
  headline: string;
  reasons: string[];
  tone: "good" | "warn" | "mute" | "info";
}) {
  const toneCls = {
    good: "border-emerald-200 bg-emerald-50/60",
    warn: "border-amber-200 bg-amber-50/60",
    mute: "border-ink-200 bg-ink-50/60",
    info: "border-brand-200 bg-brand-50/60"
  }[tone];
  const badgeCls = {
    good: "bg-emerald-500 text-white",
    warn: "bg-amber-500 text-white",
    mute: "bg-ink-400 text-white",
    info: "bg-brand-500 text-white"
  }[tone];
  return (
    <div className={clsx("rounded-xl border p-2.5 flex flex-col", toneCls)}>
      <div className="flex items-center gap-1.5">
        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-md font-bold", badgeCls)}>
          {tag}
        </span>
        <span className="text-[11.5px] font-semibold text-ink-700">{title}</span>
      </div>
      <div className="mt-1 text-[14px] font-bold text-ink-900 leading-tight">{verdictText}</div>
      <div className="text-[11.5px] text-ink-700 leading-snug mt-1">{headline}</div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="text-[10.5px] text-ink-500 leading-snug flex gap-1">
              <span className="text-ink-400 shrink-0">·</span>
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScaleSplitQuadrant({ split }: { split: CoreVerdict["scaleSplit"] }) {
  const sampleSegs = [
    { key: "machine", label: "机审", count: split.machineAutoCount, color: "bg-emerald-500" },
    { key: "ai", label: "AI 预标+人核", count: split.aiAssistCount, color: "bg-sky-500" },
    { key: "human", label: "必须人工", count: split.humanCount, color: "bg-rose-500" },
    { key: "exclude", label: "排除", count: split.excludeCount, color: "bg-ink-300" }
  ];
  const total = Math.max(1, split.totalSamples);
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-2.5 flex flex-col">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-sky-500 text-white">
          Q3
        </span>
        <span className="text-[11.5px] font-semibold text-ink-700">各占多少</span>
      </div>
      {/* 样本堆叠条 */}
      <div className="mt-2">
        <div className="text-[10.5px] text-ink-500 mb-1">
          样本拆分 · 共 <span className="text-ink-800 font-bold">{split.totalSamples}</span> 条
        </div>
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-white border border-ink-200">
          {sampleSegs.map((s) =>
            s.count > 0 ? (
              <div
                key={s.key}
                className={clsx("h-full", s.color)}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.label} ${s.count}`}
              />
            ) : null
          )}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          {sampleSegs.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-1 text-[10px] text-ink-600 leading-tight"
            >
              <span className={clsx("w-1.5 h-1.5 rounded-sm", s.color)} />
              <span>{s.label}</span>
              <span className="ml-auto font-mono text-ink-800">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
      {/* 题目拆分 */}
      {split.totalQuestions > 0 && (
        <div className="mt-2 pt-2 border-t border-ink-200/60">
          <div className="text-[10.5px] text-ink-500 mb-1">
            题目拆分 · 共 <span className="text-ink-800 font-bold">{split.totalQuestions}</span> 个
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <QStat label="机器/AI" count={split.machineQuestionCount} tone="good" />
            <QStat label="AI 辅助" count={split.aiAssistQuestionCount} tone="info" />
            <QStat label="必须人工" count={split.humanQuestionCount} tone="warn" />
          </div>
        </div>
      )}
      {/* 人天对比 */}
      <div className="mt-auto pt-2 mt-2 border-t border-ink-200/60 text-[10.5px] text-ink-600 leading-snug">
        预计 <span className="font-bold text-ink-900">{split.personDays}</span> 人天
        <span className="text-ink-400"> · 全人工基线 {split.baselinePersonDays} 人天</span>
      </div>
    </div>
  );
}

function QStat({
  label,
  count,
  tone
}: {
  label: string;
  count: number;
  tone: "good" | "warn" | "info";
}) {
  const cls = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-700",
    warn: "bg-rose-50 border-rose-200 text-rose-700",
    info: "bg-sky-50 border-sky-200 text-sky-700"
  }[tone];
  return (
    <div className={clsx("rounded-md border px-1 py-1", cls)}>
      <div className="text-[14px] font-bold leading-none">{count}</div>
      <div className="text-[9.5px] mt-0.5 text-ink-500 leading-none">{label}</div>
    </div>
  );
}

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
    <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] text-brand-700 font-semibold uppercase tracking-wide">
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
        <BulletBlock title="人工要做的事" tone="human" items={verdict.whatHumanDoes} empty="—" />
        <BulletBlock title="AI / 机审承担的事" tone="ai" items={verdict.whatAIDoes} empty="—" />
      </div>
      {verdict.priorityFocus.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-ink-600 mb-1">优先关注</div>
          <ul className="space-y-1">
            {verdict.priorityFocus.map((p, i) => (
              <li
                key={i}
                className="text-[12px] text-ink-800 bg-ink-50/60 border border-ink-200 rounded-md px-2.5 py-1.5"
              >
                {p}
              </li>
            ))}
          </ul>
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
  const cls = tone === "warn" ? "bg-amber-50 border-amber-200" : "bg-brand-50 border-brand-200";
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
    tone === "human" ? "border-rose-200 bg-rose-50/40" : "border-brand-200 bg-brand-50/40";
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
// Tab 2：题目拆分
// =============================================================================
function FieldsTab({ analysis }: { analysis: FieldLevelAnalysisOutput | undefined }) {
  if (!analysis || analysis.fields.length === 0) {
    return (
      <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12px] text-ink-500">
        未识别到可分析题目，建议补充规则文档或历史标签空间
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-200/60 bg-brand-50/40 text-[11.5px] text-brand-800 px-3 py-2 leading-relaxed">
        <span className="font-semibold">题目</span> = 本次任务需要给出判定/标注的维度（如「图文一致性判定」「标题违禁词检查」），不是送审样本的原始数据字段。
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="AI 主导题目"
          value={analysis.ai_dominant_count}
          tone="brand"
          hint="AI 可直接判定 / 高质量预填"
        />
        <StatCard
          label="必须人工题目"
          value={analysis.human_required_count}
          tone="rose"
          hint="必须人工才能可靠完成"
        />
      </div>
      <Section title="题目判定明细">
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50/80">
              <tr className="text-left text-[11px] text-ink-500">
                <th className="px-2 py-2 font-medium">题目</th>
                <th className="px-2 py-2 font-medium">难度</th>
                <th className="px-2 py-2 font-medium">AI 能力</th>
                <th className="px-2 py-2 font-medium">承接方 / 说明</th>
                <th className="px-2 py-2 font-medium text-right whitespace-nowrap">人工占比</th>
              </tr>
            </thead>
            <tbody>
              {analysis.fields.map((f) => (
                <FieldRow key={f.name} field={f} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {analysis.what_ai_does.length > 0 && (
          <Section title="AI 能做的事">
            <CompactList items={analysis.what_ai_does} empty="—" tone="info" />
          </Section>
        )}
        {analysis.what_human_does.length > 0 && (
          <Section title="人工必须做的事">
            <CompactList items={analysis.what_human_does} empty="—" tone="warn" />
          </Section>
        )}
      </div>
      {analysis.summary && (
        <div className="text-[11.5px] text-ink-500 leading-relaxed bg-ink-50/60 border border-ink-200 rounded-md px-3 py-2">
          {analysis.summary}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  hint
}: {
  label: string;
  value: number;
  tone: "brand" | "rose";
  hint?: string;
}) {
  const cls =
    tone === "brand"
      ? "border-brand-200 bg-gradient-to-br from-brand-50 to-white text-brand-700"
      : "border-rose-200 bg-gradient-to-br from-rose-50 to-white text-rose-700";
  return (
    <div className={clsx("rounded-xl border p-3", cls)}>
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="text-2xl font-bold leading-tight mt-0.5">
        {value}
        <span className="text-[11px] text-ink-500 ml-1 font-medium">个</span>
      </div>
      {hint && <div className="text-[10.5px] text-ink-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function FieldRow({ field }: { field: JudgeField }) {
  return (
    <tr className="border-t border-ink-100 align-top hover:bg-ink-50/50 transition">
      <td className="px-2 py-2 font-medium text-ink-900 whitespace-nowrap">
        {field.name}
        {field.isCoreField && <span className="text-amber-500 ml-1">★</span>}
      </td>
      <td className="px-2 py-2">
        <DifficultyBadge value={field.difficulty} />
      </td>
      <td className="px-2 py-2">
        <AICapabilityBadge value={field.aiCapability} />
      </td>
      <td className="px-2 py-2">
        <FlowBadge flow={field.suggestedFlow} />
        <div className="text-[10.5px] text-ink-500 mt-0.5 leading-snug max-w-[260px]">
          {field.reason}
        </div>
      </td>
      <td className="px-2 py-2 text-right text-ink-800 font-medium tabular-nums whitespace-nowrap">
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
    <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border", map[value])}>{value}</span>
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
    <span className={clsx("text-[10.5px] px-1.5 py-0.5 rounded border", map[value])}>{value}</span>
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
// Tab 3：样本与产能
// =============================================================================
function SamplesTab({ a }: { a: FinalTaskValueAssessment }) {
  return (
    <div className="space-y-4">
      <Section title="Top 疑难 / 边界样本（建议优先安排人工）">
        <BoundaryCasesList items={a.boundaryCaseRanking} />
      </Section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="样本六分层">
          <SampleSegmentBars sampleStrategy={a.sampleStrategy} />
        </Section>
        <Section title="人工投入对比">
          <HumanEffortChart effort={a.humanEffortEstimate} />
        </Section>
      </div>
      <Section title="机审能力概览">
        <MachineSummary m={a.machineAuditAssessment} />
      </Section>
    </div>
  );
}

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
          className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 hover:border-brand-300 transition"
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

function MachineSummary({ m }: { m: FinalTaskValueAssessment["machineAuditAssessment"] }) {
  const items: { label: string; value: string }[] = [
    { label: "整体覆盖率", value: pct(m.machineCoverageRatio) },
    { label: "高置信免审", value: pct(m.highConfidenceAutoRatio) },
    { label: "可作预标候选", value: pct(m.prelabelCandidateRatio) },
    { label: "需人工兜底", value: pct(m.humanFallbackRatio) }
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-md bg-white border border-ink-200 px-2 py-1.5"
          >
            <div className="text-[10.5px] text-ink-500">{it.label}</div>
            <div className="text-[14px] font-bold text-ink-900">{it.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
        {m.strengthLabels.length > 0 && (
          <div className="rounded-md bg-emerald-50/50 border border-emerald-200 px-2 py-1.5">
            <span className="text-emerald-700 font-medium">强项：</span>
            <span className="text-ink-700">{m.strengthLabels.join("、")}</span>
          </div>
        )}
        {m.weaknessLabels.length > 0 && (
          <div className="rounded-md bg-rose-50/50 border border-rose-200 px-2 py-1.5">
            <span className="text-rose-700 font-medium">弱项：</span>
            <span className="text-ink-700">{m.weaknessLabels.join("、")}</span>
          </div>
        )}
      </div>
      {m.judgement && (
        <div className="text-[12px] text-ink-700 leading-relaxed bg-ink-50/60 border border-ink-200 rounded-md px-2.5 py-1.5">
          {m.judgement}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab 4：评分（3 大主轴 + 子项）
// =============================================================================
function ScoreTab({ a }: { a: FinalTaskValueAssessment }) {
  const d = a.valueScore.dimensions;
  const fa = a.fieldAnalysis;
  const seg = a.sampleStrategy.segments;
  const total = a.sampleStrategy.totalCount || 1;
  const mac = a.machineAuditAssessment;

  const aiDominantQuestionRatio =
    fa.fields.length > 0 ? fa.ai_dominant_count / fa.fields.length : 0;
  const machineCarryRatio =
    (seg.machineAuto.count + seg.aiPrelabelHumanConfirm.count + seg.aiPrelabelHumanConfirm.count) /
    total;
  const humanRatio =
    (seg.highValueHumanLabeling.count +
      seg.boundaryCases.count +
      seg.humanFallback.count) /
    total;

  // 3 个主轴
  const pillars: PillarData[] = [
    {
      index: 1,
      title: "价值",
      icon: "💎",
      subtitle: "数据沉淀价值 + 业务价值",
      gradient: "from-brand-50 to-brand-100/40",
      barColor: "from-brand-500 to-brand-600",
      score: d.dataOutputValue + d.businessValue,
      max: 35,
      rows: [
        { label: "数据沉淀价值", v: d.dataOutputValue, max: 20 },
        { label: "业务价值", v: d.businessValue, max: 15 }
      ],
      evidence: [
        a.dataOutputGoals.length > 0
          ? `数据产出目标：${a.dataOutputGoals.slice(0, 3).join("、")}${a.dataOutputGoals.length > 3 ? "…" : ""}`
          : null,
        `数据资产可复用度：${a.assetReusability}`
      ].filter(Boolean) as string[]
    },
    {
      index: 2,
      title: "是否要人做",
      icon: "🤖",
      subtitle: "AI 可替代率 / 机审承接 / 人工减量",
      gradient: "from-sky-50 to-emerald-50/40",
      barColor: "from-emerald-500 to-sky-500",
      score: d.machineAuditPotential + d.humanReductionValue,
      max: 25,
      rows: [
        { label: "机审承接潜力", v: d.machineAuditPotential, max: 15 },
        { label: "人工减量价值", v: d.humanReductionValue, max: 10 }
      ],
      evidence: [
        fa.fields.length > 0
          ? `题目 AI 主导：${fa.ai_dominant_count}/${fa.fields.length}（${pct(aiDominantQuestionRatio)}）`
          : "题目级拆分尚未生成",
        `样本机审 / AI 承接：${pct(machineCarryRatio)}`,
        `机审高置信免审：${pct(mac.highConfidenceAutoRatio)}`,
        `预计人工：${a.humanEffortEstimate.optimized.personDays} 人天（vs 全人工 ${a.humanEffortEstimate.baseline.personDays} 人天）`
      ]
    },
    {
      index: 3,
      title: "历史资产 / 是否要重做",
      icon: "📚",
      subtitle: "规则可判定 / 样本可复用 / 风险可控",
      gradient: "from-amber-50 to-rose-50/40",
      barColor: "from-amber-500 to-rose-500",
      score: d.ruleJudgability + d.sampleValue + d.deliveryRiskControl,
      max: 40,
      rows: [
        { label: "规则可判定性", v: d.ruleJudgability, max: 15 },
        { label: "样本池价值", v: d.sampleValue, max: 15 },
        { label: "交付风险可控性", v: d.deliveryRiskControl, max: 10 }
      ],
      evidence: [
        `历史标注可复用度：${a.historicalReusability}`,
        `必须人工样本：${a.humanWork.estimatedHumanSampleCount} 条（${pct(humanRatio)}）`,
        a.fieldAnalysis.human_required_count > 0
          ? `必须人工题目：${a.fieldAnalysis.human_required_count} 个`
          : "无必须人工题目，规则可承接"
      ]
    }
  ];

  return (
    <div className="space-y-3">
      {/* 大总分 */}
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-accent-500/5 p-3 flex items-center gap-3">
        <ScoreGauge score={a.valueScore.totalScore} />
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] text-brand-700 font-semibold uppercase tracking-wide">
            综合价值评分
          </div>
          <div className="text-3xl font-bold text-ink-900 leading-none mt-1">
            {a.valueScore.totalScore}
            <span className="text-base text-ink-400 ml-1 font-normal">/ 100</span>
          </div>
          <div className="text-[10.5px] text-ink-500 mt-1">
            3 大主轴：① 价值 35 ｜ ② 是否要人做 25 ｜ ③ 历史资产/可重做 40
          </div>
        </div>
      </div>

      {/* 3 个主轴 */}
      {pillars.map((p) => (
        <PillarCard key={p.index} pillar={p} />
      ))}
    </div>
  );
}

interface PillarData {
  index: number;
  title: string;
  icon: string;
  subtitle: string;
  gradient: string;
  barColor: string;
  score: number;
  max: number;
  rows: { label: string; v: number; max: number }[];
  evidence: string[];
}

function PillarCard({ pillar }: { pillar: PillarData }) {
  const pillarPct = Math.max(0, Math.min(1, pillar.score / pillar.max));
  return (
    <div
      className={clsx(
        "rounded-xl border border-ink-200 bg-gradient-to-br",
        pillar.gradient,
        "p-3"
      )}
    >
      {/* 主轴头 */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-white/70 border border-ink-200 grid place-items-center text-lg shrink-0">
          {pillar.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] text-ink-500 uppercase tracking-wide font-medium">
            主轴 {numberCircle(pillar.index)}
          </div>
          <div className="flex items-baseline gap-2 -mt-0.5">
            <span className="text-[15px] font-bold text-ink-900">{pillar.title}</span>
            <span className="text-[11px] text-ink-500 truncate">{pillar.subtitle}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-ink-900 leading-none tabular-nums">
            {pillar.score}
            <span className="text-[11px] text-ink-400 ml-0.5 font-normal">/ {pillar.max}</span>
          </div>
          <div className="text-[10px] text-ink-500 mt-0.5">{Math.round(pillarPct * 100)}% 达成</div>
        </div>
      </div>
      {/* 主轴粗条 */}
      <div className="mt-2 h-2 bg-white/60 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full bg-gradient-to-r", pillar.barColor)}
          style={{ width: `${pillarPct * 100}%` }}
        />
      </div>
      {/* 子项 */}
      <div className="mt-2 space-y-1.5">
        {pillar.rows.map((r) => {
          const p = Math.max(0, Math.min(1, r.v / r.max));
          return (
            <div key={r.label}>
              <div className="flex justify-between text-[11px] text-ink-700">
                <span>{r.label}</span>
                <span className="font-mono text-ink-600">
                  {r.v} <span className="text-ink-400">/ {r.max}</span>
                </span>
              </div>
              <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mt-0.5">
                <div
                  className={clsx("h-full rounded-full bg-gradient-to-r", pillar.barColor)}
                  style={{ width: `${p * 100}%`, opacity: 0.7 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* 证据 */}
      {pillar.evidence.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {pillar.evidence.map((e, i) => (
            <span
              key={i}
              className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/80 border border-ink-200 text-ink-700"
            >
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// Tab 5：报告
// =============================================================================
function ReportInner({ executive, detailed }: { executive?: string; detailed?: string }) {
  const [sub, setSub] = useState<"executive" | "detailed">("executive");
  const text = sub === "executive" ? executive ?? "" : detailed ?? "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <SubTab active={sub === "executive"} onClick={() => setSub("executive")}>
          老板版 · 一页结论
        </SubTab>
        <SubTab active={sub === "detailed"} onClick={() => setSub("detailed")}>
          详细评估报告
        </SubTab>
        <div className="ml-auto flex gap-2">
          <CopyBtn text={text} />
          <DownloadBtn
            filename={sub === "executive" ? "executive_summary.md" : "detailed_report.md"}
            text={text}
          />
        </div>
      </div>
      <div className="markdown-body bg-white rounded-xl border border-ink-200 p-5">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 text-[12.5px] rounded-lg border transition",
        active
          ? "bg-brand-500 text-white border-brand-500 shadow-sm"
          : "bg-white text-ink-700 border-ink-200 hover:border-brand-300"
      )}
    >
      {children}
    </button>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="text-[11.5px] px-2 py-1 rounded-md border border-ink-200 bg-white hover:border-brand-300 text-ink-700"
    >
      {copied ? "已复制" : "复制 MD"}
    </button>
  );
}

function DownloadBtn({ filename, text }: { filename: string; text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="text-[11.5px] px-2 py-1 rounded-md border border-ink-200 bg-white hover:border-brand-300 text-ink-700"
    >
      下载 .md
    </button>
  );
}

// =============================================================================
// 通用组件
// =============================================================================
function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition rounded-lg",
        active
          ? "bg-brand-500 text-white shadow-sm"
          : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
        <span className="w-0.5 h-3 bg-brand-500 rounded-full" />
        {title}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className="text-[11.5px] px-2 py-0.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function CompactList({
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
      ? "border-amber-200 bg-amber-50/60 text-amber-900"
      : tone === "info"
        ? "border-brand-200 bg-brand-50/60 text-brand-900"
        : "border-ink-200 bg-white text-ink-800";
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li
          key={i}
          className={clsx(
            "text-[12px] leading-relaxed border rounded-md px-2.5 py-1.5",
            toneCls
          )}
        >
          {it}
        </li>
      ))}
    </ul>
  );
}

function pct(n: number): string {
  return `${Math.round((n ?? 0) * 100)}%`;
}

function numberCircle(n: number): string {
  return ["①", "②", "③", "④", "⑤", "⑥", "⑦"][n - 1] ?? `${n}`;
}
