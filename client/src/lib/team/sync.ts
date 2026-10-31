/**
 * 亲友团同步的纯逻辑：拉下来的条目怎么写进本地、哪些改动要推送、推送结果和冲突怎么处理、
 * 加入和退出时本地数据怎么变。不碰 React 和网络，方便单测。引擎见 TeamSync.tsx。
 *
 * 判断「本机改过没有」靠影子快照：shadow[key] = 服务器版本 v + 本机按它写进界面后的哈希 h。
 * 本地条目的哈希和 h 不一样，就是本机改过；本地没有了但影子还在，就是本机删了。
 */
import {
  TEAM_LIMITS,
  type EntityChange,
  type EntityKind,
  type EntityRecord,
  type PushResult,
  type TeamRole,
} from "@shared/teamApi";
import { ME_ID } from "@/data/seed";
import type { Scheme, SchemeVersion } from "@/data/types";
import { copyTalentFields } from "@/lib/talentSets";
import type { Draft as SchemeDraft, PendingConflict } from "@/state/store";
import type { PendingLocal, ShadowEntry } from "./account";
import { apiBase, assetUrl } from "./api";
import {
  Draft,
  collectEntities,
  entityKey,
  fromServer,
  hashJson,
  imagesOf,
  isDataUrl,
  localOwner,
  replaceImages,
  splitKey,
  toServer,
  type Collections,
} from "./mapping";

const STORAGE = "/manus-storage/";

/** 对本地数据的一项改动；data = null 表示删掉 */
export interface Op {
  kind: EntityKind;
  id: string;
  data: unknown | null;
}

export function applyOps(c: Collections, ops: Op[]): Partial<Collections> {
  if (!ops.length) return {};
  const d = new Draft(c);
  for (const op of ops) d.set(op.kind, op.id, op.data);
  return d.c;
}

/* ---------------- 图片地址 ---------------- */

/** 服务器上存的是 /manus-storage/ 相对地址，写进本地前拼上网站地址 */
export function localizeImages(kind: EntityKind, data: unknown): unknown {
  const srcs = imagesOf(kind, data).filter(s => s.startsWith(STORAGE));
  if (!srcs.length) return data;
  return replaceImages(kind, data, new Map(srcs.map(s => [s, assetUrl(s)])));
}

/** 推送前把网站地址换回相对地址 */
export function serverizeImages(kind: EntityKind, data: unknown): unknown {
  const base = apiBase();
  const srcs = imagesOf(kind, data).filter(s => s.startsWith(base + STORAGE));
  if (!srcs.length) return data;
  return replaceImages(
    kind,
    data,
    new Map(srcs.map(s => [s, s.slice(base.length)]))
  );
}

/* ---------------- 权限（和服务器 canWriteEntity 一致） ---------------- */

export const isEditor = (r: TeamRole | undefined) =>
  r === "admin" || r === "editor";

/**
 * 能不能把这项改动推上去。local = null 表示删除。
 * 服务器会再查一遍；这里先拦住，避免明知没权限还去请求。
 */
export function canPush(
  kind: EntityKind,
  local: { data: unknown } | null,
  shadow: ShadowEntry | undefined,
  role: TeamRole | undefined
): boolean {
  if (kind === "scheme") return isEditor(role);
  if (kind === "raidLog" || kind === "blacklist") {
    if (local) return isEditor(role);
    return role === "admin" || shadow?.m === 1;
  }
  // 角色、链接、配装、便签：只有创建人能改
  if (shadow) return shadow.m === 1;
  return !!local && localOwner(kind, local.data) === ME_ID;
}

/* ---------------- 拉取 ---------------- */

export interface PullPlan {
  ops: Op[];
  shadow: Record<string, ShadowEntry>;
  rejected: Record<string, string>;
}

/**
 * 把服务器返回的条目合进本地。
 *
 * - 本机没改过：用服务器的。
 * - 第一次整份拉取（还没有影子）或这项改动被服务器拒过：以服务器为准。
 * - 本机也改过：方案留着本机的，推送时服务器判冲突；其他条目以本机为准，推送时覆盖。
 * - full：since=0 只返回没删除的条目；影子里有、这次没返回的，说明服务器上已经删了。
 * - memberIds：现在的成员（本地形式）。不在里面的人的角色从本机去掉。
 */
