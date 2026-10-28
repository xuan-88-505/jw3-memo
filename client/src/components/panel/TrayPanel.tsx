import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AppWindow,
  ChevronDown,
  Pin,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { Wordmark, XinfaMark } from "@/components/brand/Marks";
import { OfflineBar, ToastStack } from "@/components/common/overlay";
import {
  Btn,
  IconBtn,
  Kbd,
  Segmented,
  StatusPill,
} from "@/components/common/ui";
import { layersOf, SEED_TEAM } from "@/data/seed";
import type { Character, ManagerSection, Mode } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { absoluteTime, hotkeyKeys, relativeTime } from "@/lib/format";
import {
  charPending,
  findScheme,
  isPending,
  latest,
  me,
  memberName,
  myCharacters,
  pendingCount,
  statusOf,
  useProto,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { MacroList, SyncBanner, TalentList } from "./PanelContent";

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
        "glass-ink relative flex h-[600px] w-[380px] flex-col overflow-hidden rounded-xl text-paper shadow-[0_28px_70px_-16px_rgb(0_0_0/0.8),0_0_0_1px_rgb(236_230_218/0.1)]",
        className
      )}
    >
      {body}
      <ToastStack surface="panel" className="bottom-12" />
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
  const mine = myCharacters(state);
  const char = mine.find(c => c.id === state.activeCharId) ?? mine[0];
  const mode: Mode = state.activeMode[char.id] ?? "PVE";
  const scheme = findScheme(state, char.xinfa, mode);
  const last = latest(scheme);
  const synced = char.synced[mode];
  const base = scheme?.versions.find(v => v.version === synced);
  const status = statusOf(state, char, mode);
  const compareBase = status === "pending" ? base : undefined;
  const diff = useMemo(
    () =>
      last
        ? diffVersions(
            status === "never" ? undefined : base,
            last,
            layersOf(char.xinfa)
          )
        : null,
    [last, base, status, char.xinfa]
  );
  const [tab, setTab] = useState<"macro" | "talent">("macro");
  const pending = pendingCount(state);

  return (
    <>
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex h-[56px] shrink-0 items-center gap-1 border-b border-paper/[0.07] pl-2 pr-2.5",
          state.pinned &&
            onHeaderPointerDown &&
            "cursor-grab active:cursor-grabbing"
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
          {showPin && (
            <IconBtn
              label={
                state.pinned
                  ? "取消置顶（点外面会收起）"
                  : "置顶（点外面不收起，可拖动）"
              }
              active={state.pinned}
              onClick={actions.togglePin}
            >
              <Pin className={cn("h-4 w-4", state.pinned && "fill-current")} />
            </IconBtn>
          )}
          <IconBtn
            label="打开管理窗口"
            onClick={() =>
              openManager("schemes", scheme?.id ?? `${char.xinfa}-${mode}`)
            }
          >
            <AppWindow className="h-4 w-4" />
          </IconBtn>
        </div>
      </header>

      <OfflineBar compact />

      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-2.5">
        <Segmented<Mode>
          label="方案类型"
          value={mode}
          onChange={m => actions.setMode(char.id, m)}
          options={(["PVE", "PVP"] as Mode[]).map(m => {
            const st = statusOf(state, char, m);
            return {
              value: m,
              label: (
                <span className="inline-flex items-center gap-1">
                  {m}
                  {isPending(st) && (
                    <span
                      className="h-1.5 w-1.5 rounded-[1.5px] bg-cinnabar"
                      aria-label="待同步"
                    />
                  )}
                </span>
              ),
            };
          })}
        />
        {last && (
          <span
            className="truncate text-[11.5px] text-paper-3"
            title={absoluteTime(last.at)}
          >
            v{last.version} · {memberName(state, last.authorId)} ·{" "}
            {relativeTime(last.at)}
          </span>
        )}
      </div>

      {!scheme || !last ? (
        <NoScheme
          xinfa={char.xinfa}
          mode={mode}
          onCreate={() => openManager("schemes", `${char.xinfa}-${mode}`)}
        />
      ) : (
        <>
          {diff && (
            <SyncBanner
              char={char}
              mode={mode}
              scheme={scheme}
              last={last}
              diff={diff}
            />
          )}

          <div
            role="tablist"
            aria-label="内容"
            className="mt-1.5 flex shrink-0 items-end gap-4 border-b border-paper/[0.07] px-4"
          >
            {(
              [
                ["macro", "宏", last.macros.length],
                ["talent", "奇穴", 9],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative -mb-px flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors",
                  tab === key
                    ? "border-cinnabar text-paper"
                    : "border-transparent text-paper-3 hover:text-paper"
                )}
              >
                {label}
                <span className="text-[11px] font-normal text-paper-3">
                  {n}
                </span>
                {key === "macro" &&
                  compareBase &&
                  last.macros.some(m => {
                    const p = compareBase.macros.find(x => x.id === m.id);
                    return !p || p.content !== m.content;
                  }) && (
                    <span
                      className="h-1.5 w-1.5 rounded-[1.5px] bg-cinnabar"
                      aria-label="有变化"
                    />
                  )}
                {key === "talent" &&
                  compareBase &&
                  compareBase.talents.some((p, i) => p !== last.talents[i]) && (
                    <span
                      className="h-1.5 w-1.5 rounded-[1.5px] bg-cinnabar"
                      aria-label="有变化"
                    />
                  )}
              </button>
            ))}
            {tab === "macro" && (
              <span className="mb-2.5 ml-auto text-[11px] text-paper-3">
                复制时自动去掉注释和空行
              </span>
            )}
          </div>

          <div
            key={`${char.id}-${mode}-${tab}`}
            className="scroll-thin min-h-0 flex-1 animate-fade overflow-y-auto"
          >
            {tab === "macro" ? (
              <MacroList macros={last.macros} base={compareBase} />
            ) : (
              <TalentList
                xinfa={char.xinfa}
                talents={last.talents}
                base={compareBase}
              />
            )}
          </div>
        </>
      )}

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-paper/[0.07] px-4 text-[11.5px] text-paper-3">
        <span>
          {mine.length} 个角色
          {pending > 0 ? (
            <>
              {" · "}
              <span className="text-cinnabar-text">{pending} 个待同步</span>
            </>
          ) : (
            " · 全部已同步"
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd keys={hotkeyKeys(state.platform)} /> 呼出 / 收起
        </span>
      </footer>
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
        className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-paper/[0.06]"
      >
        <XinfaMark xinfa={current.xinfa} size={34} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-serif text-[16px] font-semibold leading-tight">
              {current.name}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          </span>
          <span className="block truncate text-[11.5px] text-paper-3">
            {current.server} · {current.xinfa}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-2 top-[54px] z-30 animate-panel-down rounded-xl bg-ink-3 p-1.5 shadow-[0_18px_44px_-10px_rgb(0_0_0/0.75)] ring-1 ring-paper/12">
          <p className="px-2 pb-1 pt-1 text-[11px] text-paper-3">
            切换角色 · 面板打开时可以按数字键
          </p>
          <ul role="listbox" aria-label="我的角色">
            {characters.map((c, i) => {
              const m: Mode = state.activeMode[c.id] ?? "PVE";
              const st = statusOf(state, c, m);
              const active = c.id === current.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      actions.selectCharacter(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                      active ? "bg-paper/[0.07]" : "hover:bg-paper/[0.05]"
                    )}
                  >
                    {i < 9 ? (
                      <Kbd keys={[String(i + 1)]} />
                    ) : (
                      <span className="w-[18px]" />
                    )}
                    <XinfaMark xinfa={c.xinfa} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-paper">
                        {c.name}
                      </span>
                      <span className="block truncate text-[11px] text-paper-3">
                        {c.xinfa} · {m}
                      </span>
                    </span>
                    {charPending(state, c) ? (
                      <StatusPill status={isPending(st) ? st : "pending"} />
                    ) : (
                      <StatusPill status={st} />
                    )}
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-paper-2 hover:bg-paper/[0.05] hover:text-paper"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加或管理角色
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
  const role = me(state)?.role;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <XinfaMark xinfa={xinfa} size={44} className="opacity-60" />
      <p className="mt-4 font-serif text-[15px] font-semibold">
        {xinfa}还没有 {mode} 方案
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-paper-3">
        {role === "viewer"
          ? "你是只读成员，可以请管理员或编辑新建。"
          : "新建后，亲友团里所有这个心法的角色都能用。"}
      </p>
      {role !== "viewer" && (
        <Btn
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onCreate}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          去管理窗口新建
        </Btn>
      )}
    </div>
  );
}

function NoCharacters({ onAdd }: { onAdd: () => void }) {
  const { state } = useProto();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-[56px] shrink-0 items-center border-b border-paper/[0.07] px-4">
        <Wordmark size="sm" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-paper-3">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {state.team?.name}
        </span>
      </header>
      <OfflineBar compact />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-4 text-paper-2 ring-1 ring-inset ring-paper/10">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-4 font-serif text-[16px] font-semibold">还没有角色</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-paper-3">
          添加角色并选好心法，这里就会显示它要用的宏和奇穴。
        </p>
        <Btn
          variant="primary"
          size="md"
          className="mt-5"
          onClick={onAdd}
          icon={<Plus className="h-4 w-4" />}
        >
          添加第一个角色
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
      setError(
        "邀请码无效或已过期。检查一下有没有输错，或者找管理员要一个新的。"
      );
      return;
    }
    actions.toast(
      "panel",
      "success",
      `已加入「${SEED_TEAM.name}」。你现在是只读成员，管理员可以改成编辑。`
    );
  };
  const create = () => {
    const n = name.trim();
    if (!n) {
      setNameError("给亲友团起个名字");
      return;
    }
    if (n.length > 12) {
      setNameError("名字最多 12 个字");
      return;
    }
    actions.createTeam(n);
    actions.toast(
      "panel",
      "success",
      `已创建「${n}」。去管理窗口复制邀请码发给亲友。`
    );
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-[56px] shrink-0 items-center border-b border-paper/[0.07] px-4">
        <Wordmark size="sm" />
        <span className="ml-auto text-[12px] text-paper-3">已登录 · 八八</span>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-5 pt-6">
        <h2 className="font-serif text-[19px] font-semibold leading-snug">
          技改一次，
          <br />
          所有角色一起对齐。
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-paper-2">
          和亲友共用一套宏和奇穴。有人更新方案，你的角色会自动标成待同步。
        </p>

        <div className="mt-6">
          <label
            htmlFor="invite"
            className="text-[12.5px] font-medium text-paper"
          >
            用邀请码加入亲友团
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
              placeholder="TD-XXXX-XXXX"
              aria-invalid={!!error}
              aria-describedby="invite-msg"
              className={cn(
                "h-9 min-w-0 flex-1 rounded-md bg-ink px-3 font-mono text-[13px] uppercase tracking-wider text-paper placeholder:normal-case placeholder:tracking-normal placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2",
                error
                  ? "ring-cinnabar/70 focus:ring-cinnabar"
                  : "ring-paper/12 focus:ring-cinnabar-text/60"
              )}
            />
            <Btn variant="primary" size="md" onClick={join}>
              加入
            </Btn>
          </div>
          <p
            id="invite-msg"
            className={cn(
              "mt-1.5 text-[12px] leading-relaxed",
              error ? "text-cinnabar-text" : "text-paper-3"
            )}
          >
            {error || (
              <>
                演示用邀请码：
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
        </div>

        <div className="my-5 flex items-center gap-3 text-[11.5px] text-paper-3">
          <span className="h-px flex-1 bg-paper/10" />
          或者
          <span className="h-px flex-1 bg-paper/10" />
        </div>

        <div>
          <label
            htmlFor="team-name"
            className="text-[12.5px] font-medium text-paper"
          >
            创建新的亲友团
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
              placeholder="比如：夜雨听风"
              maxLength={20}
              aria-invalid={!!nameError}
              className={cn(
                "h-9 min-w-0 flex-1 rounded-md bg-ink px-3 text-[13px] text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2",
                nameError
                  ? "ring-cinnabar/70 focus:ring-cinnabar"
                  : "ring-paper/12 focus:ring-cinnabar-text/60"
              )}
            />
            <Btn variant="secondary" size="md" onClick={create}>
              创建
            </Btn>
          </div>
          <p
            className={cn(
              "mt-1.5 text-[12px]",
              nameError ? "text-cinnabar-text" : "text-paper-3"
            )}
          >
            {nameError || "你会成为管理员，可以邀请亲友和设置权限。"}
          </p>
        </div>
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
      <div className="flex h-[56px] items-center gap-2.5 border-b border-paper/[0.07] px-3.5">
        <span className="skeleton h-[34px] w-[34px]" />
        <span className="flex flex-col gap-1.5">
          <span className="skeleton h-3.5 w-20" />
          <span className="skeleton h-2.5 w-28" />
        </span>
      </div>
      <div className="px-4 pt-3">
        <span className="skeleton block h-6 w-28" />
        <span className="skeleton mt-3 block h-[62px] w-full rounded-lg" />
      </div>
      <div className="space-y-3 px-4 pt-5">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="skeleton h-[34px] w-[34px]" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="skeleton h-3 w-2/5" />
              <span className="skeleton h-2.5 w-1/4" />
            </span>
            <span className="skeleton h-7 w-[68px]" />
          </div>
        ))}
      </div>
      <p className="mt-auto pb-3 text-center text-[11.5px] text-paper-3">
        正在同步方案…
      </p>
    </div>
  );
}
