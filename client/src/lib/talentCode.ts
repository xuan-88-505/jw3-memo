/**
 * 导入魔盒复制的奇穴。宏页面奇穴下面有三个按钮，复制出来的内容分别是：
 *
 * - 复制奇穴编码：`{"version":"v20261029","xf":"铁牢律","sq":"3,4,2,4,4,3,4,5,11","client":"std"}`
 * - 复制奇穴序列：`3,4,2,4,4,3,4,5,11`（只有序列，没有心法和版本）
 * - 复制奇穴文字：`号令三军,战心,列甲,崩决,疾雨,劲风,定军,力撼河山,振甲`（没选的层写「第一重」这类字）
 *
 * 序列里每个数字是这一层选的第几个（和本地数据的 `pos` 一样）；第 7–9 层用第 7 层那 12 个共用选项的编号。
 * 编码的版本和本地数据不同时，同一个编号可能是别的奇穴：先按编码的版本下载魔盒数据换成名字，再按名字对应。
 * 来源：JX3BOX/macro src/views/Single.vue（三个按钮）、JX3BOX/jx3box-talent index.js（sq 的含义）。
 */
import type { TalentLayer } from "@/data/types";

/** 本地奇穴数据（data/talents.ts）的魔盒版本 */
export const BUNDLED_TALENT_VERSION = "v20261030";

export type TalentImport =
  | {
      kind: "code";
      xf: string;
      version: string;
      sq: string[];
      /** "std" 旗舰；"origin" 怀旧服（镇派，不是奇穴） */
      client: string;
    }
  | { kind: "sq"; sq: string[] }
  | { kind: "names"; names: string[] };

/** 认不出时返回 null。只认这三种格式，别的文字一律不管 */
export function parseTalentText(raw: string): TalentImport | null {
  const text = raw.trim().replace(/^[`'"]+|[`'"]+$/g, "");
  if (!text || text.length > 2000) return null;
  // 编码：一段 JSON，至少有心法和序列
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      const o = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
      const xf = typeof o.xf === "string" ? o.xf.trim() : "";
      const sq = Array.isArray(o.sq)
        ? o.sq.map(v => String(v).trim())
        : typeof o.sq === "string"
          ? o.sq.split(",").map(v => v.trim())
          : [];
      if (xf && sq.length && sq.every(v => /^\d+$/.test(v)))
        return {
          kind: "code",
          xf,
          version: typeof o.version === "string" ? o.version.trim() : "",
          sq,
          client: typeof o.client === "string" ? o.client : "std",
        };
    } catch {
      // 不是 JSON，往下按别的格式认
    }
    return null;
  }
  // 序列：正好 9 个数字。数字少了多了都不当奇穴，免得把别的数字当成奇穴
  if (/^\d+(\s*[,，]\s*\d+)*$/.test(text)) {
    const sq = text.split(/\s*[,，]\s*/);
    return sq.length === 9 ? { kind: "sq", sq } : null;
  }
  // 文字：3–12 个中文名字
  const names = text.split(/[\s,，、;；/|]+/).filter(Boolean);
  if (
    names.length >= 3 &&
    names.length <= 12 &&
    names.every(n => n.length <= 8 && /[\u4e00-\u9fff]/.test(n))
  )
    return { kind: "names", names };
  return null;
}

/** 每层选的位置；null = 这一层没认出，保持原样 */
export type Picks = (number | null)[];

const POOL = [6, 7, 8];

/** 按本地数据的编号对应。编号在这一层不存在、7–9 层重复的，算没认出 */
export function picksFromSq(layers: TalentLayer[], sq: string[]): Picks {
  const picks: Picks = layers.map(() => null);
  layers.forEach((L, i) => {
    const pos = Number(sq[i]);
    if (!pos || !L.options.some(o => o.pos === pos)) return;
    if (POOL.includes(i) && POOL.some(k => k < i && picks[k] === pos)) return;
    picks[i] = pos;
  });
  return picks;
}

/**
 * 按名字对应。名字先在原来那一层找，找不到再找第 1–6 层的其他层（换季后奇穴可能挪层），
 * 再找第 7–9 层共用的选项，按出现顺序放进第 7、8、9 层。
 */
export function picksFromNames(
  layers: TalentLayer[],
  names: (string | null | undefined)[]
): Picks {
  const picks: Picks = layers.map(() => null);
  const fixed = layers.slice(0, 6);
  const pool = layers[6]?.options ?? [];
  const shared: number[] = [];
  names.forEach((name, i) => {
    if (!name) return;
    const at = (j: number) => fixed[j]?.options.find(o => o.name === name);
    if (i < 6 && picks[i] === null && at(i)) {
      picks[i] = at(i)!.pos;
      return;
    }
    const j = fixed.findIndex((_, k) => picks[k] === null && at(k));
    if (j >= 0) {
      picks[j] = at(j)!.pos;
      return;
    }
    const o = pool.find(x => x.name === name);
    if (o && !shared.includes(o.pos) && shared.length < POOL.length)
      shared.push(o.pos);
  });
  shared.forEach((pos, k) => {
    if (POOL[k] < layers.length) picks[POOL[k]] = pos;
  });
  return picks;
}

