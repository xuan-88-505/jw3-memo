import { useEffect, useRef } from "react";
import { Btn } from "@/components/common/ui";
import {
  AddCharacterFields,
  useAddCharacterForm,
} from "@/components/manager/AddCharacterForm";
import { tx } from "@/lib/i18n";
import { PanelForm } from "./PanelForm";

/**
 * 面板里原地添加角色，不打开管理窗口。
 * 字段和校验与管理窗口的「添加角色」弹窗相同；添加成功后面板直接切到这个角色。
 * Esc 或「取消」回到空状态；下拉菜单开着时 Esc 只关菜单。「取消 / 添加」固定在面板底部。
 */
export function PanelAddCharacter({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  /** 添加成功后调用（列表里已有角色时，用它关掉表单） */
  onDone?: () => void;
}) {
  const form = useAddCharacterForm("panel");
  const submit = () => {
    if (form.submit()) onDone?.();
  };
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  return (
    <PanelForm
      titleId="panel-add-title"
      onCancel={onCancel}
      actions={
        <>
          <Btn variant="ghost" size="md" onClick={onCancel}>
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
      <h2
        id="panel-add-title"
        className="mb-4 text-[14px] font-medium text-paper"
      >
        {tx("添加角色")}
      </h2>
      <AddCharacterFields
        form={form}
        onSubmit={submit}
        idPrefix="panel-char"
        nameRef={nameRef}
      />
    </PanelForm>
  );
}
