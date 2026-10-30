import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppWindow, Bell, ChevronDown, Pin, Plus, Users } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { Wordmark, XinfaMark } from "@/components/brand/Marks";
import { PixelIcon } from "@/components/brand/PixelIcon";
import { OfflineBar, ToastStack } from "@/components/common/overlay";
import { Btn, IconBtn, Segmented } from "@/components/common/ui";
import { schoolLabel, xinfasOf } from "@/data/seed";
import {
  MODES,
  type Character,
  type ManagerSection,
  type Mode,
} from "@/data/types";
import {
  findScheme,
  inboxItems,
  isPending,
  latest,
  modesOf,
  me,
  myCharacters,
  statusOf,
  useProto,
  type ManagerIntent,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { Inbox } from "./Inbox";
import { NotePad } from "./NotePad";
import { PanelAddCharacter } from "./PanelAddCharacter";
import { MacroList, TalentList } from "./PanelContent";
import { tx } from "@/lib/i18n";

// 多心法分段的折叠状态：按「角色:心法」记，宏和奇穴共用；关面板、重启后保持
const COLLAPSE_KEY = "tongdiao.panelCollapsed.v1";

function readCollapsed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
    return new Set(
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : []
    );
  } catch {
    return new Set();
  }
}

function writeCollapsed(s: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]));
  } catch {
    // 存不了就只在本次有效
  }
}

export interface TrayPanelProps {
  /** 钉住后拖动面板用 */
  onHeaderPointerDown?: (e: ReactPointerEvent) => void;
  /** 单独页面里用路由打开管理窗口 */
  onOpenManager?: (
    section?: ManagerSection,
    schemeId?: string,
    intent?: ManagerIntent
  ) => void;
  showPin?: boolean;
  className?: string;
  /** 调过的面板大小；不传时是默认 360 × 500 */
  style?: React.CSSProperties;
}

export function TrayPanel({
  onHeaderPointerDown,
  onOpenManager,
  showPin = true,
  className,
  style,
}: TrayPanelProps) {
  const { state, actions } = useProto();
  const openManager = onOpenManager ?? actions.openManager;

  let body: React.ReactNode;
  if (state.dataState === "loading") body = <PanelSkeleton />;
  else if (!myCharacters(state).length) body = <NoCharacters />;
  else
    body = (
      <PanelMain
        openManager={openManager}
        onHeaderPointerDown={onHeaderPointerDown}
        showPin={showPin}
      />
    );

  return (
    <section
      aria-label={tx("备忘录面板")}
      // 下拉菜单挂在面板里：不超出面板，模拟桌面缩放时位置也对
      data-layer-root
      className={cn(
        "glass-ink relative flex h-[500px] w-[360px] flex-col overflow-hidden rounded-xl text-paper shadow-[0_28px_70px_-16px_rgb(0_0_0/0.8),0_0_0_1px_rgb(236_230_218/0.1)]",
        className
      )}
      style={style}
    >
      {body}
      <ToastStack surface="panel" className="bottom-3" />
    </section>
  );
}

// ---------- 正常状态 ----------

