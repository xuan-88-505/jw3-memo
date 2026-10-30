import { useEffect, useRef } from "react";
import { Btn } from "@/components/common/ui";
import {
  AddCharacterFields,
  useAddCharacterForm,
} from "@/components/manager/AddCharacterForm";

/**
 * 面板里原地添加角色，不打开管理窗口。
 * 字段和校验与管理窗口的「添加角色」弹窗相同；添加成功后面板直接切到这个角色。
 * Esc 或「取消」回到空状态；下拉菜单开着时 Esc 只关菜单。
 */
export function PanelAddCharacter({ onCancel }: { onCancel: () => void }) {
  const form = useAddCharacterForm("panel");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  return (
    <div
      role="form"
      aria-labelledby="panel-add-title"
      onKeyDown={e => {
        if (e.key === "Escape") {
          // 不让面板跟着收起
          e.stopPropagation();
          onCancel();
        }
      }}
      className="scroll-thin flex min-h-0 flex-1 animate-fade flex-col overflow-y-auto px-4 pb-4 pt-4"
    >
      <h2
        id="panel-add-title"
        className="mb-4 text-[14px] font-medium text-paper"
      >
        添加角色
      </h2>
      <AddCharacterFields
        form={form}
        onSubmit={form.submit}
        idPrefix="panel-char"
        nameRef={nameRef}
      />
      <div className="mt-6 flex justify-end gap-2">
        <Btn variant="ghost" size="md" onClick={onCancel}>
          取消
        </Btn>
        <Btn
          variant="primary"
          size="md"
          onClick={() => form.submit()}
          disabled={!form.canSubmit}
        >
          添加
        </Btn>
      </div>
    </div>
  );
}