export function planPull(
  c: Collections,
  acc: {
    shadow: Record<string, ShadowEntry>;
    rejected: Record<string, string>;
  },
  records: EntityRecord[],
  myId: string,
  full: boolean,
  memberIds: Set<string>
): PullPlan {
  const local = collectEntities(c);
  const shadow = { ...acc.shadow };
  const rejected = { ...acc.rejected };
  const ops: Op[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const key = entityKey(r.kind, r.id);
    seen.add(key);
    const L = local.get(key);
    const S = shadow[key];
    const authoritative = (full && !S) || key in rejected;
    const dirty = L ? !S || L.hash !== S.h : !!S;
    const mine = r.ownerId === myId ? ({ m: 1 } as const) : {};

    if (r.deleted) {
      if (L && dirty && !authoritative) {
        // 本机改过、别人删了：留着本机的，之后当作重新建推上去
        shadow[key] = { v: r.version, h: "", ...mine };
      } else {
        if (L) ops.push({ kind: r.kind, id: r.id, data: null });
        delete shadow[key];
        delete rejected[key];
      }
      continue;
    }

    const remote = localizeImages(
      r.kind,
      fromServer(r.kind, r.data, myId, r.ownerId)
    );
    const rh = hashJson(remote);
    if (L && L.hash === rh) {
      shadow[key] = { v: r.version, h: rh, ...mine };
      delete rejected[key];
      continue;
    }
    if (!dirty || authoritative) {
      ops.push({ kind: r.kind, id: r.id, data: remote });
      shadow[key] = { v: r.version, h: rh, ...mine };
      delete rejected[key];
      continue;
    }
    // 两边都改了。方案的影子不动，推送时服务器返回冲突
    if (r.kind === "scheme") continue;
    shadow[key] = { v: r.version, h: S?.h ?? "", ...mine };
  }

  if (full) {
    for (const key of Object.keys(shadow)) {
      if (seen.has(key)) continue;
      const L = local.get(key);
      const { kind, id } = splitKey(key);
      if (L && L.hash !== shadow[key].h && !(key in rejected)) {
        // 本机改过：去掉影子，当作新建推上去
        delete shadow[key];
        continue;
      }
      if (L) ops.push({ kind, id, data: null });
      delete shadow[key];
      delete rejected[key];
    }
  }

  // 已经被移除的成员的角色
  for (const [key, L] of local) {
    if (L.kind !== "character") continue;
    const owner = localOwner("character", L.data);
    if (owner && owner !== ME_ID && !memberIds.has(owner)) {
      ops.push({ kind: "character", id: L.id, data: null });
      delete shadow[key];
      delete rejected[key];
    }
  }

  return { ops, shadow, rejected };
}

/* ---------------- 推送 ---------------- */

export interface Outgoing {
  key: string;
  kind: EntityKind;
  id: string;
  /** 本地形式；删除时是 null */
  data: unknown | null;
  /** 本地形式的哈希；删除时是 "" */
  hash: string;
  /** 推成功后是不是自己的条目 */
  mine: boolean;
  /** 还没上传的图片（data URL） */
  uploads: string[];
  change: EntityChange;
}

export interface PushPlan {
  out: Outgoing[];
  /** 本机删了但没权限删的：只去掉影子，不推 */
  drop: string[];
}

export function buildChange(
  kind: EntityKind,
  id: string,
  data: unknown,
  baseVersion: number,
  myId: string
): EntityChange {
  const server = serverizeImages(kind, toServer(kind, data, myId));
  const vis = (data as { visibility?: string }).visibility;
  return {
    kind,
    id,
    baseVersion,
    data: server,
    ...(kind === "link"
      ? { visibility: vis === "private" ? "private" : "team" }
      : {}),
  };
}

/**
 * 找出本机改过、要推上去的条目。
 * skipSchemes：正在处理冲突的方案先不推。
 */
