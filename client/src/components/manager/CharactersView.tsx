import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { InlineModal } from "@/components/common/overlay";
import { Btn, IconBtn, Segmented } from "@/components/common/ui";
import { SCHOOL_GROUPS, layersOf, schoolLabel, xinfasOf } from "@/data/seed";
import type { Character, Mode } from "@/data/types";
import {
  canEdit,
  charPending,
  inboxItems,
  isOnline,
  isPending,
  memberName,
  modesOf,
  myCharacters,
  statusOf,
  useProto,
  isSolo,
} from "@/state/store";
import { diffVersions, type SchemeDiff } from "@/lib/diff";
import { relativeTime } from "@/lib/format";
import { isServerName } from "@/data/records";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "./AvatarPicker";
import { GameUpdateDialog } from "./GameUpdateDialog";
import {
  EmptyState,
  Field,
  SectionHeader,
  SelectBox,
  inputCls,
} from "./shared";
import { SchoolFields, SchoolMenu, type SchoolValue } from "./SchoolPicker";

// 表格不裁切内容（门派菜单要浮出来），圆角由表头和最后一行的单元格自己画
const TD = "px-4 py-2.5 group-hover/row:bg-paper/[0.02]";

export function CharactersView() {
  const { state, actions } = useProto();
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Character | null>(null);
  const [avatarFor, setAvatarFor] = useState<string | null>(null);
  const online = isOnline(state);

  useEffect(() => {
    if (state.managerIntent === "add-character") {
      setAdding(true);
      actions.clearIntent();
    }
  }, [state.managerIntent, actions]);

  const mine = myCharacters(state);
  const rows =
    filter === "pending" ? mine.filter(c => charPending(state, c)) : mine;
  const pending = mine.filter(c => charPending(state, c)).length;

  return (
    <div>
      <SectionHeader
        title="我的角色"
        right={
          mine.length > 0 && (
            <>
              <Segmented
                label="筛选"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `全部 ${mine.length}` },
                  { value: "pending", label: `要改 ${pending}` },
                ]}
              />
              <Btn
                variant="primary"
                size="sm"
                onClick={() => setAdding(true)}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                添加角色
              </Btn>
            </>
          )
        }
      />

      {mine.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-5 w-5" />}
          title="还没有角色"
          action={
            <Btn
              variant="primary"
              size="md"
              onClick={() => setAdding(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              添加第一个角色
            </Btn>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-jade" />}
          title="全部已是最新"
        />
      ) : (
        <div className="rounded-xl ring-1 ring-inset ring-paper/8">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-paper-3">
              <tr className="[&>th]:bg-ink-3">
                <th className="rounded-tl-xl px-4 py-2.5 font-normal">角色</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-normal">
                  服务器
                </th>
                <th className="px-4 py-2.5 font-normal">游戏里的宏和奇穴</th>
                <th className="rounded-tr-xl px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.06] [&>tr:last-child>td:first-child]:rounded-bl-xl [&>tr:last-child>td:last-child]:rounded-br-xl">
              {rows.map(c => (
                <tr key={c.id} className="group/row">
                  <td className={TD}>
                    <span className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setAvatarFor(c.id)}
                        aria-label={`更换「${c.name}」的头像`}
                        title="更换头像"
                        className="group relative shrink-0 rounded-[8px]"
                      >
                        <CharAvatar character={c} size={34} />
                        <span
                          className="absolute inset-0 grid place-items-center rounded-[8px] bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          aria-hidden="true"
                        >
                          <Pencil className="h-3.5 w-3.5 text-white" />
                        </span>
                      </button>
                      <span className="flex min-w-0 flex-col items-start">
                        <NameInput char={c} disabled={!online} />
                        <SchoolCell char={c} disabled={!online} />
                      </span>
                    </span>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-paper-2")}>
                    {c.server}
                  </td>
                  <td className={TD}>
                    <SyncCell char={c} />
                  </td>
                  <td className={cn(TD, "text-right")}>
                    <IconBtn
                      label={`删除角色 ${c.name}`}
                      onClick={() => setRemoving(c)}
                      disabled={!online}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCharacterDialog open={adding} onClose={() => setAdding(false)} />

      <AvatarPicker
        character={mine.find(c => c.id === avatarFor) ?? null}
        onClose={() => setAvatarFor(null)}
      />

      <InlineModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`删除「${removing?.name}」？`}
        description="方案和配装不受影响。"
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRemoving(null)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => {
                if (removing) {
                  actions.removeCharacter(removing.id);
                  actions.toast(
                    "manager",
                    "success",
                    `已删除「${removing.name}」`
                  );
                }
                setRemoving(null);
              }}
            >
              删除
            </Btn>
          </>
        }
      />
    </div>
  );
}

/** 角色名校验：添加和改名共用 */
/** 自己角色里出现最多的服务器；一个角色都没有时为空 */
function usualServer(mine: Character[]) {
  const count = new Map<string, number>();
  for (const c of mine) count.set(c.server, (count.get(c.server) ?? 0) + 1);
  let best = "";
  for (const [s, n] of count) if (n > (count.get(best) ?? 0)) best = s;
  return best;
}
export function nameError(
  mine: Character[],
  name: string,
  server: string,
  exceptId?: string
) {
  if (!name) return "填一下角色名";
  if (name.length > 12) return "角色名最多 12 个字";
  if (
    mine.some(c => c.id !== exceptId && c.name === name && c.server === server)
  )
    return `${server} 已经有叫「${name}」的角色了`;
  return "";
}

/** 角色名：看起来是文字，点击直接编辑。回车保存，Esc 取消，点别处也会保存 */
function NameInput({ char, disabled }: { char: Character; disabled: boolean }) {
  const { state, actions } = useProto();
  const [value, setValue] = useState(char.name);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => setValue(char.name), [char.name]);

  const check = () =>
    nameError(myCharacters(state), value.trim(), char.server, char.id);

  const onBlur = () => {
    const n = value.trim();
    if (cancelRef.current || n === char.name) {
      cancelRef.current = false;
      setValue(char.name);
      setError("");
      return;
    }
    const err = check();
    setError("");
    if (err) {
      setValue(char.name);
      actions.toast(
        "manager",
        "error",
        `${n ? err : "角色名不能为空"}，已恢复原名`
      );
      return;
    }
    actions.updateCharacter(char.id, { name: n });
    actions.toast("manager", "success", `已改名为「${n}」`);
  };

  return (
    <span className="relative -ml-1.5">
      <input
        value={value}
        disabled={disabled}
        maxLength={20}
        spellCheck={false}
        aria-label="角色名"
        aria-invalid={!!error}
        aria-describedby={error ? `name-err-${char.id}` : undefined}
        title={disabled ? "离线时不能修改" : "点击修改角色名"}
        onChange={e => {
          setValue(e.target.value);
          setError("");
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            const err = check();
            if (err) setError(err);
            else e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            cancelRef.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={onBlur}
        style={{
          width: `min(176px, calc(${Math.max(value.length, 2)}em + 14px))`,
        }}
        className={cn(
          "h-7 rounded-md bg-transparent px-1.5 text-[13px] font-medium text-paper outline-none transition-colors",
          "hover:bg-paper/[0.05] focus:bg-ink-1 focus:ring-1 focus:ring-inset focus:ring-cinnabar-text/50",
          "disabled:cursor-default disabled:hover:bg-transparent",
          error &&
            "ring-1 ring-inset ring-cinnabar-text/70 focus:ring-cinnabar-text/70"
        )}
      />
      {error && (
        <span
          id={`name-err-${char.id}`}
          role="alert"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-ink-4 px-2 py-1 text-[12px] text-cinnabar-text shadow-lg ring-1 ring-inset ring-paper/10"
        >
          {error}
        </span>
      )}
    </span>
  );
}

/** 门派和心法：级联菜单，选完立即生效 */
function SchoolCell({
  char,
  disabled,
}: {
  char: Character;
  disabled: boolean;
}) {
  const { state, actions } = useProto();
  const value: SchoolValue = {
    school: char.school,
    only: char.only,
    liupai: char.liupai,
  };
  const change = (v: SchoolValue) => {
    if (
      v.school === char.school &&
      v.only === char.only &&
      v.liupai.join() === char.liupai.join()
    )
      return;
    const before = xinfasOf(char);
    const added = xinfasOf(v).filter(x => !before.includes(x));
    const noScheme = added.filter(x => modesOf(state, x).length === 0);
    const { restored } = actions.updateCharacter(char.id, v);
    const head = `「${char.name}」改为${schoolLabel(v)}`;
    actions.toast(
      "manager",
      "success",
      restored
        ? `${head}，之前改好的记录已恢复`
        : added.length === 0
          ? head
          : noScheme.length === added.length
            ? `${head}，${noScheme.join("、")}还没有方案`
            : `${head}，有新的宏和奇穴要改`
    );
  };
  return (
    <SchoolMenu
      value={value}
      onChange={change}
      disabled={disabled}
      label={`「${char.name}」`}
    />
  );
}

/**
 * 每个心法一行，只玩一个心法时不写心法名。
 * 每行只列出这个心法已有的模式；方案库里还没有时给「新建」入口
 */
function SyncCell({ char }: { char: Character }) {
  const { state, actions } = useProto();
  const xs = xinfasOf(char);
  const multi = xs.length > 1;
  const editable = canEdit(state);
  return (
    <div className="flex flex-col gap-2.5">
      {xs.map(x => {
        const modes = modesOf(state, x);
        return (
          <div key={x} className="flex items-start gap-2">
            {multi && (
              <span
                className={cn(
                  "w-[62px] shrink-0 whitespace-nowrap text-[12px] leading-5",
                  modes.length ? "text-paper-2" : "text-paper-3"
                )}
              >
                {x}
              </span>
            )}
            {modes.length === 0 ? (
              <span className="flex items-center gap-1.5 text-[12px] leading-5 text-paper-3">
                还没有方案
                {editable && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        actions.openManager("schemes", undefined, {
                          newScheme: { xinfa: x, mode: "PVE" },
                        })
                      }
                      aria-label={`新建${x}方案`}
                      className="rounded text-paper-2 underline-offset-2 transition-colors hover:text-paper hover:underline"
                    >
                      新建
                    </button>
                  </>
                )}
              </span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {modes.map(m => (
                  <ModeCell key={m} char={char} xinfa={x} mode={m} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 「奇穴 1 处、宏 1 个」 */
function todoText(diff: SchemeDiff) {
  const parts: string[] = [];
  if (diff.talents.length) parts.push(`奇穴 ${diff.talents.length} 处`);
  if (diff.macros.length) parts.push(`宏 ${diff.macros.length} 个`);
  return parts.join("、");
}

/**
 * 一个心法的一个模式。
 * 方案更新了：写清游戏里要改什么、谁什么时候改的方案，「去改」打开明细和「我改好了」。
 * 软件不读游戏，所以要自己确认。
 */
function ModeCell({
  char,
  xinfa,
  mode,
}: {
  char: Character;
  xinfa: string;
  mode: Mode;
}) {
  const { state } = useProto();
  const [open, setOpen] = useState(false);
  const st = statusOf(state, char, mode, xinfa);
  const item = isPending(st)
    ? inboxItems(state).find(i => i.key === `${char.id}-${xinfa}-${mode}`)
    : undefined;
  const base = item?.base;
  const last = item?.last;
  const diff = useMemo(
    () => (last ? diffVersions(base, last, layersOf(xinfa)) : null),
    [base, last, xinfa]
  );
  const synced = char.synced[xinfa]?.[mode];
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 shrink-0 text-[12px] font-medium leading-5 text-paper-3">
        {mode}
      </span>
      {last && diff ? (
        <>
          <span className="min-w-0 flex-1">
            {/* 窄窗口时按短语换行，不把「奇穴 1 处」拆开 */}
            <span className="flex items-start gap-1.5 text-[12.5px] font-medium leading-5 text-paper">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-[1.5px] bg-cinnabar"
                aria-hidden="true"
              />
              <span className="flex flex-wrap">
                <span className="whitespace-nowrap">
                  {base ? "游戏里要改：" : "游戏里要设置："}
                </span>
                <span className="whitespace-nowrap">{todoText(diff)}</span>
              </span>
            </span>
            <span className="flex flex-wrap gap-x-2 pl-3 text-[11.5px] leading-[18px] text-paper-3">
              <span className="whitespace-nowrap">
                {base
                  ? `v${base.version} → v${last.version}`
                  : `第一次用 v${last.version}`}
              </span>
              <span className="whitespace-nowrap">
                {!isSolo(state) && `${memberName(state, last.authorId)} `}
                {relativeTime(last.at)}更新
              </span>
            </span>
          </span>
          <Btn
            variant="secondary"
            size="xs"
            className="shrink-0 self-center"
            aria-label={`${xinfa} ${mode}：看游戏里要改什么`}
            onClick={() => setOpen(true)}
          >
            去改
          </Btn>
          <GameUpdateDialog
            char={open ? char : null}
            xinfa={xinfa}
            mode={mode}
            onClose={() => setOpen(false)}
          />
        </>
      ) : (
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] leading-5 text-jade"
          title="游戏里和方案一致"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
          已是最新
          {synced !== undefined && (
            <span className="ml-0.5 text-paper-3">v{synced}</span>
          )}
        </span>
      )}
    </div>
  );
}

const NEW_SCHOOL: SchoolValue = {
  school: SCHOOL_GROUPS[0].school,
  only: null,
  liupai: [],
};

function AddCharacterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const [name, setName] = useState("");
  // 默认填自己角色最常用的服务器，多数号都在同一个服
  const [server, setServer] = useState(() => usualServer(myCharacters(state)));
  const [school, setSchool] = useState<SchoolValue>(NEW_SCHOOL);
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setServerError("");
    }
  }, [open]);
  const submit = () => {
    const n = name.trim();
    const sErr = !server
      ? "填一下服务器"
      : !isServerName(server)
        ? "服务器名是 2–8 个汉字"
        : "";
    setServerError(sErr);
    const err = nameError(myCharacters(state), n, server);
    setError(err);
    if (err || sErr) return;
    actions.addCharacter({ name: n, server, ...school });
    const hasScheme = xinfasOf(school).some(x => modesOf(state, x).length > 0);
    actions.toast(
      "manager",
      "success",
      hasScheme
        ? `已添加「${n}」。去面板里看它要用的宏和奇穴。`
        : `已添加「${n}」，${schoolLabel(school)}还没有方案`
    );
    onClose();
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="添加角色"
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={submit}
            disabled={!isOnline(state)}
          >
            添加
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 pb-1">
        <Field label="角色名" htmlFor="char-name" error={error}>
          <input
            id="char-name"
            data-autofocus
            value={name}
            maxLength={20}
            onChange={e => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="游戏里的角色名"
            aria-invalid={!!error}
            className={inputCls(!!error)}
          />
        </Field>
        <Field label="服务器" htmlFor="char-server" error={serverError}>
          <input
            id="char-server"
            value={server}
            maxLength={8}
            onChange={e => {
              setServer(e.target.value.replace(/\s/g, ""));
              setServerError("");
            }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="如 梦江南"
            aria-invalid={!!serverError}
            className={inputCls(!!serverError)}
          />
        </Field>
        <SchoolFields value={school} onChange={setSchool} idPrefix="char" />
      </div>
    </InlineModal>
  );
}
