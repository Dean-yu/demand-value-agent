"use client";

import { useState } from "react";
import clsx from "clsx";
import Markdown from "@/components/Markdown";

interface Props {
  executive?: string;
  detailed?: string;
}

type Tab = "executive" | "detailed";

export default function ReportTabs({ executive, detailed }: Props) {
  const [tab, setTab] = useState<Tab>("executive");
  const has = !!(executive || detailed);

  if (!has) {
    return (
      <div className="text-sm text-ink-500">
        Agent 完成后，将在此展示 <strong>老板版一页结论</strong> 与 <strong>详细评估报告</strong>。
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <TabButton active={tab === "executive"} onClick={() => setTab("executive")}>
          老板版 · 一页结论
        </TabButton>
        <TabButton active={tab === "detailed"} onClick={() => setTab("detailed")}>
          详细评估报告
        </TabButton>
        <div className="ml-auto flex gap-2">
          <CopyButton text={tab === "executive" ? executive ?? "" : detailed ?? ""} />
          <DownloadButton
            filename={tab === "executive" ? "executive_summary.md" : "detailed_report.md"}
            text={tab === "executive" ? executive ?? "" : detailed ?? ""}
          />
        </div>
      </div>
      <div className="markdown-body bg-white rounded-xl border border-ink-200 p-5">
        <Markdown>{(tab === "executive" ? executive : detailed) ?? ""}</Markdown>
      </div>
    </div>
  );
}

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
        "px-3 py-1.5 text-[13px] rounded-lg border transition",
        active
          ? "bg-brand-500 text-white border-brand-500 shadow-sm"
          : "bg-white text-ink-700 border-ink-200 hover:border-brand-300"
      )}
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
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
      className="text-[12px] px-2.5 py-1 rounded-md border border-ink-200 bg-white hover:border-brand-300 text-ink-700"
    >
      {copied ? "已复制" : "复制 Markdown"}
    </button>
  );
}

function DownloadButton({ filename, text }: { filename: string; text: string }) {
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
      className="text-[12px] px-2.5 py-1 rounded-md border border-ink-200 bg-white hover:border-brand-300 text-ink-700"
    >
      下载 .md
    </button>
  );
}
