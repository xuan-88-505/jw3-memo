/**
 * 从魔盒（JX3BOX）抓当季 PVP 装备、套装和 PVP 小附魔，换成内置原版计算器的格式，
 * 写到 client/public/pvp-equip/。用法见同目录 README.md：
 *
 *   npx tsx tools/pvp-equip/build.ts            抓取并写文件
 *   npx tsx tools/pvp-equip/build.ts --check    只抓取和校验，不写文件
 *
 * 校验不过（接口挂了、返回的数量明显不对）时直接退出，不动旧文件。
 * 内容没变的文件不改（updatedAt 也不变），所以定时跑没有新数据时不会有改动。
 * 在 GitHub Actions 里跑时，把 changed=true/false 写进 $GITHUB_OUTPUT，变更摘要写进 $GITHUB_STEP_SUMMARY。
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  convertEquip,
  convertSet,
  DECRIT_KEY,
  pickEnchants,
  PVP_DATA_VERSION,
  PVP_SCHOOL_FILE,
  TOUGH_KEY,
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
/** 附魔 id 扫描：从化劲/御劲附魔的最大 id 往前 BACK 个，往后扫到连续 GAP 个空号 */
const ENCHANT_BACK = 500;
const ENCHANT_GAP = 40;
const ENCHANT_STEP = 60;
const ENCHANT_MAX_AHEAD = 1000;
const PARTS = ["武器", "暗器", "帽子", "衣服", "腰带", "护腕", "下装", "鞋子", "项链", "腰坠", "戒指"];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
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
 * PVP 小附魔。魔盒没有附魔列表接口，物品搜索也搜不全（搜「铸世」搜不到），所以：
 * 1. 物品搜索「化劲」「御劲」，取附魔 id 的最大值当锚点（当季的 PVP 附魔都在它附近）；
 * 2. 按 id 扫 [锚点 − 500, …]，往后一直扫到连续 40 个空号（无效 id 返回 []）；
 * 3. 交给 pickEnchants 挑：当季的化劲御劲和 PVP 专用系列（铸世·归正），加上当季没有的往季属性（帽子内攻等）。
 */
async function fetchEnchants(): Promise<{ list: PvpEnchant[]; scanned: number; range: string }> {
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
  if (!ids.size) fail("搜不到化劲、御劲附魔");
  const anchor = Math.max(...Array.from(ids));
  const lo = Math.max(1, anchor - ENCHANT_BACK);
  const recs = new Map<number, BoxEnchant>();
  let failed = 0;
  const scan = async (from: number, to: number) => {
    const list = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    await pool(list, 12, async id => {
      try {
        const r = await get<BoxEnchant | unknown[]>(`resource/std/enchant.${id}`);
        if (r && !Array.isArray(r) && (r as BoxEnchant).ID) recs.set(id, r as BoxEnchant);
      } catch {
        failed++;
      }
    });
  };
  await scan(lo, anchor + ENCHANT_STEP);
  let hi = anchor + ENCHANT_STEP;
  const lastFound = () => Math.max(...Array.from(recs.keys()));
  while (hi - lastFound() < ENCHANT_GAP && hi < anchor + ENCHANT_MAX_AHEAD) {
    await scan(hi + 1, hi + ENCHANT_STEP);
    hi += ENCHANT_STEP;
  }
  // 有请求失败就不更新：漏掉的附魔会让结果忽多忽少
  if (failed) fail(`${failed} 个附魔详情没取到`);
  const sorted = Array.from(recs.values()).sort((a, b) => a.ID - b.ID);
  return { list: pickEnchants(sorted), scanned: recs.size, range: `${lo}–${hi}` };
}

function fail(msg: string): never {
  console.error(`校验没过，不写文件：${msg}`);
  process.exit(1);
}

/* ---------------- 和旧文件比 ---------------- */

/** 输出顺序固定：部位按 PARTS，装备按品级、id，套装按 id */
function normalize(f: PvpFile): PvpFile {
  const equips: PvpFile["equips"] = {};
  const parts = Object.keys(f.equips).sort(
    (a, b) => (PARTS.indexOf(a) + 1 || 99) - (PARTS.indexOf(b) + 1 || 99) || a.localeCompare(b)
  );
  for (const p of parts)
    equips[p] = [...f.equips[p]].sort((a, b) => b.装备品级 - a.装备品级 || a.id - b.id);
  const sets: PvpFile["sets"] = {};
  for (const k of Object.keys(f.sets).sort((a, b) => Number(a) - Number(b))) sets[k] = f.sets[k];
  const out: PvpFile = {
    v: f.v,
    school: f.school,
    updatedAt: f.updatedAt,
    levels: [...f.levels].sort((a, b) => b - a),
    equips,
    sets,
  };
  if (f.enchants) out.enchants = [...f.enchants].sort((a, b) => a.id - b.id);
  return out;
}

const body = (f: PvpFile) => JSON.stringify({ ...f, updatedAt: "" });

