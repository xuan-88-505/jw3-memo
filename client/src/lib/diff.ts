import type { SchemeVersion, TalentLayer, TalentOption } from "@/data/types";

export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** 按行比较（最长公共子序列） */
export function lineDiff(oldText: string, newText: string): DiffOp[] {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: a[i++] });
  while (j < m) ops.push({ type: "add", text: b[j++] });
  return ops;
}

export interface MacroChange {
  macroId: string;
  name: string;
  kind: "added" | "removed" | "changed" | "renamed";
  oldName?: string;
  ops: DiffOp[];
}

export interface TalentChange {
  layer: number;
  from?: TalentOption;
  to: TalentOption;
}

export interface SchemeDiff {
  macros: MacroChange[];
  talents: TalentChange[];
  total: number;
}

export function talentAt(
  layers: TalentLayer[],
  layerIndex: number,
  pos: number
) {
  return layers[layerIndex]?.options.find(o => o.pos === pos);
}

/** 比较两个版本。oldV 为空表示从没同步过，所有内容都算新增。 */
export function diffVersions(
  oldV: SchemeVersion | undefined,
  newV: SchemeVersion,
  layers: TalentLayer[]
): SchemeDiff {
  const macros: MacroChange[] = [];
  const oldMap = new Map((oldV?.macros ?? []).map(m => [m.id, m]));
  const newIds = new Set(newV.macros.map(m => m.id));

  for (const m of newV.macros) {
    const prev = oldMap.get(m.id);
    if (!prev) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "added",
        ops: lineDiff("", m.content),
      });
      continue;
    }
    const ops = lineDiff(prev.content, m.content);
    const contentChanged = ops.some(o => o.type !== "same");
    if (contentChanged) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "changed",
        oldName: prev.name,
        ops,
      });
    } else if (prev.name !== m.name) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "renamed",
        oldName: prev.name,
        ops: [],
      });
    }
  }
  for (const m of oldV?.macros ?? []) {
    if (!newIds.has(m.id)) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "removed",
        ops: lineDiff(m.content, ""),
      });
    }
  }

  const talents: TalentChange[] = [];
  newV.talents.forEach((pos, i) => {
    const prevPos = oldV?.talents[i];
    if (prevPos === pos) return;
    const to = talentAt(layers, i, pos);
    if (!to) return;
    talents.push({
      layer: i + 1,
      from: prevPos ? talentAt(layers, i, prevPos) : undefined,
      to,
    });
  });

  return { macros, talents, total: macros.length + talents.length };
}

/** 某个宏的哪些行是新的（用于高亮） */
export function changedLines(
  oldContent: string | undefined,
  newContent: string
): Set<number> {
  const result = new Set<number>();
  if (oldContent === undefined) return result;
  let idx = 0;
  for (const op of lineDiff(oldContent, newContent)) {
    if (op.type === "del") continue;
    if (op.type === "add") result.add(idx);
    idx++;
  }
  return result;
}
