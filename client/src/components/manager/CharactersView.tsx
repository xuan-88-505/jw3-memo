import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { InlineModal } from "@/components/common/overlay";
import { Btn, IconBtn } from "@/components/common/ui";
import { SCHOOL_GROUPS, schoolLabel, xinfasOf } from "@/data/seed";
import type { Character } from "@/data/types";
import {
  currentLoadout,
  isOnline,
  modesOf,
  myCharacters,
  useProto,
} from "@/state/store";
import { isServerName } from "@/data/records";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "./AvatarPicker";
import {
  EmptyState,
  Field,
  SectionHeader,
  SelectBox,
  inputCls,
} from "./shared";
import { SchoolFields, SchoolMenu, type SchoolValue } from "./SchoolPicker";

// 表格不裁切内容：门派菜单要浮出来
const TD = "px-3 py-2.5";

export function CharactersView() {
  const { state, actions } = useProto();
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
  // 装分取自角色的当前配装；一个角色都没关联配装时，整列不显示
  const loadoutOf = new Map(mine.map(c => [c.id, currentLoadout(state, c.id)]));
  const showScore = mine.some(c => loadoutOf.get(c.id));

  return (
    <div>
      <SectionHeader
        title="我的角色"
        right={
          mine.length > 0 && (
            <Btn
              variant="primary"
              size="sm"
              onClick={() => setAdding(true)}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              添加角色
            </Btn>
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
      ) : (
        <div className="-mx-3">
          <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              {showScore ? (
                <>
                  <col className="w-[260px]" />
                  <col />
                </>
              ) : (
                <col />
              )}
              <col className="w-[180px]" />
              <col className="w-[52px]" />
            </colgroup>
            <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
              <tr>
                <th className="px-3 py-2.5 font-normal">角色</th>
                {showScore && (
                  <th className="whitespace-nowrap px-3 py-2.5 font-normal">
                    装分
                  </th>
                )}
                <th className="whitespace-nowrap px-3 py-2.5 font-normal">
                  服务器
                </th>
                <th className="px-3 py-2.5 font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.07]">
              {mine.map(c => {
                const lo = loadoutOf.get(c.id) ?? null;
                return (
                  <tr
                    key={c.id}
                    className="group/row transition-colors hover:bg-paper/[0.025]"
                  >
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setAvatarFor(c.id)}
                          aria-label={`更换「${c.name}」的头像`}
                          title="更换头像"
                          className="group relative shrink-0 rounded-[8px]"
                        >
                          <CharAvatar character={c} size={44} />
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
                    {showScore && (
                      <td className={TD}>
                        {lo && (
                          <button
                            type="button"
                            onClick={() => {
                              actions.selectLoadout(lo.id);
                              actions.setSection("gear");
                            }}
                            title={`${lo.name} · ${lo.xinfa}`}
                            aria-label={`装分 ${lo.panel.score.toLocaleString("en-US")}，打开配装「${lo.name}」`}
                            className="-mx-1.5 rounded-md px-1.5 py-0.5 tabular-nums text-paper transition-colors hover:bg-paper/[0.06]"
                          >
                            {lo.panel.score.toLocaleString("en-US")}
                          </button>
                        )}
                      </td>
                    )}
                    <td className={cn(TD, "whitespace-nowrap text-paper-2")}>
                      {c.server}
                    </td>
                    <td className={cn(TD, "text-right")}>
                      {/* 悬停整行或键盘聚焦时出现 */}
                      <span className="inline-flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                        <IconBtn
                          label={`删除角色 ${c.name}`}
                          onClick={() => setRemoving(c)}
                          disabled={!online}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </span>
                    </td>
                  </tr>
                );
              })}
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
        description="这个角色的便签会一起删掉，方案和配装不受影响。"
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
          "hover:bg-paper/[0.05] focus:bg-paper/[0.04] focus:ring-1 focus:ring-inset focus:ring-cinnabar-text/50",
          "disabled:cursor-default disabled:hover:bg-transparent",
          error &&
            "ring-1 ring-inset ring-cinnabar-text/70 focus:ring-cinnabar-text/70"
        )}
      />
      {error && (
        <span
          id={`name-err-${char.id}`}
          role="alert"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-ink-3 px-2 py-1 text-[12px] text-cinnabar-text shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)] ring-1 ring-paper/12"
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
