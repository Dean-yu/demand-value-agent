import type {
  HistoricalLabelRecord,
  MachineAuditRecord,
  QualityResultRecord,
  SampleRecord,
  UploadedFile
} from "../agent/types";
import {
  parseCsvText,
  rowsToHistoricalLabels,
  rowsToMachineAudit,
  rowsToQualityResults,
  rowsToSamples
} from "./csvParser";
import { parseExcelDetailed, type ParsedExcel } from "./excelParser";
import { extractPdfText, isLikelyTextFile } from "./textParser";

export interface ParsedUpload {
  file: UploadedFile;
  rows?: Record<string, any>[];
  samples?: SampleRecord[];
  historicalLabels?: HistoricalLabelRecord[];
  qualityResults?: QualityResultRecord[];
  machineAuditResults?: MachineAuditRecord[];
  truncated?: boolean;
  totalRows?: number;
}

/**
 * 接受两种形式：
 * - 大文件：直接传 buffer/text（FormData 路径）
 * - 小文件：传 base64/utf8 字符串（兼容老接口）
 */
export interface ParseInput {
  name: string;
  type: string;
  size: number;
  buffer?: Buffer;
  text?: string;
  data?: string;
  encoding?: "base64" | "utf8";
  /** 用户在前端选择的文件用途；若为空，则按文件类型 + schema 启发推断 */
  role?: UploadedFile["role"];
}

const MAX_ROWS = 5000;

export async function parseUploadedFile(input: ParseInput): Promise<ParsedUpload> {
  const id = `f_${Math.random().toString(36).slice(2, 10)}`;
  const ext = input.name.toLowerCase().split(".").pop() ?? "";

  // -------------------------------------------------------------------------
  // 文本文件：txt / md / log / json
  // -------------------------------------------------------------------------
  if (
    isLikelyTextFile(ext, input.type) ||
    ["txt", "md", "markdown", "log", "json"].includes(ext)
  ) {
    const text = resolveText(input);
    return {
      file: makeFile(id, input, capText(text), inferTextRole(input))
    };
  }

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------
  if (ext === "csv") {
    const text = resolveText(input);
    const allRows = parseCsvText(text);
    return buildTabularResult(id, input, allRows);
  }

  // -------------------------------------------------------------------------
  // Excel
  // -------------------------------------------------------------------------
  if (ext === "xls" || ext === "xlsx") {
    const buf = resolveArrayBuffer(input);
    const detail = parseExcelDetailed(buf);
    return buildTabularResult(id, input, detail.rows, detail);
  }

  // -------------------------------------------------------------------------
  // PDF —— 优先走 pdfjs-dist；未安装 / 解析失败时退回到 latin1 朴素抽取
  // -------------------------------------------------------------------------
  if (ext === "pdf") {
    const buf = resolveArrayBuffer(input);
    const txt = await extractPdfText(buf);
    return {
      file: makeFile(
        id,
        input,
        txt ||
          "[未能从该 PDF 中抽取出文本：可能是扫描件或字体子集导致 CMap 缺失。请改上传 txt/md 或先用 OCR 转文本]",
        input.role ?? "rule_doc"
      )
    };
  }

  // -------------------------------------------------------------------------
  // 图片：作业页面截图 / 商品图等
  // -------------------------------------------------------------------------
  if (input.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    const inlineLimit = 5 * 1024 * 1024;
    let url: string | undefined;
    if (input.size <= inlineLimit) {
      const b64 = resolveBase64(input);
      if (b64) url = `data:${input.type || `image/${ext}`};base64,${b64}`;
    }
    return {
      file: {
        id,
        name: input.name,
        type: input.type || `image/${ext}`,
        size: input.size,
        role: input.role ?? "screenshot",
        url
      }
    };
  }

  // -------------------------------------------------------------------------
  // Fallback：当作纯文本
  // -------------------------------------------------------------------------
  const text = resolveText(input);
  return { file: makeFile(id, input, capText(text), input.role ?? "other") };
}

// =============================================================================
// 通用：表格类文件统一处理
// =============================================================================

function buildTabularResult(
  id: string,
  input: ParseInput,
  allRows: Record<string, any>[],
  excelDetail?: ParsedExcel
): ParsedUpload {
  const totalRows = allRows.length;
  const rows = allRows.length > MAX_ROWS ? allRows.slice(0, MAX_ROWS) : allRows;

  // 用户显式指定了 role：以 role 为准
  // 否则按 schema 启发判断；可同时命中多类（一张表里同时有历史标签 + 机审结果是允许的）
  const role: UploadedFile["role"] = input.role ?? inferTabularRole(rows);
  const file = makeFile(id, input, summarizeRows(rows, totalRows, excelDetail), role);

  const result: ParsedUpload = {
    file,
    rows,
    truncated: totalRows > MAX_ROWS,
    totalRows
  };

  // role 优先：明确角色时只生成对应数据
  if (role === "sample_data") {
    // 即便 rowsToSamples 内部 filter 掉了一些（比如全空行），也保底用 rows 数量
    const samples = rowsToSamples(rows);
    result.samples = samples.length > 0 ? samples : fallbackSamples(rows);
  } else if (role === "historical_labels") {
    result.historicalLabels = rowsToHistoricalLabels(rows);
  } else if (role === "quality_results") {
    result.qualityResults = rowsToQualityResults(rows);
  } else if (role === "machine_audit_results") {
    result.machineAuditResults = rowsToMachineAudit(rows);
  } else {
    // 没有明确角色：按 schema 同时尝试解析
    const samples = rowsToSamples(rows);
    const hist = rowsToHistoricalLabels(rows);
    const quality = rowsToQualityResults(rows);
    const machine = rowsToMachineAudit(rows);
    if (hasSampleSchema(rows)) result.samples = samples;
    if (hasHistoricalSchema(rows) && hist.length) result.historicalLabels = hist;
    if (hasQualitySchema(rows) && quality.length) result.qualityResults = quality;
    if (hasMachineSchema(rows) && machine.length) result.machineAuditResults = machine;
    // 兜底：什么都没识别到，但有数据 → 视为样本
    if (
      !result.samples &&
      !result.historicalLabels &&
      !result.qualityResults &&
      !result.machineAuditResults &&
      rows.length > 0
    ) {
      result.samples = samples;
    }
  }
  return result;
}

