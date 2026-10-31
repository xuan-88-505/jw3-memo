/**
 * 亲友团联网版（2.0）的接口请求。接口约定见 shared/teamApi.ts。
 *
 * 桌面版直接请求已发布网站的地址（SITE_ORIGIN）。测试时可以在 localStorage
 * 写 `tongdiao.apiBase` 指向本地开发服务，例如 http://127.0.0.1:3000。
 */
import type {
  AuthResult,
  ClientPlatform,
  CreateTeamRequest,
  EntityChange,
  FileUploadResponse,
  JoinTeamRequest,
  LoginCodeResponse,
  MemberPatch,
  PushResponse,
  SyncResponse,
  TeamError,
  TeamErrorCode,
  TeamInfo,
} from "@shared/teamApi";
import { SITE_ORIGIN } from "@/lib/desktop";

const API_BASE_KEY = "tongdiao.apiBase";

/** 接口地址；没有覆盖时用已发布网站 */
export function apiBase(): string {
  try {
    const v = localStorage.getItem(API_BASE_KEY);
    if (v && /^https?:\/\/[^\s]+$/.test(v)) return v.replace(/\/+$/, "");
  } catch {
    /* 读不了本地存储时用默认地址 */
  }
  return SITE_ORIGIN;
}

/** 条目里存的是 /manus-storage/<key>，显示时拼上网站地址 */
export function assetUrl(src: string): string {
  return src.startsWith("/manus-storage/") ? apiBase() + src : src;
}

export type ApiErrorCode = TeamErrorCode | "offline";

export class TeamApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "TeamApiError";
  }
}

/** 连不上服务器、令牌失效这两种情况，同步层要分开处理 */
export function isOffline(err: unknown) {
  return err instanceof TeamApiError && err.code === "offline";
}
export function isUnauthorized(err: unknown) {
  return err instanceof TeamApiError && err.code === "unauthorized";
}

const TIMEOUT_MS = 20_000;

interface ReqOptions {
  token?: string;
  json?: unknown;
  blob?: Blob;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: ReqOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.blob) {
    headers["Content-Type"] = opts.blob.type || "application/octet-stream";
    body = opts.blob;
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });
  } catch {
    throw new TeamApiError("offline", 0, "连不上服务器，检查网络后再试");
  } finally {
    window.clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data ?? {}) as Partial<TeamError>;
    // 服务器休眠刚醒、网关出错：按连不上处理，稍后自动重试
    if (res.status >= 502 && res.status <= 504)
      throw new TeamApiError("offline", res.status, "服务器暂时连不上");
    throw new TeamApiError(
      (e.error as TeamErrorCode) ?? "server_error",
      res.status,
      typeof e.message === "string" && e.message
        ? e.message
        : `请求失败（${res.status}）`,
      typeof e.retryAfter === "number" ? e.retryAfter : undefined
    );
  }
  return data as T;
}

export const teamApi = {
  create: (body: CreateTeamRequest) =>
    request<AuthResult>("POST", "/api/team/create", { json: body }),
  join: (body: JoinTeamRequest) =>
    request<AuthResult>("POST", "/api/team/join", { json: body }),
  login: (code: string, platform: ClientPlatform) =>
    request<AuthResult>("POST", "/api/team/login", {
      json: { code, platform },
    }),
  logout: (token: string) =>
    request<{ ok: true }>("POST", "/api/team/logout", { token, json: {} }),
  /** 生成登录码，用来在另一台电脑登录。memberId 不填是给自己；给别人生成限管理员 */
  loginCode: (token: string, memberId?: string) =>
    request<LoginCodeResponse>("POST", "/api/team/login-code", {
      token,
      json: memberId ? { memberId } : {},
    }),
  sync: (token: string, since: number) =>
    request<SyncResponse>("GET", `/api/team/sync?since=${since}`, { token }),
  push: (token: string, changes: EntityChange[]) =>
    request<PushResponse>("POST", "/api/team/push", {
      token,
      json: { changes },
    }),
  patchMember: (token: string, id: string, patch: MemberPatch) =>
    request<unknown>("PATCH", `/api/team/members/${encodeURIComponent(id)}`, {
      token,
      json: patch,
    }),
  removeMember: (token: string, id: string) =>
    request<{ ok: true }>(
      "DELETE",
      `/api/team/members/${encodeURIComponent(id)}`,
      { token }
    ),
  resetInvite: (token: string) =>
    request<{ inviteCode: string }>("POST", "/api/team/invite/reset", {
      token,
      json: {},
    }),
  renameTeam: (token: string, name: string) =>
    request<{ team: TeamInfo }>("PATCH", "/api/team", {
      token,
      json: { name },
    }),
  uploadFile: (token: string, blob: Blob) =>
    request<FileUploadResponse>("POST", "/api/team/files", { token, blob }),
};
