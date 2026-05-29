"use client";

import type { CapacityParams } from "@/lib/agent/types";

interface Props {
  value: CapacityParams;
  onChange: (patch: Partial<CapacityParams>) => void;
}

export default function CapacityParamsForm({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="预计总样本量"
        value={value.totalSampleCount ?? 0}
        onChange={(v) => onChange({ totalSampleCount: v })}
      />
      <NumberField
        label="人工单条耗时（秒）"
        value={value.avgManualSecondsPerItem}
        onChange={(v) => onChange({ avgManualSecondsPerItem: v })}
      />
      <NumberField
        label="预标确认单条耗时（秒）"
        value={value.avgPrelabelConfirmSecondsPerItem}
        onChange={(v) => onChange({ avgPrelabelConfirmSecondsPerItem: v })}
      />
      <NumberField
        label="质检抽样比例"
        value={value.qualitySamplingRatio}
        step={0.01}
        onChange={(v) => onChange({ qualitySamplingRatio: v })}
      />
      <NumberField
        label="单人单日有效工时"
        value={value.effectiveWorkHoursPerPersonDay}
        step={0.5}
        onChange={(v) => onChange({ effectiveWorkHoursPerPersonDay: v })}
      />
      <NumberField
        label="目标交付天数"
        value={value.targetDeliveryDays ?? 0}
        onChange={(v) => onChange({ targetDeliveryDays: v })}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="text-[10px] text-ink-500 mb-1">{label}</div>
      <input
        type="number"
        step={step}
        className="w-full text-[12px] bg-white border border-ink-200 rounded px-2 py-1.5 outline-none focus:border-brand-500"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
