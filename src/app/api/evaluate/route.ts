import { NextResponse } from "next/server";
import { runAgent, type SkillProgressEvent } from "@/lib/agent/orchestrator";
import { getMockTaskById } from "@/lib/mock";
import type { EvaluationTask } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 给 LLM 多一点时间
export const maxDuration = 300;

interface EvaluatePayload {
  task?: EvaluationTask;
  mockId?: string;
  /** 是否流式返回进度（SSE）。默认 true，POST 也支持 stream=false 直接返回完整 JSON */
  stream?: boolean;
}

export async function POST(request: Request) {
  let body: EvaluatePayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体非法 JSON" }, { status: 400 });
  }

  const task = resolveTask(body);
  if (!task) {
    return NextResponse.json({ error: "缺少 task 或 mockId" }, { status: 400 });
  }

  if (body.stream === false) {
    try {
      const result = await runAgent(task);
      return NextResponse.json(result);
    } catch (e: any) {
      return NextResponse.json({ error: `Agent 运行失败：${e?.message ?? e}` }, { status: 500 });
    }
  }

  // SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      try {
        send("started", { taskId: task.id, title: task.title });
        const result = await runAgent(task, {
          onProgress: (e: SkillProgressEvent) => send(e.type, e.run)
        });
        send("done", result);
      } catch (e: any) {
        send("error", { message: e?.message ?? String(e) });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function resolveTask(body: EvaluatePayload): EvaluationTask | undefined {
  if (body.task) return body.task;
  if (body.mockId) return getMockTaskById(body.mockId);
  return undefined;
}
