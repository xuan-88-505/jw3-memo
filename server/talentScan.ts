/**
 * 奇穴截图读字（服务端纯逻辑）：本机比图标认不出时，客户端把截图发来，
 * 模型只照抄截图上「选中的奇穴名字」和写着的心法名；对哪个心法、哪一层在客户端做（lib/talentNames.ts）。
 * 截图只在这次请求里交给模型，不存库、不落盘、不写日志。
 */

export interface TalentScanResult {
  /** 截图里根本没有奇穴 */
  notTalent: boolean;
  /** 截图里写着的心法名；没写是 null */
  xinfa: string | null;
  /** 选中的奇穴名字，按阅读顺序 */
  names: string[];
}

export const TALENT_PROMPT = `这是《剑网3》（剑侠情缘网络版叁）旗舰端的奇穴截图，可能来自游戏奇穴界面、推栏 App、魔盒（JX3BOX）宏页或配装页、备忘录。
只读截图里看得到的字，不要猜，不要编：
- names：选中的奇穴名字，按阅读顺序（先上后下、从左到右）照抄截图上的字，例如「亘天」「镇星入舆」。最多 12 个。
  - 一般是一排 9 个奇穴图标，名字写在图标下面或旁边。
  - 如果一层列出了好几个选项、只有一个高亮或打勾，只写选中的那个；看不出哪个选中时这一层不写。
  - 技能说明、描述文字里提到的名字不要写；只有图标没有名字的不要写。
- xinfa：截图里写着的心法名（例如「太玄经」「紫霞功」），没写是 null。
- not_talent：截图里根本没有剑网3的奇穴时为 true，names 为 []。`;

/** 模型的输出结构（json_schema strict：每个字段都 required，不允许多余字段） */
export const TALENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["not_talent", "xinfa", "names"],
  properties: {
    not_talent: { type: "boolean" },
    xinfa: { type: ["string", "null"] },
    names: { type: "array", items: { type: "string" } },
  },
} as const;

/** 不按结构返回时追加的一句 */
export const TALENT_JSON_HINT =
  "只输出一个 JSON 对象，字段是 not_talent、xinfa、names，不要别的文字。";

const NAMES_MAX = 12;

/** 去掉控制字符和空白、限长；奇穴名不超过 8 个字 */
function name(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!s) return null;
  return Array.from(s).slice(0, max).join("");
}

/** 清洗模型输出：字段不对的丢掉或改成 null，结构整个不对返回 null */
export function sanitizeTalentScan(raw: unknown): TalentScanResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.names)) return null;
  const names = r.names
    .map(n => name(n, 8))
    .filter((n): n is string => !!n)
    .slice(0, NAMES_MAX);
  return {
    notTalent: r.not_talent === true && names.length === 0,
    xinfa: name(r.xinfa, 8),
    names,
  };
}
