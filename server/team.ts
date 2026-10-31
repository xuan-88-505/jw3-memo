import { createHash, randomBytes } from "crypto";
import {
  CODE_ALPHABET,
  ENTITY_KINDS,
  TEAM_LIMITS,
  nicknameKey,
  normalizeInviteCode,
  normalizeLoginCode,
  type ClientPlatform,
  type EntityKind,
  type EntityRecord,
  type MemberAvatar,
  type MemberPatch,
  type TeamMember,
  type TeamRole,
  type Visibility,
} from "@shared/teamApi";

export const DEFAULT_MEMBER_COLOR = "#c0563f";
export const AVATAR_SRC_LIMIT = 300 * 1024;

export type EntityRow = {
  kind: EntityKind;
  entityId: string;
  ownerId: string;
  visibility: Visibility;
  version: number;
  data: string;
  deleted: boolean;
  seq: number;
  updatedBy: string;
  updatedAt: Date;
};

export type PermissionInput = {
  kind: EntityKind;
  role: TeamRole;
  actorId: string;
  existing: Pick<EntityRow, "ownerId"> | null;
  deleted: boolean;
};

export type ParsedMemberInput = {
  nickname: string;
  nicknameKey: string;
  color: string;
  avatar: MemberAvatar | null;
  platform: ClientPlatform;
};

export type ParsedEntityChange = {
  kind: EntityKind;
  id: string;
  baseVersion: number;
  deleted: boolean;
  data?: unknown;
  dataJson: string;
  visibility?: Visibility;
};

/** 生成可公开返回的随机标识。16 字节随机数编码后有 22 个 URL 安全字符。 */
export function randomId() {
  return randomBytes(16).toString("base64url");
}

/** 令牌和登录码只保存 SHA-256 十六进制摘要。 */
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** 生成 32 字节设备令牌。 */
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

function generateCode(prefix = "") {
  let text = "";
  for (let i = 0; i < 8; i++) {
    text += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
  }
  return prefix ? `${prefix}${text.slice(0, 4)}-${text.slice(4)}` : `${text.slice(0, 4)}-${text.slice(4)}`;
}

/** 生成格式为 TD-XXXX-XXXX 的邀请码。 */
export function generateInviteCode() {
  return generateCode("TD-");
}

/** 生成格式为 XXXX-XXXX 的登录码。 */
export function generateLoginCode() {
  return generateCode();
}

/** 按用户可见字符数计算长度。 */
export const charLength = (value: string) => Array.from(value).length;

function plainString(value: unknown, limit: number) {
  return typeof value === "string" && charLength(value.trim()) > 0 && charLength(value.trim()) <= limit;
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 32;
}

/** 校验头像对象和上传地址长度。 */
export function parseAvatar(value: unknown): MemberAvatar | null | undefined {
  if (value === null || value === undefined) return value === null ? null : undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const avatar = value as Record<string, unknown>;
  if (avatar.kind !== "preset" && avatar.kind !== "upload") return undefined;
  if (avatar.mood !== undefined && (typeof avatar.mood !== "string" || avatar.mood.length > 100)) return undefined;
  if (avatar.src !== undefined) {
    if (typeof avatar.src !== "string" || Buffer.byteLength(avatar.src, "utf8") > AVATAR_SRC_LIMIT) return undefined;
  }
  if (avatar.kind === "upload" && !avatar.src) return undefined;
  return {
    kind: avatar.kind,
    ...(typeof avatar.mood === "string" ? { mood: avatar.mood } : {}),
    ...(typeof avatar.src === "string" ? { src: avatar.src } : {}),
  };
}

/** 校验创建或加入时的成员资料。 */
export function parseMemberInput(value: unknown): ParsedMemberInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!plainString(body.nickname, TEAM_LIMITS.nickname)) return null;
  if (body.platform !== "win" && body.platform !== "mac") return null;
  const avatar = parseAvatar(body.avatar);
  if (body.avatar !== undefined && avatar === undefined) return null;
  if (body.color !== undefined && !validColor(body.color)) return null;
  const nickname = (body.nickname as string).trim();
  return {
    nickname,
    nicknameKey: nicknameKey(nickname),
    color: typeof body.color === "string" ? body.color.trim() : DEFAULT_MEMBER_COLOR,
    avatar: avatar ?? null,
    platform: body.platform,
  };
}

/** 校验创建亲友团请求。 */
export function parseCreateRequest(value: unknown) {
  const member = parseMemberInput(value);
  if (!member || !value || typeof value !== "object") return null;
  const teamName = (value as Record<string, unknown>).teamName;
  if (!plainString(teamName, TEAM_LIMITS.teamName)) return null;
  return { teamName: (teamName as string).trim(), ...member };
}

