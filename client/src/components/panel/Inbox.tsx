import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { PixelIcon } from "@/components/brand/PixelIcon";
import { OfflineBar } from "@/components/common/overlay";
import { Btn, IconBtn } from "@/components/common/ui";
import { layersOf } from "@/data/seed";
import type { Mode } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { absoluteTime, relativeTime } from "@/lib/format";
import {
  inboxItems,
  isOnline,
  memberName,
  useProto,
  type InboxItem,
  isSolo,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { ChangeList } from "./PanelContent";
import { tx } from "@/lib/i18n";

/** 面板的二级页：列出所有"有更新"的方案 */
export function Inbox({
  onBack,
  onOpenItem,
  onHeaderPointerDown,
  dragging,
}: {
  onBack: () => void;
  onOpenItem: (charId: string, mode: Mode, xinfa: string) => void;
  onHeaderPointerDown?: (e: ReactPointerEvent) => void;
  dragging?: boolean;
}) {
  const { state, actions } = useProto();
  const items = inboxItems(state);
  const online = isOnline(state);

  const markAll = () => {
    const n = actions.markAllSynced();
    if (n) actions.toast("panel", "success", tx("{0} 条都已是最新", n));
  };

  return (
    <>
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex h-12 shrink-0 select-none items-center gap-1 border-b border-paper/[0.07] pl-2 pr-3",
          dragging && "cursor-grab active:cursor-grabbing"
        )}
      >
        <span onPointerDown={e => e.stopPropagation()}>
          <IconBtn label={tx("返回")} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </IconBtn>
        </span>
        <h2 className="text-[14px] font-medium text-paper">{tx("通知")}</h2>
        {items.length > 1 && (
          <span className="ml-auto" onPointerDown={e => e.stopPropagation()}>
            <Btn
              variant="ghost"
              size="xs"
              onClick={markAll}
              disabled={!online}
              title={
                online ? tx("在游戏里都改好后点这里") : tx("离线时不能操作")
              }
            >
              {tx("全部改好了")}
            </Btn>
          </span>
        )}
      </header>
      <OfflineBar compact />
      <div className="scroll-thin min-h-0 flex-1 animate-fade overflow-y-auto">
        {items.length === 0 ? (
          <div className="empty-state flex h-full flex-col items-center justify-center gap-3 pb-6 text-paper-3">
            <PixelIcon name="bell" className="pixel-hop" />
            <p className="text-[13px]">{tx("没有新通知")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-paper/[0.07]">
            {items.map(it => (
              <InboxRow
                key={it.key}
                item={it}
                online={online}
                onOpen={() => onOpenItem(it.char.id, it.mode, it.xinfa)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function InboxRow({
  item,
  online,
  onOpen,
}: {
  item: InboxItem;
  online: boolean;
  onOpen: () => void;
}) {
  const { state, actions } = useProto();
  const [open, setOpen] = useState(false);
  const { char, xinfa, mode, last, base, versions } = item;
  const diff = useMemo(
    () => diffVersions(base, last, layersOf(xinfa)),
    [base, last, xinfa]
  );
  const notes = [...versions].reverse().filter(v => v.note.trim());

  const onMark = () => {
    const r = actions.markSynced(char.id, mode, xinfa);
    if (r)
      actions.toast(
        "panel",
        "success",
        tx("{0} {1} {2} 已是最新", r.name, xinfa, mode)
      );
  };

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <CharAvatar character={char} size={28} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="group flex max-w-full items-center gap-1 text-left"
            aria-label={tx("切到 {0} {1} {2}", char.name, xinfa, mode)}
          >
            <span className="truncate text-[13.5px] font-medium text-paper group-hover:underline group-hover:underline-offset-2">
              {char.name}
            </span>
            <span className="shrink-0 text-[12px] text-paper-3">
              {xinfa} {mode}
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-paper-3/70"
              aria-hidden="true"
            />
          </button>
          <p
            className="mt-0.5 text-[11.5px] text-paper-3"
            title={absoluteTime(last.at)}
          >
            {base
              ? `v${base.version} → v${last.version}`
              : tx("首次使用 v{0}", last.version)}
            {" · "}
            {!isSolo(state) && `${memberName(state, last.authorId)} · `}
            {relativeTime(last.at)}
          </p>
        </div>
        <Btn
          variant="secondary"
          size="xs"
          onClick={onMark}
          disabled={!online}
          icon={<Check className="h-3.5 w-3.5" />}
          title={online ? tx("在游戏里改好后点这里") : tx("离线时不能操作")}
        >
          {tx("我改好了")}
        </Btn>
      </div>

      <div className="pl-[38px]">
        {notes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {notes.map(v => (
              <li
                key={v.version}
                className="flex gap-1.5 text-[12.5px] leading-relaxed text-paper-2"
              >
                {notes.length > 1 && (
                  <span className="shrink-0 pt-px font-mono text-[11px] text-paper-3">
                    v{v.version}
                  </span>
                )}
                <span className="min-w-0">{v.note}</span>
              </li>
            ))}
          </ul>
        )}
        {diff.total > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-paper-3 hover:text-paper"
            >
              {open ? tx("收起") : tx("{0} 处变化", diff.total)}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  open && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div className="mt-1.5 rounded-md bg-paper/[0.04] px-2.5 py-2 ring-1 ring-inset ring-paper/10">
                <ChangeList diff={diff} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
