import { useEffect, useId, useRef, useState } from "react";
import { InlineModal } from "@/components/common/overlay";
import { Btn, Segmented } from "@/components/common/ui";
import { IconPickerButton } from "@/components/common/IconPicker";
import { MODES, type Mode } from "@/data/types";
import { MACRO_LIMIT, cleanMacro } from "@/lib/macro";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { findScheme, isOnline, latest, modesOf, useProto } from "@/state/store";
import { inputCls } from "./shared";

/**
 * 从「我的角色」某一行原地新建宏，不离开当前页。
 * 宏按心法和模式存在方案里：已有这个方案就加到最新版本后面、存成新版本；
 * 没有就新建这个方案。角色玩多个心法时可以切换。
 */
export function NewMacroDialog({
  xinfas,
  onClose,
}: {
  /** 这个角色玩的心法；空数组表示弹窗关着 */
  xinfas: string[];
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const open = xinfas.length > 0;
  const online = isOnline(state);
  const nameId = useId();
  const [xinfa, setXinfa] = useState("");
  const [mode, setMode] = useState<Mode>("PVE");
  const [icon, setIcon] = useState(13);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [content, setContent] = useState("/cast ");
  const [blocked, setBlocked] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // 每次打开时重置；模式默认选这个心法已有的方案，都没有就 PVE
  useEffect(() => {
    if (!open) return;
    const x = xinfas[0];
    setXinfa(x);
    setMode(modesOf(state, x)[0] ?? "PVE");
    setIcon(13);
    setName("");
    setNote("");
    setContent("/cast ");
    setBlocked(false);
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !xinfa) return null;

  const last = latest(findScheme(state, xinfa, mode));
  const cleaned = cleanMacro(content);
  const over = cleaned.length > MACRO_LIMIT;
  const canSave = online && !!name.trim() && cleaned.length > 0 && !over;
  const schemeId = `${xinfa}-${mode}`;

  const save = () => {
    if (!canSave) return;
    const result = actions.addMacro(xinfa, mode, {
      id: `${schemeId}-n${Date.now()}`,
      name: name.trim(),
      icon,
      content: content.trim(),
      note: note.trim(),
    });
    if (result === "draft") {
      setBlocked(true);
      return;
    }
    actions.toast("manager", "success", tx("已保存宏"));
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("新建宏")}
      width={480}
      bodyMaxHeight={520}
      footer={
        <>
          {!online && (
            <span className="mr-auto text-[12px] text-gold">
              {tx("离线时不能新建")}
            </span>
          )}
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={!canSave}>
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {xinfas.length > 1 && (
              <Segmented<string>
                label={tx("心法")}
                size="sm"
                value={xinfa}
                onChange={x => {
                  setXinfa(x);
                  setBlocked(false);
                }}
                options={xinfas.map(x => ({ value: x, label: x }))}
              />
            )}
            <Segmented<Mode>
              label={tx("模式")}
              size="sm"
              value={mode}
              onChange={m => {
                setMode(m);
                setBlocked(false);
              }}
              options={MODES.map(m => ({ value: m, label: m }))}
            />
          </div>
          {/* 说清楚宏会存到哪里：已有的方案里，还是新建一个方案 */}
          <p className="mt-2 text-[12px] leading-relaxed text-paper-3">
            {last
              ? tx("加到「{0} {1}」，存为 v{2}", xinfa, mode, last.version + 1)
              : tx("还没有「{0} {1}」方案，保存时一起新建", xinfa, mode)}
          </p>
        </div>

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
              id={nameId}
              data-autofocus
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
            rows={7}
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

        {blocked && (
          <div
            role="alert"
            className="rounded-lg bg-amber/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-paper-2 ring-1 ring-inset ring-amber/25"
          >
            {tx("「{0} {1}」有没保存的修改，先在方案库里保存或放弃", xinfa, mode)}
            <button
              type="button"
              onClick={() => {
                actions.goTo("schemes");
                actions.selectScheme(schemeId);
                onClose();
              }}
              className="ml-1 text-paper underline underline-offset-2 hover:text-cinnabar-text"
            >
              {tx("去处理")}
            </button>
          </div>
        )}
      </div>
    </InlineModal>
  );
}
