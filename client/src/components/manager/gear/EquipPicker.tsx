import { ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Anchored } from "@/components/common/Anchored";
import {
  STAT_LABEL,
  TYPE_TAG,
  attrShort,
  itemTags,
  maxRefine,
  qualityOf,
  refined,
  type EquipDef,
} from "@/data/equip";
import {
  changePct,
  equipSlot,
  slotChange,
  type Attr,
  type DraftEval,
  type GearSlot,
  type Loadout,
} from "@/data/gear";
import { cn } from "@/lib/utils";
import { passes, type GearFilter } from "./gearFilter";
import { ItemTile, QUALITY_TEXT } from "./ItemTile";

type Sort = "gain" | "ilvl";

interface Option {
  def: EquipDef;
  /** 换上后的秒伤变化，单位 % */
  pct: number;
  current: boolean;
  hidden: boolean;
}

function fmtPct(p: number) {
  if (Math.abs(p) < 0.005) return "±0";
  return `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%`;
}

function matches(def: EquipDef, q: string) {
  if (!q) return true;
  const hay = [
    def.name,
    def.source ?? "",
    String(def.ilvl),
    TYPE_TAG[def.type],
    ...itemTags(def).map(attrShort),
    ...itemTags(def),
  ].join(" ");
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w));
}

