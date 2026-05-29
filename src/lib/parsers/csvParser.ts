import type {
  HistoricalLabelRecord,
  MachineAuditRecord,
  QualityResultRecord,
  SampleRecord
} from "../agent/types";

/**
 * 简易 CSV parser，支持双引号包裹（含转义 ""）、CRLF/LF、首行表头。Demo 级别足够用。
 */
export function parseCsvText(text: string): Record<string, any>[] {
  if (!text) return [];
  const rows = parseRows(stripBom(text));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === "") continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    out.push(obj);
  }
  return out;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // handled by \n branch
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// =============================================================================
// 中文 / 英文表头别名表
// =============================================================================
// 同一字段 → 业务表里可能写法。lookup 时大小写不敏感，trim 后比对。
// 顺序代表优先级（左边优先）

const HEADER_ALIASES = {
  id: ["sample_id", "sampleid", "id", "样本id", "样本编号", "编号", "序号", "数据id", "记录id"],
  category: [
    "category",
    "product_category",
    "cat",
    "类目",
    "类别",
    "品类",
    "分类",
    "一级类目",
    "二级类目",
    "行业类目"
  ],
  label: [
    "label",
    "gold_label",
    "标签",
    "金标签",
    "标注结果",
    "结论",
    "判定",
    "判定结果",
    "答案",
    "类别标签"
  ],
  riskType: ["risk_type", "risk", "风险类型", "风险", "异常类型", "异常"],
  difficulty: ["difficulty", "difficulty_hint", "难度", "难度等级", "难度提示"],
  historicalLabel: [
    "historical_label",
    "历史标签",
    "历史标注",
    "原标签",
    "原标注",
    "一标结果",
    "一标"
  ],
  reason: ["reason", "historical_reason", "原因", "标注原因", "说明", "备注"],
  operator: ["operator", "标注员", "作业员", "操作人", "标注人"],
  labelTime: ["label_time", "timestamp", "标注时间", "时间", "提交时间"],
  taskRound: ["task_round", "round", "标注轮次", "标注阶段", "轮次", "阶段"],
  originalLabel: ["original_label", "原标签", "原标注", "原始标签"],
  finalLabel: ["final_label", "quality_final_label", "终审标签", "终审结果", "最终标签", "最终结果"],
  isCorrect: ["is_correct", "quality_result", "是否正确", "质检结果", "对错", "正确性"],
  errorType: ["error_type", "error_reason", "错误类型", "错误分类", "错因"],
  qualityReason: ["quality_reason", "质检原因", "质检说明", "质检备注"],
  reviewer: ["reviewer", "终审人", "复审人", "质检员"],
  machineLabel: ["machine_label", "model_label", "机审标签", "模型标签", "ai标签", "ai判定"],
  confidence: ["confidence", "machine_confidence", "置信度", "score", "得分"],
  modelVersion: ["model_version", "模型版本"],
  machineReason: ["machine_reason", "机审原因", "模型说明"],
  isHitRule: ["is_hit_rule", "命中规则", "是否命中规则"],
  historicalAgreement: ["historical_agreement", "历史一致", "与历史一致"]
} as const;

