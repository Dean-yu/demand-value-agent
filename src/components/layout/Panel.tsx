"use client";

import { ReactNode } from "react";
import clsx from "clsx";

interface Props {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function Panel({
  title,
  subtitle,
  rightSlot,
  children,
  className,
  contentClassName
}: Props) {
  return (
    <section
      className={clsx(
        "glass-panel rounded-2xl shadow-panel flex flex-col overflow-hidden",
        className
      )}
    >
      <header className="px-4 py-3 border-b border-ink-200/70 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-900">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-500 mt-0.5">{subtitle}</div>}
        </div>
        {rightSlot}
      </header>
      <div className={clsx("flex-1 overflow-auto p-4", contentClassName)}>{children}</div>
    </section>
  );
}
