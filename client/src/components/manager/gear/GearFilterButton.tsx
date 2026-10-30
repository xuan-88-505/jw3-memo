import { SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { Anchored } from "@/components/common/Anchored";
import { FilterChip } from "@/components/common/FilterChip";
import { TYPE_GROUPS, attrShort } from "@/data/equip";
import { cn } from "@/lib/utils";
import {
  FILTER_ATTRS,
  ILVL_STEPS,
  NO_FILTER,
  filterCount,
  type GearFilter,
} from "./gearFilter";
import { tx } from "@/lib/i18n";

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

/** 装备下拉的筛选：所有部位共用 */
export function GearFilterButton({
  value,
  onChange,
}: {
  value: GearFilter;
  onChange: (f: GearFilter) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const n = filterCount(value);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-inset transition-colors",
          n
            ? "bg-paper/[0.08] text-paper ring-paper/15"
            : "text-paper-2 ring-paper/10 hover:text-paper hover:ring-paper/20"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {tx("筛选")}
        {n > 0 && (
          <span className="rounded-full bg-cinnabar/90 px-1.5 text-[11px] leading-[18px] text-white">
            {n}
          </span>
        )}
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        width={340}
        align="end"
        label={tx("装备筛选")}
      >
        <div className="scroll-thin space-y-4 overflow-y-auto p-4">
          <Group title={tx("品级")}>
            {ILVL_STEPS.map(([v, label]) => (
              <FilterChip
                key={v}
                label={tx(label)}
                selected={value.minIlvl === v}
                onSelect={() => onChange({ ...value, minIlvl: v })}
              />
            ))}
          </Group>
          <Group title={tx("带这些词条（任一）")}>
            {FILTER_ATTRS.map(a => (
              <FilterChip
                key={a}
                label={attrShort(a)}
                selected={value.attrs.includes(a)}
                onSelect={() =>
                  onChange({ ...value, attrs: toggle(value.attrs, a) })
                }
              />
            ))}
          </Group>
          <Group title={tx("不看")}>
            {TYPE_GROUPS.map(t => (
              <FilterChip
                key={t}
                label={t}
                selected={value.hide.includes(t)}
                onSelect={() =>
                  onChange({ ...value, hide: toggle(value.hide, t) })
                }
              />
            ))}
          </Group>
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-paper/[0.07] px-4 py-2.5 text-[12px]">
          <span className="text-paper-3">{tx("所有部位共用")}</span>
          <button
            type="button"
            disabled={!n}
            onClick={() => onChange(NO_FILTER)}
            className="text-paper-2 hover:text-paper disabled:opacity-40"
          >
            {tx("清除")}
          </button>
        </div>
      </Anchored>
    </>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[12px] text-paper-3">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
