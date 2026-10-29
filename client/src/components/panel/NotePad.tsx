import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { OfflineBar } from "@/components/common/overlay";
import { IconBtn } from "@/components/common/ui";
import { relativeTime } from "@/lib/format";
import { NOTE_MAX, isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";

/** 停止输入多久后保存 */
const SAVE_DELAY = 400;

/**
 * 便签二级页：从标题栏的便签按钮进入，写法和通知页一致。
 * 便签全局一份，和角色、心法无关，只有本人能看到。
 */
export function NoteView({
  onBack,
  onHeaderPointerDown,
  dragging,
}: {
  onBack: () => void;
  onHeaderPointerDown?: (e: ReactPointerEvent) => void;
  dragging?: boolean;
}) {
  return (
    <>
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex h-12 shrink-0 items-center gap-1 border-b border-paper/[0.07] pl-2 pr-4",
          dragging && "cursor-grab active:cursor-grabbing"
        )}
      >
        <span onPointerDown={e => e.stopPropagation()}>
          <IconBtn label="返回" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </IconBtn>
        </span>
        <h2 className="text-[14px] font-medium text-paper">便签</h2>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-paper-3"
          title="便签不会共享给亲友团"
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          只有你能看到
        </span>
      </header>
      <OfflineBar compact />
      <NotePad />
    </>
  );
}

/**
 * 便签正文：随手记、快速看。
 * 输入后自动保存，没有保存按钮；返回或收起面板前会先保存。
 */
function NotePad() {
  const { state, actions } = useProto();
  const note = state.note;
  const [text, setText] = useState(note?.text ?? "");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const online = isOnline(state);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pendingRef.current === null) return;
    actions.setNote(pendingRef.current);
    pendingRef.current = null;
    setPending(false);
  };

  // 返回、关面板时，把还没保存的内容存掉
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (v: string) => {
    setText(v);
    pendingRef.current = v;
    setPending(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  };

  const len = text.length;
  const nearLimit = len > NOTE_MAX * 0.9;
  const status = pending
    ? "正在保存…"
    : !note
      ? ""
      : !online
        ? "已存在本机，联网后同步"
        : `已保存 · ${relativeTime(note.at)}`;

  return (
    <div className="flex min-h-0 flex-1 animate-fade flex-col">
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        onBlur={flush}
        maxLength={NOTE_MAX}
        spellCheck={false}
        autoFocus
        aria-label="便签"
        placeholder="随手记点东西，比如团长 YY、副本时间、还缺的装备"
        className="scroll-thin min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.75] text-paper placeholder:text-paper-3/70 focus:outline-none"
      />
      {(status || nearLimit) && (
        <div className="flex h-8 shrink-0 items-center justify-end border-t border-paper/[0.07] px-4 text-[11.5px] text-paper-3">
          <span className={cn("tabular-nums", nearLimit && "text-gold")}>
            {nearLimit ? `${len} / ${NOTE_MAX}` : status}
          </span>
        </div>
      )}
    </div>
  );
}
