import { NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/llm/provider";

export const runtime = "nodejs";

export async function GET() {
  const llm = await getLLMProvider();
  return NextResponse.json({ name: llm.name, isMock: llm.isMock });
}
