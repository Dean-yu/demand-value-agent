# 任务价值评估 Agent · Demo

> 面向**审核 / 标注 / 评测**平台的「任务价值评估 Agent」。在任务正式进入大规模生产前，结合任务规则、样本数据、历史标注、历史质检和已有机审能力，给出**前置价值评估 + 投入策略分析**。

> 本 Demo 实现了 **Agent Orchestrator + 8 个 Skill + LLM Provider 抽象（Mock / OpenAI 兼容） + 两组 Mock 示例数据 + 三栏交互界面**，零依赖即可演示，配置 API Key 即可接真实模型。

---

## 它能回答什么

1. 这个任务应该产出什么数据？
2. 这些数据对业务、算法、模型评测、规则治理有没有价值？
3. 当前任务是否值得全量人工投入？
4. 哪些样本值得人工重点标注？哪些可以机审兜住？哪些适合 AI 预标 + 人工确认？哪些不值得做？
5. 任务需要多少人工规模？引入机审或 AI 预标后，人工能减少多少？
6. 最终建议：**机审优先承接 / 试点投入 / 改造后投入 / 人工主判 / 谨慎投入 / 不建议继续投入**？

输出：**老板版一页结论 + 详细评估报告 + 人机分工建议**。

---

## 核心产品逻辑

1. 不只回答"值不值得做"，而是回答"怎么投入最合理"。
2. 不只看 AI 准确率，而是看 **机审覆盖率 + 置信度分布 + 错误模式 + 人工减量空间**。
3. 不默认所有样本都值得人工标注 —— 6 分类样本价值分层：
   - 高价值人工标注 / 边界 Case / 机审自动 / AI 预标 + 人工确认 / 人工兜底 / 不建议投入
4. 不默认历史人工结果一定正确 —— 结合质检结果判断历史结果是否可靠。
5. 信息不足时**不强行下结论**，会在报告中明示"当前结论为初步判断"并列出补料清单。

---

## 7 维评分 + 6 决策

总分 0–100：

| 维度 | 满分 |
|---|---:|
| 数据产出价值 | 20 |
| 业务价值 | 15 |
| 规则可判定性 | 15 |
| 样本池价值 | 15 |
| 机审减量潜力 | 15 |
| 人工减量价值 | 10 |
| 交付风险可控性 | 10 |

最终决策（基于规则 + 总分综合判断）：

- **建议机审优先承接**：机审潜力 + 规则可判定性双高、总分 ≥ 70
- **建议试点投入**：总分 ≥ 75 且交付风险可控 ≥ 7
- **建议改造后投入**：数据价值高但规则可判定性低
- **建议人工主判**：机审能力低但规则清晰、价值高
- **谨慎投入**：总分 ≥ 55，但缺关键条件
- **不建议继续投入**：数据价值低或总分 < 55

---

## 8 个 Skill 顺序流程

```
任务目标识别
   ↓
规则可判定性
   ↓
样本画像与价值分层
   ↓
历史标注 + 质量基线
   ↓
机审能力评估
   ↓
人工投入测算
   ↓
投入策略生成
   ↓
报告生成（老板版 + 详细版）
```

每个 Skill 内部：**确定性计算（TS）+ LLM 包装叙述**。
所有数值（占比、人天、节省比例）来自 TS 计算，LLM 只负责文案润色 —— **数值绝不由 LLM 生成**。

---

## 本地运行

```bash
# 安装依赖
npm install

# 启动开发
npm run dev
# → http://localhost:3000

# 生产构建
npm run build
npm start
```

要求 Node 18+。

---

## 环境变量配置

复制 `.env.example` → `.env.local`，按需修改：