function readOld(name: string): PvpFile | null {
  const p = join(OUT, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PvpFile;
  } catch {
    return null;
  }
}

/** 按 id 比两组：新增、删掉、改了的个数 */
function diffById<T extends { id: number }>(prev: T[], next: T[]) {
  const a = new Map(prev.map(x => [x.id, JSON.stringify(x)]));
  const b = new Map(next.map(x => [x.id, JSON.stringify(x)]));
  let add = 0;
  let del = 0;
  let mod = 0;
  b.forEach((v, id) => {
    if (!a.has(id)) add++;
    else if (a.get(id) !== v) mod++;
  });
  a.forEach((_, id) => {
    if (!b.has(id)) del++;
  });
  return { add, del, mod };
}

const fmtDiff = (label: string, d: { add: number; del: number; mod: number }) =>
  d.add || d.del || d.mod ? `${label} +${d.add} −${d.del} 改${d.mod}` : "";

function describe(prev: PvpFile | null, next: PvpFile) {
  const flat = (f: PvpFile | null) => (f ? Object.values(f.equips).flat() : []);
  const parts = [
    fmtDiff("装备", diffById(flat(prev), flat(next))),
    fmtDiff("附魔", diffById(prev?.enchants ?? [], next.enchants ?? [])),
  ].filter(Boolean);
  if (!parts.length) parts.push(prev ? "套装或品级有变化" : "新文件");
  return `${next.school}：${parts.join("，")}`;
}

function ghOutput(changed: boolean, lines: string[]) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `changed=${changed}\n`);
    appendFileSync(out, `summary<<__PVP_EOF__\n${lines.join("\n")}\n__PVP_EOF__\n`);
  }
  const sum = process.env.GITHUB_STEP_SUMMARY;
  if (sum) {
    const text = changed
      ? `### PVP 装备数据有更新\n\n${lines.map(l => `- ${l}`).join("\n")}\n`
      : "### PVP 装备数据没有变化\n";
    appendFileSync(sum, text);
  }
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

  const { list: enchants, scanned, range } = await fetchEnchants();
  const defense = enchants.filter(x =>
    x.增益集合.some(g => g.属性 === DECRIT_KEY || g.属性 === TOUGH_KEY)
  ).length;
  const legacy = enchants.filter(x => x.legacy).length;
  console.log(
    `附魔：扫了 ${range}（有效 ${scanned} 个），收 ${enchants.length} 个（化劲御劲 ${defense}，往季 ${legacy}）`
  );

  // 校验：数量明显不对时宁可不更新
  if (top < 1000) fail(`最高品级只有 ${top}`);
  if (season.length < 500) fail(`当季装备只有 ${season.length} 件`);
  const common = files.get("通用");
  // 通用的主武器没有 PVP 版，只有暗器
  if (!common) fail("没有通用装备");
  const lack = PARTS.filter(p => p !== "武器" && !common.equips[p]?.length);
  if (lack.length) fail(`通用装备缺部位：${lack.join("、")}`);
  if (files.size < 15) fail(`只有 ${files.size} 个门派`);
  if (defense < 4) fail(`化劲、御劲小附魔只有 ${defense} 个`);
  if (enchants.length < 20) fail(`PVP 小附魔只有 ${enchants.length} 个`);
  common.enchants = enchants;

  const summary = Array.from(files.values())
    .map(f => `${f.school} ${Object.values(f.equips).reduce((n, l) => n + l.length, 0)}`)
    .join("，");
  console.log(`按门派：${summary}`);

  // 和旧文件比：内容一样的不动（连 updatedAt 也不改）
  const changes: string[] = [];
  const keep = new Set<string>();
  const writes: [string, PvpFile][] = [];
  for (const f of files.values()) {
    const name = `${PVP_SCHOOL_FILE[f.school]}.json`;
    keep.add(name);
    const next = normalize(f);
    const prev = readOld(name);
    if (prev && body(normalize(prev)) === body(next)) continue;
    changes.push(describe(prev, next));
    writes.push([name, next]);
  }
  const stale = existsSync(OUT)
    ? readdirSync(OUT).filter(n => n.endsWith(".json") && !keep.has(n))
    : [];
  for (const n of stale) changes.push(`${n}：删掉（门派没有当季 PVP 装备了）`);
  console.log(changes.length ? `有变化：\n  ${changes.join("\n  ")}` : "和现有数据一样，没有变化");
  ghOutput(!CHECK_ONLY && changes.length > 0, changes);
  if (CHECK_ONLY || !changes.length) return;

  mkdirSync(OUT, { recursive: true });
  for (const [name, f] of writes) {
    f.updatedAt = today;
    writeFileSync(join(OUT, name), JSON.stringify(f) + "\n");
  }
  for (const n of stale) rmSync(join(OUT, n));
  console.log(`已写入 ${writes.length} 个文件，删掉 ${stale.length} 个（${OUT}）`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
