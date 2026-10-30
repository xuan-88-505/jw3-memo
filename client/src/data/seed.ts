// 原型的初始数据。宏和奇穴是魔盒上的真实数据（当前版本）。
// 历史版本、角色、亲友和更新说明是虚构的示例，用来演示"待同步"和"旧 → 新"。
import { JX3_SAMPLE } from "./jx3Sample";
import { TALENTS } from "./talents";
import type {
  Character,
  Macro,
  Member,
  Scheme,
  SchemeVersion,
  Team,
} from "./types";

export const ME_ID = "me";

/** 全部心法，按门派排列（顺序同魔盒数据） */
export const XINFA_LIST = Object.keys(TALENTS);

export const XINFA_META: Record<
  string,
  { short: string; color: string; school: string }
> = {
  傲血战意: { short: "傲", color: "#C46A4F", school: "天策" },
  铁牢律: { short: "牢", color: "#C46A4F", school: "天策" },
  太虚剑意: { short: "剑", color: "#7F8FC9", school: "纯阳" },
  紫霞功: { short: "气", color: "#7F8FC9", school: "纯阳" },
  离经易道: { short: "离", color: "#9A7FC0", school: "万花" },
  花间游: { short: "花", color: "#9A7FC0", school: "万花" },
  易筋经: { short: "易", color: "#C9A35B", school: "少林" },
  洗髓经: { short: "洗", color: "#C9A35B", school: "少林" },
  问水诀: { short: "藏", color: "#CDB35E", school: "藏剑" },
  焚影圣诀: { short: "焚", color: "#C9785B", school: "明教" },
  明尊琉璃体: { short: "尊", color: "#C9785B", school: "明教" },
  毒经: { short: "毒", color: "#5E9FB0", school: "五毒" },
  补天诀: { short: "补", color: "#5E9FB0", school: "五毒" },
  冰心诀: { short: "冰", color: "#C98BA8", school: "七秀" },
  云裳心经: { short: "裳", color: "#C98BA8", school: "七秀" },
  天罗诡道: { short: "罗", color: "#6C9B7E", school: "唐门" },
  惊羽诀: { short: "羽", color: "#6C9B7E", school: "唐门" },
  笑尘诀: { short: "丐", color: "#A8865E", school: "丐帮" },
  铁骨衣: { short: "骨", color: "#9C6B5E", school: "苍云" },
  分山劲: { short: "分", color: "#9C6B5E", school: "苍云" },
  莫问: { short: "莫", color: "#6FA6A0", school: "长歌" },
  相知: { short: "知", color: "#6FA6A0", school: "长歌" },
  北傲诀: { short: "霸", color: "#8B84B8", school: "霸刀" },
  凌海诀: { short: "海", color: "#6E9CC4", school: "蓬莱" },
  隐龙诀: { short: "隐", color: "#A65D6B", school: "凌雪阁" },
  太玄经: { short: "玄", color: "#8A7FAE", school: "衍天宗" },
  灵素: { short: "素", color: "#7FA27A", school: "北天药宗" },
  无方: { short: "方", color: "#7FA27A", school: "北天药宗" },
  孤锋诀: { short: "锋", color: "#9AA5B1", school: "刀宗" },
  山海心诀: { short: "灵", color: "#8FA86A", school: "万灵山庄" },
  周天功: { short: "周", color: "#B7925E", school: "段氏" },
  幽罗引: { short: "幽", color: "#A07BB0", school: "无相楼" },
};

/** 按门派分组，下拉框里用 */
export const XINFA_GROUPS: { school: string; xinfa: string[] }[] =
  XINFA_LIST.reduce<{ school: string; xinfa: string[] }[]>((acc, x) => {
    const school = XINFA_META[x]?.school ?? "其他";
    const g = acc.find(a => a.school === school);
    if (g) g.xinfa.push(x);
    else acc.push({ school, xinfa: [x] });
    return acc;
  }, []);