```bash
# 不配置任何变量 → 自动 Mock
# 配置以下任一组合即接真实 LLM：
LLM_PROVIDER=openai-compatible      # 或 openai_compatible，任意非 "mock" 值都视为真实
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

> ⚠️ 项目代码中**不写死任何 API Key**，所有调用均通过 `process.env` 读取。
> `.env.local` 已被 `.gitignore` 排除。

---

## Mock 模式说明

Mock 模式由 `src/lib/llm/mockProvider.ts` 提供，**完全不需要网络**：

1. 通过 prompt 中嵌入的 `[[SKILL:xxx]]` 标记识别当前 Skill
2. 通过 `[[PAYLOAD]]...[[/PAYLOAD]]` 解析 Skill 传入的真实数据（样本、规则、机审结果等）
3. 基于真实数据生成结构化 JSON：例如样本分布按真实 category 统计，机审承接比例按真实置信度分层

> 这保证 Demo 不仅"能跑"，输出还能体现完整的判断链路 —— 不是死循环假数据。

---

## 使用 Mock 示例数据

打开 http://localhost:3000，左侧「快速加载 Mock 示例」中提供了两组任务：

### 示例 1：电商商品质量审核
- 类型：审核
- 120 条样本，含 6 大类目，三标签（通过 / 不通过 / 待复核）
- 含历史人工标注（约 86% Agreement）+ 30% 质检 + 90% 覆盖率的旧机审结果
- 用于演示「机审优先承接 + 类目级弱项识别」

### 示例 2：「一致性」模型准确率评测
- 类型：模型准确率评测
- 110 条样本，6 大类目，三标签（一致 / 不一致 / 无法判断）
- 含 80% 历史标注 + 60% 质检 + 100% 模型覆盖
- 用于演示「评测任务的人工抽样减量空间评估」

点击 → 「开始评估」 → 实时看 8 个 Skill 顺序执行 → 右侧给出评分、决策、风险与下一步 → 底部生成两份 Markdown 报告。

---

## 目录结构

```
demand-value-agent/
├── README.md
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── .env.example
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                 # 三栏布局主页面
    │   ├── globals.css
    │   └── api/
    │       ├── evaluate/route.ts    # 主评估接口（SSE 流式）
    │       ├── mock/route.ts        # Mock 任务列表 / 单条
    │       ├── parse/route.ts       # 文件解析（CSV / Excel / PDF / 文本 / 图片）
    │       └── llm-info/route.ts    # 当前 LLM Provider 信息
    ├── components/
    │   ├── Markdown.tsx             # 内置 Markdown 渲染器（无外部依赖）
    │   ├── layout/
    │   │   ├── AppHeader.tsx
    │   │   └── Panel.tsx
    │   ├── input/
    │   │   ├── InputPanel.tsx
    │   │   ├── FileDropzone.tsx
    │   │   └── CapacityParamsForm.tsx
    │   ├── agent/
    │   │   └── AgentFlow.tsx
    │   ├── decision/
    │   │   ├── DecisionPanel.tsx
    │   │   ├── ScoreGauge.tsx
    │   │   ├── ScoreBars.tsx
    │   │   ├── SampleSegmentBars.tsx
    │   │   └── HumanEffortChart.tsx
    │   └── report/
    │       └── ReportTabs.tsx
    └── lib/
        ├── agent/
        │   ├── types.ts             # 全部数据结构
        │   ├── prompts.ts           # 主 System Prompt
        │   ├── scoring.ts           # 7 维评分
        │   ├── decision.ts          # 6 决策 + narrative
        │   ├── orchestrator.ts      # Skill 调度 + onProgress（SSE）
        │   └── initialTask.ts
        ├── skills/                  # 8 个 Skill 模块
        │   ├── skillTypes.ts
        │   ├── taskGoalSkill.ts
        │   ├── ruleJudgabilitySkill.ts
        │   ├── sampleSegmentationSkill.ts
        │   ├── historicalQualitySkill.ts
        │   ├── machineAuditCoverageSkill.ts
        │   ├── humanEffortEstimationSkill.ts
        │   ├── strategyGenerationSkill.ts
        │   └── reportGenerationSkill.ts
        ├── llm/
        │   ├── provider.ts          # LLMProvider 抽象 + 单例
        │   ├── mockProvider.ts      # 内置 Mock，按 [[SKILL:xxx]] 路由
        │   └── openAICompatibleProvider.ts
        ├── parsers/
        │   ├── fileParser.ts        # 顶层路由 + role 推断
        │   ├── csvParser.ts
        │   ├── excelParser.ts
        │   └── textParser.ts
        └── mock/
            ├── index.ts
            ├── commodityQualityTask.ts
            └── consistencyModelEvalTask.ts
```

---

## 接口契约

### POST /api/evaluate

启动一次完整的 Agent 评估。

```jsonc
// Request
{
  "task": EvaluationTask,         // 完整任务对象（也可用 mockId）
  "mockId": "task_xxx",           // 二选一：直接跑某个 Mock 任务
  "stream": true                  // 默认 true：SSE 流式；false：等待并一次返回 JSON
}
```

SSE 事件：
- `event: started` —— `{ taskId, title }`
- `event: skill_started` —— `SkillRun`（status=running）
- `event: skill_completed` —— `SkillRun`（status=completed/failed）
- `event: done` —— `AgentRunResult`
- `event: error` —— `{ message }`

### POST /api/parse

```text
multipart/form-data
- file: File
- role: rule_doc | sop_doc | training_manual | sample_data
       | historical_labels | quality_results | machine_audit_results
       | screenshot | other
```

返回 `ParsedUpload`：包含 `file` 元信息 + 按 schema 自动识别的 `samples / historicalLabels / qualityResults / machineAuditResults`。

### GET /api/mock?id=xxx

不带 `id` → 返回 Mock 任务列表（精简元信息）；带 `id` → 返回完整 EvaluationTask。

### GET /api/llm-info

返回当前生效的 LLM Provider `{ name, isMock }`，用于 Header 状态显示。

---

## 后续可扩展方向

- 多轮反思：已预留 `conflictReflection()` 与 `rerunWithAdditionalContext()` 钩子
- 接入更细致的 PDF / 图片解析（pdfjs / OCR）
- 评估结果沉淀为「任务价值看板」与「机审接入清单」
- 把评估结论反哺到任务接入、机审接入、人员调度、知识沉淀流程

---

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript 5.7
- TailwindCSS 3.4
- xlsx（Excel 解析）+ 自研 CSV 解析器
- 原生 fetch + SSE（Skill 执行流式回传）
- 零样式库 / 零图表库依赖：Score 图表、Bar 图都用 SVG / Tailwind 手写
