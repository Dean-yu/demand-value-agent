import { NextResponse } from "next/server";
import { parseUploadedFile, type ParseInput } from "@/lib/parsers/fileParser";
import type { UploadedFile } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return handleFormData(request);
  }
  return handleJson(request);
}

async function handleFormData(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (e: any) {
    return NextResponse.json({ error: `formdata 解析失败: ${e?.message ?? e}` }, { status: 400 });
  }

  const role = (form.get("role") as UploadedFile["role"] | null) ?? undefined;
  const fileEntry = form.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  const file = fileEntry as File;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `文件过大（>${MAX_BYTES} 字节）` }, { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());

  const input: ParseInput = {
    name: file.name,
    type: file.type,
    size: file.size,
    buffer: buf,
    role
  };

  // 文本类直接解码为 text，避免重复转换
  if (file.type.startsWith("text/") || /\.(txt|md|markdown|log|json|csv)$/i.test(file.name)) {
    input.text = buf.toString("utf8");
  }

  try {
    const parsed = await parseUploadedFile(input);
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: `解析失败: ${e?.message ?? e}` }, { status: 500 });
  }
}

async function handleJson(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体非法 JSON" }, { status: 400 });
  }
  if (!body?.name || !body?.type) {
    return NextResponse.json({ error: "缺少 name / type 字段" }, { status: 400 });
  }
  const input: ParseInput = {
    name: String(body.name),
    type: String(body.type),
    size: Number(body.size ?? 0),
    text: typeof body.text === "string" ? body.text : undefined,
    data: typeof body.data === "string" ? body.data : undefined,
    encoding: body.encoding === "base64" ? "base64" : body.encoding === "utf8" ? "utf8" : undefined,
    role: body.role
  };
  try {
    const parsed = await parseUploadedFile(input);
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: `解析失败: ${e?.message ?? e}` }, { status: 500 });
  }
}
