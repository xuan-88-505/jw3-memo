import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { NavIcon, type NavIconName } from "@/components/brand/NavIcon";
import { Anchored } from "@/components/common/Anchored";
import { InlineModal } from "@/components/common/overlay";
import { Btn, IconBtn } from "@/components/common/ui";
import { isServerName } from "@/data/records";
import { schoolLabel, xinfasOf } from "@/data/seed";
import type { Character } from "@/data/types";
import {
  canEdit,
  currentLoadout,
  isOnline,
  modesOf,
  myCharacters,
  useProto,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "./AvatarPicker";
import { NewLoadoutDialog } from "./gear/NewLoadoutDialog";
import { NewMacroDialog } from "./NewMacroDialog";
import { EmptyState, SectionHeader } from "./shared";
import { SchoolMenu, type SchoolValue } from "./SchoolPicker";
import {
  AddCharacterFields,
  nameError,
  useAddCharacterForm,
} from "./AddCharacterForm";
import { tx } from "@/lib/i18n";

// 表格不裁切内容：门派菜单要浮出来
const TD = "px-3 py-2.5";

export function CharactersView() {
  const { state, actions } = useProto();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Character | null>(null);
  const [avatarFor, setAvatarFor] = useState<string | null>(null);
  // 按某个角色新建配装、新建宏：原地弹窗，不离开这一页
  const [loadoutFor, setLoadoutFor] = useState<Character | null>(null);
  const [macroFor, setMacroFor] = useState<Character | null>(null);
  const online = isOnline(state);
  // 只读成员不能改方案，菜单里不出「新建宏」
  const editable = canEdit(state);

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
    <div className="flex flex-1 flex-col">
      <SectionHeader
        title={tx("我的角色")}
        right={
          mine.length > 0 && (
            <Btn
              variant="primary"
              size="sm"
              onClick={() => setAdding(true)}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              {tx("添加角色")}
            </Btn>
          )
        }
      />

      {mine.length === 0 ? (
        <EmptyState
          icon="hero"
          title={tx("还没有角色")}
          action={
            <Btn
              variant="primary"
              size="md"
              onClick={() => setAdding(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              {tx("添加第一个角色")}
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
              <col className="w-[88px]" />
            </colgroup>
            <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
              <tr>
                <th className="px-3 py-2.5 font-normal">{tx("角色")}</th>
                {showScore && (
                  <th className="whitespace-nowrap px-3 py-2.5 font-normal">
                    {tx("装分")}
                  </th>
                )}
                <th className="whitespace-nowrap px-3 py-2.5 font-normal">
                  {tx("服务器")}
                </th>
                <th className="px-3 py-2.5 font-normal">
                  <span className="sr-only">{tx("操作")}</span>
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
                          aria-label={tx("更换「{0}」的头像", c.name)}
                          title={tx("更换头像")}
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
                            aria-label={tx(
                              "装分 {0}，打开配装「{1}」",
                              lo.panel.score.toLocaleString("en-US"),
                              lo.name
                            )}
                            className="-mx-1.5 rounded-md px-1.5 py-0.5 tabular-nums text-paper transition-colors hover:bg-paper/[0.06]"
                          >
                            {lo.panel.score.toLocaleString("en-US")}
                          </button>
                        )}
                      </td>
                    )}
                    <td className={TD}>
                      <ServerInput char={c} disabled={!online} />
                    </td>
                    <td className={cn(TD, "text-right")}>
                      <RowActions
                        char={c}
                        disabled={!online}
                        canMacro={editable}
                        onLoadout={() => setLoadoutFor(c)}
                        onMacro={() => setMacroFor(c)}
                        onRemove={() => setRemoving(c)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddCharacterDialog open={adding} onClose={() => setAdding(false)} />

      {/* 填好后到配装页去建：导入的要算一会儿，手动配的建好直接打开配装器 */}
      <NewLoadoutDialog
        open={!!loadoutFor}
        defaultXinfa={loadoutFor ? xinfasOf(loadoutFor)[0] : undefined}
        defaultCharId={loadoutFor?.id}
        onClose={() => setLoadoutFor(null)}
        onStart={p => actions.goTo("gear", { newLoadout: p })}
      />

      <NewMacroDialog
        xinfas={macroFor ? xinfasOf(macroFor) : []}
        onClose={() => setMacroFor(null)}
      />

      <AvatarPicker
        character={mine.find(c => c.id === avatarFor) ?? null}
        onClose={() => setAvatarFor(null)}
      />

      <InlineModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={tx("删除「{0}」？", removing?.name)}
        description={tx("这个角色的便签会一起删掉，方案和配装不受影响。")}
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRemoving(null)}>
              {tx("取消")}
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
                    tx("已删除「{0}」", removing.name)
                  );
                }
                setRemoving(null);
              }}
            >
              {tx("删除")}
            </Btn>
          </>
        }
      />
    </div>
  );
}

