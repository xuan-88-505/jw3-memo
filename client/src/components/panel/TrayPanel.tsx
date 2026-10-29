import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AppWindow,
  Bell,
  ChevronDown,
  Pin,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { Wordmark, XinfaMark } from "@/components/brand/Marks";
import { OfflineBar, ToastStack } from "@/components/common/overlay";
import { Btn, IconBtn, Segmented } from "@/components/common/ui";
import { SEED_TEAM, XINFA_META, schoolLabel, xinfasOf } from "@/data/seed";
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
  viewXinfa,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { Inbox } from "./Inbox";
import { NotePad } from "./NotePad";
import { ChangeDot, MacroList, TalentList } from "./PanelContent";

export interface TrayPanelProps {
  /** 钉住后拖动面板用 */
  onHeaderPointerDown?: (e: ReactPointerEvent) => void;
  /** 单独页面里用路由打开管理窗口 */
  onOpenManager?: (
    section?: ManagerSection,
    schemeId?: string,
    intent?: "add-character"
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
  else if (!state.team) body = <Onboarding />;
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
  const [view, setView] = useState<"main" | "inbox">("main");
  const [tab, setTab] = useState<"macro" | "talent" | "note">("macro");
  const mine = myCharacters(state);
  const char = mine.find(c => c.id === state.activeCharId) ?? mine[0];
  // 多心法角色（双心法、学了流派）在面板里切着看
  const xinfas = xinfasOf(char);
  const xinfa = viewXinfa(state, char);
  // 只玩一种模式的心法不显示 PVE/PVP 切换
  const modes = modesOf(state, xinfa);
  const picked: Mode = state.activeMode[char.id] ?? "PVE";
  const mode: Mode =
    modes.length > 0 && !modes.includes(picked) ? modes[0] : picked;
  const scheme = findScheme(state, xinfa, mode);
  const last = latest(scheme);
  const status = statusOf(state, char, mode, xinfa);
  // 只在"有更新还没同步"时标出变化；从没同步过的角色不逐条标
  const base =
    status === "pending"
      ? scheme?.versions.find(v => v.version === char.synced[xinfa]?.[mode])
      : undefined;
  const inboxCount = inboxItems(state).length;
  const draggable = state.pinned && !!onHeaderPointerDown;

  if (view === "inbox") {
    return (
      <Inbox
        onBack={() => setView("main")}
        onOpenItem={(charId, m, x) => {
          actions.selectCharacter(charId);
          actions.setXinfa(charId, x);
          actions.setMode(charId, m);
          setView("main");
        }}
        onHeaderPointerDown={onHeaderPointerDown}
        dragging={draggable}
      />
    );
  }

  const macroChanged =
    !!base &&
    !!last &&
    last.macros.some(m => {
      const p = base.macros.find(x => x.id === m.id);
      return !p || p.content !== m.content;
    });
  const talentChanged =
    !!base && !!last && base.talents.some((p, i) => p !== last.talents[i]);

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
          <IconBtn
            label={inboxCount ? `通知，${inboxCount} 条待同步` : "通知"}
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
              openManager("schemes", scheme?.id ?? `${xinfa}-${mode}`)
            }
          >
            <AppWindow className="h-4 w-4" />
          </IconBtn>
        </div>
      </header>

      <OfflineBar compact />

