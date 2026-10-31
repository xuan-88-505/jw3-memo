/**
 * 管理窗口和面板各有一份数据，都会整份写 data.json。联网后，一个窗口用旧数据
 * 盖掉另一个窗口刚拉到的亲友团改动，同步层会把旧内容当成本机改动推上服务器。
 *
 * 所以收到另一个窗口的文件时，如果本窗口还有没写进文件的改动，按条目三方合并：
 * base = 本窗口上次读到或写入的文件，mine = 本窗口现在的数据，theirs = 文件里的新数据。
 * 只有本窗口改过的条目保留本窗口的，其余都用文件里的。
 */
import { stableJson } from "./mapping";

type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

const isIdList = (v: unknown): v is { id: string }[] =>
  Array.isArray(v) &&
  v.every(x => !!x && typeof x === "object" && typeof (x as Obj).id === "string");

const isRecord = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);

function mergeList(base: { id: string }[], mine: { id: string }[], theirs: { id: string }[]) {
  const B = new Map(base.map(x => [x.id, x]));
  const M = new Map(mine.map(x => [x.id, x]));
  const out: { id: string }[] = [];
  const seen = new Set<string>();
  for (const t of theirs) {
    seen.add(t.id);
    const b = B.get(t.id);
    const m = M.get(t.id);
    if (m === undefined) {
      // 本窗口删了：对方没改过就删，对方改过就留对方的
      if (b !== undefined && same(b, t)) continue;
      out.push(t);
    } else out.push(b !== undefined && same(m, b) ? t : m);
  }
  for (const m of mine) {
    if (seen.has(m.id)) continue;
    const b = B.get(m.id);
    // 对方删了：本窗口没改过就跟着删
    if (b !== undefined && same(m, b)) continue;
    out.push(m);
  }
  return out;
}

function mergeRecord(base: Obj, mine: Obj, theirs: Obj) {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const b = base[k];
    const m = mine[k];
    const t = theirs[k];
    if (m === undefined) {
      if (t === undefined || (b !== undefined && same(b, t))) continue;
      out[k] = t;
    } else if (t === undefined) {
      if (b !== undefined && same(m, b)) continue;
      out[k] = m;
    } else out[k] = b !== undefined && same(m, b) ? t : m;
  }
  return out;
}

/** 按字段合并；条目列表（有 id 的数组）和配装、便签按条目合并 */
export function mergePersisted(
  base: Obj,
  mine: Obj,
  theirs: Obj,
  recordKeys: ReadonlySet<string>
): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const b = base[k];
    const m = mine[k];
    const t = theirs[k];
    if (!(k in mine)) out[k] = t;
    else if (!(k in theirs)) out[k] = m;
    else if (isIdList(m) && isIdList(t))
      out[k] = mergeList(isIdList(b) ? b : [], m, t);
    else if (recordKeys.has(k) && isRecord(m) && isRecord(t))
      out[k] = mergeRecord(isRecord(b) ? b : {}, m, t);
    else out[k] = same(m, b) ? t : m;
  }
  return out;
}
