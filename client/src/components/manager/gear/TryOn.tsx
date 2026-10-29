import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  swapPanel,
  type Candidate,
  type GearSlot,
  type Loadout,
  type SlotGroup,
} from "@/data/gear";
import { Btn } from "@/components/common/ui";
import { buffedDps, buffFactor } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { Delta, fmt } from "./Dashboard";
import { BigIcon, ExtrasLine, slotExtras } from "./EnchantBits";
import { PanelStrip } from "./PanelStrip";

const GROUPS: SlotGroup[] = ["防具", "饰品", "武器"];

const QUALITY = {
  purple: "bg-[#7A64B8]/20 text-[#C9B8F2] ring-[#7A64B8]/40",
  orange: "bg-[#C98A3E]/20 text-[#F0C48A] ring-[#C98A3E]/45",
} as const;

/** 品质描边，盖在图标上面 */
const QUALITY_EDGE = {
  purple: "ring-[#9A84E0]/75",
  orange: "ring-[#E0A04A]/85",
} as const;

/** 装备图标：有图标编号时显示游戏图标，加载失败或没有编号时显示部位的一个字 */
export function ItemTile({
  text,
  iconId,
  quality,
  size = 30,
}: {
  text: string;
  iconId?: number;
  quality: keyof typeof QUALITY;
  size?: number;
}) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const showImg = iconId != null && failedId !== iconId;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-md font-serif ring-1 ring-inset",
        QUALITY[quality]
      )}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {showImg ? (
        <>
          <img
            src={`https://icon.jx3box.com/icon/${iconId}.png`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            draggable={false}
            onError={() => setFailedId(iconId)}
            className="h-full w-full object-cover"
          />
          <span
            className={cn(
              "pointer-events-none absolute inset-0 rounded-md ring-[1.5px] ring-inset",
              QUALITY_EDGE[quality]
            )}
          />
        </>
      ) : (
        text
      )}
    </span>
  );
}

function slotBest(lo: Loadout, key: string) {
  return Math.max(
    0,
    ...(lo.candidates[key] ?? []).filter(c => !c.current).map(c => c.pct)
  );
}

