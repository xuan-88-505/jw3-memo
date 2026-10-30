import { RotateCcw, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Anchored } from "@/components/common/Anchored";
import { IconBtn } from "@/components/common/ui";
import {
  BIG_LEVEL_LABEL,
  BIG_SLOTS,
  configDelta,
  enchantOptions,
  stonesFor,
  type BigLevel,
  type GearConfig,
} from "@/data/enchants";
import { GEM_MAX, attrShort, maxRefine, poolFor } from "@/data/equip";
import {
  changePct,
  configOf,
  draftChanges,
  equipSlot,
  evalDraft,
  gemSlot,
  primaryAttr,
  refineSlot,
  type DraftEval,
  type GearDraft,
  type GearSlot,
  type Loadout,
} from "@/data/gear";
import { buffFactor } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { SelectBox, inputCls } from "../shared";
import { EquipPicker } from "./EquipPicker";
import { PanelStrip } from "./PanelStrip";
import { StonePicker } from "./StonePicker";
import type { GearFilter } from "./gearFilter";
import { useEquipDb } from "./useEquipDb";

const selectCls = cn(inputCls(), "h-8 pl-2.5 text-[12.5px]");
const gemCls = cn(inputCls(), "h-8 w-[60px] px-1.5 text-center text-[12.5px]");

function sameSlot(a: GearSlot, b: GearSlot) {
  return (
    a === b ||
    (a.def?.id === b.def?.id &&
      a.item.name === b.item.name &&
      a.refine === b.refine &&
      a.gems.join() === b.gems.join() &&
      a.enchant === b.enchant)
  );
}

/**
 * 配装器的部位表：一张表改全身。所有改动先进草稿，保存后才写进配装。
 * 秒伤、保存按钮、筛选和一键在外面的弹窗里（GearEditorDialog）。
 */
