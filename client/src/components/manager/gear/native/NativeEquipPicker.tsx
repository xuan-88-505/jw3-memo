import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Anchored } from "@/components/common/Anchored";
import type { CalcInput, CalcSlotInput } from "@/data/calcTypes";
import {
  computeSync,
  equipOf,
  equipTags,
  qualityOfCalc,
  swapEquip,
  typeTag,
  type CalcCatalog,
  type CalcEquip,
} from "@/lib/calcEngine";
import { cn } from "@/lib/utils";
import { ItemTile, QUALITY_TEXT } from "../ItemTile";
import { tx } from "@/lib/i18n";

type Sort = "gain" | "ilvl";

/** 每批算几件，算完一批让出主线程，列表先出来、收益陆续补上 */
const BATCH = 6;

/**
 * 当季装备选择：装备来自原版计算器的装备库，收益用原版计算核心算
 * （换上这件、其他不变，秒伤相对现在变多少）。
 */
export function NativeEquipPicker({
  cat,
  xinfa,
  idx,
  label,
  short,
  input,
  dps,
  onPick,
}: {
  cat: CalcCatalog;
  xinfa: string;
  /** 计算器部位索引 _1 … _12 */
  idx: string;
  label: string;
  /** 图标里的一个字 */
  short: string;
  input: CalcInput;
  /** 现在这套的秒伤；0 是还没算出来 */
  dps: number;
  onPick: (next: CalcSlotInput) => void;
}) {
  const uid = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("gain");
  const [kind, setKind] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [gains, setGains] = useState<Map<number, number>>(() => new Map());

  const value = input.slots[idx] ?? null;
  const cur = value ? equipOf(cat, idx, value.id) : null;
  const pool = cat.equips[cat.slotPart[idx]] ?? [];

  // 打开时按批算每件的收益；关掉或配装变了就重算
  useEffect(() => {
    if (!open || !dps) return;
    let alive = true;
    let i = 0;
    const next = new Map<number, number>();
    setGains(new Map());
    const step = () => {
      if (!alive) return;
      for (const end = Math.min(i + BATCH, pool.length); i < end; i++) {
        const e = pool[i];
        if (value && e.id === value.id) {
          next.set(e.id, 0);
          continue;
        }
        const r = computeSync(xinfa, {
          ...input,
          slots: { ...input.slots, [idx]: swapEquip(cat, idx, value, e) },
        });
        if (r.ok) next.set(e.id, r.dps / dps - 1);
      }
      setGains(new Map(next));
      if (i < pool.length) window.setTimeout(step, 0);
    };
    const t = window.setTimeout(step, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // input 每次改都是新对象；只在打开和这几项变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dps, idx, cat, xinfa, value?.id]);

  const kinds = useMemo(() => {
    const set = new Set<string>();
    for (const e of pool) {
      const t = typeTag(e);
      if (t) set.add(t);
    }
    return Array.from(set);
  }, [pool]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = pool.filter(e => {
      if (kind && typeTag(e) !== kind) return false;
      if (!words.length) return true;
      const hay = [e.装备名称, String(e.装备品级), typeTag(e) ?? "", ...equipTags(cat, e)]
        .join(" ")
        .toLowerCase();
      return words.every(w => hay.includes(w));
    });
    const g = (e: CalcEquip) => gains.get(e.id);
    return list.sort((a, b) => {
      if (sort === "gain") {
        const ga = g(a);
        const gb = g(b);
        if (ga != null && gb != null && ga !== gb) return gb - ga;
        if (ga != null && gb == null) return -1;
        if (ga == null && gb != null) return 1;
      }
      return b.装备品级 - a.装备品级 || a.装备名称.localeCompare(b.装备名称, "zh");
    });
  }, [pool, q, kind, sort, gains, cat]);

  const show = () => {
    setQ("");
    setKind(null);
    setOpen(true);
    const at = cur ? pool.indexOf(cur) : 0;
    setActive(Math.max(0, at));
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const pick = (e: CalcEquip | undefined) => {
    if (!e) return;
    if (!value || e.id !== value.id) onPick(swapEquip(cat, idx, value, e));
    close();
  };
  const move = (i: number) => {
    const n = shown.length;
    if (!n) return;
    const next = (i + n) % n;
    setActive(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };
  const focused = shown[Math.min(active, shown.length - 1)];
  const tags = cur ? equipTags(cat, cur) : [];
  const quality = cur ? qualityOfCalc(cur) : "purple";

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tx("{0}：{1}，换装备", label, cur?.装备名称 ?? tx("未装备"))}
        onClick={() => (open ? close() : show())}
        className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-paper/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60"
      >
        <ItemTile text={short} iconId={cur?.图标ID} quality={quality} size={32} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[13px]",
              cur ? QUALITY_TEXT[quality] : "text-paper-3"
            )}
          >
            {cur?.装备名称 ?? tx("未装备")}
          </span>
          <span className="block truncate text-[11.5px] text-paper-3">
            {cur ? `${cur.装备品级} · ${tags.join(" ") || "—"}` : "—"}
            {cur && typeTag(cur) && (
              <span className="ml-1.5 rounded bg-paper/[0.07] px-1 text-[10.5px] text-paper-2">
                {typeTag(cur)}
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
        width={560}
        maxHeight={460}
        label={tx("选择{0}", label)}
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
            aria-label={tx("搜索{0}", label)}
            placeholder={tx("名称、词条或品级")}
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-paper placeholder:text-paper-3 focus:outline-none"
          />
          <div
            role="radiogroup"
            aria-label={tx("排序")}
            className="flex shrink-0 rounded-md bg-paper/[0.04] p-0.5 ring-1 ring-inset ring-paper/10"
          >
            {(
              [
                ["gain", tx("按收益")],
                ["ilvl", tx("按品级")],
              ] as [Sort, string][]
            ).map(([k, text]) => (
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
                {text}
              </button>
            ))}
          </div>
        </div>

        {kinds.length > 0 && (
          <div
            role="radiogroup"
            aria-label={tx("装备类型")}
            className="flex shrink-0 flex-wrap gap-1 border-b border-paper/[0.07] px-3 py-1.5"
          >
            {[null, ...kinds].map(k => (
              <button
                key={k ?? "all"}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setActive(0);
                }}
                className={cn(
                  "h-6 rounded-md px-2 text-[12px] transition-colors",
                  kind === k
                    ? "bg-paper/[0.1] text-paper"
                    : "text-paper-3 hover:bg-paper/[0.05] hover:text-paper-2"
                )}
              >
                {k ?? tx("全部")}
              </button>
            ))}
          </div>
        )}

        <div
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          aria-label={tx("{0}可选装备", label)}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1"
        >
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-paper-3">
              {tx("没有符合的装备")}
            </p>
          ) : (
            shown.map((e, i) => {
              const isCur = !!value && e.id === value.id;
              const g = gains.get(e.id);
              const qual = qualityOfCalc(e);
              const tag = typeTag(e);
              return (
                <div
                  key={e.id}
                  id={`${uid}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={e === focused}
                  aria-current={isCur || undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(e)}
                  className={cn(
                    "mx-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5",
                    e === focused && "bg-paper/[0.06]"
                  )}
                >
                  <ItemTile text={short} iconId={e.图标ID} quality={qual} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("truncate text-[13px]", QUALITY_TEXT[qual])}>
                        {e.装备名称}
                      </span>
                      {tag && (
                        <span className="shrink-0 rounded bg-paper/[0.07] px-1 text-[10.5px] text-paper-2">
                          {tag}
                        </span>
                      )}
                      {isCur && (
                        <span className="shrink-0 text-[11px] text-paper-3">
                          {tx("当前")}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-paper-3">
                      {e.装备品级} · {equipTags(cat, e).join(" ") || "—"}
                    </span>
                  </span>
                  <GainText value={isCur ? null : g} pending={!isCur && g == null && !!dps} />
                </div>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-paper/[0.07] px-3 py-2 text-[11.5px] text-paper-3">
          <span>
            {shown.length} {tx("件")}
          </span>
          <span>{tx("收益：换上这件、其他不变，秒伤的变化")}</span>
        </div>
      </Anchored>
    </>
  );
}

function GainText({ value, pending }: { value: number | null | undefined; pending: boolean }) {
  if (pending)
    return <span className="w-14 shrink-0 text-right text-[12px] text-paper-3/60">…</span>;
  if (value == null) return <span className="w-14 shrink-0" />;
  const pct = value * 100;
  const same = Math.abs(pct) < 0.005;
  return (
    <span
      className={cn(
        "w-14 shrink-0 text-right text-[12px] tabular-nums",
        same ? "text-paper-3" : pct > 0 ? "text-jade" : "text-cinnabar-text"
      )}
    >
      {same ? "0" : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`}
    </span>
  );
}
