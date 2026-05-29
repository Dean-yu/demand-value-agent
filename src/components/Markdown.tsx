"use client";

import { Fragment, ReactNode } from "react";

/**
 * Tiny markdown renderer for the subset our reports use:
 * - # / ## / ### headings
 * - paragraphs
 * - unordered (- / *) and ordered (1.) lists
 * - GFM tables (| col | col |)
 * - **bold**, *italic*, `code`, [text](url)
 * - > blockquote
 * - --- horizontal rule
 *
 * This avoids pulling react-markdown over the network for the Demo.
 */
export default function Markdown({ children }: { children: string }) {
  const blocks = parseBlocks(children ?? "");
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={i}>{renderBlock(b, i)}</Fragment>
      ))}
    </>
  );
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "hr" }
  | { kind: "blockquote"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      const parts = [bq[1]];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        parts.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "blockquote", text: parts.join("\n") });
      continue;
    }

    // GFM table: header line, separator line, body lines
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|\s*$/.test(lines[i + 1])) {
      const head = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    // Lists — accumulate consecutive list items, allowing 2-space indented continuation
    const ulMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const um = cur.match(/^(\s*)([-*])\s+(.*)$/);
        const om = cur.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (!ordered && um) {
          items.push(um[3]);
          i++;
        } else if (ordered && om) {
          items.push(om[3]);
          i++;
        } else if (/^\s{2,}\S/.test(cur) && items.length > 0) {
          // continuation indent → append to previous item
          items[items.length - 1] += "\n" + cur.trim();
          i++;
        } else {
          break;
        }
      }
      blocks.push(ordered ? { kind: "ol", items } : { kind: "ul", items });
      continue;
    }

    // Paragraph: gather until blank line or block-start
    const para = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: para.join("\n") });
  }
  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)([-*])\s+/.test(line) ||
    /^(\s*)\d+\.\s+/.test(line) ||
    /^---+\s*$/.test(line) ||
    /^\|.*\|\s*$/.test(line)
  );
}

function splitTableRow(line: string): string[] {
  // remove leading | and trailing |, split on |, trim
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((s) => s.trim());
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.kind) {
    case "heading":
      if (b.level === 1) return <h1 key={key}>{inline(b.text)}</h1>;
      if (b.level === 2) return <h2 key={key}>{inline(b.text)}</h2>;
      return <h3 key={key}>{inline(b.text)}</h3>;
    case "p":
      return <p key={key}>{inline(b.text)}</p>;
    case "ul":
      return (
        <ul key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      );
    case "hr":
      return <hr key={key} />;
    case "blockquote":
      return <blockquote key={key}>{inline(b.text)}</blockquote>;
    case "table":
      return (
        <table key={key}>
          <thead>
            <tr>
              {b.head.map((h, i) => (
                <th key={i}>{inline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

// Inline parser: **bold**, *italic*, `code`, [text](url), and plain text.
function inline(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(src)) !== null) {
    if (m.index > lastIndex) {
      out.push(textOf(src.slice(lastIndex, m.index), i++));
    }
    if (m[2]) out.push(<strong key={i++}>{m[2]}</strong>);
    else if (m[4]) out.push(<em key={i++}>{m[4]}</em>);
    else if (m[6]) out.push(<code key={i++}>{m[6]}</code>);
    else if (m[7]) out.push(
      <a key={i++} href={m[9]} target="_blank" rel="noreferrer">
        {m[8]}
      </a>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < src.length) {
    out.push(textOf(src.slice(lastIndex), i++));
  }
  return out;
}

function textOf(s: string, key: number): ReactNode {
  // Preserve single-newline as <br /> within a block
  if (!s.includes("\n")) return <Fragment key={key}>{s}</Fragment>;
  const parts = s.split("\n");
  return (
    <Fragment key={key}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <br />}
        </Fragment>
      ))}
    </Fragment>
  );
}
