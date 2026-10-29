import { useEffect, useRef, useState } from "react";
import {
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
import { SERVERS, XINFA_LIST } from "@/data/seed";
import type { Character, Mode } from "@/data/types";
import {
  charPending,
  findScheme,
  isOnline,
  isPending,
  latest,
  modesOf,
  myCharacters,
  statusOf,
  useProto,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "./AvatarPicker";
import {
  EmptyState,
  Field,
  SectionHeader,
  SelectBox,
  XinfaOptions,
  inputCls,
} from "./shared";

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
                  { value: "pending", label: `待同步 ${pending}` },
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
          title="全部已同步"
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-paper/8">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-ink-3 text-[12px] text-paper-3">
              <tr>
                <th className="px-4 py-2.5 font-normal">角色</th>
                <th className="px-4 py-2.5 font-normal">服务器</th>
                <th className="px-4 py-2.5 font-normal">同步状态</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.06]">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-paper/[0.02]">
                  <td className="px-4 py-2.5">
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
                        <XinfaSelect char={c} disabled={!online} />
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-paper-2">{c.server}</td>
                  <td className="px-4 py-2.5">
                    <SyncCell char={c} online={online} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
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
        description="只删除角色和它的同步记录，方案和配装不受影响。"
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

/** 心法：下拉选择，选完立即生效 */
function XinfaSelect({
  char,
  disabled,
}: {
  char: Character;
  disabled: boolean;
}) {
  const { state, actions } = useProto();
  const change = (x: string) => {
    if (x === char.xinfa) return;
    const { restored } = actions.updateCharacter(char.id, { xinfa: x });
    const hasScheme = modesOf(state, x).length > 0;
    actions.toast(
      "manager",
      "success",
      restored
        ? `「${char.name}」改回${x}，恢复了之前的同步记录`
        : hasScheme
          ? `「${char.name}」改成${x}，需要按新方案同步`
          : `「${char.name}」改成${x}，${x}还没有方案`
    );
  };
  return (
    // 显示的文字决定宽度，上面盖一层透明的原生下拉框：点开仍是系统菜单，键盘和读屏照常可用
    <span
      className={cn(
        "relative -ml-1.5 inline-flex h-6 items-center gap-1 rounded-md pl-1.5 pr-1 text-[12px] text-paper-3 transition-colors",
        "has-[select:focus-visible]:ring-1 has-[select:focus-visible]:ring-inset has-[select:focus-visible]:ring-cinnabar-text/50",
        !disabled && "hover:bg-paper/[0.05] hover:text-paper-2"
      )}
    >
      <span aria-hidden="true">{char.xinfa}</span>
      <ChevronDown className="h-3 w-3" aria-hidden="true" />
      <select
        value={char.xinfa}
        disabled={disabled}
        aria-label={`「${char.name}」的心法`}
        title={disabled ? "离线时不能修改" : "修改心法"}
        onChange={e => change(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none disabled:cursor-default"
      >
        <XinfaOptions />
      </select>
    </span>
  );
}

/** 只列出这个心法已有的模式；一个方案都没有时显示"无方案" */
function SyncCell({ char, online }: { char: Character; online: boolean }) {
  const { state } = useProto();
  const modes = modesOf(state, char.xinfa);
  if (modes.length === 0) return <StatusPill status="none" />;
  return (
    <div className="flex flex-col gap-1.5">
      {modes.map(m => (
        <ModeCell key={m} char={char} mode={m} online={online} />
      ))}
    </div>
  );
}

function ModeCell({
  char,
  mode,
  online,
}: {
  char: Character;
  mode: Mode;
  online: boolean;
}) {
  const { state, actions } = useProto();
  const st = statusOf(state, char, mode);
  const last = latest(findScheme(state, char.xinfa, mode));
  const synced = char.synced[mode];
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[12px] font-medium text-paper-3">
        {mode}
      </span>
      <StatusPill status={st} version={st === "synced" ? synced : undefined} />
      {isPending(st) && last && (
        <>
          <span className="text-[12px] text-paper-3">
            {synced ? `v${synced} → v${last.version}` : `最新 v${last.version}`}
          </span>
          <Btn
            variant="ghost"
            size="xs"
            disabled={!online}
            title={online ? "在游戏里改好后点这里" : "离线时不能标记"}
            onClick={() => {
              const r = actions.markSynced(char.id, mode);
              if (r)
                actions.toast(
                  "manager",
                  "success",
                  `「${r.name}」${mode} 已同步到 v${r.version}`
                );
            }}
          >
            标记
          </Btn>
        </>
      )}
    </div>
  );
}

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
  const [xinfa, setXinfa] = useState(XINFA_LIST[0]);
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
    actions.addCharacter({ name: n, server, xinfa });
    const hasScheme = !!findScheme(state, xinfa, "PVE");
    actions.toast(
      "manager",
      "success",
      hasScheme
        ? `已添加「${n}」。去面板里看它要用的宏和奇穴。`
        : `已添加「${n}」，${xinfa}还没有方案`
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
      <div className="space-y-4 pb-1">
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
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="心法" htmlFor="char-xinfa">
            <SelectBox
              id="char-xinfa"
              value={xinfa}
              onChange={e => setXinfa(e.target.value)}
              wrapClassName="w-full"
              className={inputCls()}
            >
              <XinfaOptions />
            </SelectBox>
          </Field>
        </div>
      </div>
    </InlineModal>
  );
}
