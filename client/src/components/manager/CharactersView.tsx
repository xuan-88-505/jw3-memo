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
import { Btn, IconBtn, Segmented, StatusPill } from "@/components/common/ui";
import {
  SCHOOL_GROUPS,
  SERVERS,
  layersOf,
  schoolLabel,
  xinfasOf,
} from "@/data/seed";
import type { Character, Mode } from "@/data/types";
import {
  charPending,
  inboxItems,
  isOnline,
  isPending,
  modesOf,
  myCharacters,
  statusOf,
  useProto,
} from "@/state/store";
import { diffVersions } from "@/lib/diff";
import { cn } from "@/lib/utils";
import { ChangeList } from "@/components/panel/PanelContent";
import { AvatarPicker } from "./AvatarPicker";
import {
  EmptyState,
  Field,
  diffSummary,
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
                  { value: "pending", label: `有更新 ${pending}` },
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
                <th className="px-4 py-2.5 font-normal">服务器</th>
                <th className="px-4 py-2.5 font-normal">宏和奇穴</th>
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
                  <td className={cn(TD, "text-paper-2")}>{c.server}</td>
                  <td className={TD}>
                    <SyncCell char={c} online={online} />
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
        className={cn(
          "h-7 w-[176px] rounded-md bg-transparent px-1.5 text-[13px] font-medium text-paper outline-none transition-colors",
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
 * 每行只列出这个心法已有的模式；一个方案都没有时显示「无方案」
 */
function SyncCell({ char, online }: { char: Character; online: boolean }) {
  const { state } = useProto();
  const xs = xinfasOf(char);
  const multi = xs.length > 1;
  return (
    <div className="flex flex-col gap-1.5">
      {xs.map(x => {
        const modes = modesOf(state, x);
        return (
          <div key={x} className="flex items-baseline gap-2">
            {multi && (
              <span
                className={cn(
                  "w-[62px] shrink-0 whitespace-nowrap text-[12px]",
                  modes.length ? "text-paper-2" : "text-paper-3"
                )}
              >
                {x}
              </span>
            )}
            {modes.length === 0 ? (
              <StatusPill status="none" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {modes.map(m => (
                  <ModeCell
                    key={m}
                    char={char}
                    xinfa={x}
                    mode={m}
                    online={online}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 一个心法的一个模式：已是最新 / 有更新。
 * 有更新时显示改了什么（点开看明细）和「改好了」：软件不读游戏，在游戏里改好后由自己确认
 */
function ModeCell({
  char,
  xinfa,
  mode,
  online,
}: {
  char: Character;
  xinfa: string;
  mode: Mode;
  online: boolean;
}) {
  const { state, actions } = useProto();
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
    <div>
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[12px] font-medium text-paper-3">
          {mode}
        </span>
        <StatusPill
          status={st}
          version={st === "synced" ? synced : undefined}
        />
        {last && diff && (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              title={
                base
                  ? `游戏里是 v${base.version}，方案已更新到 v${last.version}`
                  : `这个角色还没用过 v${last.version}`
              }
              className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 text-[12px] text-paper-2 transition-colors hover:bg-paper/[0.05] hover:text-paper"
            >
              {base ? diffSummary(diff) : `首次 · ${diffSummary(diff)}`}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  open && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            <Btn
              variant="secondary"
              size="xs"
              icon={<Check className="h-3.5 w-3.5" />}
              disabled={!online}
              title={online ? "在游戏里改好后点这里" : "离线时不能操作"}
              aria-label={`${xinfa} ${mode} 改好了`}
              onClick={() => {
                const r = actions.markSynced(char.id, mode, xinfa);
                if (r)
                  actions.toast(
                    "manager",
                    "success",
                    `「${r.name}」${xinfa} ${mode} 已是最新`
                  );
              }}
            >
              改好了
            </Btn>
          </>
        )}
      </div>
      {open && diff && (
        <div className="ml-10 mt-1.5 max-w-[440px] rounded-md bg-ink px-2.5 py-2 ring-1 ring-inset ring-paper/8">
          <ChangeList diff={diff} />
        </div>
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
  const [server, setServer] = useState(SERVERS[0]);
  const [school, setSchool] = useState<SchoolValue>(NEW_SCHOOL);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    const n = name.trim();
    const err = nameError(myCharacters(state), n, server);
    if (err) return setError(err);
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
        <Field label="服务器" htmlFor="char-server">
          <SelectBox
            id="char-server"
            value={server}
            onChange={e => setServer(e.target.value)}
            wrapClassName="w-full"
            className={inputCls()}
          >
            {SERVERS.map(s => (
              <option key={s}>{s}</option>
            ))}
          </SelectBox>
        </Field>
        <SchoolFields value={school} onChange={setSchool} idPrefix="char" />
      </div>
    </InlineModal>
  );
}
