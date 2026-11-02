import type { ReactNode } from "react";

/**
 * 面板里原地填写的表单（新建宏、新建奇穴、添加角色）共用的布局。
 * 内容区单独滚动；「取消 / 保存」一栏固定在面板底部，面板调得再矮也看得到。
 * 拦住保存的提示（notice）放在按钮上面，点了保存马上能看到原因。
 * Esc 关闭表单，不让面板跟着收起；下拉菜单、图标选择器开着时它们自己先处理 Esc。
 */
export function PanelForm({
  titleId,
  onCancel,
  notice,
  actions,
  children,
}: {
  titleId: string;
  onCancel: () => void;
  notice?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="form"
      aria-labelledby={titleId}
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex min-h-0 flex-1 animate-fade flex-col"
    >
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {children}
      </div>
      <div className="shrink-0 border-t border-paper/[0.07] px-4 py-3">
        {notice && <div className="mb-3">{notice}</div>}
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
