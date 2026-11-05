/**
 * 配装截图识别的纯逻辑：请求校验、给模型的提示和输出结构、模型输出的清洗。
 * HTTP 处理在 server/gearScanRoute.ts。截图只在这次请求里用，不存库、不落盘。
 *
 * 模型只负责「照抄截图上的字」：部位、装备名、精炼、五行石、附魔、五彩石、副属性。
 * 对上当季装备库（哪一件、哪个附魔）在客户端做，见 client/src/lib/gearScan.ts。
 */

export const SCAN_SLOTS = [
  "帽子",
  "衣服",
  "腰带",
  "护腕",
  "下装",
  "鞋子",
  "项链",
  "腰坠",
  "戒指",
  "暗器",
  "武器",
] as const;
export type ScanSlot = (typeof SCAN_SLOTS)[number];

export interface ScanItem {
  slot: ScanSlot;
  name: string;
  /** 精炼等级；截图里看不出是 null */
  refine: number | null;
  /** 每个孔的五行石等级；0 是看得到镶了、看不出等级；[] 是截图里看不到孔 */
  gems: number[];
  /** 小附魔，照抄截图上的字 */
  enchant: string | null;
  /** 截图上这件装备写着的副属性，例如 ["会心", "无双"]，用来区分同名装备 */
  attrs: string[];
  /** 品级；看不到是 null */
  ilvl: number | null;
}

export interface ScanResult {
  /** 截图里没有装备 */
  notGear: boolean;
  /** 截图里写着的心法名 */
  xinfa: string | null;
  /** 截图里的装分 */
  score: number | null;
  /** 五彩石全名 */
  stone: string | null;
  items: ScanItem[];
}

/** 解码后的图片最大 3.5 MB；客户端会先缩到长边 2400 像素、JPEG，一般 200–600 KB */
export const IMAGE_MAX_BYTES = 3.5 * 1024 * 1024;

const DATA_URL_RE =
  /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageCheck =
  | { ok: true; dataUrl: string; bytes: number }
  | { ok: false; error: "invalid" | "too_large" };

/** 只收 JPEG、PNG、WebP 的 data URL，并按文件头确认真的是这种图片 */
export function checkImage(body: unknown): ImageCheck {
  const image =
    body && typeof body === "object"
      ? (body as { image?: unknown }).image
      : undefined;
  if (typeof image !== "string") return { ok: false, error: "invalid" };
  const m = DATA_URL_RE.exec(image);
  if (!m) return { ok: false, error: "invalid" };
  const b64 = m[2];
  const bytes =
    Math.floor((b64.length * 3) / 4) - (b64.match(/=+$/)?.[0].length ?? 0);
  if (bytes > IMAGE_MAX_BYTES) return { ok: false, error: "too_large" };
  if (bytes < 64) return { ok: false, error: "invalid" };
  const head = Buffer.from(b64.slice(0, 24), "base64");
  const kind = m[1];
  const okHead =
    kind === "jpeg"
      ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
      : kind === "png"
        ? head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        : head.subarray(0, 4).toString("latin1") === "RIFF" &&
          head.subarray(8, 12).toString("latin1") === "WEBP";
  if (!okHead) return { ok: false, error: "invalid" };
  return { ok: true, dataUrl: image, bytes };
}

