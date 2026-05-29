"use client";

import { useState } from "react";
import clsx from "clsx";
import type { CapacityParams, EvaluationTask, TaskType, UploadedFile } from "@/lib/agent/types";
import FileDropzone from "./FileDropzone";
import CapacityParamsForm from "./CapacityParamsForm";
import type { MockTaskMeta } from "@/lib/mock";

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "audit", label: "审核" },
  { value: "labeling", label: "标注" },
  { value: "evaluation", label: "评测" },
  { value: "quality_inspection", label: "质检" },
  { value: "model_accuracy_eval", label: "模型准确率评测" },
  { value: "model_recall_eval", label: "模型召回评测" },
  { value: "training_data_building", label: "训练数据生产" },
  { value: "other", label: "其他" }
];

interface Props {
  task: EvaluationTask;
  setTask: (t: EvaluationTask) => void;
  mockTasks: MockTaskMeta[];
  onLoadMock: (id: string) => Promise<void>;
  onRun: () => void;
  running: boolean;
}

export default function InputPanel({
  task,
  setTask,
  mockTasks,
  onLoadMock,
  onRun,
  running
}: Props) {
  const [loadingMock, setLoadingMock] = useState<string | null>(null);
  const [mockOpen, setMockOpen] = useState(false);

  const update = (patch: Partial<EvaluationTask>) => setTask({ ...task, ...patch });
  const updateCapacity = (patch: Partial<CapacityParams>) =>
    update({ capacityParams: { ...task.capacityParams, ...patch } });

  return (
    <div className="space-y-5">
      {/* 1. 任务基本信息（升级为第一节点） */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle index={1} title="任务基本信息" />
          <MockQuickLoad
            mockTasks={mockTasks}
            loadingMock={loadingMock}
            running={running}
            open={mockOpen}
            setOpen={setMockOpen}
            onLoadMock={async (id) => {
              setLoadingMock(id);
              try {
                await onLoadMock(id);
                setMockOpen(false);
              } finally {
                setLoadingMock(null);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <div>
            <Label>任务标题</Label>
            <input
              type="text"
              className={inputCls}
              value={task.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="例：电商商品质量审核"
            />
          </div>
          <div>
            <Label>任务类型</Label>
            <select
              className={inputCls}
              value={task.taskType}
              onChange={(e) => update({ taskType: e.target.value as TaskType })}
            >
              {TASK_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>需求描述 / 业务背景</Label>
            <textarea
              className={clsx(inputCls, "min-h-[120px] font-mono text-[12px] leading-5")}
              value={task.demandDescription}
              onChange={(e) => update({ demandDescription: e.target.value })}
              placeholder="可粘贴需求文档、目标、历史背景、痛点等"
            />
          </div>
        </div>
      </div>

      {/* 2. 输入物料 */}
      <div>
        <SectionTitle index={2} title="输入物料（规则 / 样本 / 历史标注 / 质检 / 机审）" />
        <FilesSummary files={task.files} />
        <FileDropzone
          onUploaded={(parsed) => {
            const next: EvaluationTask = {
              ...task,
              files: [...task.files, parsed.file]
            };
            if (parsed.samples?.length) {
              next.sampleData = mergeBy(
                [...(task.sampleData ?? []), ...parsed.samples],
                (x) => x.id
              );
            }
            if (parsed.historicalLabels?.length) {
              next.historicalLabels = mergeBy(
                [...(task.historicalLabels ?? []), ...parsed.historicalLabels],
                (x) => x.sampleId + "|" + x.label
              );
            }
            if (parsed.qualityResults?.length) {
              next.qualityResults = mergeBy(
                [...(task.qualityResults ?? []), ...parsed.qualityResults],
                (x) => x.sampleId
              );
            }
            if (parsed.machineAuditResults?.length) {
              next.machineAuditResults = mergeBy(
                [...(task.machineAuditResults ?? []), ...parsed.machineAuditResults],
                (x) => x.sampleId
              );
            }
            setTask(next);
          }}
          disabled={running}
        />
        <DataCounts task={task} />
      </div>

      {/* 3. 产能参数 */}
      <div>
        <SectionTitle index={3} title="产能 / 单条耗时" />
        <CapacityParamsForm value={task.capacityParams} onChange={updateCapacity} />
      </div>

      {/* 4. 运行按钮 */}
      <div className="pt-2">
        <button
          onClick={onRun}
          disabled={running}
          className={clsx(
            "w-full py-3 rounded-xl text-sm font-semibold shadow-panel transition",
            running
              ? "bg-ink-200 text-ink-500 cursor-not-allowed"
              : "bg-gradient-to-r from-brand-500 to-accent-600 text-white hover:opacity-95"
          )}
        >
          {running ? "Agent 评估中…" : "开始评估"}
        </button>
        <div className="text-[11px] text-ink-500 mt-2 leading-relaxed">
          Agent 会顺序执行 10 个 Skill：任务目标 → 规则 → <span className="text-brand-600 font-medium">题目级 AI/人工拆分</span> → <span className="text-brand-600 font-medium">机审 Trial 实测</span> → 样本分层 → 历史/质检 → 机审 → 人工测算 → 策略 → 报告。
          重点回答 <span className="font-medium">"是否需要人工 / 做什么 / 做多少"</span>。
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 把 Mock 加载收成右上角的小按钮 + 弹层
// =============================================================================

function MockQuickLoad(args: {
  mockTasks: MockTaskMeta[];
  loadingMock: string | null;
  running: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  onLoadMock: (id: string) => Promise<void>;
}) {
  const { mockTasks, loadingMock, running, open, setOpen, onLoadMock } = args;
  const disabled = running || loadingMock !== null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={clsx(
          "text-[11px] px-2 py-1 rounded-md border transition",
          disabled
            ? "border-ink-200 bg-ink-50 text-ink-400 cursor-not-allowed"
            : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400"
        )}
      >
        {loadingMock ? "加载中…" : "🧪 一键试用 Mock 示例"}
      </button>
      {open && !disabled && (
        <div
          className="absolute right-0 mt-1 w-72 z-20 rounded-xl border border-ink-200 bg-white shadow-xl overflow-hidden"
          role="menu"
        >
          <div className="px-3 py-2 text-[11px] text-ink-500 bg-ink-50 border-b border-ink-200">
            选择一个示例自动填入任务、样本与各类附件
          </div>
          {mockTasks.length === 0 && (
            <div className="px-3 py-3 text-xs text-ink-400">暂无 Mock</div>
          )}
          {mockTasks.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onLoadMock(m.id)}
              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition border-b border-ink-100 last:border-0"
            >
              <div className="text-sm font-semibold text-ink-900">{m.title}</div>
              <div className="text-[11px] text-ink-500 mt-0.5">
                {m.taskType} · {m.sampleCount} 条样本
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition";

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-ink-600 mb-1 font-medium">{children}</div>;
}

function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-bold grid place-items-center">
        {index}
      </span>
      <span className="text-sm font-semibold text-ink-800">{title}</span>
    </div>
  );
}

function FilesSummary({ files }: { files: UploadedFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1 mb-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 text-[12px] bg-white border border-ink-200 rounded-md px-2 py-1.5"
        >
          <span className="text-ink-400 text-[10px]">{shortRole(f.role)}</span>
          <span className="font-medium text-ink-800 truncate">{f.name}</span>
          <span className="ml-auto text-ink-400 text-[10px]">{prettySize(f.size)}</span>
        </div>
      ))}
    </div>
  );
}

function DataCounts({ task }: { task: EvaluationTask }) {
  const items: { label: string; n: number }[] = [
    { label: "样本", n: task.sampleData?.length ?? 0 },
    { label: "历史标注", n: task.historicalLabels?.length ?? 0 },
    { label: "质检结果", n: task.qualityResults?.length ?? 0 },
    { label: "机审结果", n: task.machineAuditResults?.length ?? 0 }
  ];
  return (
    <div className="grid grid-cols-4 gap-1 mt-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md bg-ink-50 border border-ink-200/80 p-1.5 text-center"
        >
          <div className="text-[10px] text-ink-500">{it.label}</div>
          <div className="text-sm font-semibold text-ink-800">{it.n}</div>
        </div>
      ))}
    </div>
  );
}

function shortRole(role: UploadedFile["role"]): string {
  const map: Record<UploadedFile["role"], string> = {
    rule_doc: "规则",
    sop_doc: "SOP",
    training_manual: "培训",
    sample_data: "样本",
    historical_labels: "历史",
    quality_results: "质检",
    machine_audit_results: "机审",
    screenshot: "截图",
    other: "其他"
  };
  return map[role] ?? "其他";
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function mergeBy<T>(arr: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
