import { clampSize, type PanelSize } from "@/lib/panelSize";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ME_ID,
  SEED_CHARACTERS,
  SEED_MEMBERS,
  SEED_TEAM,
  XINFA_LIST,
  defaultTalents,
  layersOf,
  xinfasOf,
  rivalEdit,
  seedSchemes,
} from "@/data/seed";
import type { GearConfig } from "@/data/enchants";
import {
  applyConfig,
  hasteOf,
  makeLoadout,
  patchDelta,
  seedLoadoutZixia,
  seedLoadoutZixiaAlt,
  applyDraft,
  draftChanges,
  type GearDraft,
  type Loadout,
  type LoadoutSource,
} from "@/data/gear";
import {
  seedBlacklist,
  seedRaidLogs,
  type BlackEntry,
  type RaidLog,
} from "@/data/records";
import {
  autoTitle,
  seedLinks,
  visibleLinks,
  type LinkVisibility,
  type SharedLink,
} from "@/data/links";
import { MODES } from "@/data/types";
import type { BuffSelection } from "@/lib/buffs";
import { diffVersions } from "@/lib/diff";
import { DEFAULT_HOTKEYS, type Hotkey } from "@/lib/hotkey";
import type { NoteImage } from "@/lib/image";
import {
  DESKTOP_PLATFORM,
  IS_DESKTOP,
  WINDOW_LABEL,
  backupData,
  loadData,
  onDataChanged,
  onPanelShown,
  saveData,
} from "@/lib/desktop";
import { HUANGJI_MOODS, type HuangjiMood } from "@/components/brand/Huangji";
import type {
  Character,
  DataState,
  Macro,
  ManagerSection,
  Member,
  Mode,
  Platform,
  Role,
  Scene,
  Scheme,
  SchemeVersion,
  SyncStatus,
  Team,
  CharacterAvatar,
} from "@/data/types";
import { tx } from "@/lib/i18n";

// ---------- 状态 ----------

export type ToastSurface = "panel" | "manager";
export interface UiToast {
  id: number;
  surface: ToastSurface;
  kind: "success" | "error" | "info";
  text: string;
}

export interface Draft {
  schemeId: string;
  xinfa: string;
  mode: Mode;
  /** 0 表示新建方案 */
  baseVersion: number;
  macros: Macro[];
  talents: number[];
  /** 新建还没保存的方案，自定义标题先放在草稿里 */
  title?: string;
}

export interface PendingConflict {
  schemeId: string;
  rival: SchemeVersion;
  note: string;
}

export interface ProtoState {
  team: Team | null;
  members: Member[];
  characters: Character[];
  schemes: Scheme[];
  drafts: Record<string, Draft>;
  pendingConflict: PendingConflict | null;

  platform: Platform;
  scene: Scene;
  dataState: DataState;
  simulateConflict: boolean;

  panelOpen: boolean;
  pinned: boolean;
  panelOffset: { x: number; y: number };
  /** 用户调过的面板大小；null 表示默认 360 × 500 */
  panelSize: PanelSize | null;
  coachSeen: boolean;
  /** 设置：开机自动启动（原型只记状态） */
  launchAtLogin: boolean;
  /** 设置：托盘黄鸡的动效。hover = 悬停时动（默认），always = 一直动，off = 不动 */
  trayMotion: TrayMotion;
  managerOpen: boolean;
  managerSection: ManagerSection;
  managerIntent: ManagerIntent | null;
  activeCharId: string;
  activeMode: Record<string, Mode>;
  /** 多心法角色在面板里正在看的心法 */
  activeXinfa: Record<string, string>;
  selectedSchemeId: string;
  changelogFilter: string;
  /** 方案库里显示哪一页：方案列表 + 编辑，或二级页「修改记录」 */
  schemesPage: "list" | "changelog";
  /**
   * 修改记录里关注的心法。null 表示用户还没改过，用默认值（见 followedXinfa）。
   * 只属于本人，存在本机，不同步给亲友。
   */
  followedXinfa: string[] | null;
  /**
   * 管理窗口侧栏的顺序（不含底部的「设置」）。null 表示用户没排过，用 DEFAULT_NAV。
   * 只属于本人，存在本机，不同步给亲友。
   */
  navOrder: NavSection[] | null;
  toasts: UiToast[];
  /**
   * 便签：每个角色一份（按角色 id 存），和心法、PVE/PVP 无关。
   * 只属于本人，不进亲友团共享的数据。
   */
  notes: Record<string, Note>;
  /**
   * 配装与木桩：按配装 id 存，和便签一样只属于本人。
   * 配装按心法建，关联角色是可选的（Loadout.charId）。
   */
  loadouts: Record<string, Loadout>;
  /** 配装页正在看的配装 */
  activeLoadoutId: string | null;
  /** 本机设置：每台电脑分开保存，不同步给亲友 */
  hotkeys: Record<Platform, Hotkey>;
  /** 记录：打本记录和避雷名单，亲友团共享 */
  raidLogs: RaidLog[];
  blacklist: BlackEntry[];
  /** 链接：亲友团可见的全团共享；仅自己可见的只有添加人看得到 */
  links: SharedLink[];
  /** 正在录制新快捷键时，暂停全局快捷键 */
  recordingHotkey: boolean;
}

function seedData() {
  return {
    team: { ...SEED_TEAM },
    members: SEED_MEMBERS.map(m => ({ ...m })),
    characters: SEED_CHARACTERS.map(c => ({ ...c, synced: { ...c.synced } })),
    schemes: seedSchemes(),
    drafts: {},
    pendingConflict: null,
    raidLogs: seedRaidLogs(),
    blacklist: seedBlacklist(),
    links: seedLinks(ME_ID),
  };
}

/** 打开管理窗口时顺便要做的事：添加角色，或新建某心法某模式的方案 */
export type ManagerIntent =
  | "add-character"
  | { newScheme: { xinfa: string; mode: Mode } };

