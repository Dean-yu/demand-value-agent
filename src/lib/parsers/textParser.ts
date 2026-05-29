// =============================================================================
// 文本相关辅助：PDF 文本抽取（pdfjs-dist 主路径 + latin1 兜底）+ 文本 MIME 判断
// =============================================================================

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "log",
  "json",
  "yaml",
  "yml",
  "html",
  "htm",
  "csv"
]);

export function isLikelyTextFile(ext: string, mime: string): boolean {
  if (TEXT_EXTS.has(ext)) return true;
  if (!mime) return false;
  return mime.startsWith("text/") || mime === "application/json";
}

/**
 * PDF 文本抽取：
 *  - 主路径：动态加载 pdfjs-dist（Mozilla 官方），能解压 FlateDecode 流、解析
 *    BT/ET 文本块、按 ToUnicode CMap 还原 CJK 字符。
 *  - 兜底：未装 pdfjs-dist / 抛错时，退回到 latin1 + `(...)` 正则的朴素抽取，
 *    至少保证不会让整个 fileParser 失败。
 *
 *  设计目标：装了依赖就用，没装也不报错。
 */
const PDF_TEXT_CHAR_LIMIT = 200_000;

export async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const viaPdfjs = await extractPdfTextViaPdfjs(buf);
  if (viaPdfjs && viaPdfjs.trim().length > 0) {
    return viaPdfjs.length > PDF_TEXT_CHAR_LIMIT
      ? viaPdfjs.slice(0, PDF_TEXT_CHAR_LIMIT) + `\n[...已截断，原文 ${viaPdfjs.length} 字符]`
      : viaPdfjs;
  }
  return extractPdfTextLatin1Fallback(buf);
}

/**
 * pdfjs-dist 主路径。
 * 没装 / 加载失败 / 解析失败 → 返回空串，让上层走 latin1 兜底。
 */
async function extractPdfTextViaPdfjs(buf: ArrayBuffer): Promise<string> {
  try {
    // 动态 import：装了就用，没装会 throw "Cannot find module"，被外层 catch。
    // 用 legacy/build/pdf.mjs 是为了在 Node.js 18+ 服务端能跑（不依赖浏览器 worker）。
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs" as any).catch(
      async () => await import("pdfjs-dist" as any)
    );
    const getDocument = pdfjs.getDocument ?? pdfjs.default?.getDocument;
    if (typeof getDocument !== "function") return "";

    const data = new Uint8Array(buf);
    const loadingTask = getDocument({
      data,
      // 服务端不需要字体渲染；关掉避免找不到字体报错
      disableFontFace: true,
      useSystemFonts: false,
      // 静默 pdfjs 自身日志，避免 Next dev 控制台被刷屏
      verbosity: 0,
      isEvalSupported: false
    });
    const doc = await loadingTask.promise;

    const pages: string[] = [];
    const maxPages = Math.min(doc.numPages, 200); // 200 页封顶，防止异常大文件
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // items 里每个元素是 { str, hasEOL, ... }
      // 用空格连，行尾保留换行，便于后续按段落 / 表格被 skill 读取
      const text = (content.items as any[])
        .map((it) => {
          if (typeof it?.str !== "string") return "";
          return it.str + (it.hasEOL ? "\n" : "");
        })
        .join("");
      pages.push(text);
      // 释放页对象，降低长 PDF 的内存占用
      try {
        page.cleanup();
      } catch {
        /* ignore */
      }
    }
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* ignore */
    }

    return pages.join("\n\n").trim();
  } catch {
    return "";
  }
}

/**
 * 老的 latin1 朴素抽取：直接 latin1 解码并扫描 `(...)` 内容串。
 * 仅在 pdfjs 不可用 / 完全没抽到内容时作为最后兜底，多数现代 PDF 会输出乱码或空串。
 */
function extractPdfTextLatin1Fallback(buf: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buf);
    const decoder = new TextDecoder("latin1");
    const text = decoder.decode(bytes);
    const matches = text.match(/\(([^()\\]{2,})\)/g);
    if (!matches) return "";
    const joined = matches
      .map((m) => m.slice(1, -1))
      .filter((s) => /[一-龥a-zA-Z0-9]/.test(s))
      .join("\n");
    return joined.slice(0, 8000);
  } catch {
    return "";
  }
}