export function GearEditor({
  lo,
  draft,
  ev,
  filter,
  onDraft,
  flash,
}: {
  lo: Loadout;
  draft: GearDraft;
  ev: DraftEval;
  filter: GearFilter;
  onDraft: (d: GearDraft) => void;
  /** 从「下一步建议」跳过来时高亮的部位 */
  flash?: { slotKey: string; n: number } | null;
}) {
  const main = primaryAttr(lo.xinfa);
  const { db } = useEquipDb(main);
  const cfg = useMemo(() => configOf(draft), [draft]);
  const factor = buffFactor(lo);
  const cfgPct = (next: GearConfig) =>
    changePct(lo, ev, configDelta(main, cfg, next));

  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    rows.current[flash.slotKey]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setLit(flash.slotKey);
    const t = window.setTimeout(() => setLit(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash?.n]);

  const setSlot = (key: string, fn: (s: GearSlot) => GearSlot) =>
    onDraft({
      ...draft,
      slots: draft.slots.map(s => (s.key === key ? fn(s) : s)),
    });

  const dirty = useMemo(() => draftChanges(lo, draft).length > 0, [lo, draft]);

  return (
    <div className="@container pb-6">
      {/* 属性面板吸顶，改了哪项标出涨跌 */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-paper/[0.07] bg-ink-3/95 px-5 backdrop-blur">
        <PanelStrip
          xinfa={lo.xinfa}
          panel={ev.panel}
          hasteValue={ev.hasteValue}
          base={
            dirty ? { panel: lo.panel, hasteValue: lo.haste.value } : undefined
          }
          note={factor !== 1 ? "面板不含增益" : undefined}
        />
      </div>

      {/* 表头：宽窗口才显示 */}
      <div
        aria-hidden="true"
        className="-mx-3 mt-4 hidden items-center gap-2 px-3 text-[11.5px] text-paper-3 @min-[880px]:flex"
      >
        <span className="w-[64px] shrink-0">部位</span>
        <span className="min-w-0 flex-1">装备</span>
        <span className="w-[150px] shrink-0">附魔</span>
        <span className="w-[80px] shrink-0">精炼</span>
        <span className="w-[196px] shrink-0">镶嵌</span>
        <span className="w-[124px] shrink-0">大附魔</span>
        <span className="w-7 shrink-0" />
      </div>

      <div className="-mx-3 mt-1 divide-y divide-paper/[0.07]">
        {draft.slots.map(slot => {
          const saved = lo.slots.find(s => s.key === slot.key)!;
          const big = BIG_SLOTS.find(b => b.key === slot.key);
          const bigChanged = !!big && draft.big[big.key] !== lo.big[big.key];
          const changed = !sameSlot(saved, slot) || bigChanged;
          const enchants = enchantOptions(main, slot.key);
          return (
            <div
              key={slot.key}
              ref={el => {
                rows.current[slot.key] = el;
              }}
              className={cn(
                "group/row relative flex flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors @min-[880px]:flex-row @min-[880px]:items-center @min-[880px]:gap-2",
                lit === slot.key &&
                  "bg-cinnabar/[0.08] ring-1 ring-inset ring-cinnabar/30"
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "flex w-[64px] shrink-0 items-center text-[12.5px]",
                    changed ? "text-paper" : "text-paper-3"
                  )}
                >
                  {/* 改动圆点放在左侧留白里，部位名和页标题对齐 */}
                  <span
                    className={cn(
                      "absolute left-1 top-6 h-1.5 w-1.5 -translate-y-1/2 rounded-full @min-[880px]:top-1/2",
                      changed ? "bg-cinnabar" : "bg-transparent"
                    )}
                    aria-hidden="true"
                  />
                  {slot.label}
                  {changed && <span className="sr-only">（已改）</span>}
                </span>
                <EquipPicker
                  lo={lo}
                  ev={ev}
                  slot={slot}
                  main={main}
                  pool={db ? poolFor(db, slot.key, lo.xinfa, main) : null}
                  filter={filter}
                  onPick={def => setSlot(slot.key, s => equipSlot(s, def))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-[72px] @min-[880px]:flex-nowrap @min-[880px]:pl-0">
                {/* 附魔 */}
                <div className="w-[150px] shrink-0">
                  {enchants.length ? (
                    <SelectBox
                      aria-label={`${slot.label}附魔`}
                      value={slot.enchant ?? ""}
                      onChange={e =>
                        setSlot(slot.key, s => ({
                          ...s,
                          enchant: e.target.value || null,
                        }))
                      }
                      className={selectCls}
                      wrapClassName="w-full"
                    >
                      <option value="">不附</option>
                      {enchants.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </SelectBox>
                  ) : (
                    <span className="block px-2.5 text-[12px] text-paper-3/60">
                      —
                    </span>
                  )}
                </div>

                {/* 精炼 */}
                <div className="w-[80px] shrink-0">
                  {slot.def ? (
                    <SelectBox
                      aria-label={`${slot.label}精炼`}
                      value={slot.refine}
                      onChange={e =>
                        setSlot(slot.key, s =>
                          refineSlot(s, Number(e.target.value))
                        )
                      }
                      className={selectCls}
                      wrapClassName="w-full"
                    >
                      {Array.from(
                        { length: maxRefine(slot.def) + 1 },
                        (_, i) => maxRefine(slot.def!) - i
                      ).map(n => (
                        <option key={n} value={n}>
                          精 {n}
                        </option>
                      ))}
                    </SelectBox>
                  ) : (
                    <span className="block px-2.5 text-[12px] text-paper-3">
                      精 {slot.refine}
                    </span>
                  )}
                </div>

                {/* 镶嵌：每个孔一个 */}
                <div className="flex w-[196px] shrink-0 gap-1.5">
                  {slot.def && slot.def.holes.length ? (
                    slot.def.holes.map((h, i) => (
                      <SelectBox
                        key={i}
                        aria-label={`${slot.label}镶嵌孔 ${i + 1}（${h}）`}
                        title={`${h} ${slot.gems[i]} 级`}
                        value={slot.gems[i] ?? 0}
                        onChange={e =>
                          setSlot(slot.key, s =>
                            gemSlot(s, i, Number(e.target.value))
                          )
                        }
                        className={gemCls}
                        wrapClassName="shrink-0"
                        chevron={false}
                      >
                        {Array.from(
                          { length: GEM_MAX + 1 },
                          (_, k) => GEM_MAX - k
                        ).map(lv => (
                          <option key={lv} value={lv}>
                            {lv
                              ? `${attrShort(h)} ${lv}`
                              : `${attrShort(h)} 空`}
                          </option>
                        ))}
                      </SelectBox>
                    ))
                  ) : (
                    <span className="px-2.5 text-[12px] text-paper-3/60">
                      —
                    </span>
                  )}
                </div>

                {/* 大附魔 */}
                <div className="w-[124px] shrink-0">
                  {big ? (
                    <SelectBox
                      aria-label={`${slot.label}大附魔（${big.label}）`}
                      title={big.effect}
                      value={draft.big[big.key]}
                      onChange={e =>
                        onDraft({
                          ...draft,
                          big: {
                            ...draft.big,
                            [big.key]: Number(e.target.value) as BigLevel,
                          },
                        })
                      }
                      className={selectCls}
                      wrapClassName="w-full"
                    >
                      {([2, 1, 0] as BigLevel[]).map(lv => (
                        <option key={lv} value={lv}>
                          {lv ? `${big.label} ${BIG_LEVEL_LABEL[lv]}` : "不附"}
                        </option>
                      ))}
                    </SelectBox>
                  ) : (
                    <span className="block px-2.5 text-[12px] text-paper-3/60">
                      —
                    </span>
                  )}
                </div>

                <div className="w-7 shrink-0">
                  {changed && (
                    <IconBtn
                      label={`还原${slot.label}`}
                      onClick={() =>
                        onDraft({
                          ...draft,
                          slots: draft.slots.map(s =>
                            s.key === slot.key ? saved : s
                          ),
                          big: big
                            ? { ...draft.big, [big.key]: lo.big[big.key] }
                            : draft.big,
                        })
                      }
                      className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 五彩石：镶在主武器上 */}
        <div className="flex flex-col gap-1.5 px-2 py-3 @min-[880px]:flex-row @min-[880px]:items-start @min-[880px]:gap-2">
          <span
            className={cn(
              "flex w-[64px] shrink-0 items-center gap-1.5 pt-1.5 text-[12.5px]",
              draft.stone !== lo.stone ? "text-paper" : "text-paper-3"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                draft.stone !== lo.stone ? "bg-cinnabar" : "bg-transparent"
              )}
              aria-hidden="true"
            />
            五彩石
          </span>
          <div className="min-w-0 flex-1">
            <StonePicker
              main={main}
              value={draft.stone}
              gain={name => cfgPct({ ...cfg, stone: name })}
              onChange={stone => onDraft({ ...draft, stone })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 一键操作：都只改草稿 */
export function useQuickActions(
  lo: Loadout,
  draft: GearDraft,
  onDraft: (d: GearDraft) => void
) {
  const main = primaryAttr(lo.xinfa);
  const onGems = (lv: number) =>
    onDraft({
      ...draft,
      slots: draft.slots.map(s =>
        s.def ? s.gems.reduce((x, _, i) => gemSlot(x, i, lv), s) : s
      ),
    });
  const onRefine = () =>
    onDraft({
      ...draft,
      slots: draft.slots.map(s =>
        s.def ? refineSlot(s, maxRefine(s.def)) : s
      ),
    });
  const onBig = (lv: BigLevel) =>
    onDraft({
      ...draft,
      big: { hat: lv, coat: lv, belt: lv, wrist: lv, shoes: lv },
    });
  const onBest = () => {
    let d = draft;
    for (const key of draft.slots.map(s => s.key)) {
      const opts = enchantOptions(main, key);
      if (!opts.length) continue;
      const e = evalDraft(lo, d);
      const c = configOf(d);
      const best = opts
        .map(o => ({
          id: o.id,
          p: changePct(
            lo,
            e,
            configDelta(main, c, {
              ...c,
              enchants: { ...c.enchants, [key]: o.id },
            })
          ),
        }))
        .sort((a, b) => b.p - a.p)[0];
      d = {
        ...d,
        slots: d.slots.map(x =>
          x.key === key ? { ...x, enchant: best.id } : x
        ),
      };
    }
    const e = evalDraft(lo, d);
    const c = configOf(d);
    const stone = stonesFor(main)
      .map(st => ({
        name: st.name,
        p: changePct(lo, e, configDelta(main, c, { ...c, stone: st.name })),
      }))
      .sort((a, b) => b.p - a.p)[0];
    onDraft({ ...d, stone: stone?.name ?? d.stone });
  };
  return { onGems, onRefine, onBig, onBest };
}

export function QuickMenu({
  onGems,
  onRefine,
  onBig,
  onBest,
}: {
  onGems: (lv: number) => void;
  onRefine: () => void;
  onBig: (lv: BigLevel) => void;
  onBest: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const item = (label: string, run: () => void) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        run();
        setOpen(false);
      }}
      className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] text-paper-2 hover:bg-paper/[0.06] hover:text-paper focus-visible:bg-paper/[0.06] focus-visible:outline-none"
    >
      {label}
    </button>
  );
  const sep = (k: string) => (
    <div key={k} className="my-1 h-px bg-paper/[0.07]" role="separator" />
  );
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-paper-2 ring-1 ring-inset ring-paper/10 transition-colors hover:text-paper hover:ring-paper/20"
      >
        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
        一键
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        width={220}
        label="一键操作"
      >
        <div role="menu" aria-label="一键操作" className="p-1">
          {item("附魔、五彩石挑收益最高", onBest)}
          {sep("a")}
          {item("五行石全部 8 级", () => onGems(8))}
          {item("五行石全部 7 级", () => onGems(7))}
          {item("五行石全部 6 级", () => onGems(6))}
          {item("精炼全部满级", onRefine)}
          {sep("b")}
          {item("大附魔全英雄", () => onBig(2))}
          {item("大附魔全普通", () => onBig(1))}
          {item("去掉大附魔", () => onBig(0))}
        </div>
      </Anchored>
    </>
  );
}