export interface Note {
  text: string;
  /** 最后编辑时间 */
  at: string;
}
export const NOTE_MAX = 2000;
/** 便签的本地记录；必须在 initialState 之前定义 */
const NOTES_KEY = "tongdiao.notes.v3";
/** 上一版：全局一份 */
const GLOBAL_NOTE_KEY = "tongdiao.note.v2";
/** 更早一版：也是每个角色一份 */
const OLD_NOTES_KEY = "tongdiao.notes.v1";
const SEED_NOTES: Record<string, Note> = {
  c1: {
    text: "周三、周日 20:00 打 25 人英雄，团长 YY 88123\n还缺：腰坠、暗器\n每周一记得领帮会资源",
    at: "2026-10-28T21:12:00+08:00",
  },
  c2: {
    text: "奶妈位，团长要求进本前报一下装分\n周五 21:00 帮会战",
    at: "2026-10-27T19:40:00+08:00",
  },
};
/** 去掉空便签 */
function cleanNotes(v: unknown): Record<string, Note> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, Note> = {};
  for (const [id, n] of Object.entries(v as Record<string, Note | null>))
    if (n && typeof n.text === "string" && n.text.trim()) out[id] = n;
  return out;
}
/** 旧的全局便签交给当时选中的角色，不复制给所有角色 */
function adoptGlobalNote(
  note: unknown,
  charId: string | undefined
): Record<string, Note> {
  const n = note as Note | null;
  if (!charId || !n || typeof n.text !== "string" || !n.text.trim()) return {};
  return { [charId]: n };
}
function readNotes(activeCharId: string): Record<string, Note> {
  if (typeof window === "undefined") return SEED_NOTES;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw !== null) return cleanNotes(JSON.parse(raw));
    const global = localStorage.getItem(GLOBAL_NOTE_KEY);
    if (global !== null)
      return adoptGlobalNote(JSON.parse(global), activeCharId);
    const old = localStorage.getItem(OLD_NOTES_KEY);
    if (old !== null) return cleanNotes(JSON.parse(old));
    return SEED_NOTES;
  } catch {
    return SEED_NOTES;
  }
}
/** 侧栏默认顺序；「设置」固定在底部，不参与排序 */
export type NavSection = Exclude<ManagerSection, "settings">;
export const DEFAULT_NAV: NavSection[] = [
  "schemes",
  "characters",
  "gear",
  "records",
  "team",
];
/** 去掉未知项和重复项，补上新增的项，保证每一项都在且只出现一次 */
function normalizeNav(list: unknown): NavSection[] | null {
  if (!Array.isArray(list)) return null;
  const known = list.filter(
    (k, i): k is NavSection =>
      DEFAULT_NAV.includes(k as NavSection) && list.indexOf(k) === i
  );
  return [...known, ...DEFAULT_NAV.filter(k => !known.includes(k))];
}
/** 侧栏顺序的本地记录；必须在 initialState 之前定义 */
const NAV_KEY = "tongdiao.navOrder.v1";
function readNavOrder(): NavSection[] | null {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(NAV_KEY) : null;
    return raw ? normalizeNav(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
/** 关注心法的本地记录；必须在 initialState 之前定义 */
const FOLLOW_KEY = "tongdiao.followedXinfa.v1";
function readFollowed(): string[] | null {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(FOLLOW_KEY) : null;
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : null;
  } catch {
    return null;
  }
}
/** 托盘提示"看过"的本地记录；必须在 initialState 之前定义 */
/** 面板调过的大小；不分系统 */
const PANEL_SIZE_KEY = "tongdiao.panelSize.v1";
function readPanelSize(): PanelSize | null {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(PANEL_SIZE_KEY)
        : null;
    const v = raw ? JSON.parse(raw) : null;
    if (v && Number.isFinite(v.w) && Number.isFinite(v.h)) return clampSize(v);
  } catch {
    /* 读不到就用默认大小 */
  }
  return null;
}
/** 面板拖到的位置（相对托盘旁默认位置的偏移）；记下系统，换系统时不沿用 */
const PANEL_POS_KEY = "tongdiao.panelOffset.v1";
function readPanelOffset(platform: Platform): { x: number; y: number } {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(PANEL_POS_KEY)
        : null;
    const v = raw ? JSON.parse(raw) : null;
    if (
      v &&
      v.platform === platform &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y)
    )
      return { x: v.x, y: v.y };
  } catch {
    /* 读不到就用默认位置 */
  }
  return { x: 0, y: 0 };
}
const COACH_KEY = "tongdiao.coachSeen";

function readCoachSeen() {
  try {
    return (
      typeof window !== "undefined" && localStorage.getItem(COACH_KEY) === "1"
    );
  } catch {
    return false;
  }
}

const initialState: ProtoState = {
  ...seedData(),
  notes: readNotes("c1"),
  loadouts: { lo1: seedLoadoutZixia(), lo2: seedLoadoutZixiaAlt() },
  activeLoadoutId: "lo1",
  platform: "win",
  scene: "desktop",
  dataState: "normal",
  simulateConflict: false,
  panelOpen: false,
  pinned: false,
  panelOffset: readPanelOffset("win"),
  panelSize: readPanelSize(),
  coachSeen: readCoachSeen(),
  launchAtLogin: true,
  trayMotion: "hover",
  managerOpen: false,
  managerSection: "schemes",
  managerIntent: null,
  activeCharId: "c1",
  activeMode: {},
  activeXinfa: {},
  selectedSchemeId: "紫霞功-PVE",
  changelogFilter: "全部",
  schemesPage: "list",
  followedXinfa: readFollowed(),
  navOrder: readNavOrder(),
  toasts: [],
  hotkeys: { ...DEFAULT_HOTKEYS },
  recordingHotkey: false,
};

// ---------- 桌面版数据 ----------

/**
 * 桌面版第一次打开：不带示例数据，自己是唯一成员，没有亲友团。
 * 读到 data.json 后再用文件里的内容覆盖。
 */
function desktopInitial(): Partial<ProtoState> {
  // 自己的资料从示例复制，但不带作者标记：作者要在设置里输入作者码
  const { author: _author, ...self } =
    SEED_MEMBERS.find(m => m.id === ME_ID) ?? SEED_MEMBERS[0];
  return {
    team: null,
    members: [{ ...self, role: "admin", joinedAt: new Date().toISOString() }],
    characters: [],
    schemes: [],
    drafts: {},
    pendingConflict: null,
    raidLogs: [],
    blacklist: [],
    links: [],
    loadouts: {},
    activeLoadoutId: null,
    notes: {},
    platform: DESKTOP_PLATFORM,
    scene: "desktop",
    dataState: "normal",
    panelOffset: { x: 0, y: 0 },
    panelSize: null,
    coachSeen: true,
    launchAtLogin: false,
    managerOpen: true,
    managerSection: "characters",
    activeCharId: "",
    selectedSchemeId: "",
    followedXinfa: null,
    navOrder: null,
  };
}

/** 存进 data.json 的字段：业务数据和本机设置。面板开关、草稿、提示这类界面状态不存 */
const PERSIST_KEYS = [
  "members",
  "characters",
  "schemes",
  "raidLogs",
  "blacklist",
  "links",
  "loadouts",
  "activeLoadoutId",
  "notes",
  "hotkeys",
  "launchAtLogin",
  "trayMotion",
  "followedXinfa",
  "navOrder",
  "activeCharId",
  "activeMode",
  "activeXinfa",
  "selectedSchemeId",
] as const satisfies readonly (keyof ProtoState)[];

/** 这些字段必须是数组，否则整份文件不认 */
const ARRAY_KEYS = new Set<string>([
  "members",
  "characters",
  "schemes",
  "raidLogs",
  "blacklist",
  "links",
]);

const DATA_APP = "tongdiao";
const DATA_VERSION = 1;

/** 生成 data.json 的内容；导出数据也用它 */
export function serializeData(s: ProtoState) {
  const data = Object.fromEntries(PERSIST_KEYS.map(k => [k, s[k]]));
  return JSON.stringify({ app: DATA_APP, version: DATA_VERSION, data });
}

/** 解析 data.json 或导入的文件；不是备忘录的数据时返回 null */
export function parseData(raw: string): Partial<ProtoState> | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const file = v as { app?: unknown; data?: unknown } | null;
  if (!file || file.app !== DATA_APP) return null;
  const data = file.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  for (const k of ARRAY_KEYS)
    if (k in data && !Array.isArray(data[k])) return null;
  const out: Record<string, unknown> = {};
  for (const k of PERSIST_KEYS) if (k in data) out[k] = data[k];
  const result = out as Partial<ProtoState>;
  if ("notes" in out) result.notes = cleanNotes(out.notes);
  else if ("note" in data) {
    const chars = Array.isArray(data.characters)
      ? (data.characters as Character[])
      : [];
    const active =
      typeof data.activeCharId === "string" &&
      chars.some(c => c.id === data.activeCharId)
        ? data.activeCharId
        : chars.find(c => c.ownerId === ME_ID)?.id;
    result.notes = adoptGlobalNote(data.note, active);
  }
  if ("navOrder" in out) result.navOrder = normalizeNav(out.navOrder);
  if ("hotkeys" in out)
    result.hotkeys = {
      ...DEFAULT_HOTKEYS,
      ...(out.hotkeys as Partial<Record<Platform, Hotkey>>),
    };
  return result;
}

