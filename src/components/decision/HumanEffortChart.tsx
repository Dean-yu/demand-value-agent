"use client";

import type { HumanEffortEstimate } from "@/lib/agent/types";

interface Props {
  effort: HumanEffortEstimate;
}

export default function HumanEffortChart({ effort }: Props) {
  const baseline = effort.baseline.totalHours || 0;
  const optimized = effort.optimized.totalHours || 0;
  const max = Math.max(baseline, optimized, 1);
  const reductionPct = (effort.reduction.hourReductionRatio ?? 0) * 100;

  return (
    <div className="space-y-2">
      <Row
        label="Baseline (全人工)"
        hours={baseline}
        ratio={baseline / max}
        color="#94a3b8"
        sub={`${effort.baseline.fullManualSampleCount} 条 × ${effort.baseline.avgSecondsPerItem}s · ≈ ${effort.baseline.personDays} 人日`}
      />
      <Row
        label="优化方案"
        hours={optimized}
        ratio={optimized / max}
        color="#3a5ef0"
        sub={`机审 ${effort.optimized.machineAutoCount} + 预标 ${effort.optimized.aiPrelabelCount} + 人工 ${effort.optimized.humanRequiredCount} · ≈ ${effort.optimized.personDays} 人日`}
      />
      <div className="text-[12px] text-emerald-700 font-medium">
        预计可节省人工工时 {reductionPct.toFixed(1)}%
      </div>
      {effort.reduction.reason.length > 0 && (
        <ul className="text-[11.5px] text-ink-600 list-disc list-inside space-y-0.5">
          {effort.reduction.reason.slice(0, 3).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  label,
  hours,
  ratio,
  color,
  sub
}: {
  label: string;
  hours: number;
  ratio: number;
  color: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-ink-700">{label}</span>
        <span className="font-mono text-ink-800">{hours.toFixed(1)} h</span>
      </div>
      <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio * 100}%`, background: color }}
        />
      </div>
      <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>
    </div>
  );
}