export function TryOn({
  loadout: lo,
  initial,
  onApply,
}: {
  loadout: Loadout;
  initial?: { slotKey: string; candId?: string } | null;
  onApply: (slotKey: string, candId: string) => void;
}) {
  const [slotKey, setSlotKey] = useState(initial?.slotKey ?? lo.slots[0].key);
  const [trying, setTrying] = useState<{
    slotKey: string;
    candId: string;
  } | null>(
    initial?.candId
      ? { slotKey: initial.slotKey, candId: initial.candId }
      : null
  );

  const slot = lo.slots.find(s => s.key === slotKey) ?? lo.slots[0];
  const list = lo.candidates[slot.key] ?? [];
  const others = list.filter(c => !c.current);
  const tried = trying
    ? lo.candidates[trying.slotKey]?.find(c => c.id === trying.candId)
    : undefined;
  const triedSlot = trying
    ? lo.slots.find(s => s.key === trying.slotKey)
    : undefined;
  // 秒伤按当前增益显示，和看板一致
  const cur = buffedDps(lo);
  const after = tried ? Math.round(cur * (1 + tried.pct / 100)) : cur;
  const preview =
    tried && trying
      ? swapPanel(lo, trying.slotKey, tried.tags)
      : { panel: lo.panel, hasteValue: lo.haste.value };

  const pick = (c: Candidate) => {
    if (c.current) setTrying(null);
    else setTrying({ slotKey: slot.key, candId: c.id });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 面板属性；试穿时显示换上后的面板，变了的标出涨跌 */}
      <PanelStrip
        xinfa={lo.xinfa}
        panel={preview.panel}
        hasteValue={preview.hasteValue}
        base={
          tried ? { panel: lo.panel, hasteValue: lo.haste.value } : undefined
        }
        note={buffFactor(lo) > 1.00005 ? "不含增益" : undefined}
        className={cn(
          "shrink-0 transition-colors",
          tried && "bg-jade/[0.05] ring-jade/25"
        )}
        footer={
          tried && triedSlot ? (
            <div
              className="flex items-center gap-3 border-t border-jade/15 px-4 py-2.5"
              aria-live="polite"
            >
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-paper-3">
                <span className="text-paper-2">
                  {triedSlot.label} → {tried.name.split(" · ")[1] ?? tried.name}
                </span>
                <span className="ml-3 tabular-nums">{fmt(cur)}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only">试穿后</span>
                <span className="font-medium tabular-nums text-paper">
                  {fmt(after)}
                </span>
                <Delta pct={tried.pct} className="ml-2 text-[12.5px]" />
              </p>
              <Btn
                variant="ghost"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => setTrying(null)}
              >
                撤销
              </Btn>
              <Btn
                variant="primary"
                icon={<Check className="h-3.5 w-3.5" />}
                onClick={() => {
                  onApply(trying!.slotKey, trying!.candId);
                  setTrying(null);
                }}
              >
                应用到配装
              </Btn>
            </div>
          ) : null
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-[236px_1fr] gap-3">
        {/* 部位 */}
        <nav
          aria-label="部位"
          className="scroll-thin min-h-0 overflow-y-auto rounded-xl bg-ink-3 p-1.5 ring-1 ring-inset ring-paper/8"
        >
          {GROUPS.map(g => (
            <div key={g} className="mb-1 last:mb-0">
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium tracking-[0.12em] text-paper-3">
                {g}
              </p>
              <ul>
                {lo.slots
                  .filter(s => s.group === g)
                  .map(s => (
                    <SlotRow
                      key={s.key}
                      lo={lo}
                      slot={s}
                      best={slotBest(lo, s.key)}
                      active={s.key === slot.key}
                      trying={trying?.slotKey === s.key}
                      onClick={() => setSlotKey(s.key)}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* 候选 */}
        <section
          aria-label={`${slot.label} 的候选装备`}
          className="flex min-h-0 flex-col rounded-xl bg-ink-3 ring-1 ring-inset ring-paper/8"
        >
          <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-paper/[0.06] px-4 py-3">
            <h3 className="text-[13.5px] font-medium text-paper">
              {slot.label}
              <span className="ml-2 text-[12px] font-normal text-paper-3">
                {others.length} 件候选
              </span>
            </h3>
            <span className="text-[11.5px] text-paper-3">按秒伤提升排序</span>
          </div>
          {others.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <p className="text-[13px] text-paper-2">
                  暂时没有比当前更合适的候选
                </p>
                <p className="mt-1 text-[12px] text-paper-3">
                  候选来自魔盒装备库，只看本赛季 PVE 装备
                </p>
              </div>
            </div>
          ) : (
            <ul className="scroll-thin min-h-0 flex-1 divide-y divide-paper/[0.05] overflow-y-auto p-1.5">
              {list.map((c, i) => (
                <CandidateRow
                  key={c.id}
                  cand={c}
                  short={slot.short}
                  isBest={i === 0 && c.pct > 0}
                  selected={trying?.candId === c.id}
                  onClick={() => pick(c)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SlotRow({
  lo,
  slot,
  best,
  active,
  trying,
  onClick,
}: {
  lo: Loadout;
  slot: GearSlot;
  best: number;
  active: boolean;
  trying: boolean;
  onClick: () => void;
}) {
  const big = slotExtras(lo, slot).big;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
          active ? "bg-paper/[0.08]" : "hover:bg-paper/[0.04]"
        )}
      >
        <ItemTile
          text={slot.short}
          iconId={slot.item.iconId}
          quality={slot.item.quality}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] text-paper">
            {slot.label}
            {big && big.level > 0 && (
              <BigIcon level={big.level as 1 | 2} label={big.label} size={15} />
            )}
            {trying && (
              <span className="rounded bg-jade/15 px-1 text-[10.5px] text-jade">
                试穿中
              </span>
            )}
          </span>
          <span className="block truncate text-[11.5px] text-paper-2/80">
            {slot.item.tags.join(" ")}
          </span>
          <ExtrasLine lo={lo} slot={slot} className="mt-0.5" />
        </span>
        {best > 0 && <Delta pct={best} className="shrink-0 text-[11.5px]" />}
      </button>
    </li>
  );
}

function CandidateRow({
  cand: c,
  short,
  isBest,
  selected,
  onClick,
}: {
  cand: Candidate;
  short: string;
  isBest: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li className="py-0.5">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={c.current ? undefined : selected}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
          selected
            ? "bg-jade/[0.07] ring-jade/35"
            : "ring-transparent hover:bg-paper/[0.04]"
        )}
      >
        <ItemTile
          text={short}
          iconId={c.iconId}
          quality={c.quality}
          size={34}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13.5px] font-medium text-paper">
              {c.name}
            </span>
            {isBest && (
              <span className="rounded bg-jade/15 px-1.5 text-[10.5px] font-medium text-jade">
                最佳
              </span>
            )}
            {c.current && (
              <span className="rounded bg-paper/[0.08] px-1.5 text-[10.5px] text-paper-2">
                当前
              </span>
            )}
            {selected && (
              <span className="rounded bg-jade/15 px-1.5 text-[10.5px] text-jade">
                试穿中
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-paper-3">
            {c.source}
          </span>
          {c.effects.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
              {c.effects.map(e => (
                <span
                  key={e.label}
                  className={e.up ? "text-jade" : "text-cinnabar-text"}
                >
                  {e.label} <span className="tabular-nums">{e.value}</span>
                </span>
              ))}
            </span>
          )}
          {c.note && (
            <span className="mt-1 block text-[11.5px] text-gold">{c.note}</span>
          )}
        </span>
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-medium tabular-nums",
            c.current
              ? "text-paper-3"
              : c.pct > 0
                ? "bg-jade/12 text-jade"
                : "bg-cinnabar/12 text-cinnabar-text"
          )}
        >
          {c.current
            ? "±0"
            : `${c.pct > 0 ? "+" : "−"}${Math.abs(c.pct).toFixed(2)}%`}
        </span>
      </button>
    </li>
  );
}