/**
 * 看起来是文字，点击直接编辑。回车保存，Esc 取消，点别处也会保存。
 * 回车时不合规就在下面提示；点别处时不合规就恢复原来的值，并用 onReject 提示。
 */
function InlineEdit({
  value: saved,
  disabled,
  maxLength,
  maxWidth,
  label,
  title,
  errorId,
  normalize = v => v,
  validate,
  onCommit,
  onReject,
  className,
}: {
  value: string;
  disabled: boolean;
  maxLength: number;
  /** 输入框最宽多少像素；随内容变宽 */
  maxWidth: number;
  label: string;
  title: string;
  errorId: string;
  /** 输入时整理，比如去掉空格 */
  normalize?: (v: string) => string;
  /** 返回错误说明；合规返回空字符串 */
  validate: (v: string) => string;
  onCommit: (v: string) => void;
  onReject: (error: string, v: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(saved);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => setValue(saved), [saved]);

  const onBlur = () => {
    const n = value.trim();
    if (cancelRef.current || n === saved) {
      cancelRef.current = false;
      setValue(saved);
      setError("");
      return;
    }
    const err = validate(n);
    setError("");
    if (err) {
      setValue(saved);
      onReject(err, n);
      return;
    }
    onCommit(n);
  };

  return (
    <span className="relative -ml-1.5">
      <input
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        spellCheck={false}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        title={title}
        onChange={e => {
          setValue(normalize(e.target.value));
          setError("");
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            const err = validate(value.trim());
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
          width: `min(${maxWidth}px, calc(${Math.max(value.length, 2)}em + 14px))`,
        }}
        className={cn(
          "h-7 rounded-md bg-transparent px-1.5 text-[13px] outline-none transition-colors",
          "hover:bg-paper/[0.05] focus:bg-paper/[0.04] focus:ring-1 focus:ring-inset focus:ring-cinnabar-text/50",
          "disabled:cursor-default disabled:hover:bg-transparent",
          error &&
            "ring-1 ring-inset ring-cinnabar-text/70 focus:ring-cinnabar-text/70",
          className
        )}
      />
      {error && (
        <span
          id={errorId}
          role="alert"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-ink-3 px-2 py-1 text-[12px] text-cinnabar-text shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)] ring-1 ring-paper/12"
        >
          {error}
        </span>
      )}
    </span>
  );
}

/** 角色名：点击直接改。同一服务器里不能重名 */
function NameInput({ char, disabled }: { char: Character; disabled: boolean }) {
  const { state, actions } = useProto();
  return (
    <InlineEdit
      value={char.name}
      disabled={disabled}
      maxLength={20}
      maxWidth={176}
      label={tx("角色名")}
      title={disabled ? tx("离线时不能修改") : tx("点击修改角色名")}
      errorId={`name-err-${char.id}`}
      validate={n => nameError(myCharacters(state), n, char.server, char.id)}
      onReject={(err, n) =>
        actions.toast(
          "manager",
          "error",
          tx("{0}，已恢复原名", n ? err : tx("角色名不能为空"))
        )
      }
      onCommit={n => {
        actions.updateCharacter(char.id, { name: n });
        actions.toast("manager", "success", tx("已改名为「{0}」", n));
      }}
      className="font-medium text-paper"
    />
  );
}

