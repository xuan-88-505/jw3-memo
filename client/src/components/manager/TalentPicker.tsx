import { useState } from "react";
import { Jx3Icon } from "@/components/brand/Marks";
import { layersOf } from "@/data/seed";
import type { TalentOption } from "@/data/types";
import { LAYER_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 奇穴选择器
 * - 第 1–6 层：每层 4 选 1
 * - 第 7–9 层：共用 12 个选项，选 3 个，不能重复（点已被占用的会互换）
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
  const layers = layersOf(xinfa);
  const [slot, setSlot] = useState(6);
  const [focus, setFocus] = useState<{
    layer: number;
    opt: TalentOption;
  } | null>(null);

  const setLayer = (i: number, pos: number) => {
    const next = [...value];
    if (i >= 6) {
      const other = [6, 7, 8].find(j => j !== i && next[j] === pos);
      if (other !== undefined) next[other] = next[i];
    }
    next[i] = pos;
    onChange(next);
  };

  const detail =
    focus ??
    (() => {
      const o = layers[slot]?.options.find(x => x.pos === value[slot]);
      return o ? { layer: slot, opt: o } : null;
    })();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
      <div className="space-y-1.5">
        {layers.slice(0, 6).map((L, i) => (
          <div key={L.layer} className="flex items-center gap-3">
            <span className="w-12 shrink-0 font-serif text-[13px] text-paper-3">
              第{LAYER_LABEL[i]}重
            </span>
            <div
              className="grid flex-1 grid-cols-4 gap-1.5"
              role="radiogroup"
              aria-label={`第${LAYER_LABEL[i]}重`}
            >
              {L.options.map(o => (
                <Tile
                  key={o.pos}
                  opt={o}
                  selected={value[i] === o.pos}
                  changed={
                    !!baseline && baseline[i] !== value[i] && value[i] === o.pos
                  }
                  disabled={disabled}
                  onPick={() => setLayer(i, o.pos)}
                  onFocus={() => setFocus({ layer: i, opt: o })}
                  onBlur={() => setFocus(null)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="pt-3">
          <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 font-serif text-[13px] text-paper-3">
              七至九
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {[6, 7, 8].map(i => {
                const o = layers[i]?.options.find(x => x.pos === value[i]);
                const changed = !!baseline && baseline[i] !== value[i];
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSlot(i)}
                    aria-pressed={slot === i}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ring-1 ring-inset transition-colors",
                      slot === i && !disabled
                        ? "bg-cinnabar/[0.10] ring-cinnabar/60"
                        : "bg-ink ring-paper/10 hover:ring-paper/20"
                    )}
                  >
                    {o && <Jx3Icon id={o.icon} name={o.name} size={26} />}
                    <span className="min-w-0">
                      <span className="block font-serif text-[11px] text-paper-3">
                        第{LAYER_LABEL[i]}重
                      </span>
                      <span className="block truncate text-[12.5px] text-paper">
                        {o?.name ?? "未选"}
                        {changed && (
                          <span className="ml-1 text-cinnabar-text">·改</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mb-2 ml-[60px] mt-2 text-[11.5px] text-paper-3">
            {disabled
              ? "12 选 3"
              : `正在选第${LAYER_LABEL[slot]}重 · 点已占用的会互换`}
          </p>
          <div className="ml-[60px] grid grid-cols-6 gap-1.5">
            {layers[6]?.options.map(o => {
              const usedBy = [6, 7, 8].find(j => value[j] === o.pos);
              return (
                <Tile
                  key={o.pos}
                  opt={o}
                  selected={usedBy === slot}
                  badge={
                    usedBy !== undefined && usedBy !== slot
                      ? LAYER_LABEL[usedBy]
                      : undefined
                  }
                  disabled={disabled}
                  compact
                  onPick={() => {
                    setLayer(slot, o.pos);
                    setSlot(s => (s === 8 ? 6 : s + 1));
                  }}
                  onFocus={() => setFocus({ layer: slot, opt: o })}
                  onBlur={() => setFocus(null)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <aside
        className="hidden self-start rounded-lg bg-ink px-3 py-3 ring-1 ring-inset ring-paper/8 lg:block"
        aria-live="polite"
      >
        {detail ? (
          <>
            <div className="flex items-center gap-2">
              <Jx3Icon id={detail.opt.icon} name={detail.opt.name} size={32} />
              <span>
                <span className="block text-[13px] font-medium text-paper">
                  {detail.opt.name}
                </span>
                <span className="block font-serif text-[11px] text-paper-3">
                  第{LAYER_LABEL[detail.layer]}重
                  {detail.opt.isSkill ? " · 招式" : ""}
                </span>
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-paper-2">
              {detail.opt.desc}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-paper-3">把鼠标移到奇穴上看说明。</p>
        )}
      </aside>
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
        "relative flex items-center gap-1.5 rounded-lg ring-1 ring-inset transition-colors",
        compact ? "flex-col px-1 py-1.5" : "px-1.5 py-1.5",
        selected
          ? "bg-cinnabar/[0.10] ring-cinnabar/70"
          : "bg-ink ring-paper/8 hover:ring-paper/25",
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
        <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-[3px] bg-ink-5 font-serif text-[10px] text-paper-2">
          {badge}
        </span>
      )}
      {changed && (
        <span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-[2px] bg-cinnabar"
          aria-label="已修改"
        />
      )}
    </button>
  );
}
