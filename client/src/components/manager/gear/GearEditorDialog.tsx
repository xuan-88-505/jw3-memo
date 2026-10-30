import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { XinfaMark } from "@/components/brand/Marks";
import { Btn } from "@/components/common/ui";
import {
  draftChanges,
  draftOf,
  evalDraft,
  primaryAttr,
  type GearDraft,
  type Loadout,
} from "@/data/gear";
import { buffFactor } from "@/lib/buffs";
import { Delta, fmt } from "./Dashboard";
import { GearEditor, QuickMenu, useQuickActions } from "./GearEditor";
import { GearFilterButton } from "./GearFilterButton";
import { useGearFilter } from "./gearFilter";
import { useEquipDb } from "./useEquipDb";

/**
 * 配装器弹窗，照参考站：盖住整个管理窗口，一张表改全身，底部保存。
 * 关掉不丢草稿，下次打开还在；只有「保存」「另存为新配装」才写进配装。
 */
export function GearEditorDialog({
  open,
  onClose,
  lo,
  draft,
  onDraft,
  onSave,
  onSaveAs,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  lo: Loadout;
  draft: GearDraft;
  onDraft: (d: GearDraft) => void;
  onSave: () => void;
  onSaveAs: () => void;
  flash?: { slotKey: string; n: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const main = primaryAttr(lo.xinfa);
  const { db, failed, retry } = useEquipDb(main);
  const [filter, setFilter] = useGearFilter();
  const ev = useMemo(() => evalDraft(lo, draft), [lo, draft]);
  const changes = useMemo(() => draftChanges(lo, draft), [lo, draft]);
  const quick = useQuickActions(lo, draft, onDraft);
  const factor = buffFactor(lo);
  const dirty = changes.length > 0;

  // 打开时把焦点放进弹窗；Esc 关闭。菜单和下拉挂在别处，它们自己处理 Esc
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex animate-fade items-center justify-center bg-black/55 p-4"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full max-h-[860px] w-full max-w-[1240px] flex-col overflow-hidden rounded-xl bg-ink-3 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] outline-none ring-1 ring-paper/12"
      >
        {/* 标题行：左边是哪套配装，右边是筛选、一键和关闭 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-paper/[0.07] px-5 py-3">
          <h2 id={titleId} className="text-[16px] font-semibold text-paper">
            配装器
          </h2>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-paper-2">
            <XinfaMark xinfa={lo.xinfa} size={16} />
            <span className="truncate">{lo.name}</span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {failed ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-cinnabar-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                装备库加载失败
                <button
                  type="button"
                  onClick={retry}
                  className="text-paper-2 underline underline-offset-2 hover:text-paper"
                >
                  重试
                </button>
              </span>
            ) : (
              !db && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-paper-3">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  正在加载装备库
                </span>
              )
            )}
            <GearFilterButton value={filter} onChange={setFilter} />
            <QuickMenu {...quick} />
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              title="关闭，改动会留着"
              className="-mr-1 ml-1 grid h-8 w-8 place-items-center rounded-md text-paper-3 transition-colors hover:bg-paper/[0.08] hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5">
          <GearEditor
            key={lo.id}
            lo={lo}
            draft={draft}
            ev={ev}
            filter={filter}
            onDraft={onDraft}
            flash={flash}
          />
        </div>

        {/* 底部：改前改后秒伤和保存 */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-paper/[0.07] px-5 py-3">
          <div
            className="flex min-w-0 items-baseline gap-2.5"
            aria-live="polite"
          >
            <span className="text-[12px] text-paper-3">秒伤</span>
            <span className="text-[20px] font-semibold tabular-nums text-paper">
              {fmt(Math.round(ev.dps * factor))}
            </span>
            {dirty ? (
              <>
                <Delta pct={ev.pct * 100} className="text-[13px]" />
                <span className="truncate text-[12px] text-paper-3">
                  原 {fmt(Math.round(lo.dps * factor))}
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span title={changes.join("、")}>
                    改了 {changes.length} 处
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[12px] text-paper-3">未改动</span>
            )}
            <span className="text-[11.5px] text-paper-3">
              {factor !== 1 ? "含增益，估算" : "估算"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Btn
              variant="ghost"
              size="md"
              disabled={!dirty}
              onClick={() => onDraft(draftOf(lo))}
            >
              撤销
            </Btn>
            <Btn size="md" disabled={!dirty} onClick={onSaveAs}>
              另存为新配装
            </Btn>
            <Btn variant="primary" size="md" disabled={!dirty} onClick={onSave}>
              保存
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
