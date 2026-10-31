/**
 * 本地数据和服务器条目之间的对应关系。
 *
 * - 本地自己的成员 id 一直是 ME_ID（"me"），上传时换成服务器的 memberId，拉取时换回来。
 * - 每个方案、角色、打本记录、避雷、链接、配装、便签是一个条目，key = `${kind}:${id}`。
 * - 哈希按本地形式（带 "me"）计算，用来判断本机有没有改过。
 */
import type {
  EntityKind,
  MemberAvatar,
  TeamInfo,
  TeamMember,
  Visibility,
} from "@shared/teamApi";
import { ME_ID } from "@/data/seed";
import type { Character, Member, Scheme, Team } from "@/data/types";
import type { BlackEntry, RaidLog } from "@/data/records";
import type { SharedLink } from "@/data/links";
import type { Loadout } from "@/data/gear";
import type { NoteImage } from "@/lib/image";
import type { Note, ProtoState } from "@/state/store";
import { apiBase, assetUrl } from "./api";

/** 同步层关心的数据 */
export interface Collections {
  schemes: Scheme[];
  characters: Character[];
  raidLogs: RaidLog[];
  blacklist: BlackEntry[];
  links: SharedLink[];
  loadouts: Record<string, Loadout>;
  notes: Record<string, Note>;
}

export interface LocalEntity {
  kind: EntityKind;
  id: string;
  key: string;
  /** 本地形式 */
  data: unknown;
  visibility: Visibility;
  hash: string;
}

export const entityKey = (kind: EntityKind, id: string) => `${kind}:${id}`;

export function splitKey(key: string): { kind: EntityKind; id: string } {
  const i = key.indexOf(":");
  return { kind: key.slice(0, i) as EntityKind, id: key.slice(i + 1) };
}