// ---------- 派生数据 ----------

export type TrayMotion = "hover" | "always" | "off";

export function latest(scheme: Scheme | undefined): SchemeVersion | undefined {
  return scheme?.versions[scheme.versions.length - 1];
}

/** 这个心法已经创建了哪些模式（有已保存的版本才算） */
export function modesOf(state: ProtoState, xinfa: string): Mode[] {
  return MODES.filter(m => latest(findScheme(state, xinfa, m)));
}

export function findScheme(state: ProtoState, xinfa: string, mode: Mode) {
  return state.schemes.find(s => s.xinfa === xinfa && s.mode === mode);
}

/**
 * 方案库里实际显示的方案：选中的方案存在（或正在新建）就用它；
 * 否则用列表里的第一个，避免停在一个不存在的方案上。没有任何方案时返回 null。
 */
export function activeSchemeId(s: ProtoState): string | null {
  const exists = (id: string) => {
    const [x, m] = id.split("-") as [string, Mode];
    return !!latest(findScheme(s, x, m)) || !!s.drafts[id];
  };
  if (s.selectedSchemeId && exists(s.selectedSchemeId))
    return s.selectedSchemeId;
  for (const x of XINFA_LIST)
    for (const m of MODES) if (exists(`${x}-${m}`)) return `${x}-${m}`;
  return null;
}

export function statusOf(
  state: ProtoState,
  char: Character,
  mode: Mode,
  xinfa: string
): SyncStatus {
  const scheme = findScheme(state, xinfa, mode);
  const last = latest(scheme);
  if (!last) return "none";
  const synced = char.synced[xinfa]?.[mode];
  if (synced === undefined) return "never";
  return synced >= last.version ? "synced" : "pending";
}
/**
 * 面板里正在看的心法：用户切过就用切过的；
 * 否则先看有待同步的，再看有方案的，最后是第一个
 */
export function viewXinfa(state: ProtoState, char: Character): string {
  const xs = xinfasOf(char);
  const picked = state.activeXinfa[char.id];
  if (picked && xs.includes(picked)) return picked;
  return (
    xs.find(x => MODES.some(m => isPending(statusOf(state, char, m, x)))) ??
    xs.find(x => modesOf(state, x).length > 0) ??
    xs[0]
  );
}

export function isPending(s: SyncStatus) {
  return s === "pending" || s === "never";
}

/** 关注的心法；用户没改过时，默认是有方案的心法 + 自己角色的心法 */
export function navOrder(state: ProtoState): NavSection[] {
  return state.navOrder ?? DEFAULT_NAV;
}
export function isDefaultNav(state: ProtoState): boolean {
  return navOrder(state).every((k, i) => k === DEFAULT_NAV[i]);
}
export function followedXinfa(state: ProtoState): string[] {
  if (state.followedXinfa) return state.followedXinfa;
  const mine = myCharacters(state).flatMap(xinfasOf);
  return XINFA_LIST.filter(
    x => mine.includes(x) || state.schemes.some(s => s.xinfa === x)
  );
}

export function myCharacters(state: ProtoState) {
  return state.characters.filter(c => c.ownerId === ME_ID);
}

export function charPending(state: ProtoState, char: Character) {
  return xinfasOf(char).some(x =>
    MODES.some(m => isPending(statusOf(state, char, m, x)))
  );
}

export function pendingCount(state: ProtoState) {
  return myCharacters(state).filter(c => charPending(state, c)).length;
}

/** 通知：我的角色里每个待同步的方案算一条 */
export interface InboxItem {
  key: string;
  char: Character;
  xinfa: string;
  mode: Mode;
  scheme: Scheme;
  last: SchemeVersion;
  /** 上次同步的版本；没同步过时为空 */
  base?: SchemeVersion;
  /** 上次同步之后的所有版本，按版本号升序 */
  versions: SchemeVersion[];
}

export function inboxItems(state: ProtoState): InboxItem[] {
  const items: InboxItem[] = [];
  for (const char of myCharacters(state)) {
    for (const xinfa of xinfasOf(char)) {
      for (const mode of MODES) {
        if (!isPending(statusOf(state, char, mode, xinfa))) continue;
        const scheme = findScheme(state, xinfa, mode)!;
        const last = latest(scheme)!;
        const synced = char.synced[xinfa]?.[mode];
        items.push({
          key: `${char.id}-${xinfa}-${mode}`,
          char,
          xinfa,
          mode,
          scheme,
          last,
          base:
            synced === undefined
              ? undefined
              : scheme.versions.find(v => v.version === synced),
          versions: scheme.versions.filter(v => v.version > (synced ?? 0)),
        });
      }
    }
  }
  return items.sort((a, b) => b.last.at.localeCompare(a.last.at));
}

export function me(state: ProtoState): Member | undefined {
  return state.members.find(m => m.id === ME_ID);
}

export function memberName(state: ProtoState, id: string) {
  return state.members.find(m => m.id === id)?.name ?? tx("已离开的成员");
}

export function canEdit(state: ProtoState) {
  const role = me(state)?.role;
  return role === "admin" || role === "editor";
}

export function isOnline(state: ProtoState) {
  // 首次使用（还没加入亲友团）也是在线状态，能正常保存
  return state.dataState === "normal" || state.dataState === "onboarding";
}

/** 只有自己在用：没加入亲友团，或亲友团里只有自己。此时不显示作者名，只显示时间 */
export function isSolo(state: ProtoState) {
  return !state.team || state.members.length <= 1;
}

// ---------- 操作 ----------

type Action =
  | { type: "patch"; patch: Partial<ProtoState> }
  | { type: "update"; fn: (s: ProtoState) => Partial<ProtoState> };

function reducer(state: ProtoState, action: Action): ProtoState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "update":
      return { ...state, ...action.fn(state) };
  }
}

function newInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(
      { length: n },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `TD-${pick(4)}-${pick(4)}`;
}

/** 解除角色和配装的关联。keepXinfa：只保留这个心法的关联 */
function unlinkLoadouts(
  loadouts: Record<string, Loadout>,
  charId: string,
  keepXinfa: string[] = []
): Record<string, Loadout> {
  let changed = false;
  const out: Record<string, Loadout> = {};
  for (const [k, lo] of Object.entries(loadouts)) {
    if (lo.charId === charId && !keepXinfa.includes(lo.xinfa)) {
      out[k] = { ...lo, charId: null };
      changed = true;
    } else out[k] = lo;
  }
  return changed ? out : loadouts;
}

/** 配装列表：同一心法的放在一起，按第一次出现的顺序 */
export function loadoutList(state: ProtoState): Loadout[] {
  const all = Object.values(state.loadouts);
  const order: string[] = [];
  for (const lo of all) if (!order.includes(lo.xinfa)) order.push(lo.xinfa);
  return order.flatMap(x => all.filter(lo => lo.xinfa === x));
}

/**
 * 配装最近一次由本人变动的时间：导入、换装备、改附魔、测木桩。
 * 技改后自动重算的记录（kind 为 patch）不算，不然技改一来所有配装都一样新。
 */
