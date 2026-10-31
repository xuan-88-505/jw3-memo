/**
 * 本机的亲友团登录信息。只有管理窗口的同步层读写，存在 localStorage，
 * 不写进 data.json，也不会跟着「导出数据」出去。
 */
import type { Scheme } from "@/data/types";
import type { BlackEntry, RaidLog } from "@/data/records";

const ACCOUNT_KEY = "tongdiao.account.v1";

/** 影子快照：服务器上这个条目的版本，以及本机按它写进界面后的内容哈希 */
export interface ShadowEntry {
  v: number;
  h: string;
  /** 条目是自己建的。本机删掉后推送删除时用来判断有没有权限 */
  m?: 1;
}

/**
 * 加入或登录时本机已有、还没放进亲友团的内容。新成员默认只读，不能直接推上去；
 * 留在这里等有权限的人选择「放进亲友团」或「不要了」。
 */
export interface PendingLocal {
  schemes: Scheme[];
  raidLogs: RaidLog[];
  blacklist: BlackEntry[];
}

export interface Account {
  v: 1;
  token: string;
  memberId: string;
  teamId: string;
  /** 已经拉到的变更序号 */
  seq: number;
  /** key = `${kind}:${id}` */
  shadow: Record<string, ShadowEntry>;
  /** 服务器拒绝过的改动：key → 被拒时的内容哈希。内容再变才重试 */
  rejected: Record<string, string>;
  /** 加入时本机有、亲友团里没有的内容，等用户选择是否并入 */
  pending: PendingLocal;
  /** 被拒过的改动要从服务器整份拉回来，下次拉取用 since=0 */
  needFull: boolean;
  /** 最后一次同步成功的时间（ISO） */
  lastSyncAt: string | null;
}

export const emptyPending = (): PendingLocal => ({
  schemes: [],
  raidLogs: [],
  blacklist: [],
});

export const pendingCountOf = (p: PendingLocal) =>
  p.schemes.length + p.raidLogs.length + p.blacklist.length;

export function newAccount(
  token: string,
  memberId: string,
  teamId: string
): Account {
  return {
    v: 1,
    token,
    memberId,
    teamId,
    seq: 0,
    shadow: {},
    rejected: {},
    pending: emptyPending(),
    needFull: false,
    lastSyncAt: null,
  };
}

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<Account>;
    if (
      a?.v !== 1 ||
      typeof a.token !== "string" ||
      typeof a.memberId !== "string" ||
      typeof a.teamId !== "string"
    )
      return null;
    const p = (a.pending ?? {}) as Partial<PendingLocal>;
    return {
      v: 1,
      token: a.token,
      memberId: a.memberId,
      teamId: a.teamId,
      seq: typeof a.seq === "number" ? a.seq : 0,
      shadow: a.shadow && typeof a.shadow === "object" ? a.shadow : {},
      rejected: a.rejected && typeof a.rejected === "object" ? a.rejected : {},
      pending: {
        schemes: Array.isArray(p.schemes) ? p.schemes : [],
        raidLogs: Array.isArray(p.raidLogs) ? p.raidLogs : [],
        blacklist: Array.isArray(p.blacklist) ? p.blacklist : [],
      },
      needFull: a.needFull === true,
      lastSyncAt: typeof a.lastSyncAt === "string" ? a.lastSyncAt : null,
    };
  } catch {
    return null;
  }
}

export function saveAccount(a: Account) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
  } catch (err) {
    console.error("登录信息保存失败", err);
  }
}

export function clearAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* 本地存储不可用时没有可清的 */
  }
}