function PanelMain({
  openManager,
  onHeaderPointerDown,
  showPin,
}: {
  openManager: NonNullable<TrayPanelProps["onOpenManager"]>;
  onHeaderPointerDown?: (e: ReactPointerEvent) => void;
  showPin: boolean;
}) {
  const { state, actions } = useProto();
  const [view, setView] = useState<"main" | "inbox">("main");
  const [tab, setTab] = useState<"macro" | "talent" | "note">("macro");
  const [focusXinfa, setFocusXinfa] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const mine = myCharacters(state);
  const char = mine.find(c => c.id === state.activeCharId) ?? mine[0];
  // 多心法角色（双心法、学了流派）：列表按心法分段，每段一个小标题
  const xinfas = xinfasOf(char);
  const multi = xinfas.length > 1;
  // 这个角色所有心法里出现过的模式；只有一种时不显示 PVE/PVP 切换
  const modes = MODES.filter(m =>
    xinfas.some(x => modesOf(state, x).includes(m))
  );
  const picked: Mode = state.activeMode[char.id] ?? "PVE";
  const mode: Mode =
    modes.length > 0 && !modes.includes(picked) ? modes[0] : picked;
  const sections = xinfas.map(x => {
    const scheme = findScheme(state, x, mode);
    const last = latest(scheme);
    const status = statusOf(state, char, mode, x);
    // 有更新还没改时，展开宏能高亮改过的行；从没改过的不逐行标
    const base =
      status === "pending"
        ? scheme?.versions.find(v => v.version === char.synced[x]?.[mode])
        : undefined;
    return {
      xinfa: x,
      scheme,
      last,
      status,
      base,
    };
  });
  // 有方案的心法在前，还没有方案的放最后
  const ready = sections.filter(x => x.scheme && x.last);
  const missing = sections.filter(x => !x.scheme || !x.last);
  const focusScheme = (ready.find(x => isPending(x.status)) ?? ready[0])
    ?.scheme;
  const inboxCount = inboxItems(state).length;
  // 面板任何时候都能拖，不需要先置顶
  const draggable = !!onHeaderPointerDown;

  const setSectionCollapsed = (key: string, value: boolean) =>
    setCollapsed(prev => {
      if (prev.has(key) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      writeCollapsed(next);
      return next;
    });

  useEffect(() => {
    if (view !== "main" || !focusXinfa) return;
    // 从通知点进来：这个心法折叠着就先展开
    setSectionCollapsed(`${char.id}:${focusXinfa}`, false);
    sectionRefs.current.get(focusXinfa)?.scrollIntoView({ block: "start" });
    setFocusXinfa(null);
  }, [view, focusXinfa]);

  if (view === "inbox") {
    return (
      <Inbox
        onBack={() => setView("main")}
        onOpenItem={(charId, m, x) => {
          actions.selectCharacter(charId);
          actions.setMode(charId, m);
          setFocusXinfa(x);
          // 从通知点进来是看方案：在便签页签时切回宏
          if (tab === "note") setTab("macro");
          setView("main");
        }}
        onHeaderPointerDown={onHeaderPointerDown}
        dragging={draggable}
      />
    );
  }

  return (
    <>
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex h-12 shrink-0 select-none items-center gap-1 pl-1.5 pr-2",
          draggable && "cursor-grab active:cursor-grabbing"
        )}
      >
        <CharacterSwitcher
          current={char}
          characters={mine}
          onManage={() => openManager("characters")}
        />
        <div
          className="ml-auto flex items-center gap-0.5"
          onPointerDown={e => e.stopPropagation()}
        >
          <IconBtn
            label={
              inboxCount ? tx("通知，{0} 条有更新", inboxCount) : tx("通知")
            }
            onClick={() => setView("inbox")}
          >
            <span className="relative">
              <Bell className="h-4 w-4" />
              {inboxCount > 0 && (
                <span className="absolute -right-[7px] -top-[6px] grid h-[14px] min-w-[14px] place-items-center rounded-full bg-cinnabar-fill px-[3px] text-[9.5px] font-semibold leading-none text-[#FFF7F0] ring-2 ring-ink-2">
                  {inboxCount}
                </span>
              )}
            </span>
          </IconBtn>
          {showPin && (
            <IconBtn
              label={state.pinned ? tx("取消置顶") : tx("置顶")}
              active={state.pinned}
              onClick={actions.togglePin}
            >
              <Pin className={cn("h-4 w-4", state.pinned && "fill-current")} />
            </IconBtn>
          )}
          <IconBtn
            label={tx("打开管理窗口")}
            onClick={() =>
              // 没有方案时不定位，方案库显示列表里的第一个
              openManager("schemes", focusScheme?.id)
            }
          >
            <AppWindow className="h-4 w-4" />
          </IconBtn>
        </div>
      </header>

      {/* 页签行：宏 / 奇穴 / 便签平级；没有方案时也显示，便签随时能进 */}
      <div className="flex h-10 shrink-0 items-stretch gap-2 border-b border-paper/[0.07] pl-4 pr-2">
        <div
          role="tablist"
          aria-label={tx("内容")}
          className="flex items-stretch gap-4"
        >
          {(
            [
              ["macro", tx("宏")],
              ["talent", tx("奇穴")],
              ["note", tx("便签")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "relative -mb-px flex items-center border-b-2 text-[13px] font-medium transition-colors",
                tab === key
                  ? "border-cinnabar text-paper"
                  : "border-transparent text-paper-3 hover:text-paper"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 便签和 PVE/PVP 无关，不显示切换 */}
          {modes.length > 1 && tab !== "note" && (
            <Segmented<Mode>
              label={tx("方案类型")}
              size="xs"
              value={mode}
              onChange={m => actions.setMode(char.id, m)}
              options={modes.map(m => ({ value: m, label: m }))}
            />
          )}
        </div>
      </div>

      <OfflineBar compact />

      {tab === "note" ? (
        // 每个角色一份：按角色 id 重新挂载，切角色时内容跟着变
        <NotePad key={char.id} charId={char.id} />
      ) : missing.length && (!multi || ready.length === 0) ? (
        <NoScheme
          xinfa={multi ? undefined : xinfas[0]}
          onCreate={() =>
            openManager("schemes", undefined, {
              newScheme: { xinfa: missing[0].xinfa, mode },
            })
          }
        />
      ) : (
        <div
          key={`${char.id}-${mode}-${tab}`}
          className="scroll-thin min-h-0 flex-1 animate-fade overflow-y-auto"
        >
          {ready.map(sec => {
            const id = `panel-sec-${char.id}-${sec.xinfa}`;
            const list =
              tab === "macro" ? (
                <MacroList
                  macros={sec.last!.macros}
                  base={sec.base}
                  compact={multi}
                />
              ) : (
                <TalentList
                  xinfa={sec.xinfa}
                  talents={sec.last!.talents}
                  compact={multi}
                />
              );
            // 只玩一个心法时不加小标题
            if (!multi) return <div key={sec.xinfa}>{list}</div>;
            const key = `${char.id}:${sec.xinfa}`;
            const isCollapsed = collapsed.has(key);
            return (
              <section
                key={sec.xinfa}
                aria-labelledby={id}
                ref={el => {
                  if (el) sectionRefs.current.set(sec.xinfa, el);
                  else sectionRefs.current.delete(sec.xinfa);
                }}
              >
                <SectionHeading
                  id={id}
                  xinfa={sec.xinfa}
                  collapsed={isCollapsed}
                  onToggle={() => setSectionCollapsed(key, !isCollapsed)}
                />
                {/* 折叠时只隐藏不卸载：展开的宏、奇穴说明保持原样 */}
                <div id={`${id}-body`} hidden={isCollapsed}>
                  {list}
                </div>
              </section>
            );
          })}
          {multi && missing.length > 0 && (
            <NewSchemeRow
              missing={missing.map(x => x.xinfa)}
              onCreate={() =>
                openManager("schemes", undefined, {
                  newScheme: { xinfa: missing[0].xinfa, mode },
                })
              }
            />
          )}
        </div>
      )}
    </>
  );
}

/** 多心法角色列表里的心法小标题：滚动时贴在顶部，点整行展开或折叠 */
function SectionHeading({
  id,
  xinfa,
  collapsed,
  onToggle,
}: {
  id: string;
  xinfa: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <h3 id={id} className="sticky top-0 z-10 bg-[#181714]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={`${id}-body`}
        className="group flex h-8 w-full items-center gap-2 px-4 text-left text-[12px] font-medium text-paper-2 transition-colors hover:text-paper"
      >
        <span aria-hidden="true" className="inline-flex shrink-0">
          <XinfaMark xinfa={xinfa} size={16} />
        </span>
        <span className="truncate">{xinfa}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform duration-150 group-hover:text-paper-2",
            collapsed && "-rotate-90"
          )}
        />
      </button>
    </h3>
  );
}

