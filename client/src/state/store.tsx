import {
  createContext,
  useCallback,
  useContext,
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
  rivalEdit,
  seedSchemes,
} from "@/data/seed";
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
  managerOpen: boolean;
  managerSection: ManagerSection;
  managerIntent: "add-character" | null;
  activeCharId: string;
  activeMode: Record<string, Mode>;
  selectedSchemeId: string;
  changelogFilter: string;
  toasts: UiToast[];
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

const initialState: ProtoState = {
  ...seedData(),
  platform: "win",
  scene: "desktop",
  dataState: "normal",
  simulateConflict: false,
  panelOpen: false,
  pinned: false,
  panelOffset: { x: 0, y: 0 },
  coachSeen: false,
  managerOpen: false,
  managerSection: "schemes",
  managerIntent: null,
  activeCharId: "c1",
  activeMode: {},
  selectedSchemeId: "紫霞功-PVE",
  changelogFilter: "全部",
  toasts: [],
};

// ---------- 派生数据 ----------

export function latest(scheme: Scheme | undefined): SchemeVersion | undefined {
  return scheme?.versions[scheme.versions.length - 1];
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
      setMyRole: (role: Role) =>
        update(s => ({
          members: s.members.map(m => (m.id === ME_ID ? { ...m, role } : m)),
        })),
      setDataState: (dataState: DataState) =>
        update(s => {
          if (dataState === "onboarding") {
            return {
              dataState,
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
        update(st => {
          const drafts = { ...st.drafts };
          delete drafts[schemeId];
          return {
            schemes: appendVersion(st.schemes, schemeId, version, draft),
            drafts,
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
            { ...c, id, ownerId: ME_ID, synced: {} },
          ],
          activeCharId: id,
        }));
        return id;
      },
      removeCharacter: (id: string) =>
        update(s => {
          const characters = s.characters.filter(c => c.id !== id);
          const mine = characters.filter(c => c.ownerId === ME_ID);
          return {
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
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProto() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProto must be used inside ProtoProvider");
  return v;
}