/** 一个部位的装备选择：触发按钮显示当前装备，弹出层里搜索、按收益排序、看详情 */
export function EquipPicker({
  lo,
  ev,
  slot,
  main,
  pool,
  filter,
  onPick,
}: {
  lo: Loadout;
  ev: DraftEval;
  slot: GearSlot;
  main: Attr;
  /** null 是装备库还在加载 */
  pool: EquipDef[] | null;
  filter: GearFilter;
  onPick: (def: EquipDef) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("gain");
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const uid = useId();

  const options = useMemo<Option[]>(() => {
    if (!open || !pool) return [];
    return pool.map(def => {
      const current = def.id === slot.def?.id;
      return {
        def,
        current,
        pct: current
          ? 0
          : changePct(lo, ev, slotChange(slot, equipSlot(slot, def), main)) *
            100,
        hidden: !current && !passes(def, filter),
      };
    });
  }, [open, pool, slot, lo, ev, main, filter]);

  const shown = useMemo(() => {
    const term = q.trim();
    const list = options.filter(
      o => (showAll || !o.hidden) && matches(o.def, term)
    );
    return list.sort((a, b) =>
      sort === "gain"
        ? b.pct - a.pct || b.def.ilvl - a.def.ilvl
        : b.def.ilvl - a.def.ilvl || b.pct - a.pct
    );
  }, [options, q, showAll, sort]);
  const hiddenCount = useMemo(
    () => options.filter(o => o.hidden && matches(o.def, q.trim())).length,
    [options, q]
  );

  const show = () => {
    setQ("");
    setShowAll(false);
    setActive(0);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const pick = (o: Option | undefined) => {
    if (!o) return;
    if (!o.current) onPick(o.def);
    close();
    btn.current?.focus();
  };
  const move = (i: number) => {
    const n = Math.max(0, Math.min(shown.length - 1, i));
    setActive(n);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${n}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };
  const focused = shown[active] ?? shown[0];

  const tags = slot.item.tags;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${slot.label}：${slot.item.name}，换装备`}
        onClick={() => (open ? close() : show())}
        className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-paper/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60"
      >
        <ItemTile
          text={slot.short}
          iconId={slot.item.iconId}
          quality={slot.item.quality}
          size={32}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[13px]",
              QUALITY_TEXT[slot.item.quality]
            )}
          >
            {slot.item.name}
          </span>
          <span className="block truncate text-[11.5px] text-paper-3">
            {slot.def ? `${slot.def.ilvl} · ` : ""}
            {tags.map(attrShort).join(" ") || "—"}
            {slot.def && TYPE_TAG[slot.def.type] && (
              <span className="ml-1.5 rounded bg-paper/[0.07] px-1 text-[10.5px] text-paper-2">
                {TYPE_TAG[slot.def.type]}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-paper-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={close}
        width={640}
        maxHeight={460}
        label={`选择${slot.label}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-paper/[0.07] px-3 py-2">
          <Search className="h-3.5 w-3.5 text-paper-3" aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(active + 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(active - 1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(focused);
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls={`${uid}-list`}
            aria-activedescendant={
              focused ? `${uid}-${shown.indexOf(focused)}` : undefined
            }
            aria-label={`搜索${slot.label}`}
            placeholder="名称、词条、品级或来源"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-paper placeholder:text-paper-3 focus:outline-none"
          />
          <div
            role="radiogroup"
            aria-label="排序"
            className="flex shrink-0 rounded-md bg-paper/[0.04] p-0.5 ring-1 ring-inset ring-paper/10"
          >
            {(
              [
                ["gain", "按收益"],
                ["ilvl", "按品级"],
              ] as [Sort, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={sort === k}
                onClick={() => setSort(k)}
                className={cn(
                  "h-6 rounded px-2 text-[12px] transition-colors",
                  sort === k
                    ? "bg-paper/[0.1] text-paper"
                    : "text-paper-3 hover:text-paper-2"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            aria-label={`${slot.label}可选装备`}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1"
          >
            {!pool ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-paper-3">
                正在加载装备库…
              </p>
            ) : shown.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-paper-3">
                没有符合的装备
              </p>
            ) : (
              shown.map((o, i) => (
                <div
                  key={o.def.id}
                  id={`${uid}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o === focused}
                  aria-current={o.current || undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    "mx-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5",
                    o === focused && "bg-paper/[0.06]"
                  )}
                >
                  <ItemTile
                    text={slot.short}
                    iconId={o.def.iconId}
                    quality={qualityOf(o.def)}
                    size={28}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          QUALITY_TEXT[qualityOf(o.def)]
                        )}
                      >
                        {o.def.name}
                      </span>
                      {TYPE_TAG[o.def.type] && (
                        <span className="shrink-0 rounded bg-paper/[0.07] px-1 text-[10.5px] text-paper-2">
                          {TYPE_TAG[o.def.type]}
                        </span>
                      )}
                      {o.current && (
                        <span className="shrink-0 text-[11px] text-paper-3">
                          当前
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-paper-3">
                      {o.def.ilvl} ·{" "}
                      {itemTags(o.def).map(attrShort).join(" ") || "—"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[12.5px] tabular-nums",
                      o.current || Math.abs(o.pct) < 0.005
                        ? "text-paper-3"
                        : o.pct > 0
                          ? "text-jade"
                          : "text-cinnabar-text"
                    )}
                  >
                    {o.current ? "—" : fmtPct(o.pct)}
                  </span>
                </div>
              ))
            )}
          </div>
          {focused && <Detail o={focused} />}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-paper/[0.07] px-3 py-2 text-[11.5px] text-paper-3">
          <span>
            {shown.length} 件
            {hiddenCount > 0 && !showAll && <>，筛选隐藏了 {hiddenCount} 件</>}
          </span>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
            >
              {showAll ? "按筛选显示" : "显示全部"}
            </button>
          )}
        </div>
      </Anchored>
    </>
  );
}

/** 右侧的装备详情：属性按满精炼显示 */
function Detail({ o }: { o: Option }) {
  const d = o.def;
  const r = maxRefine(d);
  return (
    <aside
      aria-label="装备详情"
      className="scroll-thin hidden w-[210px] shrink-0 overflow-y-auto border-l border-paper/[0.07] px-3.5 py-3 text-[12px] sm:block"
    >
      <p className={cn("text-[13px] font-medium", QUALITY_TEXT[qualityOf(d)])}>
        {d.name}
      </p>
      <p className="mt-0.5 text-paper-3">
        品级 {d.ilvl}
        {TYPE_TAG[d.type] && ` · ${TYPE_TAG[d.type]}`}
      </p>
      <dl className="mt-2.5 space-y-1">
        {d.stats.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-paper-3">{STAT_LABEL[k]}</dt>
            <dd className="tabular-nums text-paper-2">
              +{refined(v, r).toLocaleString("zh-CN")}
            </dd>
          </div>
        ))}
        {d.weaponDmg > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-paper-3">武器伤害</dt>
            <dd className="tabular-nums text-paper-2">
              {d.weaponDmg.toLocaleString("zh-CN")}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-1.5 text-[11px] text-paper-3">按精炼 {r} 显示</p>
      {d.holes.length > 0 && (
        <p className="mt-2.5 text-paper-2">
          <span className="text-paper-3">镶嵌孔 </span>
          {d.holes.map(attrShort).join(" · ")}
        </p>
      )}
      {d.effect && (
        <p className="mt-1.5 text-paper-2">
          <span className="text-paper-3">特效 </span>
          {d.effect.replace(/_/g, " · ")}
        </p>
      )}
      {d.source && (
        <p className="mt-2.5 leading-relaxed text-paper-3">{d.source}</p>
      )}
    </aside>
  );
}