/** 多心法角色里有心法还没方案：列表最后一行「新建」，不逐个列出 */
function NewSchemeRow({
  missing,
  onCreate,
}: {
  missing: string[];
  onCreate: () => void;
}) {
  const { state } = useProto();
  if (me(state)?.role === "viewer") return null;
  return (
    <div className="border-t border-paper/[0.07] px-2 py-1.5">
      <button
        type="button"
        onClick={onCreate}
        title={tx("{0}还没有方案", missing.join("、"))}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-paper-3 transition-colors hover:bg-paper/[0.06] hover:text-paper"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {tx("新建")}
      </button>
    </div>
  );
}

function CharacterSwitcher({
  current,
  characters,
  onManage,
}: {
  current: Character;
  characters: Character[];
  onManage: () => void;
}) {
  const { state, actions } = useProto();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="min-w-0" onPointerDown={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${current.server} · ${schoolLabel(current)}`}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-paper/[0.06]"
      >
        <CharAvatar character={current} size={28} />
        <span className="truncate text-[15px] font-semibold leading-tight">
          {current.name}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute inset-x-2 top-[46px] z-30 animate-panel-down rounded-xl bg-ink-3 p-1 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-paper/12">
          <ul role="listbox" aria-label={tx("我的角色")}>
            {characters.map((c, i) => {
              const active = c.id === current.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    title={
                      i < 9 ? tx("面板打开时按 {0} 切换", i + 1) : undefined
                    }
                    onClick={() => {
                      actions.selectCharacter(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left",
                      active ? "bg-paper/[0.07]" : "hover:bg-paper/[0.05]"
                    )}
                  >
                    <CharAvatar character={c} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-paper">
                      {c.name}
                      <span className="ml-2 text-[11.5px] font-normal text-paper-3">
                        {schoolLabel(c)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-paper/[0.07] pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[12.5px] text-paper-2 hover:bg-paper/[0.05] hover:text-paper"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tx("管理角色")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 空状态 ----------

function NoScheme({
  xinfa,
  onCreate,
}: {
  /** 只玩一个心法时写心法名；多心法角色一个方案都没有时不写 */
  xinfa?: string;
  onCreate: () => void;
}) {
  const { state } = useProto();
  const viewer = me(state)?.role === "viewer";
  return (
    <div className="empty-state flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
      {xinfa ? (
        <XinfaMark xinfa={xinfa} size={40} className="opacity-60" />
      ) : (
        <PixelIcon name="book" className="pixel-hop" />
      )}
      <p className="text-[13.5px] text-paper-2">
        {xinfa ? tx("{0}还没有方案", xinfa) : tx("还没有方案")}
      </p>
      {viewer ? (
        <p className="text-[12px] text-paper-3">{tx("只读成员不能新建")}</p>
      ) : (
        <Btn
          variant="secondary"
          size="sm"
          onClick={onCreate}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          {tx("新建")}
        </Btn>
      )}
    </div>
  );
}

/** 还没有角色：点「添加角色」在面板里原地填表，不打开管理窗口 */
function NoCharacters() {
  const { state } = useProto();
  const [adding, setAdding] = useState(false);
  const addBtn = useRef<HTMLButtonElement>(null);
  const backToButton = useRef(false);
  // 取消后焦点回到「添加角色」按钮，键盘用户不用重新找
  useEffect(() => {
    if (!adding && backToButton.current) {
      backToButton.current = false;
      addBtn.current?.focus();
    }
  }, [adding]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-paper/[0.07] px-4">
        <Wordmark size="sm" />
        {state.team && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-paper-3">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {state.team.name}
          </span>
        )}
      </header>
      <OfflineBar compact />
      {adding ? (
        <PanelAddCharacter
          onCancel={() => {
            backToButton.current = true;
            setAdding(false);
          }}
        />
      ) : (
        <div className="empty-state flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
          <PixelIcon name="hero" className="pixel-hop" />
          <p className="text-[13.5px] text-paper-2">{tx("还没有角色")}</p>
          <Btn
            ref={addBtn}
            variant="primary"
            size="md"
            onClick={() => setAdding(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            {tx("添加角色")}
          </Btn>
        </div>
      )}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div
      className="flex flex-1 flex-col"
      aria-busy="true"
      aria-label={tx("正在加载")}
    >
      <div className="flex h-12 items-center gap-2 px-3">
        <span className="skeleton h-7 w-7" />
        <span className="skeleton h-3.5 w-20" />
        <span className="ml-auto flex gap-1.5">
          <span className="skeleton h-6 w-6" />
          <span className="skeleton h-6 w-6" />
          <span className="skeleton h-6 w-6" />
        </span>
      </div>
      <div className="flex h-10 items-center gap-4 border-b border-paper/[0.07] pl-4 pr-3">
        <span className="skeleton h-3 w-6" />
        <span className="skeleton h-3 w-8" />
        <span className="skeleton ml-auto h-6 w-6" />
      </div>
      <div className="space-y-3 px-4 pt-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="skeleton h-8 w-8" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="skeleton h-3 w-2/5" />
              <span className="skeleton h-2.5 w-1/4" />
            </span>
            <span className="skeleton h-7 w-[64px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