/**
 * 流派：不分门派，任何满级角色都能学。
 * 无相楼随 2025-10-30 资料片「山海源流」上线，心法「幽罗引」
 */
export const LIUPAI_SCHOOLS = ["无相楼"];
/** 门派（不含流派）。角色必须属于一个门派 */
export const SCHOOL_GROUPS = XINFA_GROUPS.filter(
  g => !LIUPAI_SCHOOLS.includes(g.school)
);
/** 流派心法，目前只有幽罗引 */
export const LIUPAI_XINFA = XINFA_GROUPS.filter(g =>
  LIUPAI_SCHOOLS.includes(g.school)
).flatMap(g => g.xinfa);
export function schoolXinfa(school: string): string[] {
  return XINFA_GROUPS.find(g => g.school === school)?.xinfa ?? [];
}
export function schoolOf(xinfa: string) {
  return XINFA_META[xinfa]?.school ?? "";
}
export function schoolColor(school: string) {
  return XINFA_META[schoolXinfa(school)[0]]?.color ?? "#968F82";
}
type CharSchool = Pick<Character, "school" | "only" | "liupai">;
/** 角色玩的全部心法：门派心法（选了一个就只有它）+ 学了的流派心法 */
export function xinfasOf(c: CharSchool): string[] {
  return [...(c.only ? [c.only] : schoolXinfa(c.school)), ...c.liupai];
}
/** 「纯阳 · 紫霞功 + 无相楼」；没选心法时只写门派 */
export function schoolLabel(c: CharSchool) {
  return (
    [c.school, c.only].filter(Boolean).join(" · ") +
    c.liupai.map(x => ` + ${schoolOf(x)}`).join("")
  );
}
export function layersOf(xinfa: string) {
  return TALENTS[xinfa] ?? JX3_SAMPLE.xinfa[xinfa]?.layers ?? [];
}

export const SEED_TEAM: Team = { name: "夜雨听风", inviteCode: "TD-7K2M-9QX4" };

export const SEED_MEMBERS: Member[] = [
  {
    id: ME_ID,
    avatar: { kind: "preset", mood: "嗷呜" },
    name: "八八",
    role: "admin",
    color: "#D2462F",
    joinedAt: "2026-09-20T20:00:00+08:00",
    author: true,
  },
  {
    id: "xiaotao",
    avatar: { kind: "preset", mood: "害羞" },
    name: "小桃",
    role: "editor",
    color: "#C98BA8",
    joinedAt: "2026-09-21T21:12:00+08:00",
  },
  {
    id: "ajiu",
    avatar: { kind: "preset", mood: "抠鼻" },
    name: "阿九",
    role: "editor",
    color: "#6F9A8B",
    joinedAt: "2026-09-22T19:40:00+08:00",
  },
  {
    id: "xiangcai",
    avatar: { kind: "preset", mood: "呕吐" },
    name: "不吃香菜",
    role: "viewer",
    color: "#C9A35B",
    joinedAt: "2026-10-08T22:30:00+08:00",
  },
];

