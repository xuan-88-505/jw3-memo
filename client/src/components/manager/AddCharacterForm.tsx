import { useState, type RefObject } from "react";
import { SCHOOL_GROUPS, schoolLabel, xinfasOf } from "@/data/seed";
import type { Character } from "@/data/types";
import { isServerName } from "@/data/records";
import { isOnline, modesOf, myCharacters, useProto } from "@/state/store";
import { Field, inputCls } from "./shared";
import { SchoolFields, type SchoolValue } from "./SchoolPicker";

/** 自己角色里出现最多的服务器；一个角色都没有时为空 */
function usualServer(mine: Character[]) {
  const count = new Map<string, number>();
  for (const c of mine) count.set(c.server, (count.get(c.server) ?? 0) + 1);
  let best = "";
  for (const [s, n] of count) if (n > (count.get(best) ?? 0)) best = s;
  return best;
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

const NEW_SCHOOL: SchoolValue = {
  school: SCHOOL_GROUPS[0].school,
  only: null,
  liupai: [],
};

/**
 * 添加角色的表单状态和提交。管理窗口的弹窗和面板里的原地表单共用。
 * surface 决定成功提示出现在哪个窗口。
 */
export function useAddCharacterForm(surface: "manager" | "panel") {
  const { state, actions } = useProto();
  const [name, setName] = useState("");
  // 默认填自己角色最常用的服务器，多数号都在同一个服
  const [server, setServer] = useState(() => usualServer(myCharacters(state)));
  const [school, setSchool] = useState<SchoolValue>(NEW_SCHOOL);
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");

  /** 清空角色名和错误；服务器和门派保留，连着加同服的号不用重选 */
  const reset = () => {
    setName("");
    setError("");
    setServerError("");
  };

  /** 校验通过就添加并提示，返回是否添加成功 */
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
    if (err || sErr) return false;
    const hasScheme = xinfasOf(school).some(x => modesOf(state, x).length > 0);
    actions.addCharacter({ name: n, server, ...school });
    actions.toast(
      surface,
      "success",
      !hasScheme
        ? `已添加「${n}」，${schoolLabel(school)}还没有方案`
        : surface === "panel"
          ? `已添加「${n}」`
          : `已添加「${n}」。去面板里看它要用的宏和奇穴。`
    );
    return true;
  };

  return {
    name,
    setName,
    server,
    setServer,
    school,
    setSchool,
    error,
    setError,
    serverError,
    setServerError,
    reset,
    submit,
    /** 离线时不能添加 */
    canSubmit: isOnline(state),
  };
}

export type AddCharacterForm = ReturnType<typeof useAddCharacterForm>;

/** 角色名、服务器、门派、心法、流派。两列排；在输入框里按回车调 onSubmit */
export function AddCharacterFields({
  form,
  onSubmit,
  idPrefix,
  nameRef,
}: {
  form: AddCharacterForm;
  onSubmit: () => void;
  /** 同一页面里可能同时有两份表单（模拟桌面），id 要分开 */
  idPrefix: string;
  nameRef?: RefObject<HTMLInputElement | null>;
}) {
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSubmit();
  };
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      <Field label="角色名" htmlFor={`${idPrefix}-name`} error={form.error}>
        <input
          ref={nameRef}
          id={`${idPrefix}-name`}
          data-autofocus
          value={form.name}
          maxLength={20}
          onChange={e => {
            form.setName(e.target.value);
            form.setError("");
          }}
          onKeyDown={onEnter}
          placeholder="游戏里的角色名"
          aria-invalid={!!form.error}
          className={inputCls(!!form.error)}
        />
      </Field>
      <Field
        label="服务器"
        htmlFor={`${idPrefix}-server`}
        error={form.serverError}
      >
        <input
          id={`${idPrefix}-server`}
          value={form.server}
          maxLength={8}
          onChange={e => {
            form.setServer(e.target.value.replace(/\s/g, ""));
            form.setServerError("");
          }}
          onKeyDown={onEnter}
          placeholder="如 梦江南"
          aria-invalid={!!form.serverError}
          className={inputCls(!!form.serverError)}
        />
      </Field>
      <SchoolFields
        value={form.school}
        onChange={form.setSchool}
        idPrefix={idPrefix}
      />
    </div>
  );
}
