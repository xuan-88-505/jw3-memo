import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  ME_ID,
  SEED_CHARACTERS,
  SEED_MEMBERS,
  SEED_TEAM,
  defaultTalents,
  layersOf,
  rivalEdit,
  seedSchemes,
} from "@/data/seed";
import {
  makeLoadout,
  patchDelta,
  seedLoadoutZixia,
  sortCandidates,
  type Loadout,
  type LoadoutSource,
} from "@/data/gear";
import { MODES } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { DEFAULT_HOTKEYS, type Hotkey } from "@/lib/hotkey";
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
  coachSeen: boolean;
  /** 设置：开机自动启动（原型只记状态） */
  launchAtLogin: boolean;
  /** 设置：托盘黄鸡的动效。hover = 悬停时动（默认），always = 一直动，off = 不动 */
  trayMotion: TrayMotion;
  managerOpen: boolean;
  managerSection: ManagerSection;
  managerIntent: "add-character" | null;
  activeCharId: string;
  activeMode: Record<string, Mode>;
  selectedSchemeId: string;
  changelogFilter: string;
  toasts: UiToast[];
  /**
   * 便签：按角色 id 存。只属于本人，不进亲友团共享的数据，管理窗口也不显示。
   * 原型存在浏览器本地；正式版跟着账号同步到自己的其他电脑。
   */
  notes: Record<string, CharNote>;
  /** 配装与木桩：按角色 id 存。和便签一样只属于本人 */
  loadouts: Record<string, Loadout>;
  /** 本机设置：每台电脑分开保存，不同步给亲友 */
  hotkeys: Record<Platform, Hotkey>;
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
  };
}

export interface CharNote {
  text: string;
  /** 最后编辑时间 */
  at: string;
}
export const NOTE_MAX = 2000;
/** 便签的本地记录；必须在 initialState 之前定义 */
const NOTES_KEY = "tongdiao.notes.v1";
const SEED_NOTES: Record<string, CharNote> = {
  c1: {
    text: "周三、周日 20:00 打 25 人英雄，团长 YY 88123\n还缺：腰坠、暗器\n每周一记得领帮会资源",
    at: "2026-10-28T21:12:00+08:00",
  },
};
function readNotes(): Record<string, CharNote> {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(NOTES_KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, CharNote>) : SEED_NOTES;
  } catch {
    return SEED_NOTES;
  }
}

/** 托盘提示"看过"的本地记录；必须在 initialState 之前定义 */
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
  notes: readNotes(),
  loadouts: { c1: seedLoadoutZixia() },
  platform: "win",
  scene: "desktop",
  dataState: "normal",
  simulateConflict: false,
  panelOpen: false,
  pinned: false,
  panelOffset: { x: 0, y: 0 },
  coachSeen: readCoachSeen(),
  launchAtLogin: true,
  trayMotion: "hover",
  managerOpen: false,
  managerSection: "schemes",
  managerIntent: null,
  activeCharId: "c1",
  activeMode: {},
  selectedSchemeId: "紫霞功-PVE",
  changelogFilter: "全部",
  toasts: [],
  hotkeys: { ...DEFAULT_HOTKEYS },
  recordingHotkey: false,
};

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

export function statusOf(
  state: ProtoState,
  char: Character,
  mode: Mode
): SyncStatus {
  const scheme = findScheme(state, char.xinfa, mode);
  const last = latest(scheme);
  if (!last) return "none";
  const synced = char.synced[mode];
  if (synced === undefined) return "never";
  return synced >= last.version ? "synced" : "pending";
}

export function isPending(s: SyncStatus) {
  return s === "pending" || s === "never";
}

export function myCharacters(state: ProtoState) {
  return state.characters.filter(c => c.ownerId === ME_ID);
}

export function charPending(state: ProtoState, char: Character) {
  return (
    isPending(statusOf(state, char, "PVE")) ||
    isPending(statusOf(state, char, "PVP"))
  );
}

export function pendingCount(state: ProtoState) {
  return myCharacters(state).filter(c => charPending(state, c)).length;
}

