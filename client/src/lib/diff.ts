import type { SchemeVersion, TalentLayer, TalentOption } from "@/data/types";
import { talentSetLabel, talentSetsOf } from "@/lib/talentSets";

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
  /** icon：只换了图标，内容和名称都没变 */
  kind: "added" | "removed" | "changed" | "renamed" | "icon";
  oldName?: string;
  /** 换了图标时，原来的图标编号（游戏里也要跟着换） */
  iconFrom?: number;
  ops: DiffOp[];
}

export interface TalentChange {
  layer: number;
  from?: TalentOption;
  to: TalentOption;
  /** 有多套时：这一处是哪一套（显示名）。只有一套时不写 */
  set?: string;
  /** 有多套时：这一套的 id，显示时按套分组 */
  setId?: string;
}

/** 整套的变化：新增、删除、改名。层的变化在 TalentChange 里 */
export interface TalentSetChange {
  setId: string;
  kind: "added" | "removed" | "renamed";
  /** 显示名：新增、改名是新名字，删除是原来的名字 */
  name: string;
  /** 改名前的名字 */
  oldName?: string;
  /** 新增的一套：9 层选了什么 */
  picks?: TalentOption[];
}

export interface SchemeDiff {
  macros: MacroChange[];
  talents: TalentChange[];
  talentSets: TalentSetChange[];
  total: number;
}

export function talentAt(
  layers: TalentLayer[],
  layerIndex: number,
  pos: number
) {
  return layers[layerIndex]?.options.find(o => o.pos === pos);
}

function diffLayers(
  oldT: number[] | undefined,
  newT: number[],
  layers: TalentLayer[],
  set?: { id: string; name: string }
): TalentChange[] {
  const out: TalentChange[] = [];
  newT.forEach((pos, i) => {
    const prevPos = oldT?.[i];
    if (prevPos === pos) return;
    const to = talentAt(layers, i, pos);
    if (!to) return;
    out.push({
      layer: i + 1,
      from: prevPos ? talentAt(layers, i, prevPos) : undefined,
      to,
      ...(set ? { set: set.name, setId: set.id } : {}),
    });
  });
  return out;
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
    const iconFrom = prev.icon !== m.icon ? prev.icon : undefined;
    if (contentChanged) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "changed",
        oldName: prev.name,
        iconFrom,
        ops,
      });
    } else if (prev.name !== m.name) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "renamed",
        oldName: prev.name,
        iconFrom,
        ops: [],
      });
    } else if (iconFrom !== undefined) {
      macros.push({
        macroId: m.id,
        name: m.name,
        kind: "icon",
        iconFrom,
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

  // 奇穴：按套比较。只有一套时和以前一样，不写套名
  const oldSets = oldV ? talentSetsOf(oldV) : [];
  const newSets = talentSetsOf(newV);
  const multi = oldSets.length > 1 || newSets.length > 1;
  const talents: TalentChange[] = [];
  const talentSets: TalentSetChange[] = [];
  newSets.forEach((s, i) => {
    const label = talentSetLabel(s, i);
    const prevIndex = oldSets.findIndex(o => o.id === s.id);
    const prev = prevIndex >= 0 ? oldSets[prevIndex] : undefined;
    // 第一套在第一个版本里一层一层列出来；后加的一套整套算新增
    if (!prev && i > 0) {
      talentSets.push({
        setId: s.id,
        kind: "added",
        name: label,
        picks: s.talents.flatMap((pos, k) => {
          const o = talentAt(layers, k, pos);
          return o ? [o] : [];
        }),
      });
      return;
    }
    // 没起名的套按顺序叫「第几套」，前面删了一套顺序会变，不算改名
    if (prev && prev.name.trim() !== s.name.trim()) {
      talentSets.push({
        setId: s.id,
        kind: "renamed",
        name: label,
        oldName: talentSetLabel(prev, prevIndex),
      });
    }
    talents.push(
      ...diffLayers(
        prev?.talents,
        s.talents,
        layers,
        multi ? { id: s.id, name: label } : undefined
      )
    );
  });
  oldSets.forEach((o, i) => {
    if (newSets.some(s => s.id === o.id)) return;
    talentSets.push({
      setId: o.id,
      kind: "removed",
      name: talentSetLabel(o, i),
    });
  });

  return {
    macros,
    talents,
    talentSets,
    total: macros.length + talents.length + talentSets.length,
  };
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

/** 游戏里要不要跟着改：只改备注或奇穴套的名字不用 */
export function hasGameChange(d: SchemeDiff): boolean {
  return d.total > d.talentSets.filter(c => c.kind === "renamed").length;
}
