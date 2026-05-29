import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "任务价值评估 Agent",
  description:
    "面向审核、标注、评测平台的任务价值评估 Agent — 在正式投入人力前完成数据产出价值、机审承接潜力、人工减量空间与最终投入决策的前置评估。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  );
}