export const SCAN_PROMPT = `这是《剑网3》（剑侠情缘网络版叁）的装备截图，可能来自游戏角色面板、装备悬浮提示、推栏 App、茗伊插件、魔盒配装页或配装计算器。
只读截图里看得到的内容，不要猜，不要编：
- items：每件装备一项，按截图里的顺序。截图里没有的部位不要写。
  - slot：部位，只能是 帽子 衣服 腰带 护腕 下装 鞋子 项链 腰坠 戒指 暗器 武器 之一。截图没写部位时按装备名判断：冠/帽→帽子，衣→衣服，带/腰带→腰带，腕/袖/护手→护腕，裤/下装→下装，鞋/靴→鞋子，链→项链，坠/佩→腰坠，戒/指环→戒指，囊/暗器→暗器，剑、笔、弓、刀、棍、枪、琴、伞、双刀等→武器。
  - name：装备名，照抄截图上的字（例如「驭龙惊天·星坛剑」「无观冠·内·荒」）。名字后面括号里的精炼数字不要放进名字。
  - refine：精炼等级。数实心星星的个数，或读「精炼 6」「精 6」「(6)」；看不出是 null。
  - gems：每个五行石孔的等级，按顺序。写着等级就写数字；只看得到镶了石头、看不出等级写 0；截图里看不到孔写 []。
  - enchant：小附魔，照抄文字（例如「峡金焠·头（急速）」「奉天·头·铸（急速）」或只有「急速」「外功·攻击」）；没有是 null。
  - attrs：这件装备上写着的副属性词，照截图写（例如 会心、会效、破防、无双、加速、破招、攻击、化劲、御劲），不要把附魔和五行石的属性放进来；没有写 []。
  - ilvl：品级数字，截图上写着「品级」才写，否则 null。
- stone：武器上的五彩石全名，照抄（例如「彩·灭气·激流·月华(陆)」）；没有是 null。
- xinfa：截图里写着的心法名（例如「紫霞功」「太虚剑意」），没写是 null。
- score：截图里的装分数字，没有是 null。
- not_gear：截图里根本没有剑网3的装备时为 true，items 为 []。`;

/** 模型的输出结构（json_schema strict：每个字段都 required，不允许多余字段） */
export const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["not_gear", "xinfa", "score", "stone", "items"],
  properties: {
    not_gear: { type: "boolean" },
    xinfa: { type: ["string", "null"] },
    score: { type: ["integer", "null"] },
    stone: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "slot",
          "name",
          "refine",
          "gems",
          "enchant",
          "attrs",
          "ilvl",
        ],
        properties: {
          slot: { type: "string", enum: [...SCAN_SLOTS] },
          name: { type: "string" },
          refine: { type: ["integer", "null"] },
          gems: { type: "array", items: { type: "integer" } },
          enchant: { type: ["string", "null"] },
          attrs: { type: "array", items: { type: "string" } },
          ilvl: { type: ["integer", "null"] },
        },
      },
    },
  },
} as const;

/** 模型没按结构返回时：去掉 Markdown 代码块，取最外层的 { … } */
export function extractJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/** 去掉控制字符、合并空白、限长 */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return Array.from(s).slice(0, max).join("");
}

function int(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < lo || r > hi ? null : r;
}

const SLOT_SET = new Set<string>(SCAN_SLOTS);
const ITEMS_MAX = 16;

/** 清洗模型输出：字段不对的丢掉或改成 null，结构整个不对返回 null */
export function sanitizeScan(raw: unknown): ScanResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const items: ScanItem[] = [];
  for (const it of r.items.slice(0, ITEMS_MAX)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = text(o.name, 40);
    if (!name || typeof o.slot !== "string" || !SLOT_SET.has(o.slot)) continue;
    const gems = Array.isArray(o.gems)
      ? o.gems
          .slice(0, 4)
          .map(g => int(g, 0, 8))
          .filter((g): g is number => g !== null)
      : [];
    const attrs = Array.isArray(o.attrs)
      ? o.attrs
          .map(a => text(a, 6))
          .filter((a): a is string => !!a)
          .slice(0, 8)
      : [];
    items.push({
      slot: o.slot as ScanSlot,
      name,
      refine: int(o.refine, 0, 8),
      gems,
      enchant: text(o.enchant, 40),
      attrs,
      ilvl: int(o.ilvl, 1, 99999),
    });
  }
  return {
    notGear: r.not_gear === true && items.length === 0,
    xinfa: text(r.xinfa, 8),
    score: int(r.score, 0, 9_999_999),
    stone: text(r.stone, 40),
    items,
  };
}
