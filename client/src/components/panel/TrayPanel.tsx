import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AppWindow,
  Bell,
  BookOpen,
  ChevronDown,
  Pin,
  Plus,
  StickyNote,
  UserPlus,
  Users,
} from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { Wordmark, XinfaMark } from "@/components/brand/Marks";
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
  charPending,
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
import { NoteView } from "./NotePad";
import { ChangeDot, MacroList, TalentList } from "./PanelContent";

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
}

export function TrayPanel({
  onHeaderPointerDown,
  onOpenManager,
  showPin = true,
  className,
}: TrayPanelProps) {
  const { state, actions } = useProto();
  const openManager = onOpenManager ?? actions.openManager;

  let body: React.ReactNode;
  if (state.dataState === "loading") body = <PanelSkeleton />;
  else if (!myCharacters(state).length)
    body = (
      <NoCharacters
        onAdd={() => openManager("characters", undefined, "add-character")}
      />
    );
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
      aria-label="同调面板"
      className={cn(
        "glass-ink relative flex h-[500px] w-[360px] flex-col overflow-hidden rounded-xl text-paper shadow-[0_28px_70px_-16px_rgb(0_0_0/0.8),0_0_0_1px_rgb(236_230_218/0.1)]",
        className
      )}
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
  const [view, setView] = useState<"main" | "inbox" | "note">("main");
  const [tab, setTab] = useState<"macro" | "talent">("macro");
  const [focusXinfa, setFocusXinfa] = useState<string | null>(null);
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
    // 只在"有更新还没同步"时标出变化；从没同步过的不逐条标
    const base =
      status === "pending"
        ? scheme?.versions.find(v => v.version === char.synced[x]?.[mode])
        : undefined;
    const macroChanged =
      !!base &&
      !!last &&
      last.macros.some(m => {
        const p = base.macros.find(y => y.id === m.id);
        return !p || p.content !== m.content;
      });
    const talentChanged =
      !!base && !!last && base.talents.some((p, i) => p !== last.talents[i]);
    return {
      xinfa: x,
      scheme,
      last,
      status,
      base,
      macroChanged,
      talentChanged,
    };
  });
  // 有方案的心法在前，还没有方案的放最后
  const ready = sections.filter(x => x.scheme && x.last);
  const missing = sections.filter(x => !x.scheme || !x.last);
  const focusScheme = (ready.find(x => isPending(x.status)) ?? ready[0])
    ?.scheme;
  const inboxCount = inboxItems(state).length;
  const draggable = state.pinned && !!onHeaderPointerDown;

  useEffect(() => {
    if (view !== "main" || !focusXinfa) return;
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
          setView("main");
        }}
        onHeaderPointerDown={onHeaderPointerDown}
        dragging={draggable}
      />
    );
  }

  // 便签全局一份，和角色无关：从标题栏进二级页
  if (view === "note") {
    return (
      <NoteView
        onBack={() => setView("main")}
        onHeaderPointerDown={onHeaderPointerDown}
        dragging={draggable}
      />
    );
  }

  const macroChanged = sections.some(x => x.macroChanged);
  const talentChanged = sections.some(x => x.talentChanged);

  return (
    <>
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex h-12 shrink-0 items-center gap-1 border-b border-paper/[0.07] pl-1.5 pr-2",
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
          <IconBtn label="便签" onClick={() => setView("note")}>
            <StickyNote className="h-4 w-4" />
          </IconBtn>
          <IconBtn
            label={inboxCount ? `通知，${inboxCount} 条有更新` : "通知"}
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
              label={state.pinned ? "取消置顶" : "置顶"}
              active={state.pinned}
              onClick={actions.togglePin}
            >
              <Pin className={cn("h-4 w-4", state.pinned && "fill-current")} />
            </IconBtn>
          )}
          <IconBtn
            label="打开管理窗口"
            onClick={() =>
              // 没有方案时不定位，方案库显示列表里的第一个
              openManager("schemes", focusScheme?.id)
            }
          >
            <AppWindow className="h-4 w-4" />
          </IconBtn>
        </div>
      </header>

      <OfflineBar compact />

      {missing.length && (!multi || ready.length === 0) ? (
        <NoScheme
          xinfa={multi ? undefined : xinfas[0]}
          mode={mode}
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
                <MacroList macros={sec.last!.macros} base={sec.base} />
              ) : (
                <TalentList
                  xinfa={sec.xinfa}
                  talents={sec.last!.talents}
                  base={sec.base}
                />
              );
            // 只玩一个心法时不加小标题
            if (!multi) return <div key={sec.xinfa}>{list}</div>;
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
                  version={sec.last!.version}
                  changed={
                    tab === "macro" ? sec.macroChanged : sec.talentChanged
                  }
                />
                {list}
              </section>
            );
          })}
          {multi && missing.length > 0 && (
            <NewSchemeRow
              missing={missing.map(x => x.xinfa)}
              mode={mode}
              onCreate={() =>
                openManager("schemes", undefined, {
                  newScheme: { xinfa: missing[0].xinfa, mode },
                })
              }
            />
          )}
        </div>
      )}

      {/* 底栏：宏 / 奇穴，离托盘图标近 */}
      <div className="flex h-11 shrink-0 items-center gap-4 border-t border-paper/[0.07] px-4">
        <div
          role="tablist"
          aria-label="内容"
          className="flex h-full items-stretch gap-4"
        >
          {(
            [
              ["macro", "宏", macroChanged],
              ["talent", "奇穴", talentChanged],
            ] as const
          ).map(([key, label, changed]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "relative -mt-px flex items-center gap-1.5 border-t-2 text-[13px] font-medium transition-colors",
                tab === key
                  ? "border-cinnabar text-paper"
                  : "border-transparent text-paper-3 hover:text-paper"
              )}
            >
              {label}
              {changed && <ChangeDot />}
            </button>
          ))}
        </div>
        {modes.length > 1 && (
          <div className="ml-auto">
            <Segmented<Mode>
              label="方案类型"
              size="xs"
              value={mode}
              onChange={m => actions.setMode(char.id, m)}
              options={modes.map(m => ({
                value: m,
                label: (
                  <span className="inline-flex items-center gap-1">
                    {m}
                    {xinfas.some(x =>
                      isPending(statusOf(state, char, m, x))
                    ) && <ChangeDot />}
                  </span>
                ),
              }))}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** 多心法角色列表里的心法小标题：滚动时贴在顶部 */
function SectionHeading({
  id,
  xinfa,
  version,
  changed,
}: {
  id: string;
  xinfa: string;
  version: number;
  changed: boolean;
}) {
  return (
    <h3
      id={id}
      className="sticky top-0 z-10 flex h-8 items-center gap-2 bg-[#181714] px-4 text-[12px] font-medium text-paper-2"
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        <XinfaMark xinfa={xinfa} size={16} />
      </span>
      <span className="truncate">{xinfa}</span>
      {changed && (
        <>
          <ChangeDot />
          <span className="sr-only">有改动</span>
        </>
      )}
      <span className="ml-auto shrink-0 text-[11px] font-normal tabular-nums text-paper-3">
        v{version}
      </span>
    </h3>
  );
}

/** 多心法角色里有心法还没方案：列表最后一行「新建方案」，不逐个列出 */
function NewSchemeRow({
  missing,
  mode,
  onCreate,
}: {
  missing: string[];
  mode: Mode;
  onCreate: () => void;
}) {
  const { state } = useProto();
  if (me(state)?.role === "viewer") return null;
  return (
    <div className="border-t border-paper/[0.07] px-2 py-1.5">
      <button
        type="button"
        onClick={onCreate}
        title={`${missing.join("、")}还没有 ${mode} 方案`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-paper-3 transition-colors hover:bg-paper/[0.06] hover:text-paper"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        新建方案
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
        <span className="truncate font-serif text-[15px] font-semibold leading-tight">
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
          <ul role="listbox" aria-label="我的角色">
            {characters.map((c, i) => {
              const active = c.id === current.id;
              const pending = charPending(state, c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    title={i < 9 ? `面板打开时按 ${i + 1} 切换` : undefined}
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
                    {pending && <span className="sr-only">有更新</span>}
                    {pending && <ChangeDot className="h-2 w-2 rounded-[2px]" />}
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
              管理角色
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
  mode,
  onCreate,
}: {
  /** 只玩一个心法时写心法名；多心法角色一个方案都没有时不写 */
  xinfa?: string;
  mode: Mode;
  onCreate: () => void;
}) {
  const { state } = useProto();
  const viewer = me(state)?.role === "viewer";
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
      {xinfa ? (
        <XinfaMark xinfa={xinfa} size={40} className="opacity-60" />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-paper/[0.05] text-paper-3">
          <BookOpen className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      )}
      <p className="text-[13.5px] text-paper-2">
        {xinfa ?? ""}还没有 {mode} 方案
      </p>
      {viewer ? (
        <p className="text-[12px] text-paper-3">只读成员不能新建</p>
      ) : (
        <Btn
          variant="secondary"
          size="sm"
          onClick={onCreate}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          新建方案
        </Btn>
      )}
    </div>
  );
}

function NoCharacters({ onAdd }: { onAdd: () => void }) {
  const { state } = useProto();
  return (
    <div className="flex flex-1 flex-col">
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-paper/[0.05] text-paper-3">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-[13.5px] text-paper-2">还没有角色</p>
        <Btn
          variant="primary"
          size="md"
          onClick={onAdd}
          icon={<Plus className="h-4 w-4" />}
        >
          添加角色
        </Btn>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div
      className="flex flex-1 flex-col"
      aria-busy="true"
      aria-label="正在加载"
    >
      <div className="flex h-12 items-center gap-2 border-b border-paper/[0.07] px-3">
        <span className="skeleton h-7 w-7" />
        <span className="skeleton h-3.5 w-20" />
        <span className="ml-auto flex gap-1.5">
          <span className="skeleton h-6 w-6" />
          <span className="skeleton h-6 w-6" />
          <span className="skeleton h-6 w-6" />
        </span>
      </div>
      <div className="flex h-10 items-center gap-4 border-b border-paper/[0.07] px-4">
        <span className="skeleton h-3 w-6" />
        <span className="skeleton h-3 w-8" />
        <span className="skeleton ml-auto h-5 w-[86px]" />
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
