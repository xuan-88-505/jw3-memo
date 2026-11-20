/**
 * 从魔盒（JX3BOX）抓当季 PVP 装备、套装和化劲/御劲小附魔，换成内置原版计算器的格式，
 * 写到 client/public/pvp-equip/。用法见同目录 README.md：
 *
 *   npx tsx tools/pvp-equip/build.ts            抓取并写文件
 *   npx tsx tools/pvp-equip/build.ts --check    只抓取和校验，不写文件
 *
 * 校验不过（接口挂了、返回的数量明显不对）时直接退出，不动旧文件。
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  convertEnchant,
  convertEquip,
  convertSet,
  PVP_DATA_VERSION,
  PVP_SCHOOL_FILE,
  type BoxEnchant,
  type BoxEquip,
  type PvpEnchant,
  type PvpFile,
} from "../../client/src/lib/pvpEquip";

const API = "https://node.jx3box.com/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "client/public/pvp-equip");
const KINDS = ["armor", "trinket", "weapon"] as const;
/** 当季：品级不低于最高 PVP 品级的 90%（当季 1260–1355，上一季最高 1095） */
const SEASON_RATIO = 0.9;
const PER = 200;
const CHECK_ONLY = process.argv.includes("--check");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "jw3-memo pvp-equip" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as T;
    } catch (e) {
      last = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error(`请求失败：${url} —— ${String(last)}`);
}

interface Page {
  total: number;
  pages: number;
  list: BoxEquip[];
}

const listParams = (page: number, per = PER) => ({
  client: "std",
  pv_type: 2,
  order_key: "Level",
  order_by: "DESC",
  per,
  page,
});

