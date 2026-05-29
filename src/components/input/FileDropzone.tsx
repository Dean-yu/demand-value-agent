"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { ParsedUpload } from "@/lib/parsers/fileParser";
import type { UploadedFile } from "@/lib/agent/types";

const ROLE_OPTIONS: { value: UploadedFile["role"]; label: string }[] = [
  { value: "rule_doc", label: "规则文档" },
  { value: "sop_doc", label: "作业 SOP" },
  { value: "training_manual", label: "外包培训" },
  { value: "sample_data", label: "样本数据" },
  { value: "historical_labels", label: "历史标注结果" },
  { value: "quality_results", label: "质检结果" },
  { value: "machine_audit_results", label: "机审结果" },
  { value: "screenshot", label: "页面截图" },
  { value: "other", label: "其他" }
];

interface Props {
  onUploaded: (parsed: ParsedUpload) => void;
  disabled?: boolean;
}

export default function FileDropzone({ onUploaded, disabled }: Props) {
  const [role, setRole] = useState<UploadedFile["role"]>("sample_data");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("role", role);
      const res = await fetch("/api/parse", {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `解析失败 ${res.status}`);
      }
      onUploaded(data as ParsedUpload);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-ink-600">用途:</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UploadedFile["role"])}
          className="text-[12px] bg-white border border-ink-200 rounded px-2 py-1"
          disabled={disabled || busy}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div
        ref={dragRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) await uploadFile(file);
        }}
        className={clsx(
          "border-2 border-dashed rounded-xl p-4 text-center text-[12px] transition",
          dragOver ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-ink-50/40",
          (disabled || busy) && "opacity-60"
        )}
      >
        <div className="text-ink-700">
          拖入或
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="text-brand-600 font-medium px-1 underline-offset-2 hover:underline"
          >
            选择文件
          </button>
          上传
        </div>
        <div className="text-ink-500 text-[11px] mt-1">支持 txt / md / csv / xlsx / pdf / 图片</div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".txt,.md,.markdown,.log,.json,.csv,.xls,.xlsx,.pdf,image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await uploadFile(file);
          }}
        />
        {busy && <div className="mt-2 text-[11px] text-ink-500">解析中…</div>}
        {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}
      </div>
    </div>
  );
}
