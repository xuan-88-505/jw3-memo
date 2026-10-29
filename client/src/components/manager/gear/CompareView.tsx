import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  GitCompare,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { XinfaMark } from "@/components/brand/Marks";
import { Btn, IconBtn, Segmented } from "@/components/common/ui";
import type { GearSlot, Loadout } from "@/data/gear";
import { buffedDps, buffLabel } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { useProto } from "@/state/store";
import { EmptyState, SelectBox } from "../shared";
import { fmt } from "./Dashboard";
import { ItemTile } from "./ItemTile";
import { BigIcon, ExtrasLine, extrasDiffer, slotExtras } from "./EnchantBits";
import { panelRows, panelSame, showPanelValue } from "./panelRows";

type BuffMode = "same" | "own";

type Row = {
  key: string;
  label: string;
  a: number;
  b: number;
  /** pct：百分比属性；int：整数 */
  unit: "pct" | "int";
  /** 显示在数值后面的段位，例如加速 */
  suffix?: [string, string];
};

const show = showPanelValue;

function Diff({
  d,
  unit,
  pct,
}: {
  d: number;
  unit: Row["unit"];
  pct?: number;
}) {
  // 百分比属性保留两位小数，避免 0.004 这种噪声显示成差异
  const zero = unit === "pct" ? Math.abs(d) < 0.005 : d === 0;
  if (zero)
    return (
      <span className="text-paper-3" aria-label="相同">
        —
      </span>
    );
  const up = d > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  const abs = Math.abs(d);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-medium",
        up ? "text-jade" : "text-cinnabar-text"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{up ? "高" : "低"}</span>
      {unit === "pct" ? `${abs.toFixed(2)}%` : fmt(abs)}
      {pct != null && (
        <span className="ml-0.5 font-normal opacity-80">
          ({Math.abs(pct).toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function slotDiffers(a: GearSlot, b: GearSlot) {
  return (
    a.item.name !== b.item.name || a.item.tags.join() !== b.item.tags.join()
  );
}

function ItemCell({
  lo,
  slot,
  dim,
}: {
  lo: Loadout;
  slot: GearSlot;
  dim?: boolean;
}) {
  const big = slotExtras(lo, slot).big;
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2.5", dim && "opacity-55")}
    >
      <ItemTile
        text={slot.short}
        iconId={slot.item.iconId}
        quality={slot.item.quality}
        size={28}
      />
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-paper">
          <span className="truncate">{slot.item.tags.join(" · ")}</span>
          {big && big.level > 0 && (
            <BigIcon level={big.level as 1 | 2} label={big.label} size={14} />
          )}
        </p>
        <ExtrasLine lo={lo} slot={slot} />
      </div>
    </div>
  );
}

/**
 * 两套配装对比。只比较同一心法：不同心法的秒伤和属性没有可比性。
 * A 是正在看的配装，B 从同心法的其他配装里选。
 */
export function CompareView({
  a,
  bId,
  onPickB,
  onSwap,
  onOpen,
  onCreate,
}: {
  a: Loadout;
  bId: string | null;
  onPickB: (id: string) => void;
  /** 交换 A 和 B：B 变成正在看的配装 */
  onSwap: (bId: string) => void;
  /** 回到看板查看这套 */
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { state } = useProto();
  const [mode, setMode] = useState<BuffMode>("same");
  const [showAll, setShowAll] = useState(false);
  const others = Object.values(state.loadouts).filter(
    l => l.xinfa === a.xinfa && l.id !== a.id
  );
  const b = others.find(l => l.id === bId) ?? others[0];

  if (!b) {
    return (
      <EmptyState
        icon={<GitCompare className="h-5 w-5" />}
        title={`${a.xinfa}只有这一套配装`}
        description="再建一套同心法的配装，就能对比属性"
        action={
          <Btn
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            disabled={state.dataState === "offline"}
            onClick={onCreate}
          >
            新建{a.xinfa}配装
          </Btn>
        }
      />
    );
  }

  const charName = (lo: Loadout) =>
    state.characters.find(c => c.id === lo.charId)?.name;
  const dpsA = buffedDps(a);
  const dpsB = buffedDps(mode === "same" ? { ...b, buffs: a.buffs } : b);

  // 两套里有一套全能不为 0 时，两边都显示全能
  const ra = panelRows(a.xinfa, a.panel, a.haste.value);
  const rb = panelRows(b.xinfa, b.panel, b.haste.value);
  const keys = [...ra, ...rb].map(r => r.key);
  const order = panelRows(a.xinfa, { ...a.panel, versatility: 1 }, 0).map(
    r => r.key
  );
  const rows: Row[] = order
    .filter(k => keys.includes(k))
    .map(k => {
      const x = ra.find(r => r.key === k);
      const y = rb.find(r => r.key === k);
      const base = (x ?? y)!;
      return {
        key: k,
        label: base.label,
        a: x?.value ?? 0,
        b: y?.value ?? 0,
        unit: base.unit,
        suffix: k === "haste" ? [a.haste.tier, b.haste.tier] : undefined,
      };
    });
  const slotPairs = a.slots.map(s => ({
    a: s,
    b: b.slots.find(x => x.key === s.key) ?? s,
  }));
  const partDiffers = (p: { a: GearSlot; b: GearSlot }) =>
    slotDiffers(p.a, p.b) || extrasDiffer(a, p.a, b, p.b);
  const changed = slotPairs.filter(partDiffers);
  const listedSlots = showAll ? slotPairs : changed;

  const cell = "px-3 py-2.5 text-right tabular-nums";

  return (
    <div className="space-y-6">
      <div className="-mx-3">
        <table className="w-full table-fixed text-[13px]">
          <caption className="sr-only">
            {a.name} 和 {b.name} 的属性对比，差值是 B 减 A
          </caption>
          <colgroup>
            <col className="w-[104px]" />
            <col />
            <col />
            <col className="w-[168px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-paper/[0.07] align-top">
              <th scope="col" className="px-3 pb-3 pt-4 text-left">
                <span className="sr-only">属性</span>
                <IconBtn
                  label="交换 A 和 B"
                  onClick={() => onSwap(b.id)}
                  className="-ml-1.5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </IconBtn>
              </th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-normal">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[11px] font-semibold text-paper-3">
                    A
                  </span>
                  <XinfaMark xinfa={a.xinfa} size={18} />
                  <span className="truncate font-serif text-[14px] font-semibold text-paper">
                    {a.name}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11.5px] text-paper-3">
                  {charName(a) ?? "未关联角色"} · {buffLabel(a.buffs)}
                </p>
              </th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-normal">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[11px] font-semibold text-paper-3">
                    B
                  </span>
                  <XinfaMark xinfa={b.xinfa} size={18} />
                  <SelectBox
                    aria-label="选择 B"
                    value={b.id}
                    onChange={e => onPickB(e.target.value)}
                    wrapClassName="min-w-0 max-w-full"
                    className="h-7 truncate rounded-md bg-transparent pl-1 font-serif text-[14px] font-semibold text-paper ring-1 ring-inset ring-paper/12 hover:ring-paper/20 focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60"
                  >
                    {others.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </SelectBox>
                </div>
                <p className="mt-1 truncate text-[11.5px] text-paper-3">
                  {charName(b) ?? "未关联角色"} ·{" "}
                  {mode === "same" ? `按 A 的增益` : buffLabel(b.buffs)}
                  <button
                    type="button"
                    onClick={() => onOpen(b.id)}
                    className="ml-2 text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
                  >
                    查看
                  </button>
                </p>
              </th>
              <th
                scope="col"
                className="px-3 pb-3 pt-4 text-right text-[11.5px] font-normal text-paper-3"
              >
                <div className="flex justify-end">
                  <Segmented
                    size="xs"
                    label="增益"
                    value={mode}
                    onChange={setMode}
                    options={[
                      {
                        value: "same",
                        label: "同样增益",
                        title: "B 也按 A 的增益算秒伤，比较更公平",
                      },
                      {
                        value: "own",
                        label: "各自增益",
                        title: "各自按自己选的增益算秒伤",
                      },
                    ]}
                  />
                </div>
                <p className="mt-1.5">B − A</p>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-paper/[0.07]">
              <th
                scope="row"
                className="px-3 py-3.5 text-left font-normal text-paper-2"
              >
                秒伤
              </th>
              <td
                className={cn(
                  cell,
                  "py-3.5 font-serif text-[18px] font-semibold text-paper"
                )}
              >
                {fmt(dpsA)}
              </td>
              <td
                className={cn(
                  cell,
                  "py-3.5 font-serif text-[18px] font-semibold text-paper"
                )}
              >
                {fmt(dpsB)}
              </td>
              <td className={cn(cell, "py-3.5")}>
                <Diff
                  d={dpsB - dpsA}
                  unit="int"
                  pct={((dpsB - dpsA) / dpsA) * 100}
                />
              </td>
            </tr>
            {rows.map(r => {
              const d = r.b - r.a;
              const same = panelSame(d, r.unit);
              return (
                <tr
                  key={r.key}
                  className="border-b border-paper/[0.07] last:border-0"
                >
                  <th
                    scope="row"
                    className="px-3 py-2.5 text-left font-normal text-paper-2"
                  >
                    {r.label}
                  </th>
                  <td
                    className={cn(cell, same ? "text-paper-3" : "text-paper")}
                  >
                    {show(r.a, r.unit)}
                    {r.suffix && (
                      <span className="ml-1.5 text-paper-3">{r.suffix[0]}</span>
                    )}
                  </td>
                  <td
                    className={cn(cell, same ? "text-paper-3" : "text-paper")}
                  >
                    {show(r.b, r.unit)}
                    {r.suffix && (
                      <span className="ml-1.5 text-paper-3">{r.suffix[1]}</span>
                    )}
                  </td>
                  <td className={cell}>
                    <Diff d={d} unit={r.unit} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section
        aria-label="装备差异"
        className="border-t border-paper/[0.07] pt-6"
      >
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-[14px] font-medium text-paper">
            {changed.length
              ? `${changed.length} 个部位不同`
              : "装备和附魔完全相同"}
          </h3>
          {changed.length > 0 && changed.length < slotPairs.length && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              aria-expanded={showAll}
              className="text-[12px] text-paper-3 hover:text-paper"
            >
              {showAll ? "只看不同" : `显示全部 ${slotPairs.length} 个部位`}
            </button>
          )}
        </div>
        {listedSlots.length > 0 && (
          <ul className="-mx-2.5">
            {listedSlots.map(p => {
              const diff = partDiffers(p);
              return (
                <li
                  key={p.a.key}
                  className="grid grid-cols-[92px_1fr_1fr] items-center gap-3 rounded-lg px-2.5 py-2"
                >
                  <span
                    className={cn(
                      "text-[12px]",
                      diff ? "text-paper-2" : "text-paper-3"
                    )}
                  >
                    {p.a.label}
                  </span>
                  <ItemCell lo={a} slot={p.a} dim={!diff} />
                  <ItemCell lo={b} slot={p.b} dim={!diff} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11.5px] text-paper-3">
        面板属性不含增益；秒伤是木桩估算值
      </p>
    </div>
  );
}
