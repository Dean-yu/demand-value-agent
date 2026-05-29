"use client";

import type { SampleSegmentationResult } from "@/lib/agent/types";

interface Props {
  sampleStrategy: SampleSegmentationResult;
}

const ROWS: {
  key: keyof SampleSegmentationResult["segments"];
  label: string;
  color: string;
}[] = [
  { key: "highValueHumanLabeling", label: "高价值人工", color: "#3a5ef0" },
  { key: "boundaryCases", label: "边界 / 标准沉淀", color: "#7c3aed" },
  { key: "machineAuto", label: "机审自动免审", color: "#10b981" },
  { key: "aiPrelabelHumanConfirm", label: "AI 预标 + 人工确认", color: "#0ea5e9" },
  { key: "humanFallback", label: "机审低置信 / 人工兜底", color: "#f59e0b" },
  { key: "notRecommended", label: "不建议投入", color: "#9ca3af" }
];

export default function SampleSegmentBars({ sampleStrategy }: Props) {
  const total = sampleStrategy.totalCount || 0;
  if (total === 0) {
    return <div className="text-[12px] text-ink-400">未识别到样本数据</div>;
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-ink-500">总样本：{total}</div>
      {ROWS.map((r) => {
        const seg = sampleStrategy.segments[r.key];
        const ratio = seg?.ratio ?? 0;
        const count = seg?.count ?? 0;
        return (
          <div key={r.key}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span style={{ color: r.color }}>{r.label}</span>
              <span className="text-ink-700 font-mono">
                {count} <span className="text-ink-400">({(ratio * 100).toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${ratio * 100}%`, background: r.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