/** 一类装备按品级从高到低翻页，翻到低于 min 为止 */
async function fetchKind(kind: string, min: number) {
  const out: BoxEquip[] = [];
  for (let page = 1; ; page++) {
    const d = await get<Page>(`equip/${kind}`, listParams(page));
    const list = d.list || [];
    out.push(...list);
    const lowest = list.length ? list[list.length - 1].Level : 0;
    if (!list.length || lowest < min || page >= d.pages) break;
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

interface ItemSearch {
  data: { total: number; data: { Name: string; Desc?: string | null }[] };
}

/**
 * 化劲、御劲小附魔：物品搜索找到附魔 id，再取附魔详情。
 * 只留当季的：魔盒标了 _latest_enhance 的还包括前几季，所以再按装分筛，
 * 同品质（蓝、紫）里装分不低于最高的 60%（当季紫 105–158、蓝 42–52；上一季紫最高 85、蓝 28）。
 */
async function fetchEnchants(): Promise<PvpEnchant[]> {
  const ids = new Set<number>();
  for (const keyword of ["化劲", "御劲"]) {
    for (let page = 1; ; page++) {
      const d = await get<ItemSearch>("item/search", { client: "std", keyword, per: 50, page });
      for (const it of d.data?.data || []) {
        const m = /ENCHANT (\d+)/.exec(it.Desc || "");
        if (m) ids.add(Number(m[1]));
      }
      if (page * 50 >= (d.data?.total || 0)) break;
    }
  }
  const recs = await pool(Array.from(ids).sort((a, b) => a - b), 8, id =>
    get<BoxEnchant>(`resource/std/enchant.${id}`).catch(() => null)
  );
  const all = recs
    .filter((r): r is BoxEnchant => !!r?._latest_enhance)
    .map(r => convertEnchant(r))
    .filter((x): x is PvpEnchant => !!x);
  const group = (x: PvpEnchant) => (x.附魔类型 === "蓝" ? "蓝" : "紫");
  const top = new Map<string, number>();
  for (const x of all) top.set(group(x), Math.max(top.get(group(x)) ?? 0, x.附魔装分));
  return all
    .filter(x => x.附魔装分 >= (top.get(group(x)) ?? 0) * 0.6)
    .sort((a, b) => a.id - b.id);
}

function fail(msg: string): never {
  console.error(`校验没过，不写文件：${msg}`);
  process.exit(1);
}

async function main() {
  let top = 0;
  for (const kind of KINDS) {
    const d = await get<Page>(`equip/${kind}`, listParams(1, 1));
    top = Math.max(top, d.list?.[0]?.Level ?? 0);
  }
  const min = top * SEASON_RATIO;
  const recs: BoxEquip[] = [];
  for (const kind of KINDS) {
    const list = await fetchKind(kind, min);
    recs.push(...list);
    console.log(`${kind}：取到 ${list.length} 条`);
  }
  const season = recs.filter(r => r.Level >= min);
  console.log(`最高品级 ${top}，收录 ≥ ${Math.ceil(min)} 的 ${season.length} 件`);

  const dropped = new Set<string>();
  const files = new Map<string, PvpFile>();
  const unknownSchools = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);
  for (const r of season) {
    const school = r.BelongSchool || "通用";
    if (!PVP_SCHOOL_FILE[school]) {
      unknownSchools.set(school, (unknownSchools.get(school) ?? 0) + 1);
      continue;
    }
    const hit = convertEquip(r, dropped);
    if (!hit) continue;
    let f = files.get(school);
    if (!f) {
      f = { v: PVP_DATA_VERSION, school, updatedAt: today, levels: [], equips: {}, sets: {} };
      files.set(school, f);
    }
    const list = (f.equips[hit.part] ??= []);
    if (list.some(e => e.id === hit.equip.id)) continue;
    list.push(hit.equip);
    if (!f.levels.includes(hit.equip.装备品级)) f.levels.push(hit.equip.装备品级);
    const set = convertSet(r);
    if (set && r.SetID) f.sets[r.SetID] = set;
  }
  if (unknownSchools.size)
    console.warn("没收录的门派（PVP_SCHOOL_FILE 里没有）：", Object.fromEntries(unknownSchools));
  if (dropped.size) console.log("丢掉的属性：", Array.from(dropped).sort().join(" "));

  const enchants = await fetchEnchants();
  console.log(`化劲、御劲小附魔：${enchants.length} 个`);

  // 校验：数量明显不对时宁可不更新
  if (top < 1000) fail(`最高品级只有 ${top}`);
  if (season.length < 500) fail(`当季装备只有 ${season.length} 件`);
  const common = files.get("通用");
  // 通用的主武器没有 PVP 版，只有暗器
  const parts = ["帽子", "衣服", "腰带", "护腕", "下装", "鞋子", "项链", "腰坠", "戒指", "暗器"];
  if (!common) fail("没有通用装备");
  const lack = parts.filter(p => !common.equips[p]?.length);
  if (lack.length) fail(`通用装备缺部位：${lack.join("、")}`);
  if (files.size < 15) fail(`只有 ${files.size} 个门派`);
  if (enchants.length < 4) fail(`化劲、御劲小附魔只有 ${enchants.length} 个`);
  common.enchants = enchants;

  for (const f of files.values()) {
    f.levels.sort((a, b) => b - a);
    for (const list of Object.values(f.equips))
      list.sort((a, b) => b.装备品级 - a.装备品级 || a.id - b.id);
  }
  const summary = Array.from(files.values())
    .map(f => `${f.school} ${Object.values(f.equips).reduce((n, l) => n + l.length, 0)}`)
    .join("，");
  console.log(`按门派：${summary}`);
  if (CHECK_ONLY) return;

  mkdirSync(OUT, { recursive: true });
  const written = new Set<string>();
  for (const f of files.values()) {
    const name = `${PVP_SCHOOL_FILE[f.school]}.json`;
    writeFileSync(join(OUT, name), JSON.stringify(f) + "\n");
    written.add(name);
  }
  for (const name of readdirSync(OUT))
    if (name.endsWith(".json") && !written.has(name)) rmSync(join(OUT, name));
  console.log(`已写入 ${written.size} 个文件到 ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
