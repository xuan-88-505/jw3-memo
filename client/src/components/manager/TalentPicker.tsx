import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Jx3Icon } from "@/components/brand/Marks";
import { layersOf } from "@/data/seed";
import type { TalentOption } from "@/data/types";
import { layerLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/**
 * 奇穴选择器
 * - 上面一行：第一重到第九重的当前选择，一排看完
 * - 点其中一重，下面列出这一重的选项
 *   - 第 1–6 重：每重 4 选 1
 *   - 第 7–9 重：共用 12 个选项，选 3 个，不能重复（点已被占用的会互换）
 * - 最下面是鼠标所在（或当前选中）奇穴的说明
 */
export function TalentPicker({
  xinfa,
  value,
  baseline,
  onChange,
  disabled,
}: {
  xinfa: string;
  value: number[];
  baseline?: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const layers = layersOf(xinfa);
  const [slot, setSlot] = useState(0);
  const [hover, setHover] = useState<TalentOption | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isPool = (i: number) => i >= 6;
  const optionsOf = (i: number) =>
    (isPool(i) ? layers[6]?.options : layers[i]?.options) ?? [];
  const pickedAt = (i: number) => optionsOf(i).find(o => o.pos === value[i]);
  const changedAt = (i: number) => !!baseline && baseline[i] !== value[i];

  const setLayer = (i: number, pos: number) => {
    const next = [...value];
    if (isPool(i)) {
      const other = [6, 7, 8].find(j => j !== i && next[j] === pos);
      if (other !== undefined) next[other] = next[i];
    }
    next[i] = pos;
    onChange(next);
  };

  const go = (i: number) => {
    setSlot(i);
    setHover(null);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = layers.length - 1;
    const to =
      e.key === "ArrowRight"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft"
          ? i === 0
            ? last
            : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    go(to);
    tabRefs.current[to]?.focus();
  };

  const pool = isPool(slot);
  const detail = hover ?? pickedAt(slot) ?? null;

  return (
    <div className="@container">
      {/* 九重一排 */}
      <div role="tablist" aria-label={tx("奇穴")} className="flex gap-1.5">
        {layers.map((L, i) => {
          const o = pickedAt(i);
          const active = slot === i;
          const changed = changedAt(i);
          return (
            <button
              key={L.layer}
              ref={el => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={active}
              aria-controls={`${uid}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => go(i)}
              onKeyDown={e => onTabKey(e, i)}
              title={tx("第{0}重 · {1}", layerLabel(i), o?.name ?? tx("未选"))}
              className={cn(
                "relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-lg px-1 pb-1.5 pt-1.5 ring-1 ring-inset transition-colors",
                i === 6 && "ml-2",
                active
                  ? "bg-cinnabar/[0.10] ring-cinnabar/70"
                  : "bg-paper/[0.04] ring-paper/10 hover:ring-paper/[0.22]"
              )}
            >
              <span
                className={cn(
                  "font-serif text-[11px] leading-none",
                  active ? "text-paper-2" : "text-paper-3"
                )}
              >
                {layerLabel(i)}
              </span>
              {o ? (
                <Jx3Icon id={o.icon} name={o.name} size={32} />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-md bg-paper/[0.06]"
                />
              )}
              <span
                className={cn(
                  "hidden w-full truncate text-center text-[11px] @[520px]:block",
                  active ? "text-paper" : "text-paper-2"
                )}
              >
                {o?.name ?? tx("未选")}
              </span>
              {changed && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 h-2 w-2 rounded-[2px] bg-cinnabar"
                  />
                  <span className="sr-only">{tx("已修改")}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* 当前这一重的选项 */}
      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${slot}`}
        className="mt-4"
      >
        <p className="mb-2 text-[11.5px] text-paper-3">
          <span className="text-paper-2">
            {tx("第{0}重", layerLabel(slot))}
          </span>
          {pool
            ? disabled
              ? tx(" · 七至九重共用，12 选 3")
              : tx(" · 七至九重共用，点已占用的会互换")
            : null}
        </p>
        <div
          role="radiogroup"
          aria-label={tx("第{0}重", layerLabel(slot))}
          className={cn(
            "grid gap-1.5",
            pool ? "grid-cols-4 @[480px]:grid-cols-6" : "grid-cols-4"
          )}
        >
          {optionsOf(slot).map(o => {
            const usedBy = pool
              ? [6, 7, 8].find(j => value[j] === o.pos)
              : undefined;
            const selected = pool ? usedBy === slot : value[slot] === o.pos;
            return (
              <Tile
                key={o.pos}
                opt={o}
                selected={selected}
                changed={selected && changedAt(slot)}
                badge={
                  usedBy !== undefined && usedBy !== slot
                    ? layerLabel(usedBy)
                    : undefined
                }
                disabled={disabled}
                compact={pool}
                onPick={() => {
                  setLayer(slot, o.pos);
                  // 七至九重要连选三个：选完自动跳到下一重
                  if (pool) go(slot === 8 ? 6 : slot + 1);
                }}
                onFocus={() => setHover(o)}
                onBlur={() => setHover(null)}
              />
            );
          })}
        </div>

        {/* 说明 */}
        <div
          className="mt-3 flex min-h-[76px] gap-3 border-t border-paper/[0.07] pt-3"
          aria-live="polite"
        >
          {detail ? (
            <>
              <span className="shrink-0">
                <Jx3Icon id={detail.icon} name={detail.name} size={32} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-paper">
                  {detail.name}
                  {detail.isSkill && (
                    <span className="ml-1.5 text-[11px] font-normal text-paper-3">
                      {tx("招式")}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-paper-2">
                  {detail.desc}
                </p>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-paper-3">{tx("这一重还没选。")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({
  opt,
  selected,
  changed,
  badge,
  disabled,
  compact,
  onPick,
  onFocus,
  onBlur,
}: {
  opt: TalentOption;
  selected: boolean;
  changed?: boolean;
  badge?: string;
  disabled?: boolean;
  compact?: boolean;
  onPick: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled && !selected}
      onClick={() => !disabled && onPick()}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      title={opt.name}
      className={cn(
        "relative flex min-w-0 items-center gap-1.5 rounded-lg ring-1 ring-inset transition-colors",
        compact ? "flex-col px-1 py-1.5" : "px-1.5 py-1.5",
        selected
          ? "bg-cinnabar/[0.10] ring-cinnabar/70"
          : "bg-paper/[0.04] ring-paper/10 hover:ring-paper/[0.22]",
        disabled && !selected && "opacity-40",
        disabled && "cursor-default"
      )}
    >
      <Jx3Icon
        id={opt.icon}
        name={opt.name}
        size={compact ? 30 : 28}
        dim={!!badge}
      />
      <span
        className={cn(
          "min-w-0 truncate text-[12px]",
          compact && "w-full text-center text-[11px]",
          selected ? "text-paper" : "text-paper-2"
        )}
      >
        {opt.name}
      </span>
      {badge && (
        <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-[3px] bg-ink-3/90 font-serif text-[10px] text-paper-2 ring-1 ring-paper/12">
          {badge}
        </span>
      )}
      {changed && (
        <span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-[2px] bg-cinnabar"
          aria-label={tx("已修改")}
        />
      )}
    </button>
  );
}