export const SEED_CHARACTERS: Character[] = [
  {
    id: "c1",
    name: "云间鹤",
    server: "梦江南",
    school: "纯阳",
    only: null,
    liupai: ["幽罗引"],
    ownerId: ME_ID,
    synced: { 紫霞功: { PVE: 3 } },
    avatar: { kind: "preset", mood: "大笑" },
  },
  {
    id: "c2",
    name: "雪满弓",
    server: "梦江南",
    school: "七秀",
    only: "冰心诀",
    liupai: [],
    ownerId: ME_ID,
    synced: { 冰心诀: { PVE: 2 } },
    avatar: { kind: "preset", mood: "害羞" },
  },
  {
    id: "c3",
    name: "山鬼",
    server: "梦江南",
    school: "万灵山庄",
    only: null,
    liupai: [],
    ownerId: ME_ID,
    synced: { 山海心诀: { PVE: 1 } },
    avatar: { kind: "preset", mood: "发怒" },
  },
  {
    id: "c4",
    name: "花不语",
    server: "梦江南",
    school: "万花",
    only: "花间游",
    liupai: [],
    ownerId: ME_ID,
    synced: { 花间游: { PVE: 2 } },
    avatar: { kind: "preset", mood: "色" },
  },
  {
    id: "f1",
    name: "桃夭夭",
    server: "梦江南",
    school: "七秀",
    only: "冰心诀",
    liupai: [],
    ownerId: "xiaotao",
    synced: { 冰心诀: { PVE: 2 } },
    avatar: { kind: "preset", mood: "嘤嘤" },
  },
  {
    id: "f2",
    name: "九歌",
    server: "梦江南",
    school: "纯阳",
    only: "紫霞功",
    liupai: [],
    ownerId: "ajiu",
    synced: { 紫霞功: { PVE: 4 } },
    avatar: { kind: "preset", mood: "晕" },
  },
  {
    id: "f3",
    name: "香菜不要",
    server: "梦江南",
    school: "万灵山庄",
    only: null,
    liupai: [],
    ownerId: "xiangcai",
    synced: { 山海心诀: { PVE: 3 } },
    avatar: { kind: "preset", mood: "流汗" },
  },
];

/** 示例备注：模拟用户自己填写的内容，空字符串表示没填 */
const MACRO_NOTES: Record<string, string> = {
  "紫霞功-m0": "紫气期间一直按",
  "紫霞功-m1": "会神亮了再按",
  "紫霞功-m2": "开怪前按一次",
  "冰心诀-m0": "日常本用",
  "山海心诀-m0": "日常一键循环",
  "山海心诀-m1": "橙武特效亮了按",
};

/** 取真实宏，可选替换内容 */
function real(
  xinfa: string,
  index: number,
  edit?: (s: string) => string
): Macro {
  const m = JX3_SAMPLE.xinfa[xinfa].macros[index];
  return {
    id: `${xinfa}-m${index}`,
    name: m.name,
    icon: m.icon,
    content: edit ? edit(m.content) : m.content,
    note: MACRO_NOTES[`${xinfa}-m${index}`] ?? "",
  };
}

function v(
  version: number,
  authorId: string,
  at: string,
  note: string,
  macros: Macro[],
  talents: number[]
): SchemeVersion {
  return { version, authorId, at, note, macros, talents };
}

const sq = (xinfa: string) => [...JX3_SAMPLE.xinfa[xinfa].talentSq];

// 紫霞功：循环宏带一行注释，用来演示"复制时去掉注释"
const withComment = (s: string) => `// 气点阈值跟着技改调\n${s}`;

function ziXia(): Scheme {
  const now = sq("紫霞功");
  const old = [...now];
  old[6] = 1; // 第 7 重：抱一
  const loopOld = real("紫霞功", 0, s =>
    withComment(s.replace("qidian>9", "qidian>8"))
  );
  const loopNew = real("紫霞功", 0, withComment);
  const burstOld = real("紫霞功", 1, s =>
    s.replace("buff:会神&nobuff:紫气东来", "nobuff:紫气东来")
  );
  const burstNew = real("紫霞功", 1);
  const opener = real("紫霞功", 2);
  return {
    id: "紫霞功-PVE",
    xinfa: "紫霞功",
    mode: "PVE",
    versions: [
      v(
        1,
        ME_ID,
        "2026-10-02T20:10:00+08:00",
        "暗影千机赛季初方案，第 7 重先用抱一过渡",
        [loopOld, burstOld],
        old
      ),
      v(
        2,
        "ajiu",
        "2026-10-09T21:30:00+08:00",
        "紫气东来加上会神判断，避免空放",
        [loopOld, burstNew],
        old
      ),
      v(
        3,
        ME_ID,
        "2026-10-16T22:05:00+08:00",
        "加入正气起手宏",
        [loopOld, burstNew, opener],
        old
      ),
      v(
        4,
        "xiaotao",
        "2026-10-28T21:40:00+08:00",
        "技改后调整：第 7 重 抱一 → 正气；两仪化形改为 9 点气点再放",
        [loopNew, burstNew, opener],
        now
      ),
    ],
  };
}

