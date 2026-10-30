import { tx } from "@/lib/i18n";
// 宏清洗和检查。
// 规则来源：
// - 魔盒云端宏要求无注释、无空行。
// - 官方说明：每个宏不超过 128 个字符，符号要用英文输入法输入。
//   2026-10 的真实宏全部在 128 字符以内（含换行），说明上限仍然有效。

export const MACRO_LIMIT = 128;

export interface CleanResult {
  text: string;
  comments: number;
  blanks: number;
  length: number;
}

export function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("#");
}

export function cleanMacro(content: string): CleanResult {
  const kept: string[] = [];
  let comments = 0;
  let blanks = 0;
  for (const raw of content.split(/\r?\n/)) {
    if (raw.trim() === "") {
      blanks += 1;
      continue;
    }
    if (isCommentLine(raw)) {
      comments += 1;
      continue;
    }
    kept.push(raw.replace(/\s+$/, ""));
  }
  const text = kept.join("\n");
  return { text, comments, blanks, length: text.length };
}

/** 去掉注释和空行后的有效行数 */
export function lineCount(content: string): number {
  const { text } = cleanMacro(content);
  return text === "" ? 0 : text.split("\n").length;
}

export type LintLevel = "info" | "warn" | "error";

export interface LintItem {
  level: LintLevel;
  text: string;
}

// 游戏里不认的中文符号
const FULL_WIDTH = /[：｜＆（）［］＜＞＝！，；]/;

export function lintMacro(content: string): LintItem[] {
  const items: LintItem[] = [];
  const result = cleanMacro(content);

  if (result.text === "") {
    items.push({ level: "error", text: tx("宏是空的") });
    return items;
  }

  if (result.length > MACRO_LIMIT) {
    items.push({
      level: "error",
      text: tx(
        "去掉注释后有 {0} 个字符，超过游戏上限 {1}",
        result.length,
        MACRO_LIMIT
      ),
    });
  }

  content.split(/\r?\n/).forEach((line, i) => {
    if (isCommentLine(line) || line.trim() === "") return;
    const m = line.match(FULL_WIDTH);
    if (m) {
      items.push({
        level: "warn",
        text: tx("第 {0} 行有中文符号「{1}」，游戏里不认", i + 1, m[0]),
      });
    }
    if (!line.trim().startsWith("/")) {
      items.push({
        level: "warn",
        text: tx("第 {0} 行没有以 / 开头，可能不是宏命令", i + 1),
      });
    }
  });

  const removed: string[] = [];
  if (result.comments) removed.push(tx("{0} 行注释", result.comments));
  if (result.blanks) removed.push(tx("{0} 行空行", result.blanks));
  if (removed.length) {
    items.push({
      level: "info",
      text: tx("复制时会去掉 {0}", removed.join("、")),
    });
  }
  return items;
}