/** 通知：我的角色里每个待同步的方案算一条 */
export interface InboxItem {
  key: string;
  char: Character;
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
    for (const mode of MODES) {
      if (!isPending(statusOf(state, char, mode))) continue;
      const scheme = findScheme(state, char.xinfa, mode)!;
      const last = latest(scheme)!;
      const synced = char.synced[mode];
      items.push({
        key: `${char.id}-${mode}`,
        char,
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
  return items.sort((a, b) => b.last.at.localeCompare(a.last.at));
}

export function me(state: ProtoState): Member | undefined {
  return state.members.find(m => m.id === ME_ID);
}

export function memberName(state: ProtoState, id: string) {
  return state.members.find(m => m.id === id)?.name ?? "已离开的成员";
}

export function canEdit(state: ProtoState) {
  const role = me(state)?.role;
  return role === "admin" || role === "editor";
}

export function isOnline(state: ProtoState) {
  return state.dataState === "normal";
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

/** 技改后重算（原型：按版本号给一个稳定的小幅变化） */
function recalcAfterPatch(
  st: ProtoState,
  xinfa: string,
  version: number,
  at: string
): Record<string, Loadout> {
  const out = { ...st.loadouts };
  for (const c of st.characters) {
    const lo = out[c.id];
    if (c.ownerId !== ME_ID || c.xinfa !== xinfa || !lo || lo.xinfa !== xinfa)
      continue;
    const dps = Math.round(lo.dps * (1 + patchDelta(xinfa, version) / 100));
    out[c.id] = {
      ...lo,
      dps,
      history: [
        ...lo.history,
        {
          at,
          dps,
          label: `v${version} 技改`,
          kind: "patch",
          detail: "奇穴有变化",
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
      { id: schemeId, xinfa: base.xinfa, mode: base.mode, versions: [version] },
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

    return {
      toast,
      dismissToast: (id: number) =>
        update(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      // 演示台控制
      setPlatform: (platform: Platform) =>
        update(s => ({
          platform,
          scene: platform === "mac" ? "desktop" : s.scene,
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
            return {
              dataState,
              // 模拟新用户：托盘提示重新出现
              coachSeen: false,
              team: null,
              members: [],
              characters: [],
              drafts: {},
              pendingConflict: null,
              managerSection: "characters",
            };
          }
          if (!s.team) return { dataState, ...seedData(), activeCharId: "c1" };
          return { dataState };
        }),
      retry: () => {
        patch({ dataState: "loading" });
        window.setTimeout(() => patch({ dataState: "normal" }), 900);
      },

      // 面板
      dismissCoach: () => patch({ coachSeen: true }),
      setLaunchAtLogin: (launchAtLogin: boolean) => patch({ launchAtLogin }),
      setTrayMotion: (trayMotion: TrayMotion) => patch({ trayMotion }),
      togglePanel: () =>
        update(s => ({ panelOpen: !s.panelOpen, coachSeen: true })),
      setPanelOpen: (open: boolean) =>
        update(s => ({ panelOpen: open, coachSeen: s.coachSeen || open })),
      togglePin: () =>
        update(s => ({
          pinned: !s.pinned,
          panelOffset: s.pinned ? { x: 0, y: 0 } : s.panelOffset,
        })),
      setPanelOffset: (panelOffset: { x: number; y: number }) =>
        patch({ panelOffset }),
      selectCharacter: (activeCharId: string) => patch({ activeCharId }),
      setMode: (charId: string, mode: Mode) =>
        update(s => ({ activeMode: { ...s.activeMode, [charId]: mode } })),
      markSynced: (charId: string, mode: Mode) => {
        const s = stateRef.current;
        const char = s.characters.find(c => c.id === charId);
        const last = char && latest(findScheme(s, char.xinfa, mode));
        if (!char || !last) return;
        update(st => ({
          characters: st.characters.map(c =>
            c.id === charId
              ? { ...c, synced: { ...c.synced, [mode]: last.version } }
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
            for (const i of mine) synced[i.mode] = i.last.version;
            return { ...c, synced };
          }),
        }));
        return items.length;
      },

      // 管理窗口
      openManager: (
        section?: ManagerSection,
        schemeId?: string,
        intent?: "add-character"
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
      setSection: (managerSection: ManagerSection) => patch({ managerSection }),
      selectScheme: (selectedSchemeId: string) => patch({ selectedSchemeId }),
      setChangelogFilter: (changelogFilter: string) =>
        patch({ changelogFilter }),

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
                  c.xinfa === draft.xinfa &&
                  c.synced[draft.mode] === last!.version
                    ? {
                        ...c,
                        synced: { ...c.synced, [draft.mode]: version.version },
                      }
                    : c
                )
              : st.characters,
          };
        });
        return "saved";
      },
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
              note: `${pc.note}（覆盖了 ${memberName(st, pc.rival.authorId)} 的 v${pc.rival.version}）`,
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
      /** 改名或改心法。改心法时按心法分开保存同步记录，改回去会恢复 */
      updateCharacter: (
        id: string,
        p: { name?: string; xinfa?: string }
      ): { restored: boolean } => {
        const char = stateRef.current.characters.find(c => c.id === id);
        if (!char) return { restored: false };
        let next: Character = { ...char, ...(p.name ? { name: p.name } : {}) };
        let restored = false;
        if (p.xinfa && p.xinfa !== char.xinfa) {
          const stash = {
            ...(char.syncedByXinfa ?? {}),
            [char.xinfa]: char.synced,
          };
          const back = stash[p.xinfa];
          delete stash[p.xinfa];
          restored = !!back && Object.keys(back).length > 0;
          next = {
            ...next,
            xinfa: p.xinfa,
            synced: back ?? {},
            syncedByXinfa: stash,
          };
        }
        update(s => ({
          characters: s.characters.map(c => (c.id === id ? next : c)),
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
       * 导入配装（原型：生成示例数值）。
       * 同心法重新导入：原型里魔盒那边没有改动，所以保留原数值，只更新导入时间。
       * 返回 "new"（第一次或换了心法）或 "same"（配装没有变化）
       */
      importLoadout: (
        charId: string,
        source: LoadoutSource,
        sourceId: string | null
      ): "new" | "same" => {
        const s = stateRef.current;
        const char = s.characters.find(c => c.id === charId);
        if (!char) return "new";
        const at = new Date().toISOString();
        const prev = s.loadouts[charId];
        if (prev && prev.xinfa === char.xinfa) {
          update(st => ({
            loadouts: {
              ...st.loadouts,
              [charId]: {
                ...prev,
                importedAt: at,
                source,
                sourceId:
                  source === "jx3box" ? (sourceId ?? prev.sourceId) : null,
              },
            },
          }));
          return "same";
        }
        update(st => ({
          loadouts: {
            ...st.loadouts,
            [charId]: makeLoadout(char.xinfa, source, sourceId, at),
          },
        }));
        return "new";
      },
      /** 把试穿的装备应用到配装；返回新秒伤 */
      applyCandidate: (charId: string, slotKey: string, candId: string) => {
        const s = stateRef.current;
        const lo = s.loadouts[charId];
        const cand = lo?.candidates[slotKey]?.find(c => c.id === candId);
        const slot = lo?.slots.find(x => x.key === slotKey);
        if (!lo || !cand || !slot || cand.current) return lo?.dps ?? 0;
        const dps = Math.round(lo.dps * (1 + cand.pct / 100));
        const at = new Date().toISOString();
        const next: Loadout = {
          ...lo,
          dps,
          slots: lo.slots.map(x =>
            x.key === slotKey
              ? {
                  ...x,
                  item: {
                    ...x.item,
                    name: cand.name.replace(" · ", "·"),
                    quality: cand.quality,
                    tags: cand.tags,
                  },
                }
              : x
          ),
          // 其他候选的提升值改成相对新装备
          candidates: {
            ...lo.candidates,
            [slotKey]: sortCandidates(
              lo.candidates[slotKey].map(c =>
                c.id === candId
                  ? {
                      ...c,
                      pct: 0,
                      current: true,
                      source: "已装备",
                      effects: [],
                      note: undefined,
                    }
                  : {
                      ...c,
                      current: false,
                      source: c.current ? "刚换下" : c.source,
                      pct: Math.round((c.pct - cand.pct) * 100) / 100,
                    }
              )
            ),
          },
          history: [
            ...lo.history,
            {
              at,
              dps,
              label: `换${slot.label.replace(/ \d$/, "")}`,
              kind: "gear",
            },
          ],
        };
        update(st => ({ loadouts: { ...st.loadouts, [charId]: next } }));
        return dps;
      },
      /** 写便签。空内容直接删掉这条记录 */
      setNote: (charId: string, text: string) =>
        update(s => {
          const notes = { ...s.notes };
          if (text.trim())
            notes[charId] = { text, at: new Date().toISOString() };
          else delete notes[charId];
          return { notes };
        }),
      removeCharacter: (id: string) =>
        update(s => {
          const characters = s.characters.filter(c => c.id !== id);
          const mine = characters.filter(c => c.ownerId === ME_ID);
          // 角色删了，它的便签也一起删
          const notes = { ...s.notes };
          delete notes[id];
          const loadouts = { ...s.loadouts };
          delete loadouts[id];
          return {
            notes,
            loadouts,
            characters,
            activeCharId:
              s.activeCharId === id ? (mine[0]?.id ?? "") : s.activeCharId,
          };
        }),

      // 亲友团
      createTeam: (name: string) =>
        update(() => ({
          team: { name, inviteCode: newInviteCode() },
          members: [
            {
              ...SEED_MEMBERS[0],
              role: "admin",
              joinedAt: new Date().toISOString(),
            },
          ],
          schemes: [],
          characters: [],
          dataState: "normal",
        })),
      joinTeam: (code: string): boolean => {
        if (code.trim().toUpperCase() !== SEED_TEAM.inviteCode) return false;
        update(() => {
          const data = seedData();
          return {
            ...data,
            members: data.members.map(m =>
              m.id === ME_ID
                ? {
                    ...m,
                    role: "viewer" as Role,
                    joinedAt: new Date().toISOString(),
                  }
                : m
            ),
            characters: data.characters.filter(c => c.ownerId !== ME_ID),
            dataState: "normal",
          };
        });
        return true;
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
    ...initial,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const actions = useActions(dispatch, stateRef);
  // 便签存到本地，刷新后还在
  useEffect(() => {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
    } catch {
      /* 浏览器禁用本地存储时，只在本次打开期间记住 */
    }
  }, [state.notes]);
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
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
