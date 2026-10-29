import { ME_ID, SERVERS, XINFA_META } from "./seed";

/**
 * 记录：打本记录 + 避雷名单，亲友团共享。
 *
 * 角色匹配：输入「角色名 + 服务器」或 UID，匹配到游戏里的角色后按 UID 保存。
 * 改名后 UID 不变，所以表格里显示的是最新名字，旧名字记在 formerNames。
 *
 * 正式版的数据来源（见 research-notes.md「角色查询与改名追踪」）：
 * - 名字 → UID：JX3API `/role/detail`（需要令牌）
 * - UID → 当前名字：推栏 `role/indicator`（需要推栏凭证）
 * 原型里用下面的 ROLE_DIRECTORY 模拟这两个接口。
 */

export interface GameRole {
  /** 角色 UID（本服角色 ID） */
  uid: string;
  name: string;
  server: string;
  school: string;
  body: "成男" | "成女" | "正太" | "萝莉";
  camp: "浩气盟" | "恶人谷" | "中立";
  tong?: string;
  /** 曾用名，最近的在后面；until 是改名的时间 */
  formerNames: { name: string; until: string }[];
}

export interface RaidLog {
  id: string;
  /** 开团时间 */
  at: string;
  difficulty: string;
  dungeon: string;
  /** 团牌：团队招募里挂的团名 */
  tuanpai: string;
  /** 团长：匹配到的角色 UID；没填为 null */
  leaderUid: string | null;
  /** 亲友团里去打本的角色 */
  charId: string;
  /** 工资，单位：金 */
  wage: number;
  note: string;
  /** 记录人 */
  by: string;
  updatedAt: string;
}

export interface BlackEntry {
  id: string;
  /** 匹配到的角色 UID；没匹配到时为 null，只能按名字对 */
  uid: string | null;
  /** 记录时的名字 */
  nameAtRecord: string;
  server: string;
  tags: string[];
  reason: string;
  by: string;
  at: string;
}

export const DIFFICULTIES = [
  "25人英雄",
  "25人普通",
  "25人挑战",
  "10人英雄",
  "10人普通",
];

export const BLACK_TAGS = ["黑工资", "跑路", "划水", "放鸽子", "骂人", "其他"];

/** 工资上限：1 千万金 */
export const WAGE_MAX = 10_000_000;

// ---------- 门派标记 ----------

const SCHOOL_SHORT: Record<string, string> = {
  天策: "策",
  七秀: "秀",
  万花: "花",
  万灵: "灵",
  长歌: "歌",
};

export function schoolMeta(school: string) {
  const hit = Object.values(XINFA_META).find(m => m.school === school);
  return {
    short: SCHOOL_SHORT[school] ?? school.slice(0, 1),
    color: hit?.color ?? "#968F82",
  };
}

// ---------- 模拟角色目录 ----------

export const ROLE_DIRECTORY: GameRole[] = [
  {
    uid: "3388012",
    name: "月下独酌",
    server: "梦江南",
    school: "七秀",
    body: "成女",
    camp: "恶人谷",
    tong: "月下金团",
    formerNames: [],
  },
  {
    uid: "4719832",
    name: "糯米团子",
    server: "梦江南",
    school: "天策",
    body: "成男",
    camp: "浩气盟",
    tong: "鸽鸽鸽",
    formerNames: [{ name: "鸽子王", until: "2026-10-27T10:00:00+08:00" }],
  },
  {
    uid: "2290164",
    name: "一只小咸鱼",
    server: "梦江南",
    school: "丐帮",
    body: "正太",
    camp: "中立",
    formerNames: [],
  },
  {
    uid: "1857321",
    name: "长歌当哭",
    server: "梦江南",
    school: "长歌",
    body: "成男",
    camp: "浩气盟",
    tong: "长歌夜宴",
    formerNames: [],
  },
  {
    uid: "6021457",
    name: "白日梦想家",
    server: "梦江南",
    school: "万花",
    body: "成男",
    camp: "恶人谷",
    formerNames: [{ name: "梦里花落", until: "2026-06-02T12:00:00+08:00" }],
  },
  {
    uid: "7781203",
    name: "风起长安",
    server: "唯我独尊",
    school: "苍云",
    body: "成男",
    camp: "恶人谷",
    formerNames: [],
  },
  {
    uid: "9032556",
    name: "不吃香菜的猫",
    server: "乾坤一掷",
    school: "唐门",
    body: "萝莉",
    camp: "中立",
    formerNames: [],
  },
  {
    uid: "1203345",
    name: "云间鹤",
    server: "梦江南",
    school: "纯阳",
    body: "成男",
    camp: "浩气盟",
    tong: "夜雨听风",
    formerNames: [],
  },
];

export function roleByUid(uid: string | null | undefined) {
  if (!uid) return undefined;
  return ROLE_DIRECTORY.find(r => r.uid === uid);
}

export type RoleQuery =
  | { kind: "uid"; uid: string; server: string }
  | { kind: "name"; name: string; server: string }
  | { kind: "invalid"; message: string };

/**
 * 解析输入：
 * - 5–12 位数字：UID
 * - 「名字·服务器」或「名字@服务器」：用输入里的服务器
 * - 其他：名字，用下拉框选的服务器
 */