/** 服务器：点击直接改，规则和添加角色时一样；改完不能和自己别的角色重名重服 */
function ServerInput({
  char,
  disabled,
}: {
  char: Character;
  disabled: boolean;
}) {
  const { state, actions } = useProto();
  const validate = (v: string) =>
    !v
      ? tx("填一下服务器")
      : !isServerName(v)
        ? tx("服务器名是 2–8 个汉字")
        : nameError(myCharacters(state), char.name, v, char.id);
  return (
    <InlineEdit
      value={char.server}
      disabled={disabled}
      maxLength={8}
      maxWidth={150}
      label={tx("服务器")}
      title={disabled ? tx("离线时不能修改") : tx("点击修改服务器")}
      errorId={`server-err-${char.id}`}
      normalize={v => v.replace(/\s/g, "")}
      validate={validate}
      onReject={err =>
        actions.toast("manager", "error", tx("{0}，已恢复原来的服务器", err))
      }
      onCommit={v => {
        actions.updateCharacter(char.id, { server: v });
        actions.toast(
          "manager",
          "success",
          tx("「{0}」的服务器改为{1}", char.name, v)
        );
      }}
      className="text-paper-2"
    />
  );
}

/**
 * 行尾的操作：新建（配装、宏）和删除。悬停整行或键盘聚焦时出现，菜单开着时一直显示。
 * 只读成员只能新建配装，这时「+」直接打开新建配装。
 */
function RowActions({
  char,
  disabled,
  canMacro,
  onLoadout,
  onMacro,
  onRemove,
}: {
  char: Character;
  disabled: boolean;
  canMacro: boolean;
  onLoadout: () => void;
  onMacro: () => void;
  onRemove: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const menuLabel = tx("为「{0}」新建", char.name);
  const item = (icon: NavIconName, label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
      className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-paper-2 hover:bg-paper/[0.06] hover:text-paper focus-visible:bg-paper/[0.06] focus-visible:outline-none"
    >
      <NavIcon name={icon} className="shrink-0" />
      {label}
    </button>
  );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100",
        open && "opacity-100"
      )}
    >
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup={canMacro ? "menu" : undefined}
        aria-expanded={canMacro ? open : undefined}
        aria-label={canMacro ? menuLabel : tx("新建配装")}
        title={canMacro ? tx("新建配装或宏") : tx("新建配装")}
        onClick={() => (canMacro ? setOpen(v => !v) : onLoadout())}
        className={cn(
          "inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-paper-2 transition-colors hover:bg-paper/[0.08] hover:text-paper disabled:opacity-40",
          open && "bg-paper/[0.08] text-paper"
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
      <IconBtn
        label={tx("删除角色 {0}", char.name)}
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 className="h-4 w-4" />
      </IconBtn>
      {canMacro && (
        <Anchored
          anchor={btn}
          open={open}
          onClose={() => setOpen(false)}
          width={224}
          align="end"
          label={menuLabel}
        >
          <div role="menu" aria-label={menuLabel} className="p-1">
            {item("gear", tx("新建配装"), onLoadout)}
            {item("schemes", tx("新建宏"), onMacro)}
          </div>
        </Anchored>
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
    const head = tx("「{0}」改为{1}", char.name, schoolLabel(v));
    actions.toast(
      "manager",
      "success",
      restored
        ? tx("{0}，之前改好的记录已恢复", head)
        : added.length === 0
          ? head
          : noScheme.length === added.length
            ? tx("{0}，{1}还没有方案", head, noScheme.join("、"))
            : tx("{0}，有新的宏和奇穴要改", head)
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

function AddCharacterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const form = useAddCharacterForm("manager");
  const { reset } = form;
  useEffect(() => {
    if (open) reset();
    // 只在打开时清空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = () => {
    if (form.submit()) onClose();
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={tx("添加角色")}
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={submit}
            disabled={!form.canSubmit}
          >
            {tx("添加")}
          </Btn>
        </>
      }
    >
      <div className="pb-1">
        <AddCharacterFields form={form} onSubmit={submit} idPrefix="char" />
      </div>
    </InlineModal>
  );
}