/** 名字能对上几个（选心法用） */
export function countNameHits(layers: TalentLayer[], names: string[]) {
  return picksFromNames(layers, names).filter(p => p !== null).length;
}

// ---------- 魔盒的其他版本数据 ----------

type RawOption = { name?: string };
type RawLayer = Record<string, RawOption | string> & { _follow?: string };
export type RawTalentData = Record<string, Record<string, RawLayer>>;

/** 用某个版本的魔盒数据，把序列换成名字 */
export function namesFromRaw(
  raw: RawTalentData,
  xf: string,
  sq: string[]
): (string | null)[] {
  const xd = raw[xf];
  if (!xd) return sq.map(() => null);
  return sq.map((pos, i) => {
    let level = xd[String(i + 1)];
    if (level?._follow) level = xd[String(level._follow)];
    const o = level?.[pos];
    return o && typeof o === "object" && o.name ? o.name : null;
  });
}

const cache = new Map<string, Promise<RawTalentData>>();

/** 下载魔盒某个版本的奇穴数据（接口允许跨域）。失败时不留缓存，下次重试 */
export function fetchTalentVersion(version: string): Promise<RawTalentData> {
  if (!/^v\d{8}$/.test(version))
    return Promise.reject(new Error("bad version"));
  let p = cache.get(version);
  if (!p) {
    p = fetch(`https://data.jx3box.com/talent/std/${version}.json`).then(
      async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as RawTalentData;
      }
    );
    p.catch(() => cache.delete(version));
    cache.set(version, p);
  }
  return p;
}

// ---------- 换算成当前方案的选择 ----------

export type ImportResult =
  | { ok: true; xinfa: string; picks: Picks; found: number }
  | {
      ok: false;
      reason: "origin" | "xinfa" | "empty" | "version" | "nomatch";
      /** reason=xinfa：内容属于哪个心法 */
      xinfa?: string;
      /** reason=version：下载失败的版本 */
      version?: string;
    };

export function needsFetch(imp: TalentImport) {
  return (
    imp.kind === "code" &&
    imp.client !== "origin" &&
    imp.version !== "" &&
    imp.version !== BUNDLED_TALENT_VERSION
  );
}

/**
 * xinfa 是当前心法；xinfas 是可以直接切过去的心法（面板新建方案时是全部心法），不给就不切。
 * allXinfa 用来认出奇穴文字其实属于哪个心法。
 */
export async function resolveTalentImport(
  imp: TalentImport,
  ctx: {
    xinfa: string;
    xinfas?: string[];
    allXinfa: string[];
    layersOf: (xinfa: string) => TalentLayer[];
    fetchVersion?: (version: string) => Promise<RawTalentData>;
    /** 至少对上这么多层才算 */
    minFound: number;
  }
): Promise<ImportResult> {
  const canUse = (x: string) =>
    x === ctx.xinfa || (ctx.xinfas ?? []).includes(x);
  const done = (xinfa: string, picks: Picks): ImportResult => {
    const found = picks.filter(p => p !== null).length;
    return found < ctx.minFound
      ? { ok: false, reason: "nomatch" }
      : { ok: true, xinfa, picks, found };
  };

  if (imp.kind === "code") {
    if (imp.client === "origin") return { ok: false, reason: "origin" };
    if (!canUse(imp.xf)) return { ok: false, reason: "xinfa", xinfa: imp.xf };
    const layers = ctx.layersOf(imp.xf);
    if (!layers.length) return { ok: false, reason: "empty", xinfa: imp.xf };
    if (!needsFetch(imp)) return done(imp.xf, picksFromSq(layers, imp.sq));
    let raw: RawTalentData;
    try {
      raw = await (ctx.fetchVersion ?? fetchTalentVersion)(imp.version);
    } catch {
      return { ok: false, reason: "version", version: imp.version };
    }
    return done(
      imp.xf,
      picksFromNames(layers, namesFromRaw(raw, imp.xf, imp.sq))
    );
  }

  if (imp.kind === "sq") {
    const layers = ctx.layersOf(ctx.xinfa);
    if (!layers.length) return { ok: false, reason: "empty", xinfa: ctx.xinfa };
    return done(ctx.xinfa, picksFromSq(layers, imp.sq));
  }

  // 文字没写心法：当前心法对上的最多就用当前心法；别的心法对上更多时，能切就切，不能切就报是哪个心法
  const here = countNameHits(ctx.layersOf(ctx.xinfa), imp.names);
  let best = { xinfa: ctx.xinfa, hits: here };
  for (const x of ctx.allXinfa) {
    if (x === ctx.xinfa) continue;
    const hits = countNameHits(ctx.layersOf(x), imp.names);
    if (hits > best.hits) best = { xinfa: x, hits };
  }
  if (best.hits < ctx.minFound) return { ok: false, reason: "nomatch" };
  if (!canUse(best.xinfa))
    return { ok: false, reason: "xinfa", xinfa: best.xinfa };
  return done(best.xinfa, picksFromNames(ctx.layersOf(best.xinfa), imp.names));
}