function loadoutTouchedAt(lo: Loadout): number {
  let at = new Date(lo.importedAt).getTime();
  for (const p of lo.history) {
    if (p.kind === "patch") continue;
    at = Math.max(at, new Date(p.at).getTime());
  }
  return at;
}

/**
 * 角色的当前配装：关联到这个角色的配装里，最近改过或导入的一套。
 * 没有关联任何配装时返回 null。
 */
export function currentLoadout(
  state: ProtoState,
  charId: string
): Loadout | null {
  let best: Loadout | null = null;
  for (const lo of Object.values(state.loadouts)) {
    if (lo.charId !== charId) continue;
    if (!best || loadoutTouchedAt(lo) > loadoutTouchedAt(best)) best = lo;
  }
  return best;
}

/** 技改后重算（原型：按版本号给一个稳定的小幅变化） */
function recalcAfterPatch(
  st: ProtoState,
  xinfa: string,
  version: number,
  at: string
): Record<string, Loadout> {
  const out = { ...st.loadouts };
  for (const lo of Object.values(out)) {
    if (lo.xinfa !== xinfa) continue;
    const dps = Math.round(lo.dps * (1 + patchDelta(xinfa, version) / 100));
    out[lo.id] = {
      ...lo,
      dps,
      history: [
        ...lo.history,
        {
          at,
          dps,
          label: tx("v{0} 技改", version),
          kind: "patch",
          detail: tx("奇穴有变化"),
        },
      ],
    };
  }
  return out;
}

function appendVersion(
  schemes: Scheme[],
  schemeId: string,
  version: SchemeVersion,
  base?: Draft
) {
  const exists = schemes.some(s => s.id === schemeId);
  if (!exists && base) {
    return [
      ...schemes,
      {
        id: schemeId,
        xinfa: base.xinfa,
        mode: base.mode,
        ...(base.title ? { title: base.title } : {}),
        versions: [version],
      },
    ];
  }
  return schemes.map(s =>
    s.id === schemeId ? { ...s, versions: [...s.versions, version] } : s
  );
}

let toastSeq = 1;

