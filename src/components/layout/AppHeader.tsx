"use client";

interface Props {
  llmName: string;
  isMock: boolean;
}

export default function AppHeader({ llmName, isMock }: Props) {
  return (
    <header className="px-6 py-4 border-b border-ink-200/80 glass-panel sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 grid place-items-center text-white text-lg font-bold shadow-panel">
            T
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold gradient-text">任务价值评估 Agent</div>
            <div className="text-[11px] text-ink-500">
              在正式投入前完成数据价值 / 机审承接 / 人工减量 / 投入决策的前置评估
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span
            className={`px-2 py-1 rounded-full border text-[11px] tracking-wide ${
              isMock
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-emerald-300 bg-emerald-50 text-emerald-700"
            }`}
          >
            {isMock ? "Mock LLM（无需密钥）" : "Real LLM"}
          </span>
          <span className="text-ink-500">{llmName}</span>
        </div>
      </div>
    </header>
  );
}
