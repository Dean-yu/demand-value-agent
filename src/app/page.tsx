"use client";

import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import Panel from "@/components/layout/Panel";
import InputPanel from "@/components/input/InputPanel";
import AgentFlow from "@/components/agent/AgentFlow";
import ResultPanel from "@/components/result/ResultPanel";
import { makeEmptyTask } from "@/lib/agent/initialTask";
import type {
  AgentRunResult,
  EvaluationTask,
  FinalTaskValueAssessment,
  SkillRun
} from "@/lib/agent/types";
import type { MockTaskMeta } from "@/lib/mock";

interface LlmInfo {
  name: string;
  isMock: boolean;
}

export default function HomePage() {
  const [task, setTask] = useState<EvaluationTask>(() => makeEmptyTask());
  const [mockTasks, setMockTasks] = useState<MockTaskMeta[]>([]);
  const [llmInfo, setLlmInfo] = useState<LlmInfo>({ name: "loading…", isMock: true });
  const [running, setRunning] = useState(false);
  const [skillRuns, setSkillRuns] = useState<SkillRun[]>([]);
  const [assessment, setAssessment] = useState<FinalTaskValueAssessment | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Bootstrap: 拉 LLM 信息 + Mock 列表
  useEffect(() => {
    void fetch("/api/llm-info")
      .then((r) => r.json())
      .then(setLlmInfo)
      .catch(() => {});
    void fetch("/api/mock")
      .then((r) => r.json())
      .then((data) => setMockTasks(data.tasks ?? []))
      .catch(() => {});
  }, []);

  async function loadMock(id: string) {
    const res = await fetch(`/api/mock?id=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.task) {
      setTask(data.task as EvaluationTask);
      setSkillRuns([]);
      setAssessment(undefined);
      setErrorMsg(null);
    }
  }

  async function runAgent() {
    if (running) return;
    setRunning(true);
    setSkillRuns([]);
    setAssessment(undefined);
    setErrorMsg(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
        signal: ac.signal
      });
      if (!res.ok || !res.body) {
        throw new Error(`服务返回 ${res.status}`);
      }
      // 解析 SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      const handle = (event: string, data: any) => {
        if (event === "skill_started") {
          setSkillRuns((prev) => upsertRun(prev, data));
        } else if (event === "skill_completed") {
          setSkillRuns((prev) => upsertRun(prev, data));
        } else if (event === "done") {
          const result = data as AgentRunResult;
          setSkillRuns(result.skills);
          setAssessment(result.assessment);
        } else if (event === "error") {
          setErrorMsg(data?.message ?? "Agent 执行失败");
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const e of events) {
          const evMatch = /event:\s*(\S+)/.exec(e);
          const dataMatch = /data:\s*(.+)/s.exec(e);
          if (!evMatch || !dataMatch) continue;
          try {
            const data = JSON.parse(dataMatch[1]);
            handle(evMatch[1], data);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancelRun() {
    abortRef.current?.abort();
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader llmName={llmInfo.name} isMock={llmInfo.isMock} />
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-3 px-3 py-3 max-w-[1800px] mx-auto w-full">
        <div className="col-span-12 xl:col-span-3 min-h-0 flex flex-col">
          <Panel
            title="① 任务输入"
            subtitle="任务信息 / 物料 / 产能"
            className="flex-1 min-h-0"
          >
            <InputPanel
              task={task}
              setTask={setTask}
              mockTasks={mockTasks}
              onLoadMock={loadMock}
              onRun={runAgent}
              running={running}
            />
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-3 min-h-0 flex flex-col">
          <Panel
            title="② Agent 推理流程"
            subtitle="10 个 Skill 顺序执行"
            className="flex-1 min-h-0"
            rightSlot={
              running ? (
                <button
                  onClick={cancelRun}
                  className="text-[11.5px] text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-md hover:bg-red-100"
                >
                  取消
                </button>
              ) : null
            }
          >
            {errorMsg && (
              <div className="mb-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                {errorMsg}
              </div>
            )}
            <AgentFlow runs={skillRuns} active={running} />
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-6 min-h-0 flex flex-col">
          <Panel
            title="③ 评估结论与报告"
            subtitle="结论 / 题目拆分 / 样本与产能 / 评分 / 报告"
            className="flex-1 min-h-0"
            contentClassName="p-3 overflow-hidden"
          >
            <ResultPanel assessment={assessment} running={running} />
          </Panel>
        </div>
      </main>
      <footer className="px-6 py-2 text-[10.5px] text-ink-400 text-center border-t border-ink-200/70 shrink-0">
        任务价值评估 Agent · Demo · {llmInfo.isMock ? "Mock LLM 模式" : `Real LLM: ${llmInfo.name}`}
      </footer>
    </div>
  );
}

function upsertRun(prev: SkillRun[], next: SkillRun): SkillRun[] {
  const idx = prev.findIndex((r) => r.id === next.id);
  if (idx < 0) return [...prev, next];
  const out = prev.slice();
  out[idx] = { ...prev[idx], ...next };
  return out;
}
