import * as XLSX from "xlsx";

export interface ParsedExcel {
  rows: Record<string, any>[];
  /** 实际使用的 sheet 名 */
  sheetName: string;
  /** 自动探测出的表头行号（0-based，原 sheet 行号） */
  headerRowIndex: number;
  /** 用到的表头字段 */
  headers: string[];
  /** 原 sheet 总行数（含标题/空白行） */
  rawRowCount: number;
}

/**
 * Excel 解析（鲁棒版）：
 *  1. 扫所有 sheet，挑"识别后行数最多"的那个（很多业务表会把目录/封面放 sheet 0）
 *  2. 在选中的 sheet 里探测 header 行：跳过前 5 行内的空行 / 单列标题行，
 *     首个 ≥2 个非空 cell 的行即为 header
 *  3. trim 表头空白；把 header 行之后的每行映射成对象返回
 *  4. 完全空的行（所有字段都是 ""）会被丢弃
 */
export function parseExcelBuffer(buf: ArrayBuffer): Record<string, any>[] {
  return parseExcelDetailed(buf).rows;
}

export function parseExcelDetailed(buf: ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) {
    return { rows: [], sheetName: "", headerRowIndex: -1, headers: [], rawRowCount: 0 };
  }

  // 1) 选 sheet：挑解析后行数最多的（用浅尝即止：sheet_to_json 默认 header 模式）
  let best: ParsedExcel = {
    rows: [],
    sheetName: sheetNames[0],
    headerRowIndex: -1,
    headers: [],
    rawRowCount: 0
  };
  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const detail = parseOneSheet(ws, name);
    if (detail.rows.length > best.rows.length) {
      best = detail;
    }
  }
  return best;
}

function parseOneSheet(ws: XLSX.WorkSheet, sheetName: string): ParsedExcel {
  // 用 header:1 拿到二维数组，自己探测 header 行
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  const rawRowCount = matrix.length;
  if (rawRowCount === 0) {
    return { rows: [], sheetName, headerRowIndex: -1, headers: [], rawRowCount: 0 };
  }

  // 探测 header 行：前 8 行内找第一个 ≥2 非空 cell 的行
  const SCAN_LIMIT = Math.min(8, matrix.length);
  let headerIdx = 0;
  for (let i = 0; i < SCAN_LIMIT; i++) {
    const nonEmpty = matrix[i].filter((c) => normalize(c) !== "").length;
    if (nonEmpty >= 2) {
      headerIdx = i;
      break;
    }
  }

  const headersRaw = matrix[headerIdx] ?? [];
  const headers = headersRaw.map((h, i) => {
    const s = normalize(h);
    return s || `col_${i + 1}`;
  });

  // header 之后的所有数据行
  const rows: Record<string, any>[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const obj: Record<string, any> = {};
    let anyValue = false;
    headers.forEach((h, idx) => {
      const v = normalize(row[idx]);
      obj[h] = v;
      if (v !== "") anyValue = true;
    });
    if (anyValue) rows.push(obj);
  }

  return {
    rows,
    sheetName,
    headerRowIndex: headerIdx,
    headers,
    rawRowCount
  };
}

function normalize(v: any): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}