export function parseRoleQuery(raw: string, server: string): RoleQuery {
  const text = raw.trim().replace(/\s+/g, "");
  if (!text) return { kind: "invalid", message: "先输入角色名或 UID" };
  if (/^\d{5,12}$/.test(text)) return { kind: "uid", uid: text, server };
  const m = text.match(/^(.+?)[·@](.+)$/);
  if (m && SERVERS.includes(m[2])) {
    return { kind: "name", name: m[1], server: m[2] };
  }
  if (text.length > 16) {
    return { kind: "invalid", message: "角色名最多 16 个字" };
  }
  if (!/^[\u4e00-\u9fffA-Za-z0-9@]+$/.test(text)) {
    return { kind: "invalid", message: "角色名只能有中文、字母和数字" };
  }
  return { kind: "name", name: text, server };
}

export type LookupResult =
  | { kind: "found"; role: GameRole; via: "uid" | "name" | "former" }
  | { kind: "not-found"; message: string }
  | { kind: "invalid"; message: string };

/** 模拟查询接口：约 0.5 秒返回 */
export async function lookupRole(
  raw: string,
  server: string
): Promise<LookupResult> {
  const q = parseRoleQuery(raw, server);
  if (q.kind === "invalid") return q;
  await new Promise(r => setTimeout(r, 520));
  if (q.kind === "uid") {
    const role = ROLE_DIRECTORY.find(
      r => r.uid === q.uid && r.server === q.server
    );
    return role
      ? { kind: "found", role, via: "uid" }
      : {
          kind: "not-found",
          message: `${q.server}没有 UID 为 ${q.uid} 的角色，检查一下服务器`,
        };
  }
  const inServer = ROLE_DIRECTORY.filter(r => r.server === q.server);
  const now = inServer.find(r => r.name === q.name);
  if (now) return { kind: "found", role: now, via: "name" };
  const former = inServer.find(r => r.formerNames.some(f => f.name === q.name));
  if (former) return { kind: "found", role: former, via: "former" };
  return {
    kind: "not-found",
    message: `${q.server}没有叫「${q.name}」的角色，检查一下名字和服务器`,
  };
}

/** 避雷名单里有没有这个角色：先按 UID，再按记录时的名字 */
export function blackEntriesFor(
  list: BlackEntry[],
  role: Pick<GameRole, "uid" | "name" | "server" | "formerNames">
) {
  const names = new Set([role.name, ...role.formerNames.map(f => f.name)]);
  return list.filter(e =>
    e.uid
      ? e.uid === role.uid
      : e.server === role.server && names.has(e.nameAtRecord)
  );
}

// ---------- 示例记录 ----------

export function seedRaidLogs(): RaidLog[] {
  const log = (
    id: string,
    at: string,
    o: Partial<RaidLog> & Pick<RaidLog, "charId" | "wage" | "by">
  ): RaidLog => ({
    id,
    at,
    difficulty: "25人英雄",
    dungeon: "一之窟",
    tuanpai: "月下金团",
    leaderUid: "3388012",
    note: "",
    updatedAt: at,
    ...o,
  });
  return [
    log("r1", "2026-10-28T20:00:00+08:00", {
      charId: "c1",
      wage: 18600,
      note: "老板多，工资稳",
      by: ME_ID,
    }),
    log("r2", "2026-10-28T20:00:00+08:00", {
      charId: "f2",
      wage: 18600,
      by: "ajiu",
    }),
    log("r3", "2026-10-26T21:30:00+08:00", {
      difficulty: "25人普通",
      tuanpai: "咸鱼翻身团",
      leaderUid: "2290164",
      charId: "c3",
      wage: 3200,
      note: "说好 8000，最后只发 3200",
      by: ME_ID,
    }),
    log("r4", "2026-10-25T20:00:00+08:00", {
      tuanpai: "鸽鸽鸽",
      leaderUid: "4719832",
      charId: "f1",
      wage: 0,
      note: "开到老二团长跑路了",
      by: "xiaotao",
    }),
    log("r5", "2026-10-22T20:00:00+08:00", {
      charId: "c1",
      wage: 21000,
      by: ME_ID,
    }),
    log("r6", "2026-10-19T19:30:00+08:00", {
      difficulty: "25人普通",
      tuanpai: "长歌夜宴",
      leaderUid: "1857321",
      charId: "c4",
      wage: 6800,
      by: ME_ID,
    }),
    log("r7", "2026-09-27T20:00:00+08:00", {
      difficulty: "10人英雄",
      dungeon: "九老洞",
      tuanpai: "",
      leaderUid: null,
      charId: "c2",
      wage: 2400,
      note: "亲友车",
      by: ME_ID,
    }),
  ];
}

export function seedBlacklist(): BlackEntry[] {
  return [
    {
      id: "b1",
      uid: "4719832",
      nameAtRecord: "鸽子王",
      server: "梦江南",
      tags: ["跑路", "黑工资"],
      reason: "开到老二跑路，工资一分没发。10 月 27 日改名了",
      by: "xiaotao",
      at: "2026-10-25T23:40:00+08:00",
    },
    {
      id: "b2",
      uid: "2290164",
      nameAtRecord: "一只小咸鱼",
      server: "梦江南",
      tags: ["黑工资"],
      reason: "说好 8000，结算只给 3200",
      by: ME_ID,
      at: "2026-10-27T00:10:00+08:00",
    },
    {
      id: "b3",
      uid: "7781203",
      nameAtRecord: "风起长安",
      server: "唯我独尊",
      tags: ["划水", "骂人"],
      reason: "",
      by: "ajiu",
      at: "2026-10-12T22:05:00+08:00",
    },
  ];
}
