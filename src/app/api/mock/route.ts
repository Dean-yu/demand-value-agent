import { NextResponse } from "next/server";
import { getMockTaskById, listMockTasks } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const task = getMockTaskById(id);
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ task });
  }
  return NextResponse.json({ tasks: listMockTasks() });
}
