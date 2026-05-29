"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { SkillRun, SkillStatus } from "@/lib/agent/types";

const SKILL_STEPS: { id: string; title: string; subtitle: string }[] = [
  { id: "task_goal_and_data_output", title: "任务目标识别", subtitle: "数据产出 / 业务价值 / 价值闭环" },
  { id: "rule_judgability", title: "规则可判定性", subtitle: "可机判 / 待 AI 辅助 / 必须人工" },
  { id: "field_level_analysis", title: "题目级 AI / 人工拆分", subtitle: "哪些判定题目 AI 可承接、哪些必须人工" },
  { id: "machine_audit_trial", title: "机审 Trial 实测", subtitle: "≤60 条样本上真实跑一次通用机审，得 per-category accuracy" },
  { id: "sample_pool_segmentation", title: "样本画像与分层", subtitle: "六分类 + Top 疑难样本" },
  { id: "historical_quality_baseline", title: "历史标注与质量基线", subtitle: "Agreement / 错误标签" },
  { id: "machine_audit_coverage", title: "机审能力评估", subtitle: "覆盖 / 高置信 / 弱项" },
  { id: "human_effort_estimation", title: "人工投入测算", subtitle: "Baseline vs 优化方案" },
  { id: "task_investment_strategy", title: "投入策略生成", subtitle: "试点 / 放量 / 改造" },
  { id: "task_value_report", title: "报告生成", subtitle: "老板版 + 详细版" }
];

interface Props {
  runs: SkillRun[];
  active: boolean;
}

export default function AgentFlow({ runs, active }: Props) {
  // 默认展开：正在运行的 + 有 warnings 的 + 用户手动展开的
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 当某个 step 正在 running 时自动展开（仅添加，不移除用户手动的折叠/展开）
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of runs) {
        if (r.status === "running" && !next.has(r.id)) {
          next.add(r.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [runs]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-1">
      {SKILL_STEPS.map((step, idx) => {
        const run = runs.find((r) => r.id === step.id);
        const status: SkillStatus = run?.status ?? "pending";
        const hasDetail =
          !!run?.summary ||
          (run?.keyFindings?.length ?? 0) > 0 ||
          (run?.warnings?.length ?? 0) > 0;
        const open = expanded.has(step.id) && hasDetail;
        const summaryLine =
          run?.summary?.replace(/\s+/g, " ").trim() ?? (status === "pending" ? "待执行" : "");
        const hasWarn = (run?.warnings?.length ?? 0) > 0;
        return (
          <div key={step.id}>
            {/* 单行 */}
            <button
              type="button"
              onClick={() => hasDetail && toggle(step.id)}
              disabled={!hasDetail}
              className={clsx(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition border",
                hasDetail ? "cursor-pointer hover:bg-ink-50" : "cursor-default",
                status === "running"
                  ? "border-brand-200 bg-brand-50/50"
                  : status === "completed"
                    ? "border-emerald-100 bg-white"
                    : status === "warning"
                      ? "border-amber-200 bg-amber-50/40"
                      : status === "failed"
                        ? "border-red-200 bg-red-50/40"
                        : "border-ink-100 bg-white"
              )}
            >
              <StepDot index={idx + 1} status={status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink-900 truncate">
                    {step.title}
                  </span>
                  {hasWarn && <span className="text-amber-500 text-[10px]">⚠</span>}
                </div>
                {summaryLine && (
                  <div className="text-[10.5px] text-ink-500 truncate leading-tight mt-0.5">
                    {summaryLine}
                  </div>
                )}
              </div>
              <StatusBadge status={status} compact />
              {hasDetail && (
                <span
                  className={clsx(
                    "text-[10px] text-ink-400 transition-transform shrink-0 w-3 text-center",
                    open && "rotate-180"
                  )}
                  aria-hidden
                >
                  ▼
                </span>
              )}
            </button>

            {/* 展开详情 */}
            {open && (
              <div className="ml-7 mt-0.5 mb-1 pl-3 border-l-2 border-ink-100">
                <div className="text-[11px] text-ink-500">{step.subtitle}</div>
                {run?.summary && (
                  <div className="mt-1 text-[11.5px] text-ink-700 leading-relaxed">
                    {run.summary}
                  </div>
                )}
                {(run?.keyFindings?.length ?? 0) > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-ink-600 list-disc list-inside">
                    {run!.keyFindings!.slice(0, 6).map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                )}
                {(run?.warnings?.length ?? 0) > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700 list-disc list-inside">
                    {run!.warnings!.slice(0, 4).map((w, i) => (
                      <li key={i}>⚠ {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 全部完成 / idle 的小提示 */}
      {!active && runs.length === 0 && (
        <div className="text-[11px] text-ink-400 text-center py-2">
          点击「开始评估」后，10 个 Skill 会在这里顺序执行
        </div>
      )}
    </div>
  );
}

function StepDot({ index, status }: { index: number; status: SkillStatus }) {
  const cls =
    status === "completed"
      ? "bg-emerald-500 text-white"
      : status === "running"
        ? "bg-brand-500 text-white animate-pulse"
        : status === "failed"
          ? "bg-red-500 text-white"
          : status === "warning"
            ? "bg-amber-500 text-white"
            : "bg-ink-200 text-ink-600";
  return (
    <span
      className={clsx(
        "shrink-0 w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold",
        cls
      )}
    >
      {status === "completed" ? "✓" : status === "failed" ? "!" : index}
    </span>
  );
}

function StatusBadge({ status, compact }: { status: SkillStatus; compact?: boolean }) {
  const map: Record<SkillStatus, { text: string; cls: string }> = {
    pending: { text: "待执行", cls: "bg-ink-100 text-ink-500 border-ink-200" },
    running: { text: "进行中", cls: "bg-brand-50 text-brand-700 border-brand-200" },
    completed: { text: "完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    warning: { text: "需关注", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    failed: { text: "失败", cls: "bg-red-50 text-red-700 border-red-200" }
  };
  const v = map[status];
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full border font-medium",
        compact ? "text-[10px] px-1.5 py-0" : "text-[11px] px-2 py-0.5",
        v.cls
      )}
    >
      {v.text}
    </span>
  );
}