/** 校验加入亲友团请求。 */
export function parseJoinRequest(value: unknown) {
  const member = parseMemberInput(value);
  if (!member || !value || typeof value !== "object") return null;
  const inviteCode = (value as Record<string, unknown>).inviteCode;
  if (typeof inviteCode !== "string" || !inviteCode.trim()) return null;
  return { inviteCode: normalizeInviteCode(inviteCode), ...member };
}

/** 校验第二台设备登录请求。 */
export function parseLoginRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.code !== "string" || (body.platform !== "win" && body.platform !== "mac")) return null;
  const code = normalizeLoginCode(body.code);
  if (!/^[A-Z0-9]{8}$/.test(code)) return null;
  return { code, platform: body.platform as ClientPlatform };
}

/** 校验成员资料修改请求。 */
export function parseMemberPatch(value: unknown): MemberPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = ["role", "nickname", "color", "avatar"];
  if (!keys.some(key => body[key] !== undefined)) return null;
  if (body.role !== undefined && body.role !== "admin" && body.role !== "editor" && body.role !== "viewer") return null;
  if (body.nickname !== undefined && !plainString(body.nickname, TEAM_LIMITS.nickname)) return null;
  if (body.color !== undefined && !validColor(body.color)) return null;
  const avatar = parseAvatar(body.avatar);
  if (body.avatar !== undefined && avatar === undefined) return null;
  return {
    ...(body.role !== undefined ? { role: body.role as TeamRole } : {}),
    ...(body.nickname !== undefined ? { nickname: (body.nickname as string).trim() } : {}),
    ...(body.color !== undefined ? { color: (body.color as string).trim() } : {}),
    ...(body.avatar !== undefined ? { avatar: avatar ?? null } : {}),
  };
}

/** 校验亲友团名称修改请求。 */
export function parseTeamName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as Record<string, unknown>).name;
  return plainString(name, TEAM_LIMITS.teamName) ? (name as string).trim() : null;
}

/** 校验单项条目修改，并提前序列化数据以检查字节数。 */
export function parseEntityChange(value: unknown):
  | { ok: true; value: ParsedEntityChange }
  | { ok: false; kind: EntityKind; id: string; error: "invalid" | "too_large"; message: string } {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const kind = (typeof body.kind === "string" ? body.kind : "") as EntityKind;
  const id = typeof body.id === "string" ? body.id : "";
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, kind, id, error: "invalid", message: "条目类型不对" };
  }
  // eslint-disable-next-line no-control-regex
  if (charLength(id) < 1 || charLength(id) > TEAM_LIMITS.entityId || /[\u0000-\u001F\u007F-\u009F]/.test(id)) {
    return { ok: false, kind, id, error: "invalid", message: "条目 ID 不对" };
  }
  if (!Number.isSafeInteger(body.baseVersion) || (body.baseVersion as number) < 0) {
    return { ok: false, kind, id, error: "invalid", message: "版本不对" };
  }
  if (body.deleted !== undefined && typeof body.deleted !== "boolean") {
    return { ok: false, kind, id, error: "invalid", message: "删除标记不对" };
  }
  if (body.visibility !== undefined && body.visibility !== "team" && body.visibility !== "private") {
    return { ok: false, kind, id, error: "invalid", message: "可见范围不对" };
  }
  const deleted = body.deleted === true;
  let dataJson = "null";
  if (!deleted) {
    if (!("data" in body)) return { ok: false, kind, id, error: "invalid", message: "条目内容不对" };
    try {
      const encoded = JSON.stringify(body.data);
      if (encoded === undefined) return { ok: false, kind, id, error: "invalid", message: "条目内容不对" };
      dataJson = encoded;
    } catch {
      return { ok: false, kind, id, error: "invalid", message: "条目内容不对" };
    }
    if (Buffer.byteLength(dataJson, "utf8") > TEAM_LIMITS.entityBytes) {
      return { ok: false, kind, id, error: "too_large", message: "条目内容太大" };
    }
  }
  return {
    ok: true,
    value: {
      kind,
      id,
      baseVersion: body.baseVersion as number,
      deleted,
      ...(deleted ? {} : { data: body.data }),
      dataJson,
      ...(body.visibility !== undefined ? { visibility: body.visibility as Visibility } : {}),
    },
  };
}