/** 稳定的 JSON：对象按键名排序，避免键顺序不同算出不同哈希 */
export function stableJson(v: unknown): string {
  return stable(v);
}
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter(k => o[k] !== undefined)
    .sort()
    .map(k => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** 两个 32 位 FNV-1a 拼起来，碰撞概率足够低 */
export function hashJson(v: unknown): string {
  const s = stable(v);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

function entity(
  kind: EntityKind,
  id: string,
  data: unknown,
  visibility: Visibility
): LocalEntity {
  return { kind, id, key: entityKey(kind, id), data, visibility, hash: hashJson(data) };
}

export function collectionsOf(s: ProtoState): Collections {
  return {
    schemes: s.schemes,
    characters: s.characters,
    raidLogs: s.raidLogs,
    blacklist: s.blacklist,
    links: s.links,
    loadouts: s.loadouts,
    notes: s.notes,
  };
}

/** 本地所有要同步的条目 */
export function collectEntities(c: Collections): Map<string, LocalEntity> {
  const out = new Map<string, LocalEntity>();
  const put = (e: LocalEntity) => out.set(e.key, e);
  for (const x of c.schemes) put(entity("scheme", x.id, x, "team"));
  for (const x of c.characters) put(entity("character", x.id, x, "team"));
  for (const x of c.raidLogs) put(entity("raidLog", x.id, x, "team"));
  for (const x of c.blacklist) put(entity("blacklist", x.id, x, "team"));
  for (const x of c.links)
    put(entity("link", x.id, x, x.visibility === "private" ? "private" : "team"));
  for (const [id, x] of Object.entries(c.loadouts))
    put(entity("loadout", id, x, "private"));
  for (const [id, x] of Object.entries(c.notes))
    put(entity("note", id, x, "private"));
  return out;
}

/** 条目的创建人（本地形式）；用来判断自己能不能改 */
export function localOwner(kind: EntityKind, data: unknown): string | null {
  const d = data as Record<string, unknown>;
  switch (kind) {
    case "character":
      return typeof d.ownerId === "string" ? d.ownerId : null;
    case "raidLog":
    case "blacklist":
    case "link":
      return typeof d.by === "string" ? d.by : null;
    case "loadout":
    case "note":
      return ME_ID;
    default:
      return null;
  }
}

const swap = (v: unknown, from: string, to: string) => (v === from ? to : v);

/** ME_ID ↔ memberId，只换已知字段，用户写的文字里的 "me" 不动 */
function convertIds(kind: EntityKind, data: unknown, from: string, to: string): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  switch (kind) {
    case "scheme": {
      const s = d as unknown as Scheme;
      return {
        ...s,
        versions: (s.versions ?? []).map(v => ({
          ...v,
          authorId: swap(v.authorId, from, to) as string,
        })),
      };
    }
    case "character":
      return { ...d, ownerId: swap(d.ownerId, from, to) };
    case "raidLog":
    case "blacklist":
    case "link":
      return { ...d, by: swap(d.by, from, to) };
    default:
      return data;
  }
}

export const toServer = (kind: EntityKind, data: unknown, myId: string) =>
  convertIds(kind, data, ME_ID, myId);

/**
 * 服务器条目 → 本地形式。ownerId 是服务器记录的拥有者（服务器按真实写入人记，客户端改不了）：
 * 角色的 ownerId、记录 / 避雷 / 链接的 by 以它为准，不信内容里写的，
 * 免得别人把内容里的创建人填成我，让我以为是自己的条目。
 */
export function fromServer(
  kind: EntityKind,
  data: unknown,
  myId: string,
  ownerId?: string
): unknown {
  let bound = data;
  if (ownerId && data && typeof data === "object") {
    if (kind === "character") bound = { ...(data as object), ownerId };
    else if (kind === "raidLog" || kind === "blacklist" || kind === "link")
      bound = { ...(data as object), by: ownerId };
  }
  const d = convertIds(kind, bound, myId, ME_ID);
  // 别人的角色服务器去掉了 synced；本地界面要求有这个字段
  if (kind === "character" && d && typeof d === "object") {
    const c = d as Partial<Character>;
    return { ...c, synced: c.synced ?? {}, liupai: c.liupai ?? [] };
  }
  return d;
}

/** 条目里所有图片（data URL 要先上传） */
export function imagesOf(kind: EntityKind, data: unknown): string[] {
  const d = data as Record<string, unknown> | null;
  if (!d) return [];
  const out: string[] = [];
  if (kind === "raidLog" || kind === "blacklist") {
    for (const im of (d.images as NoteImage[] | undefined) ?? []) out.push(im.src);
  } else if (kind === "link") {
    const im = d.image as NoteImage | undefined;
    if (im) out.push(im.src);
  } else if (kind === "character") {
    const av = d.avatar as { kind: string; src?: string } | undefined;
    if (av?.kind === "upload" && av.src) out.push(av.src);
  }
  return out;
}

/** 把条目里的图片地址按 map 换掉 */
export function replaceImages(
  kind: EntityKind,
  data: unknown,
  map: Map<string, string>
): unknown {
  if (map.size === 0 || !data) return data;
  const d = data as Record<string, unknown>;
  const re = (im: NoteImage): NoteImage =>
    map.has(im.src) ? { ...im, src: map.get(im.src)! } : im;
  if (kind === "raidLog" || kind === "blacklist")
    return { ...d, images: ((d.images as NoteImage[]) ?? []).map(re) };
  if (kind === "link" && d.image) return { ...d, image: re(d.image as NoteImage) };
  if (kind === "character") {
    const av = d.avatar as { kind: string; src?: string } | undefined;
    if (av?.kind === "upload" && av.src && map.has(av.src))
      return { ...d, avatar: { kind: "upload", src: map.get(av.src) } };
  }
  return data;
}

export const isDataUrl = (src: string) => src.startsWith("data:");

/** 可以改写的副本：只在第一次改某个集合时复制 */
export class Draft {
  private touched = new Set<keyof Collections>();
  c: Collections;
  constructor(base: Collections) {
    this.c = { ...base };
  }
  private own<K extends keyof Collections>(k: K): Collections[K] {
    if (!this.touched.has(k)) {
      this.touched.add(k);
      const v = this.c[k];
      this.c[k] = (Array.isArray(v) ? [...v] : { ...v }) as Collections[K];
    }
    return this.c[k];
  }
  get changed() {
    return this.touched.size > 0;
  }
  /** data = null 表示删掉 */
  set(kind: EntityKind, id: string, data: unknown | null) {
    const arr = (k: "schemes" | "characters" | "raidLogs" | "blacklist" | "links") => {
      const list = this.own(k) as { id: string }[];
      const i = list.findIndex(x => x.id === id);
      if (data === null) {
        if (i >= 0) list.splice(i, 1);
      } else if (i >= 0) list[i] = data as { id: string };
      else list.push(data as { id: string });
    };
    const rec = (k: "loadouts" | "notes") => {
      const r = this.own(k) as Record<string, unknown>;
      if (data === null) delete r[id];
      else r[id] = data;
    };
    switch (kind) {
      case "scheme":
        return arr("schemes");
      case "character":
        return arr("characters");
      case "raidLog":
        return arr("raidLogs");
      case "blacklist":
        return arr("blacklist");
      case "link":
        return arr("links");
      case "loadout":
        return rec("loadouts");
      case "note":
        return rec("notes");
    }
  }
}

function avatarFromServer(a: MemberAvatar | null): Member["avatar"] {
  if (!a) return undefined;
  if (a.kind === "upload" && a.src)
    return { kind: "upload", src: assetUrl(a.src) };
  if (a.kind === "preset" && a.mood)
    return { kind: "preset", mood: a.mood as never };
  return undefined;
}

/** 图片的网站地址换回 /manus-storage/ 相对地址（服务器只认这种和 data URL） */
export function storagePath(src: string): string {
  const base = apiBase();
  return src.startsWith(base + "/manus-storage/") ? src.slice(base.length) : src;
}

export function avatarToServer(a: Member["avatar"]): MemberAvatar | null {
  if (!a) return null;
  return a.kind === "upload"
    ? { kind: "upload", src: storagePath(a.src) }
    : { kind: "preset", mood: a.mood };
}

export function membersFromServer(list: TeamMember[], myId: string): Member[] {
  return list.map(m => ({
    id: m.id === myId ? ME_ID : m.id,
    name: m.nickname,
    role: m.role,
    color: m.color,
    avatar: avatarFromServer(m.avatar),
    joinedAt: m.joinedAt,
  }));
}

export function teamFromServer(t: TeamInfo): Team {
  return { name: t.name, inviteCode: t.inviteCode ?? "" };
}