function bingXin(): Scheme {
  const now = sq("冰心诀");
  const old = [...now];
  old[8] = 12;
  const loopOld = real("冰心诀", 0, s =>
    s.replace("tnobuff:急曲|tbuff:急曲<5 玳弦急曲", "tnobuff:急曲 玳弦急曲")
  );
  return {
    id: "冰心诀-PVE",
    xinfa: "冰心诀",
    mode: "PVE",
    versions: [
      v(
        1,
        "xiaotao",
        "2026-10-05T19:20:00+08:00",
        "赛季初方案",
        [loopOld],
        old
      ),
      v(
        2,
        "xiaotao",
        "2026-10-20T23:10:00+08:00",
        "第 9 重换盈袖；急曲剩 5 秒内就续",
        [real("冰心诀", 0)],
        now
      ),
    ],
  };
}

function shanHai(): Scheme {
  const now = sq("山海心诀");
  const old = [...now];
  old[8] = 5;
  const oneOld = real("山海心诀", 0, s =>
    s.replace("rage<7 饮羽簇", "rage<6 饮羽簇")
  );
  return {
    id: "山海心诀-PVE",
    xinfa: "山海心诀",
    mode: "PVE",
    versions: [
      v(1, "ajiu", "2026-10-03T20:45:00+08:00", "赛季初一键宏", [oneOld], old),
      v(
        2,
        "ajiu",
        "2026-10-12T21:05:00+08:00",
        "饮羽簇阈值改到 7；第 9 重换卢令",
        [real("山海心诀", 0)],
        now
      ),
      v(
        3,
        "ajiu",
        "2026-10-27T22:18:00+08:00",
        "出橙武了，补两条橙武宏",
        [real("山海心诀", 0), real("山海心诀", 1), real("山海心诀", 2)],
        now
      ),
    ],
  };
}

function huaJian(): Scheme {
  const now = sq("花间游");
  const old = [...now];
  old[8] = 10;
  const mohaiOld = real("花间游", 0, s => s.replace("/cast 快雪时晴\n", ""));
  return {
    id: "花间游-PVE",
    xinfa: "花间游",
    mode: "PVE",
    versions: [
      v(1, ME_ID, "2026-10-04T21:00:00+08:00", "赛季初方案", [mohaiOld], old),
      v(
        2,
        ME_ID,
        "2026-10-15T20:30:00+08:00",
        "补快雪时晴",
        [real("花间游", 0)],
        old
      ),
      v(
        3,
        "xiaotao",
        "2026-10-28T20:05:00+08:00",
        "第 9 重换成渲青",
        [real("花间游", 0)],
        now
      ),
    ],
  };
}

export function seedSchemes(): Scheme[] {
  return [ziXia(), bingXin(), shanHai(), huaJian()];
}

/** 新建方案时的默认奇穴：1–6 层选第 1 个，7–9 层选 1、2、3 */
export function defaultTalents(): number[] {
  return [1, 1, 1, 1, 1, 1, 1, 2, 3];
}

/** 模拟冲突时"对方"保存的改动：把第 8 重换成下一个没被占用的选项 */
export function rivalEdit(base: SchemeVersion): SchemeVersion {
  const talents = [...base.talents];
  const used = new Set([talents[6], talents[8]]);
  let next = talents[7];
  for (let i = 1; i <= 12; i++) {
    const cand = ((talents[7] + i - 1) % 12) + 1;
    if (!used.has(cand)) {
      next = cand;
      break;
    }
  }
  talents[7] = next;
  return {
    ...base,
    version: base.version + 1,
    talents,
    authorId: "xiaotao",
    at: new Date(Date.now() - 60_000).toISOString(),
    note: "第 8 重按新攻略调整",
  };
}