export function planPush(
  c: Collections,
  acc: {
    shadow: Record<string, ShadowEntry>;
    rejected: Record<string, string>;
  },
  myId: string,
  role: TeamRole | undefined,
  skipSchemes: Set<string> = new Set()
): PushPlan {
  const local = collectEntities(c);
  const out: Outgoing[] = [];
  const drop: string[] = [];
  for (const [key, L] of local) {
    const S = acc.shadow[key];
    if (S && S.h === L.hash) continue;
    if (acc.rejected[key] === L.hash) continue;
    if (L.kind === "scheme" && skipSchemes.has(L.id)) continue;
    if (!canPush(L.kind, L, S, role)) continue;
    out.push({
      key,
      kind: L.kind,
      id: L.id,
      data: L.data,
      hash: L.hash,
      mine: S ? S.m === 1 : true,
      uploads: Array.from(new Set(imagesOf(L.kind, L.data).filter(isDataUrl))),
      change: buildChange(L.kind, L.id, L.data, S?.v ?? 0, myId),
    });
  }
  for (const key of Object.keys(acc.shadow)) {
    if (local.has(key)) continue;
    const S = acc.shadow[key];
    const { kind, id } = splitKey(key);
    if (acc.rejected[key] === "") continue;
    if (kind === "scheme" && skipSchemes.has(id)) continue;
    if (!canPush(kind, null, S, role)) {
      drop.push(key);
      continue;
    }
    out.push({
      key,
      kind,
      id,
      data: null,
      hash: "",
      mine: S.m === 1,
      uploads: [],
      change: { kind, id, baseVersion: S.v, deleted: true },
    });
  }
  return { out, drop };
}