/** 根据条目类型和当前拥有者判断写入权限。 */
export function canWriteEntity(input: PermissionInput) {
  const { kind, role, actorId, existing, deleted } = input;
  const editor = role === "admin" || role === "editor";
  if (kind === "scheme") return editor;
  if (kind === "character" || kind === "link" || kind === "loadout" || kind === "note") {
    return !existing || existing.ownerId === actorId;
  }
  if (kind === "raidLog" || kind === "blacklist") {
    if (!existing) return deleted ? role === "admin" : editor;
    return deleted ? role === "admin" || existing.ownerId === actorId : editor;
  }
  return false;
}

/** 条目类型决定最终的可见范围，客户端不能覆盖固定规则。 */
export function entityVisibility(kind: EntityKind, requested?: Visibility): Visibility {
  if (kind === "loadout" || kind === "note") return "private";
  if (kind === "link") return requested ?? "team";
  return "team";
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** 把数据库行转换成 API 约定中的条目记录。 */
export function entityRecord(row: EntityRow): EntityRecord {
  return {
    kind: row.kind,
    id: row.entityId,
    version: row.version,
    ownerId: row.ownerId,
    visibility: row.visibility,
    deleted: row.deleted,
    ...(row.deleted ? {} : { data: parseStoredJson(row.data) }),
    updatedBy: row.updatedBy,
    updatedAt: new Date(row.updatedAt).toISOString(),
    seq: Number(row.seq),
  };
}

/**
 * 过滤私有条目，并删除非拥有者看到的角色同步标记。
 * tombstoneLinks：增量同步时，别人的链接改成了仅自己可见，其他人要收到删除，
 * 不然本机一直留着改之前的内容。
 */
export function visibleEntity(row: EntityRow, memberId: string, tombstoneLinks = false): EntityRecord | null {
  if (row.visibility === "private" && row.ownerId !== memberId) {
    if (!tombstoneLinks || row.kind !== "link") return null;
    return {
      kind: row.kind,
      id: row.entityId,
      version: row.version,
      ownerId: row.ownerId,
      visibility: "private",
      deleted: true,
      updatedBy: row.updatedBy,
      updatedAt: new Date(row.updatedAt).toISOString(),
      seq: Number(row.seq),
    };
  }
  const record = entityRecord(row);
  if (record.kind === "character" && record.ownerId !== memberId && record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    delete (record.data as Record<string, unknown>).synced;
  }
  return record;
}

/** 转换成员行中可能被数据库驱动解析或序列化的 JSON 头像。 */
export function memberAvatar(value: unknown): MemberAvatar | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "string" ? (() => {
    try { return JSON.parse(value); } catch { return null; }
  })() : value;
  return parseAvatar(parsed) ?? null;
}

/** 将成员行转换为公开成员资料。 */
export function teamMember(row: {
  id: string;
  nickname: string;
  role: TeamRole;
  color: string;
  avatar: unknown;
  joinedAt: Date;
}): TeamMember {
  return {
    id: row.id,
    nickname: row.nickname,
    role: row.role,
    color: row.color,
    avatar: memberAvatar(row.avatar),
    joinedAt: new Date(row.joinedAt).toISOString(),
  };
}

/** 可配置的内存滑动窗口限流器。键数有上限，超过时先清过期的，再丢最久没用的。 */
export class TeamRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly maxKeys = 10_000) {}

  take(key: string, limit: number, windowMs: number, now = Date.now()) {
    const list = (this.hits.get(key) ?? []).filter(time => now - time < windowMs);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000));
    }
    list.push(now);
    // 删掉再放回去：Map 的顺序就是最近使用的顺序
    this.hits.delete(key);
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) {
      for (const [storedKey, times] of this.hits) {
        if (!times.some(time => now - time < windowMs)) this.hits.delete(storedKey);
      }
      // 还是太多（大量新键）：丢掉最久没用的，清到上限的 90%，不必每次请求都整表扫描
      const target = Math.floor(this.maxKeys * 0.9);
      for (const storedKey of this.hits.keys()) {
        if (this.hits.size <= target) break;
        this.hits.delete(storedKey);
      }
    }
    return 0;
  }

  get size() {
    return this.hits.size;
  }
}

/** 按文件头判断图片格式，不信任请求头里的类型。认不出返回 null。 */
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * 取限流用的客户端 IP。线上经过 Cloudflare，它会覆盖 CF-Connecting-IP，客户端伪造不了；
 * 没有这个头时用 X-Forwarded-For 最后一项（最近一层代理加的），最后才用套接字地址。
 * 不用 X-Forwarded-For 第一项：那一项客户端可以随便填。
 */
export function pickClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketAddress?: string
) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v);
  const cf = one(headers["cf-connecting-ip"])?.trim();
  if (cf) return cf;
  const forwarded = one(headers["x-forwarded-for"])
    ?.split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return forwarded?.[forwarded.length - 1] || socketAddress || "unknown";
}
