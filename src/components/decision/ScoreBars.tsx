"use client";

import type { ValueScoreDimensions } from "@/lib/agent/types";

interface Props {
  dimensions: ValueScoreDimensions;
}

const ROWS: { key: keyof ValueScoreDimensions; label: string; max: number }[] = [
  { key: "dataOutputValue", label: "数据产出价值", max: 20 },
  { key: "businessValue", label: "业务价值", max: 15 },
  { key: "ruleJudgability", label: "规则可判定性", max: 15 },
  { key: "sampleValue", label: "样本池价值", max: 15 },
  { key: "machineAuditPotential", label: "机审减量潜力", max: 15 },
  { key: "humanReductionValue", label: "人工减量价值", max: 10 },
  { key: "deliveryRiskControl", label: "交付风险可控", max: 10 }
];

export default function ScoreBars({ dimensions }: Props) {
  return (
    <div className="space-y-1.5">
      {ROWS.map((r) => {
        const v = dimensions[r.key];
        const pct = Math.max(0, Math.min(1, v / r.max));
        return (
          <div key={r.key}>
            <div className="flex justify-between text-[11px] text-ink-700 mb-0.5">
              <span>{r.label}</span>
              <span className="font-mono">
                {v} <span className="text-ink-400">/ {r.max}</span>
              </span>
            </div>
            <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
              <div
                className="score-bar h-full rounded-full transition-all duration-500"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
