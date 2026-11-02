import { useEffect, useRef, useState } from "react";
import { Btn, Segmented } from "@/components/common/ui";
import { IconPickerButton } from "@/components/common/IconPicker";
import { TalentPicker } from "@/components/manager/TalentPicker";
import { inputCls } from "@/components/manager/shared";
import { defaultTalents } from "@/data/seed";
import type { Scheme } from "@/data/types";
import { MACRO_LIMIT, cleanMacro } from "@/lib/macro";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProto } from "@/state/store";

/**
 * 面板里原地新建，不打开管理窗口。
 * 宏页签：填一个宏（图标、名称、说明、内容）。给了 target（宏列表最后的「新建宏」）时
 * 作为一段加到这个方案的最新版本后面，存成新版本；否则给心法新建一个 PVE 方案，存成 v1。
 * 奇穴页签：给还没有方案的心法选奇穴，新建一个 PVE 方案，存成 v1。
 * 保存后面板回到列表。Esc 或「取消」回到原来的样子。
 */
export function PanelNewScheme({
  kind,
  xinfas,
  target,
  context,
  onDone,
  onCancel,
  onOpenManager,
}: {
  kind: "macro" | "talent";
  /** 要存到哪些心法；多于一个时可以切换 */
  xinfas: string[];
  /** 加到哪个方案；没有时新建 */
  target?: Scheme;
  /** 标题旁边弱显示存到哪里：心法有好几个方案、或角色玩好几个心法时用 */
  context?: string;
  /** 带上新宏的 id（列表可以滚到它）和存到的方案 */
  onDone: (macroId?: string, schemeId?: string, xinfa?: string) => void;
  onCancel: () => void;
  /** 管理窗口里有这个方案没保存的草稿时，去那里处理 */
  onOpenManager: (schemeId: string) => void;
}) {
  const { actions } = useProto();
  const [xinfa, setXinfa] = useState(xinfas[0]);
  const [icon, setIcon] = useState(13);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [content, setContent] = useState("/cast ");
  const [talents, setTalents] = useState(defaultTalents);
  const [blocked, setBlocked] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind === "macro") nameRef.current?.focus();
    else first.current?.querySelector<HTMLElement>("[role=tab]")?.focus();
  }, [kind]);

  const cleaned = cleanMacro(content);
  const over = cleaned.length > MACRO_LIMIT;
  const empty = cleaned.length === 0;
  const canSave = kind === "talent" || (!!name.trim() && !empty && !over);
  const save = () => {
    if (!canSave) return;
    if (kind === "macro") {
      const macroId = `${xinfa}-n${Date.now()}`;
      const r = actions.addMacro(
        target?.xinfa === xinfa ? target.id : null,
        xinfa,
        target?.mode ?? "PVE",
        {
          id: macroId,
          name: name.trim(),
          icon,
          content: content.trim(),
          note: note.trim(),
        }
      );
      if (r.result === "draft") {
        setBlocked(true);
        return;
      }
      actions.toast("panel", "success", tx("已保存宏"));
      onDone(macroId, r.schemeId, xinfa);
      return;
    }
    const schemeId = actions.createScheme(xinfa, "PVE", { talents });
    actions.toast("panel", "success", tx("已保存奇穴"));
    onDone(undefined, schemeId, xinfa);
  };

  return (
    <div
      role="form"
      aria-labelledby="panel-new-title"
      onKeyDown={e => {
        if (e.key === "Escape") {
          // 不让面板跟着收起；图标选择器开着时它自己先处理 Esc
          e.stopPropagation();
          onCancel();
        }
      }}
      className="scroll-thin flex min-h-0 flex-1 animate-fade flex-col overflow-y-auto px-4 pb-4 pt-4"
    >
      <h2
        id="panel-new-title"
        className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px] font-medium text-paper"
      >
        {kind === "macro" ? tx("新建宏") : tx("新建奇穴")}
        {context && (
          <span className="min-w-0 text-[12px] font-normal text-paper-3 [overflow-wrap:anywhere]">
            {context}
          </span>
        )}
      </h2>

      {xinfas.length > 1 && (
        <div className="mb-4">
          <Segmented<string>
            label={tx("心法")}
            size="xs"
            value={xinfa}
            onChange={x => {
              setXinfa(x);
              setBlocked(false);
            }}
            options={xinfas.map(x => ({ value: x, label: x }))}
          />
        </div>
      )}

      {kind === "macro" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <IconPickerButton
              xinfa={xinfa}
              value={icon}
              name={name || tx("宏")}
              onChange={setIcon}
              size={40}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <input
                ref={nameRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") save();
                }}
                aria-label={tx("宏名称")}
                placeholder={tx("宏名称")}
                maxLength={24}
                className={cn(inputCls(false), "w-full")}
              />
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                aria-label={tx("说明")}
                placeholder={tx("说明（选填）")}
                maxLength={40}
                className={cn(inputCls(false), "w-full")}
              />
            </div>
          </div>
          <div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              aria-label={tx("宏内容")}
              aria-invalid={over}
              spellCheck={false}
              rows={6}
              className={cn(
                inputCls(over),
                "h-auto w-full resize-none py-2 font-mono text-[12.5px] leading-[1.7]"
              )}
            />
            <p
              className={cn(
                "mt-1 text-right text-[11.5px] tabular-nums",
                over ? "text-cinnabar-text" : "text-paper-3/80"
              )}
            >
              {cleaned.length}/{MACRO_LIMIT}
            </p>
          </div>
        </div>
      ) : (
        <div ref={first}>
          <TalentPicker
            xinfa={xinfa}
            value={talents}
            onChange={setTalents}
            compact
          />
        </div>
      )}

      {blocked && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-amber/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-paper-2 ring-1 ring-inset ring-amber/25"
        >
          {tx("管理窗口里有{0}没保存的修改，先在那里保存或放弃", xinfa)}
          <button
            type="button"
            onClick={() => onOpenManager(target?.id ?? "")}
            className="ml-1 text-paper underline underline-offset-2 hover:text-cinnabar-text"
          >
            {tx("去处理")}
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Btn variant="ghost" size="md" onClick={onCancel}>
          {tx("取消")}
        </Btn>
        <Btn variant="primary" size="md" onClick={save} disabled={!canSave}>
          {tx("保存")}
        </Btn>
      </div>
    </div>
  );
}