/** 在 row 中按别名顺序找第一个非空值；大小写 / trim 不敏感 */
function lookup(row: Record<string, any>, aliases: readonly string[]): any {
  // 把 row 的 key 全部 lower+trim 化做一次索引，找到了直接取
  const keyMap = new Map<string, string>();
  for (const k of Object.keys(row)) {
    keyMap.set(k.toLowerCase().trim(), k);
  }
  for (const a of aliases) {
    const realKey = keyMap.get(a.toLowerCase().trim());
    if (realKey === undefined) continue;
    const v = row[realKey];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

// =============================================================================
// 行 → 各种业务记录的转换
// =============================================================================

export function rowsToSamples(rows: Record<string, any>[]): SampleRecord[] {
  // 不再过滤：每一行都映射成一个 SampleRecord，即便字段全空也保留（id 自动生成 + raw 保留原行）
  return rows.map((r, i) => ({
    id: String(lookup(r, HEADER_ALIASES.id) ?? `sample_${String(i + 1).padStart(4, "0")}`),
    raw: r,
    category: pickStr(lookup(r, HEADER_ALIASES.category)),
    label: pickStr(lookup(r, HEADER_ALIASES.label)),
    riskType: pickStr(lookup(r, HEADER_ALIASES.riskType)),
    difficultyHint: parseDifficulty(lookup(r, HEADER_ALIASES.difficulty))
  }));
}

export function rowsToHistoricalLabels(
  rows: Record<string, any>[]
): HistoricalLabelRecord[] {
  return rows
    .map((r) => ({
      sampleId: String(lookup(r, HEADER_ALIASES.id) ?? ""),
      label: String(
        lookup(r, HEADER_ALIASES.historicalLabel) ??
          lookup(r, HEADER_ALIASES.label) ??
          ""
      ),
      reason: pickStr(lookup(r, HEADER_ALIASES.reason)),
      operator: pickStr(lookup(r, HEADER_ALIASES.operator)),
      labelTime: pickStr(lookup(r, HEADER_ALIASES.labelTime)),
      taskRound: parseRound(lookup(r, HEADER_ALIASES.taskRound))
    }))
    .filter((x) => x.sampleId && x.label);
}

export function rowsToQualityResults(
  rows: Record<string, any>[]
): QualityResultRecord[] {
  return rows
    .map((r) => ({
      sampleId: String(lookup(r, HEADER_ALIASES.id) ?? ""),
      originalLabel: pickStr(
        lookup(r, HEADER_ALIASES.originalLabel) ??
          lookup(r, HEADER_ALIASES.historicalLabel) ??
          lookup(r, HEADER_ALIASES.label)
      ),
      finalLabel: pickStr(lookup(r, HEADER_ALIASES.finalLabel)),
      isCorrect: parseBool(lookup(r, HEADER_ALIASES.isCorrect)),
      errorType: pickStr(lookup(r, HEADER_ALIASES.errorType)),
      qualityReason: pickStr(lookup(r, HEADER_ALIASES.qualityReason)),
      reviewer: pickStr(lookup(r, HEADER_ALIASES.reviewer))
    }))
    .filter((x) => x.sampleId);
}

export function rowsToMachineAudit(
  rows: Record<string, any>[]
): MachineAuditRecord[] {
  return rows
    .map((r) => ({
      sampleId: String(lookup(r, HEADER_ALIASES.id) ?? ""),
      machineLabel: String(lookup(r, HEADER_ALIASES.machineLabel) ?? ""),
      confidence: parseFloatSafe(lookup(r, HEADER_ALIASES.confidence)),
      modelVersion: pickStr(lookup(r, HEADER_ALIASES.modelVersion)),
      machineReason: pickStr(lookup(r, HEADER_ALIASES.machineReason)),
      isHitRule: parseBool(lookup(r, HEADER_ALIASES.isHitRule)),
      historicalAgreement: parseBool(lookup(r, HEADER_ALIASES.historicalAgreement))
    }))
    .filter((x) => x.sampleId && x.machineLabel);
}

// -----------------------------------------------------------------------------

function pickStr(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function parseDifficulty(v: any): SampleRecord["difficultyHint"] {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "easy" || s === "简单") return "easy";
  if (s === "medium" || s === "中等") return "medium";
  if (s === "hard" || s === "困难" || s === "hard_case") return "hard";
  return "unknown";
}

function parseRound(v: any): HistoricalLabelRecord["taskRound"] {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "first" || s === "first_label" || s === "一标") return "first_label";
  if (s === "second" || s === "second_label" || s === "二标") return "second_label";
  if (s === "final" || s === "final_review" || s === "终审") return "final_review";
  return "unknown";
}

function parseBool(v: any): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "yes", "y", "正确", "通过", "对"].includes(s)) return true;
  if (["false", "0", "no", "n", "错误", "不通过", "错"].includes(s)) return false;
  return undefined;
}

function parseFloatSafe(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
