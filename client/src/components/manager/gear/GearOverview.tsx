import { ChevronRight, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Btn } from "@/components/common/ui";
import { XinfaMark } from "@/components/brand/Marks";
import {
  SOURCE_LABEL,
  comparableHistory,
  type GearSlot,
  type Loadout,
} from "@/data/gear";
import { buffLabel, estimateBuffs } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { monthDay, tx } from "@/lib/i18n";
import { fromCalc } from "@/lib/dpsCalc";
import { needsSeasonSync, useSeasonSyncRunning } from "@/lib/calcEngine";
import { Delta, HistoryPanel, fmt } from "./Dashboard";
import { BigIcon, slotExtras } from "./EnchantBits";
import { ItemTile, QUALITY_TEXT } from "./ItemTile";
import { panelRows, showPanelValue } from "./panelRows";
import { seasonNote } from "./seasonNote";

/** 左列放防具，右列放饰品和武器，和游戏里角色界面的排法一样 */
const ARMOR = ["hat", "coat", "belt", "wrist", "pants", "shoes"];
const HISTORY_KEY = "tongdiao.gear.historyOpen.v1";
const blockTitle = "text-[12.5px] font-medium text-paper-2";

function SlotRow({
  lo,
  slot,
  missing,
  onOpen,
}: {
  lo: Loadout;
  slot: GearSlot;
  /** 原版计算器的装备库里没有这件，装分和秒伤没算它 */
  missing: boolean;
  onOpen: () => void;
}) {
  const x = slotExtras(lo, slot);
  // 数值来自原版计算器时，小附魔用计算器里的简写（备忘录的附魔表是上赛季的数值）
  const enchant = fromCalc(lo)
    ? (lo.calc?.enchants?.[slot.key] ?? null)
    : x.enchant;
  const extras = [enchant, x.stone?.label].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={tx("在配装器里换这件")}
      aria-label={tx(
        "{0}：{1}，换装备",
        slot.label,
        slot.item.name || tx("未装备")
      )}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-[7px] text-left transition-colors hover:bg-paper/[0.04]"
    >
      <ItemTile
        text={slot.short}
        iconId={slot.item.iconId}
        quality={slot.item.quality}
        size={40}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span
            className={cn(
              "text-[13.5px] font-medium [overflow-wrap:anywhere]",
              QUALITY_TEXT[slot.item.quality]
            )}
          >
            {slot.item.name || (
              <span className="font-normal text-paper-3">{tx("未装备")}</span>
            )}
          </span>
          {x.big?.level ? (
            <BigIcon
              level={x.big.level as 1 | 2}
              label={x.big.label}
              size={15}
            />
          ) : null}
        </span>
        {/* 第二行放不下就换行，不截断 */}
        <span className="mt-0.5 block text-[11.5px] leading-[17px] text-paper-3 [overflow-wrap:anywhere]">
          {slot.label}
          <span className="mx-1" aria-hidden="true">
            ·
          </span>
          {slot.item.detail && (
            <span className="tabular-nums">{slot.item.detail}</span>
          )}
          {extras && (
            <>
              <span className="mx-1" aria-hidden="true">
                ·
              </span>
              {extras}
            </>
          )}
          {missing && (
            <span className="ml-1.5 text-gold">
              {tx("计算器里没有这件，没算进去")}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * 配装页主栏，从上到下：配装名和操作、面板（装分最大，木桩秒伤只是一行小字）、
 * 12 件装备、秒伤变化（默认收起）。
 */
export function GearOverview({
  lo,
  charName,
  dirty,
  offline,
  onEdit,
  onReimport,
  onOpenEditor,
  onOpenBuffs,
  onOpenChangelog,
}: {
  lo: Loadout;
  charName?: string;
  /** 配装器里有没保存的改动 */
  dirty: boolean;
  offline: boolean;
  onEdit: () => void;
  onReimport: () => void;
  /** 传部位就打开配装器并定位到这个部位 */
  onOpenEditor: (slotKey?: string) => void;
  onOpenBuffs: () => void;
  onOpenChangelog: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(
    () => localStorage.getItem(HISTORY_KEY) === "1"
  );
  const toggleHistory = () =>
    setHistoryOpen(v => {
      localStorage.setItem(HISTORY_KEY, v ? "0" : "1");
      return !v;
    });

  const est = estimateBuffs(lo, lo.buffs);
  const buffed = est.pct > 0.00005;
  const D = (n: number) => Math.round(n * (1 + est.pct));
  // 换成原版计算器之前的点是估算的，数量级不同，不拿来算涨跌
  const history = comparableHistory(lo.history);
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const last = history[history.length - 1];
  const deltaPct = prev ? ((lo.dps - prev.dps) / prev.dps) * 100 : 0;
  // 数值来自原版计算器时：它的面板里没有破招，不显示；百分比用计算器算好的
  const calc = fromCalc(lo);
  const missing = new Set(calc ? (lo.calc?.missing ?? []) : []);
  const rows = panelRows(
    lo.xinfa,
    lo.panel,
    lo.haste.value,
    calc ? lo.calc?.pct : undefined
  ).filter(r => r.key !== "score" && !(calc && r.key === "surplus"));
  const armor = lo.slots.filter(s => ARMOR.includes(s.key));
  const others = lo.slots.filter(s => !ARMOR.includes(s.key));
  // 正在换成当季：数值还是上赛季的，淡显，等换完
  const syncing = useSeasonSyncRunning() && needsSeasonSync(lo);
  const note = seasonNote(lo);

  return (
    <div className="@container">
      {/* 标题行：放不下时按钮整组换到下一行，标题不截断 */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <XinfaMark xinfa={lo.xinfa} size={36} />
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight text-paper [overflow-wrap:anywhere]">
              {lo.name}
            </h2>
            <p className="mt-1 text-[12px] text-paper-3">
              {charName ? `${charName} · ${lo.xinfa}` : lo.xinfa}
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              {lo.source === "manual"
                ? tx("{0} 手动新建", monthDay(new Date(lo.importedAt)))
                : tx(
                    "{0} 从{1}导入",
                    monthDay(new Date(lo.importedAt)),
                    SOURCE_LABEL[lo.source]
                  )}
              {lo.sample && (
                <span className="ml-2 rounded bg-paper/[0.07] px-1.5 py-px text-[11px] text-paper-2">
                  {tx("示例数据")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Btn
            variant="ghost"
            size="md"
            aria-label={tx("编辑配装")}
            title={tx("编辑配装")}
            className="w-8 px-0"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={onEdit}
          />
          {lo.source !== "manual" && (
            <Btn
              variant="ghost"
              size="md"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              disabled={offline}
              title={offline ? tx("离线时不能导入") : undefined}
              onClick={onReimport}
            >
              {tx("重新导入")}
            </Btn>
          )}
          <Btn
            variant="primary"
            size="md"
            title={dirty ? tx("有没保存的改动") : undefined}
            onClick={() => onOpenEditor()}
          >
            {tx("打开配装器")}
            {dirty && (
              <span
                className="ml-0.5 h-1.5 w-1.5 rounded-full bg-paper"
                aria-label={tx("有没保存的改动")}
              />
            )}
          </Btn>
        </div>
      </header>

      {/* 面板：装分最显眼，秒伤是估算值，只放一行小字 */}
      <section
        aria-label={tx("面板")}
        aria-busy={syncing || undefined}
        className={cn("mt-7 transition-opacity", syncing && "opacity-40")}
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-[12.5px] text-paper-3">{tx("装分")}</p>
            <p className="mt-1 text-[40px] font-semibold leading-none tabular-nums text-paper">
              {fmt(lo.panel.score)}
            </p>
          </div>
          {syncing ? (
            <p className="flex items-center gap-1.5 pb-[3px] text-[12.5px] text-paper-3">
              <Loader2
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {tx("正在换成当季装备库…")}
            </p>
          ) : (
            <p
              className="pb-[3px] text-[12.5px] text-paper-3"
              title={
                calc
                  ? tx("由内置的原版配装计算器算出")
                  : tx("估算值，以游戏内为准")
              }
            >
              {tx("木桩秒伤")}{" "}
              <span className="tabular-nums text-paper-2">
                {buffed && "≈ "}
                {fmt(D(lo.dps))}
              </span>
              {prev && <Delta pct={deltaPct} className="ml-1.5" />}
              {buffed && (
                <button
                  type="button"
                  onClick={onOpenBuffs}
                  className="ml-1.5 rounded px-1 text-jade transition-colors hover:bg-jade/10"
                >
                  {buffLabel(lo.buffs)}
                </button>
              )}
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              {calc ? tx("原版计算器") : tx("估算")}
            </p>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-4 gap-y-3 rounded-lg bg-paper/[0.03] px-4 py-3">
          {rows.map(r => (
            <div key={r.key} className="min-w-0" title={r.title}>
              <dt className="text-[11.5px] text-paper-3 [overflow-wrap:anywhere]">
                {r.label}
              </dt>
              <dd className="mt-0.5 text-[14px] font-medium tabular-nums text-paper">
                {showPanelValue(r.value, r.unit)}
                {r.key === "haste" && r.sub && (
                  <span className="ml-1.5 text-[11.5px] font-normal text-paper-3">
                    {r.sub}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {buffed && (
          <p className="mt-1.5 text-[11.5px] text-paper-3">{tx("不含增益")}</p>
        )}
      </section>

      {/* 12 件装备：点一件直接到配装器的这个部位 */}
      <section
        aria-label={tx("装备")}
        aria-busy={syncing || undefined}
        className={cn("mt-7 transition-opacity", syncing && "opacity-40")}
      >
        <h3 className={blockTitle}>{tx("装备")}</h3>
        {note && (
          <p className="mt-1 text-[11.5px] leading-[17px] text-paper-3">
            {note}
          </p>
        )}
        <div className="mt-2 grid grid-cols-1 gap-x-6 @xl:grid-cols-2">
          <div>
            {armor.map(s => (
              <SlotRow
                key={s.key}
                lo={lo}
                slot={s}
                missing={missing.has(s.key)}
                onOpen={() => onOpenEditor(s.key)}
              />
            ))}
          </div>
          <div>
            {others.map(s => (
              <SlotRow
                key={s.key}
                lo={lo}
                slot={s}
                missing={missing.has(s.key)}
                onOpen={() => onOpenEditor(s.key)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 秒伤变化：用得少，默认收成一行，点开才画图 */}
      <section aria-label={tx("秒伤变化")} className="mt-7">
        <button
          type="button"
          aria-expanded={historyOpen}
          onClick={toggleHistory}
          className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-paper-3 transition-colors hover:bg-paper/[0.04] hover:text-paper-2"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              historyOpen && "rotate-90"
            )}
            aria-hidden="true"
          />
          {tx("秒伤变化")}
          {!historyOpen && prev && last?.label && (
            <span>
              <span className="mx-1" aria-hidden="true">
                ·
              </span>
              {tx("最近：{0}", tx(last.label))} <Delta pct={deltaPct} />
            </span>
          )}
        </button>
        {historyOpen && (
          <div className="mt-3">
            <HistoryPanel lo={lo} onOpenChangelog={onOpenChangelog} />
          </div>
        )}
      </section>
    </div>
  );
}
