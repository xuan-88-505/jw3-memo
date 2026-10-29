import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import type { Character } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { NOTE_MAX, isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";

/** 停止输入多久后保存 */
const SAVE_DELAY = 400;

/**
 * 便签：每个角色一份，随手记、快速看。只有本人能看到。
 * 输入后自动保存，没有保存按钮；切换角色或收起面板前会先保存。
 */
export function NotePad({ char }: { char: Character }) {
  const { state, actions } = useProto();
  const note = state.notes[char.id];
  const [text, setText] = useState(note?.text ?? "");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const online = isOnline(state);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pendingRef.current === null) return;
    actions.setNote(char.id, pendingRef.current);
    pendingRef.current = null;
    setPending(false);
  };

  // 切换角色、关面板时，把还没保存的内容存掉
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
        aria-label={`${char.name} 的便签`}
        placeholder="随手记点东西，比如团长 YY、副本时间、还缺的装备"
        className="scroll-thin min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.75] text-paper placeholder:text-paper-3/70 focus:bg-paper/[0.015] focus:outline-none"
      />
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t border-paper/[0.07] px-4 text-[11.5px] text-paper-3">
        <Lock className="h-3 w-3" aria-hidden="true" />
        只有你能看到
        <span className={cn("ml-auto tabular-nums", nearLimit && "text-gold")}>
          {nearLimit ? `${len} / ${NOTE_MAX}` : status}
        </span>
      </div>
    </div>
  );
}
