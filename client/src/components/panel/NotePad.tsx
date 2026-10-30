import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/lib/format";
import { NOTE_MAX, isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/** 停止输入多久后保存 */
const SAVE_DELAY = 400;

/**
 * 面板「便签」页签的正文：每个角色一份，随手记、快速看，只有本人能看到。
 * 输入后自动保存，没有保存按钮。切页签、切角色、收起面板时先把没保存的内容存掉。
 * 外层按角色 id 加 key，切角色时重新挂载，读出那个角色的便签。
 */
export function NotePad({ charId }: { charId: string }) {
  const { state, actions } = useProto();
  const note = state.notes[charId];
  const [text, setText] = useState(note?.text ?? "");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const online = isOnline(state);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pendingRef.current === null) return;
    actions.setNote(charId, pendingRef.current);
    pendingRef.current = null;
    setPending(false);
  };

  // 切页签、切角色、关面板时，把还没保存的内容存掉
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 另一个窗口改了这个角色的便签：自己没在输入时跟着更新
  useEffect(() => {
    if (pendingRef.current === null) setText(note?.text ?? "");
  }, [note?.text]);

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
    ? tx("正在保存…")
    : !note
      ? ""
      : !online
        ? tx("已存在本机，联网后同步")
        : tx("已保存 · {0}", relativeTime(note.at));

  return (
    <div
      role="tabpanel"
      aria-label={tx("便签")}
      className="flex min-h-0 flex-1 animate-fade flex-col"
    >
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        onBlur={flush}
        maxLength={NOTE_MAX}
        spellCheck={false}
        aria-label={tx("这个角色的便签")}
        title={tx("便签只有你能看到，不会共享给亲友团")}
        placeholder={tx(
          "记点这个角色的事，比如团长 YY、副本时间\n只有你能看到"
        )}
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