/** 按 50 项、约 3 MB 分批（服务器请求体上限 4 MB） */
export function batches(out: Outgoing[], maxBytes = 3_000_000): Outgoing[][] {
  const list: Outgoing[][] = [];
  let cur: Outgoing[] = [];
  let size = 0;
  for (const o of out) {
    const n = JSON.stringify(o.change).length;
    if (
      cur.length &&
      (cur.length >= TEAM_LIMITS.pushBatch || size + n > maxBytes)
    ) {
      list.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(o);
    size += n;
  }
  if (cur.length) list.push(cur);
  return list;
}

/** 单项超过服务器上限（512 KB）的，不用发也知道会被拒 */
export function tooLarge(o: Outgoing): boolean {
  if (o.change.deleted) return false;
  return (
    new TextEncoder().encode(JSON.stringify(o.change.data ?? null)).length >
    TEAM_LIMITS.entityBytes
  );
}

export interface PushOutcome {
  shadow: Record<string, ShadowEntry>;
  rejected: Record<string, string>;
  conflicts: { key: string; id: string; current?: EntityRecord }[];
  errors: { key: string; error: string; message: string }[];
  okCount: number;
}

export function applyPushResults(
  acc: {
    shadow: Record<string, ShadowEntry>;
    rejected: Record<string, string>;
  },
  sent: Outgoing[],
  results: PushResult[]
): PushOutcome {
  const shadow = { ...acc.shadow };
  const rejected = { ...acc.rejected };
  const conflicts: PushOutcome["conflicts"] = [];
  const errors: PushOutcome["errors"] = [];
  let okCount = 0;
  sent.forEach((o, i) => {
    const r = results[i];
    if (!r || r.kind !== o.kind || r.id !== o.id) return;
    if (r.ok) {
      okCount++;
      delete rejected[o.key];
      if (o.change.deleted) delete shadow[o.key];
      else
        shadow[o.key] = {
          v: r.version,
          h: o.hash,
          ...(o.mine ? { m: 1 as const } : {}),
        };
      return;
    }
    if (r.error === "conflict") {
      conflicts.push({ key: o.key, id: o.id, current: r.current });
      return;
    }
    rejected[o.key] = o.hash;
    errors.push({ key: o.key, error: r.error, message: r.message });
  });
  return { shadow, rejected, conflicts, errors, okCount };
}

/* ---------------- 方案冲突 ---------------- */

export type ConflictPlan =
  /** 服务器上没有或已删：按 shadow 的版本重新推 */
  | { type: "recreate"; shadow?: ShadowEntry }
  /** 本机没有多出来的版本：直接用服务器的 */
  | { type: "adopt"; scheme: Scheme | null; shadow: ShadowEntry }
  /** 两边都保存了新版本：服务器的写进本地，我的放进草稿，弹冲突提示 */
  | {
      type: "conflict";
      scheme: Scheme;
      shadow: ShadowEntry;
      draft: SchemeDraft;
      conflict: PendingConflict;
    };

const sameVersion = (a: SchemeVersion, b: SchemeVersion) =>
  a.version === b.version && a.at === b.at && a.authorId === b.authorId;

export function planConflict(
  local: Scheme | undefined,
  current: EntityRecord | undefined,
  myId: string
): ConflictPlan {
  if (!current) return { type: "recreate" };
  const mine = current.ownerId === myId ? ({ m: 1 } as const) : {};
  if (current.deleted)
    return { type: "recreate", shadow: { v: current.version, h: "", ...mine } };
  const server = localizeImages(
    "scheme",
    fromServer("scheme", current.data, myId)
  ) as Scheme;
  const shadow = { v: current.version, h: hashJson(server), ...mine };
  // 本机删了，别人同时改了：保留别人的
  if (!local) return { type: "adopt", scheme: server, shadow };
  const extra = local.versions.filter(
    v => !server.versions.some(sv => sameVersion(sv, v))
  );
  const rival = server.versions[server.versions.length - 1];
  if (!extra.length || !rival) {
    // 只改了标题之类：用服务器的版本，标题留本机的，之后再推一次
    return {
      type: "adopt",
      scheme: { ...server, title: local.title },
      shadow,
    };
  }
  const myLast = extra[extra.length - 1];
  // 我是基于哪个版本改的：我的版本号减一；找不到就用对方之前的那一版
  const base =
    server.versions.find(v => v.version === myLast.version - 1) ??
    server.versions[server.versions.length - 2];
  return {
    type: "conflict",
    scheme: server,
    shadow,
    draft: {
      schemeId: server.id,
      xinfa: server.xinfa,
      mode: server.mode,
      baseVersion: rival.version,
      macros: myLast.macros,
      ...copyTalentFields(myLast),
    },
    conflict: {
      schemeId: server.id,
      rival,
      note: myLast.note,
      ...(base ? { base } : {}),
    },
  };
}

/* ---------------- 加入、登录、退出 ---------------- */

export interface JoinPlan {
  collections: Partial<Collections>;
  pending: PendingLocal;
}

/**
 * 加入别人的亲友团或在第二台电脑登录：自己的角色、配装、便签、自己的链接留着并推上去；
 * 方案、打本记录、避雷用亲友团的。本机原有的这三类先放进 pending，让有权限的人选择是否并入。
 */
export function prepareJoin(c: Collections): JoinPlan {
  return {
    collections: {
      schemes: [],
      raidLogs: [],
      blacklist: [],
      characters: c.characters.filter(x => x.ownerId === ME_ID),
      links: c.links.filter(x => x.by === ME_ID),
    },
    pending: {
      schemes: c.schemes,
      raidLogs: c.raidLogs,
      blacklist: c.blacklist,
    },
  };
}

/** 拉到亲友团的数据后：亲友团里已经有同一个方案（同心法同模式）的，不再并入 */
export function filterPending(
  p: PendingLocal,
  c: Collections
): { pending: PendingLocal; skipped: Scheme[] } {
  const has = new Set(c.schemes.map(s => s.id));
  const rl = new Set(c.raidLogs.map(x => x.id));
  const bl = new Set(c.blacklist.map(x => x.id));
  return {
    pending: {
      schemes: p.schemes.filter(s => !has.has(s.id)),
      raidLogs: p.raidLogs.filter(x => !rl.has(x.id)),
      blacklist: p.blacklist.filter(x => !bl.has(x.id)),
    },
    skipped: p.schemes.filter(s => has.has(s.id)),
  };
}

/** 并入：放进本地，之后按新建推上去 */
export function mergePending(
  c: Collections,
  p: PendingLocal
): Partial<Collections> {
  const has = new Set(c.schemes.map(s => s.id));
  const rl = new Set(c.raidLogs.map(x => x.id));
  const bl = new Set(c.blacklist.map(x => x.id));
  return {
    schemes: [...c.schemes, ...p.schemes.filter(s => !has.has(s.id))],
    raidLogs: [...p.raidLogs.filter(x => !rl.has(x.id)), ...c.raidLogs],
    blacklist: [...p.blacklist.filter(x => !bl.has(x.id)), ...c.blacklist],
  };
}

/**
 * 退出登录或被移除：留下自己的东西，去掉别人的角色、记录、避雷、链接。
 * 方案留着（离开后还能接着用）；还没并入的本机内容放回来。
 */
export function prepareLeave(
  c: Collections,
  pending: PendingLocal | null
): Partial<Collections> {
  const base: Collections = {
    ...c,
    characters: c.characters.filter(x => x.ownerId === ME_ID),
    raidLogs: c.raidLogs.filter(x => x.by === ME_ID),
    blacklist: c.blacklist.filter(x => x.by === ME_ID),
    links: c.links.filter(x => x.by === ME_ID),
  };
  const back = pending ? mergePending(base, pending) : {};
  return { ...base, ...back };
}
