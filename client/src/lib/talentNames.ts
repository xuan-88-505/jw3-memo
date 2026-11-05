/**
 * 奇穴截图读名字（客户端）：本机比图标认不出时，截图发到 /api/talent-scan（server/talentScan.ts），
 * 模型照抄选中的奇穴名字；这里在本机把名字对上心法和层。
 *
 * - 每个心法都对一遍，取对上名字最多的；同样多时先当前心法，再看截图上写着的心法名。至少对上 3 个才算。
 * - 第 1–6 层按名字所在的层；第 7–9 层共用一组选项，按出现的顺序依次填，不重复。
 * - 名字先全字对，再容一个字认错（三个字以上、长度一样）。
 */
import { layersOf } from "@/data/seed";
import { TALENTS } from "@/data/talents";
import { postScan, prepareImage } from "./gearScan";

/** 和服务器约定的结构（server/talentScan.ts） */
export interface TalentNamesResult {
  notTalent: boolean;
  xinfa: string | null;
  names: string[];
}

export interface NameMatch {
  xinfa: string;
  /** 9 层各自对上的 pos；没对上是 null */
  picks: (number | null)[];
  found: number;
}

/** 至少对上这么多个名字才算这个心法的奇穴 */
export const MIN_NAMES = 3;

/** 截图 → 服务器读出的奇穴名字 */
export async function requestTalentNames(
  src: Blob | ImageData,
  signal?: AbortSignal
) {
  const dataUrl = await prepareImage(src);
  return postScan<TalentNamesResult>("/api/talent-scan", dataUrl, signal);
}

/** 统一写法：全角转半角，去掉空白、标点和括号 */
export const normTalent = (s: string) =>
  s
    .normalize("NFKC")
    .replace(
      /[\s·・•.,，。、:：;；!！?？'"“”‘’()（）[\]【】「」『』<>《》]/g,
      ""
    );

/** 容一个字认错：三个字以上、长度一样、只差一个字 */
function nearly(a: string, b: string) {
  const A = Array.from(a);
  const B = Array.from(b);
  if (A.length < 3 || A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i] && ++d > 1) return false;
  return true;
}

/** 按名字给这个心法的 9 层选上；没对上的层是 null */
export function picksByNames(xinfa: string, names: string[]) {
  const layers = layersOf(xinfa);
  const picks: (number | null)[] = Array.from({ length: 9 }, () => null);
  const opts = layers.map(l =>
    (l.options ?? []).map(o => ({ pos: o.pos, key: normTalent(o.name) }))
  );
  const sharedIdx = layers.flatMap((l, i) => (l.shared ? [i] : []));
  const usedShared = (pos: number) => sharedIdx.some(j => picks[j] === pos);
  const place = (n: string, same: (a: string, b: string) => boolean) => {
    for (let i = 0; i < Math.min(layers.length, 9); i++) {
      if (picks[i] !== null) continue;
      const o = opts[i].find(
        o => same(o.key, n) && !(layers[i].shared && usedShared(o.pos))
      );
      if (o) {
        picks[i] = o.pos;
        return true;
      }
    }
    return false;
  };
  for (const raw of names) {
    const n = normTalent(raw);
    if (!n) continue;
    if (!place(n, (a, b) => a === b)) place(n, nearly);
  }
  return { picks, found: picks.filter(p => p !== null).length };
}

/**
 * 在这些心法里找名字对上最多的；对上不到 MIN_NAMES 个返回 null。
 * current：同样多时优先；hint：截图上写着的心法名，其次优先。
 */
export function matchTalentNames(
  names: string[],
  {
    current,
    hint,
    among = Object.keys(TALENTS),
  }: { current: string; hint?: string | null; among?: string[] }
): NameMatch | null {
  const hintKey = hint ? normTalent(hint) : "";
  const rank = (xf: string, found: number) =>
    found * 4 + (xf === current ? 2 : 0) + (hintKey && xf === hintKey ? 1 : 0);
  let best: NameMatch | null = null;
  let bestRank = -1;
  for (const xf of new Set([current, ...among])) {
    if (!layersOf(xf).length) continue;
    const r = picksByNames(xf, names);
    const k = rank(xf, r.found);
    if (k > bestRank) {
      best = { xinfa: xf, ...r };
      bestRank = k;
    }
  }
  return best && best.found >= MIN_NAMES ? best : null;
}