function useActions(
  dispatch: React.Dispatch<Action>,
  stateRef: React.MutableRefObject<ProtoState>
) {
  const patch = useCallback(
    (p: Partial<ProtoState>) => dispatch({ type: "patch", patch: p }),
    [dispatch]
  );
  const update = useCallback(
    (fn: (s: ProtoState) => Partial<ProtoState>) =>
      dispatch({ type: "update", fn }),
    [dispatch]
  );

  return useMemo(() => {
    const toast = (
      surface: ToastSurface,
      kind: UiToast["kind"],
      text: string
    ) => {
      const id = toastSeq++;
      update(s => ({
        toasts: [
          ...s.toasts.filter(t => t.surface !== surface),
          { id, surface, kind, text },
        ],
      }));
      window.setTimeout(
        () => update(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
        2600
      );
    };

    /** 把草稿存成新版本。管理窗口保存草稿、面板里直接新建都走这里 */
    const commitDraft = (draft: Draft, note: string) => {
      const schemeId = draft.schemeId;
      const last = latest(
        stateRef.current.schemes.find(x => x.id === schemeId)
      );
      const version: SchemeVersion = {
        version: (last?.version ?? 0) + 1,
        macros: draft.macros,
        talents: draft.talents,
        note,
        authorId: ME_ID,
        at: new Date().toISOString(),
      };
      // 只改了备注：游戏里不用动，已同步的角色继续算已同步
      const noGameChange =
        !!last &&
        diffVersions(last, version, layersOf(draft.xinfa)).total === 0;
      // PVE 方案的奇穴变了：用这个心法、已导入配装的我的角色重算一次
      const talentChanged =
        !last || last.talents.some((t, i) => t !== draft.talents[i]);
      update(st => {
        const drafts = { ...st.drafts };
        delete drafts[schemeId];
        return {
          schemes: appendVersion(st.schemes, schemeId, version, draft),
          drafts,
          loadouts:
            draft.mode === "PVE" && talentChanged
              ? recalcAfterPatch(st, draft.xinfa, version.version, version.at)
              : st.loadouts,
          characters: noGameChange
            ? st.characters.map(c =>
                xinfasOf(c).includes(draft.xinfa) &&
                c.synced[draft.xinfa]?.[draft.mode] === last!.version
                  ? {
                      ...c,
                      synced: {
                        ...c.synced,
                        [draft.xinfa]: {
                          ...c.synced[draft.xinfa],
                          [draft.mode]: version.version,
                        },
                      },
                    }
                  : c
              )
            : st.characters,
        };
      });
    };
    return {
      toast,
      dismissToast: (id: number) =>
        update(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      // 演示台控制
      setPlatform: (platform: Platform) =>
        update(s => ({
          platform,
          scene: platform === "mac" ? "desktop" : s.scene,
          // Windows 从右下角算、Mac 从右上角算，换系统时回到托盘旁
          panelOffset: platform === s.platform ? s.panelOffset : { x: 0, y: 0 },
        })),
      setScene: (scene: Scene) => patch({ scene }),
      setSimulateConflict: (on: boolean) => patch({ simulateConflict: on }),
      setHotkey: (platform: Platform, hk: Hotkey) =>
        update(s => ({ hotkeys: { ...s.hotkeys, [platform]: hk } })),
      resetHotkey: (platform: Platform) =>
        update(s => ({
          hotkeys: { ...s.hotkeys, [platform]: DEFAULT_HOTKEYS[platform] },
        })),
      setRecordingHotkey: (recordingHotkey: boolean) =>
        patch({ recordingHotkey }),
      setMyRole: (role: Role) =>
        update(s => ({
          members: s.members.map(m => (m.id === ME_ID ? { ...m, role } : m)),
        })),
      setDataState: (dataState: DataState) =>
        update(s => {
          if (dataState === "onboarding") {
            // 模拟新用户：还没加入亲友团，但自己能正常用全部功能
            const self = s.members.find(m => m.id === ME_ID) ?? SEED_MEMBERS[0];
            return {
              dataState,
              // 托盘提示重新出现
              coachSeen: false,
              team: null,
              members: [
                { ...self, role: "admin", joinedAt: new Date().toISOString() },
              ],
              characters: [],
              schemes: [],
              drafts: {},
              pendingConflict: null,
              raidLogs: [],
              blacklist: [],
              links: [],
              loadouts: {},
              activeLoadoutId: null,
              selectedSchemeId: "",
              managerSection: "characters",
            };
          }
          // 从首次使用切回「正常」：恢复示例数据
          if (s.dataState === "onboarding" && dataState === "normal" && !s.team)
            return { dataState, ...seedData(), activeCharId: "c1" };
          return { dataState };
        }),
      retry: () => {
        patch({ dataState: "loading" });
        window.setTimeout(() => patch({ dataState: "normal" }), 900);
      },
      /** 桌面版导入数据：覆盖本机数据，丢掉没保存的草稿 */
      importData: (data: Partial<ProtoState>) =>
        patch({
          ...data,
          drafts: {},
          pendingConflict: null,
          managerIntent: null,
          schemesPage: "list",
        }),

      // 面板
      dismissCoach: () => patch({ coachSeen: true }),
      setLaunchAtLogin: (launchAtLogin: boolean) => patch({ launchAtLogin }),
      setTrayMotion: (trayMotion: TrayMotion) => patch({ trayMotion }),
      togglePanel: () =>
        update(s => ({ panelOpen: !s.panelOpen, coachSeen: true })),
      setPanelOpen: (open: boolean) =>
        update(s => ({ panelOpen: open, coachSeen: s.coachSeen || open })),
      togglePin: () =>
        // 置顶只管"点外面不收起"，不动面板位置
        update(s => ({ pinned: !s.pinned })),
      setPanelOffset: (panelOffset: { x: number; y: number }) =>
        patch({ panelOffset }),
      resetPanelOffset: () => patch({ panelOffset: { x: 0, y: 0 } }),
      setPanelSize: (panelSize: PanelSize | null) => patch({ panelSize }),
      /** 设置里的「恢复默认」：位置和大小都回到默认 */
      resetPanelLayout: () =>
        patch({ panelOffset: { x: 0, y: 0 }, panelSize: null }),
      selectCharacter: (activeCharId: string) => patch({ activeCharId }),
      setMode: (charId: string, mode: Mode) =>
        update(s => ({ activeMode: { ...s.activeMode, [charId]: mode } })),
      setXinfa: (charId: string, xinfa: string) =>
        update(s => ({ activeXinfa: { ...s.activeXinfa, [charId]: xinfa } })),
      markSynced: (charId: string, mode: Mode, xinfa: string) => {
        const s = stateRef.current;
        const char = s.characters.find(c => c.id === charId);
        const last = char && latest(findScheme(s, xinfa, mode));
        if (!char || !last) return;
        update(st => ({
          characters: st.characters.map(c =>
            c.id === charId
              ? {
                  ...c,
                  synced: {
                    ...c.synced,
                    [xinfa]: { ...c.synced[xinfa], [mode]: last.version },
                  },
                }
              : c
          ),
        }));
        return { name: char.name, version: last.version };
      },
      markAllSynced: () => {
        const items = inboxItems(stateRef.current);
        if (!items.length) return 0;
        update(st => ({
          characters: st.characters.map(c => {
            const mine = items.filter(i => i.char.id === c.id);
            if (!mine.length) return c;
            const synced = { ...c.synced };
            for (const i of mine)
              synced[i.xinfa] = {
                ...synced[i.xinfa],
                [i.mode]: i.last.version,
              };
            return { ...c, synced };
          }),
        }));
        return items.length;
      },

      // 管理窗口
      openManager: (
        section?: ManagerSection,
        schemeId?: string,
        intent?: ManagerIntent
      ) =>
        update(s => ({
          managerOpen: true,
          managerIntent: intent ?? null,
          panelOpen: s.pinned ? s.panelOpen : false,
          managerSection: section ?? s.managerSection,
          selectedSchemeId: schemeId ?? s.selectedSchemeId,
        })),
      closeManager: () => patch({ managerOpen: false }),
      clearIntent: () => patch({ managerIntent: null }),
      setSection: (managerSection: ManagerSection) =>
        patch({ managerSection, schemesPage: "list" }),
      /** 打开方案库的二级页「修改记录」；传心法时只看这个心法 */
      openChangelog: (xinfa?: string) =>
        patch({
          managerSection: "schemes",
          schemesPage: "changelog",
          changelogFilter: xinfa ?? "全部",
        }),
      closeChangelog: () => patch({ schemesPage: "list" }),
      selectScheme: (selectedSchemeId: string) => patch({ selectedSchemeId }),
      setChangelogFilter: (changelogFilter: string) =>
        patch({ changelogFilter }),
      followXinfa: (xinfa: string) => {
        const list = followedXinfa(stateRef.current);
        if (list.includes(xinfa)) return;
        // 按门派顺序排，和添加弹窗里的顺序一致
        const next = XINFA_LIST.filter(x => x === xinfa || list.includes(x));
        patch({ followedXinfa: next });
      },
      setNavOrder: (order: ManagerSection[]) => {
        const next = normalizeNav(order);
        if (!next) return;
        // 排回默认顺序时清掉记录，以后默认顺序变了也能跟着变
        patch({
          navOrder: next.every((k, i) => k === DEFAULT_NAV[i]) ? null : next,
        });
      },
      resetNavOrder: () => patch({ navOrder: null }),
      unfollowXinfa: (xinfa: string) => {
        const s = stateRef.current;
        patch({
          followedXinfa: followedXinfa(s).filter(x => x !== xinfa),
          changelogFilter:
            s.changelogFilter === xinfa ? "全部" : s.changelogFilter,
        });
      },

      // 方案编辑
      startDraft: (xinfa: string, mode: Mode) =>
        update(s => {
          const id = `${xinfa}-${mode}`;
          if (s.drafts[id]) return {};
          const last = latest(findScheme(s, xinfa, mode));
          const draft: Draft = {
            schemeId: id,
            xinfa,
            mode,
            baseVersion: last?.version ?? 0,
            macros: last ? last.macros.map(m => ({ ...m })) : [],
            talents: last ? [...last.talents] : defaultTalents(),
          };
          return { drafts: { ...s.drafts, [id]: draft }, selectedSchemeId: id };
        }),
      /** 没有草稿时，先从最新版本创建草稿再修改 */
      editDraft: (schemeId: string, fn: (d: Draft) => Draft) =>
        update(s => {
          let draft = s.drafts[schemeId];
          if (!draft) {
            const [xinfa, mode] = schemeId.split("-") as [string, Mode];
            const last = latest(findScheme(s, xinfa, mode));
            draft = {
              schemeId,
              xinfa,
              mode,
              baseVersion: last?.version ?? 0,
              macros: last ? last.macros.map(m => ({ ...m })) : [],
              talents: last ? [...last.talents] : defaultTalents(),
            };
          }
          return { drafts: { ...s.drafts, [schemeId]: fn(draft) } };
        }),
      discardDraft: (schemeId: string) =>
        update(s => {
          const drafts = { ...s.drafts };
          delete drafts[schemeId];
          return { drafts };
        }),
      /**
       * 改方案标题：直接生效，不产生新版本，也不影响角色的同步状态。
       * 空字符串表示恢复默认标题。方案还没保存时，标题先存在草稿里。
       */
      renameScheme: (schemeId: string, title: string) =>
        update(s => {
          const t = title.trim() || undefined;
          if (s.schemes.some(x => x.id === schemeId)) {
            return {
              schemes: s.schemes.map(x =>
                x.id === schemeId ? { ...x, title: t } : x
              ),
            };
          }
          const draft = s.drafts[schemeId];
          if (!draft) return {};
          return {
            drafts: { ...s.drafts, [schemeId]: { ...draft, title: t } },
          };
        }),
      /** 返回 "saved" 或 "conflict" */
      saveDraft: (schemeId: string, note: string): "saved" | "conflict" => {
        const s = stateRef.current;
        const draft = s.drafts[schemeId];
        if (!draft) return "saved";
        const last = latest(s.schemes.find(x => x.id === schemeId));
        if (s.simulateConflict && last) {
          patch({
            pendingConflict: { schemeId, rival: rivalEdit(last), note },
          });
          return "conflict";
        }
        commitDraft(draft, note);
        return "saved";
      },
      /**
       * 面板里直接新建：不经过管理窗口，填好的内容直接存成 v1，说明写「新建」。
       * 已经有方案时返回 "exists"；管理窗口里这个方案有填了内容还没保存的草稿时
       * 返回 "draft"，不覆盖。
       */
      createScheme: (
        xinfa: string,
        mode: Mode,
        init: { macros?: Macro[]; talents?: number[] }
      ): "created" | "exists" | "draft" => {
        const s = stateRef.current;
        if (latest(findScheme(s, xinfa, mode))) return "exists";
        const schemeId = `${xinfa}-${mode}`;
        const old = s.drafts[schemeId];
        const blank = defaultTalents();
        if (
          old &&
          (old.macros.length > 0 || old.talents.some((t, i) => t !== blank[i]))
        )
          return "draft";
        commitDraft(
          {
            schemeId,
            xinfa,
            mode,
            baseVersion: 0,
            macros: init.macros ?? [],
            talents: init.talents ?? blank,
          },
          tx("新建")
        );
        return "created";
      },
      /** 作者头像框：在设置里输入作者码后开启，也可以关掉 */
      setAuthor: (on: boolean) =>
        update(st => ({
          members: st.members.map(m =>
            m.id === ME_ID ? { ...m, author: on || undefined } : m
          ),
        })),
      resolveConflict: (choice: "mine" | "theirs") => {
        const s = stateRef.current;
        const pc = s.pendingConflict;
        if (!pc) return;
        const draft = s.drafts[pc.schemeId];
        update(st => {
          let schemes = appendVersion(st.schemes, pc.schemeId, pc.rival);
          if (choice === "mine" && draft) {
            schemes = appendVersion(schemes, pc.schemeId, {
              version: pc.rival.version + 1,
              macros: draft.macros,
              talents: draft.talents,
              note: tx(
                "{0}（覆盖了 {1} 的 v{2}）",
                pc.note,
                memberName(st, pc.rival.authorId),
                pc.rival.version
              ),
              authorId: ME_ID,
              at: new Date().toISOString(),
            });
          }
          const drafts = { ...st.drafts };
          delete drafts[pc.schemeId];
          return {
            schemes,
            drafts,
            pendingConflict: null,
            simulateConflict: false,
          };
        });
      },

      // 角色
      addCharacter: (c: Omit<Character, "id" | "ownerId" | "synced">) => {
        const id = `c${Date.now()}`;
        update(s => ({
          characters: [
            ...s.characters,
            {
              ...c,
              id,
              ownerId: ME_ID,
              synced: {},
              avatar: c.avatar ?? {
                kind: "preset",
                mood: nextMood(s.characters.filter(x => x.ownerId === ME_ID)),
              },
            },
          ],
          activeCharId: id,
        }));
        return id;
      },
      /**
       * 改名，或改门派、心法、流派。同步记录按心法存，改回去自动恢复。
       * restored：新加的心法里有以前的同步记录
       */
      updateCharacter: (
        id: string,
        p: Partial<Pick<Character, "name" | "school" | "only" | "liupai">>
      ): { restored: boolean } => {
        const char = stateRef.current.characters.find(c => c.id === id);
        if (!char) return { restored: false };
        const next: Character = {
          ...char,
          ...(p.name ? { name: p.name } : {}),
          ...(p.school !== undefined ? { school: p.school } : {}),
          ...(p.only !== undefined ? { only: p.only } : {}),
          ...(p.liupai !== undefined ? { liupai: p.liupai } : {}),
        };
        const before = xinfasOf(char);
        const after = xinfasOf(next);
        const restored = after.some(
          x =>
            !before.includes(x) && Object.keys(char.synced[x] ?? {}).length > 0
        );
        const xinfaChanged = after.join() !== before.join();
        update(s => ({
          characters: s.characters.map(c => (c.id === id ? next : c)),
          // 配装按心法建：角色不再玩的心法，解除关联
          loadouts: xinfaChanged
            ? unlinkLoadouts(s.loadouts, id, after)
            : s.loadouts,
        }));
        return { restored };
      },
      /** 改自己的昵称和头像。所有显示成员的地方都按 id 读取，会一起更新 */
      updateMe: (p: { name?: string; avatar?: CharacterAvatar }) =>
        update(s => ({
          members: s.members.map(m => (m.id === ME_ID ? { ...m, ...p } : m)),
        })),
      renameTeam: (name: string) =>
        update(s => (s.team ? { team: { ...s.team, name } } : {})),
      setCharacterAvatar: (id: string, avatar: CharacterAvatar) =>
        update(s => ({
          characters: s.characters.map(c =>
            c.id === id ? { ...c, avatar } : c
          ),
        })),
      /**
       * 新建配装（原型：生成示例数值）。配装按心法建，charId 可以为空。
       * 同一心法已经有配装时换几件装备，方便对比。返回新配装的 id
       */
      createLoadout: (p: {
        xinfa: string;
        name: string;
        charId: string | null;
        source: LoadoutSource;
        sourceId: string | null;
        /** 新建时改过的附魔和五彩石；不传就用导入的 */
        config?: GearConfig;
      }): string => {
        const s = stateRef.current;
        const id = `lo${Date.now()}`;
        const sameXinfa = Object.values(s.loadouts).some(
          l => l.xinfa === p.xinfa
        );
        const { config, ...rest } = p;
        const made = makeLoadout({
          ...rest,
          id,
          variant: sameXinfa ? id : undefined,
        });
        const lo = config
          ? (() => {
              const next = applyConfig(made, config);
              // 导入时就是这套附魔，历史从改过的秒伤开始
              return {
                ...next,
                history: [{ ...made.history[0], dps: next.dps }],
              };
            })()
          : made;
        update(st => ({
          loadouts: { ...st.loadouts, [id]: lo },
          activeLoadoutId: id,
        }));
        return id;
      },
      /** 重新导入：原型里魔盒那边没有改动，所以保留原数值，只更新来源和时间 */
      reimportLoadout: (
        id: string,
        source: LoadoutSource,
        sourceId: string | null
      ) =>
        update(st => {
          const lo = st.loadouts[id];
          if (!lo) return {};
          return {
            loadouts: {
              ...st.loadouts,
              [id]: {
                ...lo,
                importedAt: new Date().toISOString(),
                source,
                sourceId:
                  source === "jx3box" ? (sourceId ?? lo.sourceId) : null,
              },
            },
          };
        }),
      /** 改配装名、改关联角色 */
      updateLoadout: (
        id: string,
        p: { name?: string; charId?: string | null }
      ) =>
        update(st => {
          const lo = st.loadouts[id];
          if (!lo) return {};
          return { loadouts: { ...st.loadouts, [id]: { ...lo, ...p } } };
        }),
      /** 改小附魔、大附魔、五彩石：面板和秒伤一起重算，秒伤变了就记一笔 */
      configureLoadout: (id: string, config: GearConfig) =>
        update(st => {
          const lo = st.loadouts[id];
          if (!lo) return {};
          const next = applyConfig(lo, config);
          const history =
            next.dps === lo.dps
              ? lo.history
              : [
                  ...lo.history,
                  {
                    at: new Date().toISOString(),
                    dps: next.dps,
                    label: tx("改附魔"),
                    kind: "gear" as const,
                  },
                ];
          return { loadouts: { ...st.loadouts, [id]: { ...next, history } } };
        }),
      removeLoadout: (id: string) =>
        update(st => {
          const loadouts = { ...st.loadouts };
          delete loadouts[id];
          return {
            loadouts,
            activeLoadoutId:
              st.activeLoadoutId === id
                ? (Object.keys(loadouts)[0] ?? null)
                : st.activeLoadoutId,
          };
        }),
      selectLoadout: (activeLoadoutId: string) => patch({ activeLoadoutId }),
      /** 保存配装器的草稿：装备、精炼、镶嵌、附魔、大附魔、五彩石。返回新秒伤 */
      saveGearDraft: (loId: string, draft: GearDraft) => {
        const lo = stateRef.current.loadouts[loId];
        if (!lo) return 0;
        const changes = draftChanges(lo, draft);
        if (!changes.length) return lo.dps;
        const saved = applyDraft(lo, draft);
        const label =
          changes.length === 1
            ? tx("改{0}", changes[0].replace(/ \d$/, ""))
            : tx("改 {0} 处", changes.length);
        const next: Loadout = {
          ...saved,
          history: [
            ...lo.history,
            {
              at: new Date().toISOString(),
              dps: saved.dps,
              label,
              kind: "gear",
              detail: changes.join("、"),
            },
          ],
        };
        update(st => ({ loadouts: { ...st.loadouts, [loId]: next } }));
        return next.dps;
      },
      /** 草稿另存为一套新配装（同心法、不关联角色），原配装不变。返回新配装 id */
      saveGearDraftAs: (loId: string, draft: GearDraft, name: string) => {
        const lo = stateRef.current.loadouts[loId];
        if (!lo) return null;
        const id = `lo${Date.now()}`;
        const at = new Date().toISOString();
        const saved = applyDraft(lo, draft);
        const made: Loadout = {
          ...saved,
          id,
          name,
          charId: null,
          importedAt: at,
          history: [
            {
              at,
              dps: saved.dps,
              label: tx("从「{0}」另存", lo.name),
              kind: "import",
            },
          ],
        };
        update(st => ({
          loadouts: { ...st.loadouts, [id]: made },
          activeLoadoutId: id,
        }));
        return id;
      },
      /** 改配装的增益（小药、团队增益、阵眼）。只影响本人看到的估算 */
      setLoadoutBuffs: (loId: string, buffs: BuffSelection) =>
        update(st => {
          const lo = st.loadouts[loId];
          if (!lo) return {};
          return { loadouts: { ...st.loadouts, [loId]: { ...lo, buffs } } };
        }),
      /** 写某个角色的便签。空内容直接清掉 */
      setNote: (charId: string, text: string) =>
        update(st => {
          const notes = { ...st.notes };
          if (text.trim())
            notes[charId] = { text, at: new Date().toISOString() };
          else delete notes[charId];
          return { notes };
        }),
      removeCharacter: (id: string) =>
        update(s => {
          const characters = s.characters.filter(c => c.id !== id);
          const mine = characters.filter(c => c.ownerId === ME_ID);
          // 便签跟着角色删；配装不跟着删，只解除关联
          const notes = { ...s.notes };
          delete notes[id];
          return {
            notes,
            loadouts: unlinkLoadouts(s.loadouts, id),
            characters,
            activeCharId:
              s.activeCharId === id ? (mine[0]?.id ?? "") : s.activeCharId,
          };
        }),

      // 亲友团
      // 创建亲友团：自己已有的角色、方案、配装、记录都保留，成为亲友团的数据
      createTeam: (name: string) =>
        update(s => {
          const self = s.members.find(m => m.id === ME_ID) ?? SEED_MEMBERS[0];
          return {
            team: { name, inviteCode: newInviteCode() },
            members: [
              { ...self, role: "admin", joinedAt: new Date().toISOString() },
            ],
            dataState: "normal",
          };
        }),
      joinTeam: (code: string): boolean => {
        if (code.trim().toUpperCase() !== SEED_TEAM.inviteCode) return false;
        // 加入亲友团：自己的角色、配装、记录都带进去；
        // 自己建的方案，亲友团里没有同心法同模式的才带进去，有的话用亲友团的
        update(s => {
          const data = seedData();
          const self = s.members.find(m => m.id === ME_ID);
          const mine = s.schemes.filter(
            x =>
              !data.schemes.some(t => t.xinfa === x.xinfa && t.mode === x.mode)
          );
          const myChars = s.characters.filter(c => c.ownerId === ME_ID);
          return {
            ...data,
            members: data.members.map(m =>
              m.id === ME_ID
                ? {
                    ...m,
                    ...(self ? { name: self.name, avatar: self.avatar } : {}),
                    role: "viewer" as Role,
                    joinedAt: new Date().toISOString(),
                  }
                : m
            ),
            characters: [
              ...data.characters.filter(c => c.ownerId !== ME_ID),
              ...myChars,
            ],
            schemes: [...data.schemes, ...mine],
            drafts: Object.fromEntries(
              Object.entries(s.drafts).filter(([id]) =>
                mine.some(x => x.id === id)
              )
            ),
            raidLogs: [...s.raidLogs, ...data.raidLogs],
            blacklist: [...s.blacklist, ...data.blacklist],
            // 自己原来的链接保持原样（没加入时都是仅自己），可以逐条改成亲友团可见
            links: [...s.links, ...data.links],
            activeCharId: myChars.some(c => c.id === s.activeCharId)
              ? s.activeCharId
              : (myChars[0]?.id ?? s.activeCharId),
            dataState: "normal",
          };
        });
        return true;
      },
      // 记录：打本记录
      saveRaidLog: (
        input: Omit<RaidLog, "id" | "by" | "updatedAt">,
        id?: string
      ) => {
        const now = new Date().toISOString();
        update(s => ({
          raidLogs: id
            ? s.raidLogs.map(r =>
                r.id === id ? { ...r, ...input, updatedAt: now } : r
              )
            : [
                {
                  ...input,
                  id: `r${Date.now().toString(36)}`,
                  by: ME_ID,
                  updatedAt: now,
                },
                ...s.raidLogs,
              ],
        }));
        toast("manager", "success", id ? tx("已保存修改") : tx("已记下"));
      },
      deleteRaidLog: (id: string) => {
        update(s => ({ raidLogs: s.raidLogs.filter(r => r.id !== id) }));
        toast("manager", "success", tx("已删除这条记录"));
      },
      // 记录：避雷名单
      saveBlack: (input: Omit<BlackEntry, "id" | "by" | "at">, id?: string) => {
        update(s => ({
          blacklist: id
            ? s.blacklist.map(b => (b.id === id ? { ...b, ...input } : b))
            : [
                {
                  ...input,
                  id: `b${Date.now().toString(36)}`,
                  by: ME_ID,
                  at: new Date().toISOString(),
                },
                ...s.blacklist,
              ],
        }));
        toast(
          "manager",
          "success",
          id ? tx("已保存修改") : tx("已加入避雷名单")
        );
      },
      // 记录：链接。返回实际加了几条（已有的地址跳过）
      addLinks: (urls: string[], visibility: LinkVisibility) => {
        const have = new Set(
          visibleLinks(stateRef.current.links, ME_ID).map(l => l.url)
        );
        const fresh = urls.filter(u => !have.has(u));
        const added = fresh.length;
        const now = Date.now();
        const items: SharedLink[] = fresh.map((url, i) => ({
          id: `l${(now + i).toString(36)}`,
          url,
          title: autoTitle(url),
          by: ME_ID,
          at: new Date(now - i).toISOString(),
          visibility,
        }));
        if (added) update(st => ({ links: [...items, ...st.links] }));
        const dup = urls.length - added;
        if (added)
          toast(
            "manager",
            "success",
            dup
              ? tx("已添加 {0} 条，{1} 条已经在列表里", added, dup)
              : added > 1
                ? tx("已添加 {0} 条链接", added)
                : tx("已添加链接")
          );
        else toast("manager", "info", tx("这条链接已经在列表里"));
        return added;
      },
      /** 记录：链接页里直接放图片，每张一条 */
      addLinkImages: (
        items: { image: NoteImage; title: string }[],
        visibility: LinkVisibility
      ) => {
        if (!items.length) return;
        const now = Date.now();
        const fresh: SharedLink[] = items.map((it, i) => ({
          id: `l${(now + i).toString(36)}i`,
          url: "",
          title: it.title,
          by: ME_ID,
          at: new Date(now - i).toISOString(),
          visibility,
          image: it.image,
        }));
        update(st => ({ links: [...fresh, ...st.links] }));
        toast(
          "manager",
          "success",
          items.length > 1
            ? tx("已添加 {0} 张图片", items.length)
            : tx("已添加图片")
        );
      },
      saveLink: (
        id: string,
        input: Pick<SharedLink, "title" | "url" | "visibility" | "note">
      ) => {
        update(s => ({
          links: s.links.map(l => (l.id === id ? { ...l, ...input } : l)),
        }));
        toast("manager", "success", tx("已保存修改"));
      },
      deleteLink: (id: string) => {
        const isImage = !!stateRef.current.links.find(l => l.id === id)?.image;
        update(s => ({ links: s.links.filter(l => l.id !== id) }));
        toast(
          "manager",
          "success",
          isImage ? tx("已删除图片") : tx("已删除链接")
        );
      },
      deleteBlack: (id: string) => {
        update(s => ({ blacklist: s.blacklist.filter(b => b.id !== id) }));
        toast("manager", "success", tx("已移出避雷名单"));
      },
      setRole: (memberId: string, role: Role) =>
        update(s => ({
          members: s.members.map(m => (m.id === memberId ? { ...m, role } : m)),
        })),
      removeMember: (memberId: string) =>
        update(s => ({
          members: s.members.filter(m => m.id !== memberId),
          characters: s.characters.filter(c => c.ownerId !== memberId),
        })),
      regenerateInvite: () =>
        update(s =>
          s.team ? { team: { ...s.team, inviteCode: newInviteCode() } } : {}
        ),
    };
  }, [patch, update, stateRef]);
}

export type ProtoActions = ReturnType<typeof useActions>;

const Ctx = createContext<{ state: ProtoState; actions: ProtoActions } | null>(
  null
);

export function ProtoProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<ProtoState>;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    ...(IS_DESKTOP ? desktopInitial() : {}),
    ...initial,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const actions = useActions(dispatch, stateRef);
  const ready = useDesktopData(state, stateRef, dispatch, actions);
  // 便签存到本地，刷新后还在
  useEffect(() => {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
      localStorage.removeItem(GLOBAL_NOTE_KEY);
      localStorage.removeItem(OLD_NOTES_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.notes]);
  // 关注的心法存到本地；没改过时不写，继续用默认值
  useEffect(() => {
    try {
      if (state.followedXinfa)
        localStorage.setItem(FOLLOW_KEY, JSON.stringify(state.followedXinfa));
      else localStorage.removeItem(FOLLOW_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.followedXinfa]);
  // 面板位置存到本地；默认位置不写
  useEffect(() => {
    try {
      const { x, y } = state.panelOffset;
      if (x || y)
        localStorage.setItem(
          PANEL_POS_KEY,
          JSON.stringify({ platform: state.platform, x, y })
        );
      else localStorage.removeItem(PANEL_POS_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.panelOffset, state.platform]);
  // 面板大小存到本地；默认大小不写
  useEffect(() => {
    try {
      const sz = state.panelSize;
      if (sz) localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(sz));
      else localStorage.removeItem(PANEL_SIZE_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.panelSize]);
  // 侧栏顺序存到本地；默认顺序不写
  useEffect(() => {
    try {
      if (state.navOrder)
        localStorage.setItem(NAV_KEY, JSON.stringify(state.navOrder));
      else localStorage.removeItem(NAV_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.navOrder]);
  // 托盘提示看过一次就记下来，刷新后也不再出现
  useEffect(() => {
    try {
      if (state.coachSeen) localStorage.setItem(COACH_KEY, "1");
      else localStorage.removeItem(COACH_KEY);
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.coachSeen]);
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  // 桌面版读到 data.json 之前不显示，避免先闪一下空界面
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 桌面版：启动时读 data.json；要保存的字段变了就在 300ms 后写回；
 * 另一个窗口保存后重新读取。网页原型里什么都不做，直接返回 true。
 */
function useDesktopData(
  state: ProtoState,
  stateRef: React.MutableRefObject<ProtoState>,
  dispatch: React.Dispatch<Action>,
  actions: ProtoActions
) {
  const [ready, setReady] = useState(!IS_DESKTOP);
  /** 文件里现在的内容。读到的和要写的一样时不写，避免两个窗口来回通知 */
  const lastJson = useRef<string | null>(null);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let alive = true;
    let first = true;
    const pull = async () => {
      try {
        const raw = await loadData();
        if (!alive) return;
        // 文件没变（比如弹出面板时补读一次）：不刷新界面
        if (!first && raw && raw === lastJson.current) return;
        const data = raw ? parseData(raw) : null;
        if (raw && data) {
          lastJson.current = raw;
          dispatch({ type: "patch", patch: data });
        } else if (first) {
          // 没有文件（第一次打开）或文件读不出来：从空数据开始，没改动就不写
          lastJson.current = serializeData(stateRef.current);
          if (raw) {
            const name = await backupData().catch(() => null);
            if (WINDOW_LABEL === "manager")
              actions.toast(
                "manager",
                "error",
                name
                  ? tx("数据文件读不出来，已另存为 {0}，现在从空白开始", name)
                  : tx("数据文件读不出来，现在从空白开始")
              );
          }
        }
      } catch (err) {
        console.error("读取数据失败", err);
      }
      first = false;
      if (alive) setReady(true);
    };
    /**
     * 补读一次文件。窗口隐藏时系统可能推迟处理「另一个窗口保存了」的通知，
     * 所以面板弹出、窗口重新获得焦点或变成可见时再读一次。
     * 本窗口还有没写进文件的改动时不读，免得盖掉刚改的内容。
     */
    const refresh = () => {
      if (first) return;
      if (serializeData(stateRef.current) !== lastJson.current) return;
      void pull();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    void pull();
    const off = onDataChanged(() => void pull());
    const offShown = WINDOW_LABEL === "panel" ? onPanelShown(refresh) : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      void off.then(f => f());
      void offShown?.then(f => f());
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const persisted = PERSIST_KEYS.map(k => state[k]);
  useEffect(() => {
    if (!IS_DESKTOP || !ready) return;
    const t = window.setTimeout(() => {
      const json = serializeData(stateRef.current);
      if (json === lastJson.current) return;
      lastJson.current = json;
      saveData(json).catch(err => {
        console.error("保存数据失败", err);
        actions.toast(
          WINDOW_LABEL === "panel" ? "panel" : "manager",
          "error",
          tx("保存失败，这次的改动没有写进文件")
        );
      });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...persisted]);

  return ready;
}

export function useProto() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProto must be used inside ProtoProvider");
  return v;
}

/** 新角色默认用一个自己还没用过的黄鸡表情；全部用过就按顺序轮换 */
export function nextMood(mine: Character[]): HuangjiMood {
  const used = new Set(
    mine.flatMap(c => (c.avatar?.kind === "preset" ? [c.avatar.mood] : []))
  );
  const free = HUANGJI_MOODS.find(m => !used.has(m.key));
  return free
    ? free.key
    : HUANGJI_MOODS[mine.length % HUANGJI_MOODS.length].key;
}