      <div className="flex h-10 shrink-0 items-center gap-4 border-b border-paper/[0.07] px-4">
        <div
          role="tablist"
          aria-label="内容"
          className="flex h-full items-stretch gap-4"
        >
          {(
            [
              ["macro", "宏", macroChanged],
              ["talent", "奇穴", talentChanged],
              ["note", "便签", false],
            ] as const
          ).map(([key, label, changed]) => {
            // 没有方案时宏、奇穴不能点；便签和方案无关，一直能用
            const enabled = key === "note" || !!last;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key && enabled}
                onClick={() => setTab(key)}
                disabled={!enabled}
                className={cn(
                  "relative -mb-px flex items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors disabled:opacity-40",
                  tab === key && enabled
                    ? "border-cinnabar text-paper"
                    : "border-transparent text-paper-3 hover:text-paper"
                )}
              >
                {label}
                {changed && <ChangeDot />}
              </button>
            );
          })}
        </div>
        {(xinfas.length > 1 || modes.length > 1) && (
          <div className="ml-auto flex items-center gap-1.5">
            {xinfas.length > 1 && (
              <Segmented<string>
                label="心法"
                size="xs"
                value={xinfa}
                onChange={x => actions.setXinfa(char.id, x)}
                options={xinfas.map(x => ({
                  value: x,
                  title: x,
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true">
                        {XINFA_META[x]?.short ?? x.slice(0, 1)}
                      </span>
                      <span className="sr-only">{x}</span>
                      {MODES.some(m =>
                        isPending(statusOf(state, char, m, x))
                      ) && <ChangeDot />}
                    </span>
                  ),
                }))}
              />
            )}
            {modes.length > 1 && (
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
                      {isPending(statusOf(state, char, m, xinfa)) && (
                        <ChangeDot />
                      )}
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )}
      </div>

      {tab === "note" ? (
        <NotePad key={char.id} char={char} />
      ) : !scheme || !last ? (
        <NoScheme
          xinfa={xinfa}
          mode={mode}
          onCreate={() => openManager("schemes", `${xinfa}-${mode}`)}
        />
      ) : (
        <div
          key={`${char.id}-${xinfa}-${mode}-${tab}`}
          className="scroll-thin min-h-0 flex-1 animate-fade overflow-y-auto"
        >
          {tab === "macro" ? (
            <MacroList macros={last.macros} base={base} />
          ) : (
            <TalentList xinfa={xinfa} talents={last.talents} base={base} />
          )}
        </div>
      )}
    </>
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
        <div className="absolute inset-x-2 top-[46px] z-30 animate-panel-down rounded-xl bg-ink-3 p-1 shadow-[0_18px_44px_-10px_rgb(0_0_0/0.75)] ring-1 ring-paper/12">
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
                    {pending && <span className="sr-only">待同步</span>}
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
  xinfa: string;
  mode: Mode;
  onCreate: () => void;
}) {
  const { state } = useProto();
  const viewer = me(state)?.role === "viewer";
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
      <XinfaMark xinfa={xinfa} size={40} className="opacity-60" />
      <p className="text-[13.5px] text-paper-2">
        {xinfa}没有 {mode} 方案
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
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-paper-3">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {state.team?.name}
        </span>
      </header>
      <OfflineBar compact />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-6 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-4 text-paper-2 ring-1 ring-inset ring-paper/10">
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

function Onboarding() {
  const { actions } = useProto();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");

  const join = () => {
    if (!code.trim()) {
      setError("先输入邀请码");
      return;
    }
    if (!actions.joinTeam(code)) {
      setError("邀请码无效或已过期");
      return;
    }
    actions.toast("panel", "success", `已加入「${SEED_TEAM.name}」`);
  };
  const create = () => {
    const n = name.trim();
    if (!n) {
      setNameError("先填名字");
      return;
    }
    if (n.length > 12) {
      setNameError("最多 12 个字");
      return;
    }
    actions.createTeam(n);
    actions.toast("panel", "success", `已创建「${n}」`);
  };

  const inputCls = (err: string) =>
    cn(
      "h-9 min-w-0 flex-1 rounded-md bg-ink px-3 text-[13px] text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2",
      err
        ? "ring-cinnabar/70 focus:ring-cinnabar"
        : "ring-paper/12 focus:ring-cinnabar-text/60"
    );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-paper/[0.07] px-4">
        <Wordmark size="sm" />
        <span className="ml-auto text-[12px] text-paper-3">八八</span>
      </header>
      <div className="flex flex-1 flex-col justify-center px-5 pb-8">
        <label
          htmlFor="invite"
          className="text-[12.5px] font-medium text-paper"
        >
          加入亲友团
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="invite"
            value={code}
            onChange={e => {
              setCode(e.target.value);
              setError("");
            }}
            onKeyDown={e => e.key === "Enter" && join()}
            placeholder="邀请码 TD-XXXX-XXXX"
            aria-invalid={!!error}
            aria-describedby="invite-msg"
            className={cn(
              inputCls(error),
              "font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            )}
          />
          <Btn variant="primary" size="md" onClick={join}>
            加入
          </Btn>
        </div>
        <p
          id="invite-msg"
          className={cn(
            "mt-1.5 min-h-[18px] text-[12px]",
            error ? "text-cinnabar-text" : "text-paper-3"
          )}
        >
          {error || (
            <>
              演示码{" "}
              <button
                type="button"
                className="font-mono text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
                onClick={() => setCode(SEED_TEAM.inviteCode)}
              >
                {SEED_TEAM.inviteCode}
              </button>
            </>
          )}
        </p>

        <div className="my-5 flex items-center gap-3 text-[11.5px] text-paper-3">
          <span className="h-px flex-1 bg-paper/10" />或
          <span className="h-px flex-1 bg-paper/10" />
        </div>

        <label
          htmlFor="team-name"
          className="text-[12.5px] font-medium text-paper"
        >
          创建亲友团
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="team-name"
            value={name}
            onChange={e => {
              setName(e.target.value);
              setNameError("");
            }}
            onKeyDown={e => e.key === "Enter" && create()}
            placeholder="名字"
            maxLength={20}
            aria-invalid={!!nameError}
            className={inputCls(nameError)}
          />
          <Btn variant="secondary" size="md" onClick={create}>
            创建
          </Btn>
        </div>
        <p className="mt-1.5 min-h-[18px] text-[12px] text-cinnabar-text">
          {nameError}
        </p>
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
