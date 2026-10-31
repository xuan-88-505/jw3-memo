/**
 * 亲友团联网版（2.0）前后端共用的接口约定。
 *
 * 所有接口都在 `/api/team` 下，请求和响应都是 JSON（上传图片除外）。
 * 除创建、加入、登录外，都要带 `Authorization: Bearer <设备令牌>`。
 * 桌面版从 tauri 来源跨域请求，服务器对这些来源开放跨域（同意见反馈接口）。
 *
 * 出错时返回 `{ error: TeamErrorCode, message: string }`（message 是中文，可以直接显示），
 * HTTP 状态：400 invalid，401 unauthorized，403 forbidden，404 not_found / invite_invalid /
 * code_invalid，409 nickname_taken / last_admin，413 too_large，429 rate_limited（带 retryAfter 秒）。
 */

export type TeamRole = "admin" | "editor" | "viewer";
export type ClientPlatform = "win" | "mac";

/** 条目类型。每个方案、角色、记录、链接、配装、便签各是一个条目 */
export const ENTITY_KINDS = [
  "scheme",
  "character",
  "raidLog",
  "blacklist",
  "link",
  "loadout",
  "note",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** team = 亲友团全员可见；private = 只有创建人可见。配装、便签固定 private，链接可选 */
export type Visibility = "team" | "private";

export interface MemberAvatar {
  kind: "preset" | "upload";
  /** preset 时是黄鸡表情名 */
  mood?: string;
  /** upload 时是裁好的正方形图片：data URL 或 /manus-storage/ 地址 */
  src?: string;
}

export interface TeamMember {
  id: string;
  nickname: string;
  role: TeamRole;
  /** 头像底色，如 "#c0563f" */
  color: string;
  avatar: MemberAvatar | null;
  /** ISO 时间 */
  joinedAt: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  /** 只有管理员能看到，其他人是 null。格式 TD-XXXX-XXXX */
  inviteCode: string | null;
}

/** 创建、加入、登录成功后的返回 */
export interface AuthResult {
  token: string;
  memberId: string;
  team: TeamInfo;
  members: TeamMember[];
}

export interface CreateTeamRequest {
  /** 1–20 个字符 */
  teamName: string;
  /** 1–12 个字符，同一个亲友团里不能重复（不分大小写，去掉首尾空格后比较） */
  nickname: string;
  color?: string;
  avatar?: MemberAvatar | null;
  platform: ClientPlatform;
}

export interface JoinTeamRequest {
  inviteCode: string;
  nickname: string;
  color?: string;
  avatar?: MemberAvatar | null;
  platform: ClientPlatform;
}

/** 第二台电脑用登录码登录 */
export interface LoginRequest {
  /** 格式 XXXX-XXXX，不分大小写，可以不带横线 */
  code: string;
  platform: ClientPlatform;
}

export interface LoginCodeResponse {
  code: string;
  /** ISO 时间，生成后 10 分钟 */
  expiresAt: string;
}

/** 服务器上的一个条目 */
export interface EntityRecord {
  kind: EntityKind;
  id: string;
  /** 每次写入加 1，用来判断冲突 */
  version: number;
  ownerId: string;
  visibility: Visibility;
  deleted: boolean;
  /** 条目内容（客户端的原始 JSON 对象）；deleted 时省略 */
  data?: unknown;
  updatedBy: string;
  updatedAt: string;
  /** 写入时亲友团的变更序号 */
  seq: number;
}

/** GET /api/team/sync?since=<seq> */
export interface SyncResponse {
  /** 亲友团当前的变更序号；下次拉取带上它 */
  seq: number;
  team: TeamInfo;
  me: { memberId: string; role: TeamRole; nickname: string };
  /** 全部成员（已移除的不含），每次都完整返回 */
  members: TeamMember[];
  /**
   * seq 大于 since 的条目，按 seq 升序。since=0 时只返回没删除的。
   * 只返回本人能看到的：private 条目只给创建人；角色给别人时去掉 data.synced。
   */
  entities: EntityRecord[];
}

/** POST /api/team/push 里的一项修改 */
export interface EntityChange {
  kind: EntityKind;
  id: string;
  /**
   * 客户端上次拿到的 version；新建时为 0。
   * 只有方案（scheme）检查冲突：和服务器当前 version 不一致时返回 conflict。
   * 其他条目按最后保存的为准。
   */
  baseVersion: number;
  deleted?: boolean;
  /** deleted 时可以省略；序列化后不超过 512 KB */
  data?: unknown;
  /** 只对 link 有意义；配装、便签固定 private，其他固定 team */
  visibility?: Visibility;
}

export interface PushRequest {
  /** 1–50 项，按顺序处理 */
  changes: EntityChange[];
}

export type PushResult =
  | { kind: EntityKind; id: string; ok: true; version: number; seq: number }
  | {
      kind: EntityKind;
      id: string;
      ok: false;
      error: "conflict" | "forbidden" | "invalid" | "too_large";
      message: string;
      /** conflict 时附上服务器当前的条目 */
      current?: EntityRecord;
    };

export interface PushResponse {
  seq: number;
  results: PushResult[];
}

/** PATCH /api/team/members/:id —— role 只有管理员能改；其余只有本人能改 */
export interface MemberPatch {
  role?: TeamRole;
  nickname?: string;
  color?: string;
  avatar?: MemberAvatar | null;
}

/** POST /api/team/files 的返回：图片的稳定地址，桌面版显示时拼上网站地址 */
export interface FileUploadResponse {
  src: string;
}

export type TeamErrorCode =
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invite_invalid"
  | "code_invalid"
  | "nickname_taken"
  | "last_admin"
  | "too_large"
  | "rate_limited"
  | "server_error";

export interface TeamError {
  error: TeamErrorCode;
  message: string;
  retryAfter?: number;
}

/** 限制：前后端一起用 */
export const TEAM_LIMITS = {
  teamName: 20,
  nickname: 12,
  entityId: 96,
  entityBytes: 512 * 1024,
  pushBatch: 50,
  fileBytes: 2 * 1024 * 1024,
  fileTypes: ["image/png", "image/jpeg", "image/webp"],
  loginCodeMinutes: 10,
} as const;

/** 邀请码、登录码用的字符：去掉容易看错的 0 O 1 I L */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 规范化邀请码：去空格、转大写，补上 TD- 前缀和横线 */
export function normalizeInviteCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const body = s.startsWith("TD") ? s.slice(2) : s;
  if (body.length !== 8) return raw.trim().toUpperCase();
  return `TD-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** 规范化登录码：去空格、横线，转大写 */
export function normalizeLoginCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** 昵称比较用：去首尾空格、转小写 */
export function nicknameKey(name: string): string {
  return name.trim().toLowerCase();
}