// =============================================================================
// Schema 探测
// =============================================================================

function hasSampleSchema(rows: Record<string, any>[]): boolean {
  if (rows.length === 0) return false;
  const keys = new Set(Object.keys(rows[0]).map((k) => k.toLowerCase()));
  return (
    keys.has("sample_id") ||
    keys.has("id") ||
    keys.has("title") ||
    keys.has("content") ||
    keys.has("category") ||
    keys.has("product_name")
  );
}

function hasHistoricalSchema(rows: Record<string, any>[]): boolean {
  if (rows.length === 0) return false;
  const keys = new Set(Object.keys(rows[0]).map((k) => k.toLowerCase()));
  return (
    keys.has("historical_label") ||
    keys.has("operator") ||
    keys.has("label_time") ||
    keys.has("task_round") ||
    (keys.has("label") && (keys.has("reason") || keys.has("operator")))
  );
}

function hasQualitySchema(rows: Record<string, any>[]): boolean {
  if (rows.length === 0) return false;
  const keys = new Set(Object.keys(rows[0]).map((k) => k.toLowerCase()));
  return (
    keys.has("quality_result") ||
    keys.has("is_correct") ||
    keys.has("error_type") ||
    keys.has("quality_reason") ||
    keys.has("final_label") ||
    keys.has("reviewer")
  );
}

function hasMachineSchema(rows: Record<string, any>[]): boolean {
  if (rows.length === 0) return false;
  const keys = new Set(Object.keys(rows[0]).map((k) => k.toLowerCase()));
  return (
    keys.has("machine_label") ||
    keys.has("model_label") ||
    keys.has("confidence") ||
    keys.has("machine_confidence") ||
    keys.has("model_version") ||
    keys.has("machine_reason")
  );
}

function inferTabularRole(rows: Record<string, any>[]): UploadedFile["role"] {
  if (hasMachineSchema(rows)) return "machine_audit_results";
  if (hasQualitySchema(rows)) return "quality_results";
  if (hasHistoricalSchema(rows)) return "historical_labels";
  if (hasSampleSchema(rows)) return "sample_data";
  return "other";
}

function inferTextRole(input: ParseInput): UploadedFile["role"] {
  if (input.role) return input.role;
  const name = input.name.toLowerCase();
  if (name.includes("rule") || name.includes("规则")) return "rule_doc";
  if (name.includes("sop") || name.includes("作业") || name.includes("流程")) return "sop_doc";
  if (name.includes("training") || name.includes("培训") || name.includes("manual"))
    return "training_manual";
  return "other";
}

// =============================================================================
// 工具函数
// =============================================================================

function makeFile(
  id: string,
  input: ParseInput,
  content: string,
  role: UploadedFile["role"]
): UploadedFile {
  return {
    id,
    name: input.name,
    type: input.type,
    size: input.size,
    role,
    contentText: content
  };
}

function summarizeRows(
  rows: Record<string, any>[],
  total?: number,
  excelDetail?: ParsedExcel
): string {
  if (rows.length === 0) return "[空文件]";
  const headers = Object.keys(rows[0]).join(", ");
  const totalStr =
    total && total > rows.length ? `${total} 行（已截取前 ${rows.length} 行用于解析）` : `${rows.length} 行`;
  const sheetHint =
    excelDetail && excelDetail.sheetName
      ? `Sheet: ${excelDetail.sheetName}（从第 ${excelDetail.headerRowIndex + 1} 行识别表头）\n`
      : "";
  return `${sheetHint}共 ${totalStr}，字段: ${headers}\n\n样例: ${JSON.stringify(rows.slice(0, 2), null, 2)}`;
}

/**
 * 兜底：当 rowsToSamples 因 schema 不匹配返回 0 条时，
 * 直接把每行原样包装成 SampleRecord（保留 raw），保证「一行 = 一条」
 */
function fallbackSamples(rows: Record<string, any>[]): SampleRecord[] {
  return rows.map((r, i) => ({
    id: `sample_${String(i + 1).padStart(4, "0")}`,
    raw: r
  }));
}

function capText(s: string, max = 200_000): string {
  return s.length > max ? s.slice(0, max) + `\n[...已截断，原文 ${s.length} 字符]` : s;
}

function resolveText(input: ParseInput): string {
  if (typeof input.text === "string") return input.text;
  if (input.data === undefined) return "";
  if (input.encoding === "utf8") return input.data;
  return decodeBase64ToUtf8(input.data);
}

function resolveArrayBuffer(input: ParseInput): ArrayBuffer {
  if (input.buffer) {
    const b = input.buffer;
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  if (input.data) {
    const buf = Buffer.from(input.data, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  return new ArrayBuffer(0);
}

function resolveBase64(input: ParseInput): string {
  if (input.buffer) return input.buffer.toString("base64");
  if (input.encoding === "base64" && input.data) return input.data;
  return "";
}

function decodeBase64ToUtf8(b64: string): string {
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}
