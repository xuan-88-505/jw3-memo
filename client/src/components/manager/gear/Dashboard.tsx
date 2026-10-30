import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { bestUpgrade, primaryAttr, type Loadout } from "@/data/gear";
import { Btn } from "@/components/common/ui";
import { buffLabel, estimateBuffs, hasteWithBuffs } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { DpsChart } from "./DpsChart";
import { useEquipDb } from "./useEquipDb";
import { tx, paren } from "@/lib/i18n";

export const fmt = (n: number) => n.toLocaleString("en-US");

export function Delta({ pct, className }: { pct: number; className?: string }) {
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.005;
  return (
    <span
      className={cn(
        "tabular-nums",
        flat ? "text-paper-3" : up ? "text-jade" : "text-cinnabar-text",
        className
      )}
    >
      {flat ? "±0" : `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%`}
    </span>
  );
}

const sectionTitle = "text-[12.5px] font-medium text-paper-2";

/** 所有秒伤都按当前增益显示，前后可比 */
function useBuffed(lo: Loadout) {
  const est = estimateBuffs(lo, lo.buffs);
  const f = 1 + est.pct;
  return {
    est,
    buffed: est.pct > 0.00005,
    D: (n: number) => Math.round(n * f),
  };
}

/** 右侧顶部：木桩秒伤大号数字，和参考站的「伤害计算」一样放在最上面 */
export function DpsSummary({
  lo,
  meta,
  actions,
  onOpenBuffs,
}: {
  lo: Loadout;
  /** 数字下面的一行小字：导入时间、来源 */
  meta: ReactNode;
  /** 标题行右边的按钮 */
  actions?: ReactNode;
  onOpenBuffs: () => void;
}) {
  const { buffed, D } = useBuffed(lo);
  const prev = lo.history.length > 1 ? lo.history[lo.history.length - 2] : null;
  const deltaPct = prev ? ((lo.dps - prev.dps) / prev.dps) * 100 : 0;
  return (
    <section aria-label={tx("木桩秒伤")}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[13px] text-paper-3">{tx("木桩秒伤")}</h2>
        <div className="flex items-center gap-1.5">{actions}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <p className="text-[38px] font-semibold leading-none tabular-nums text-paper">
          {buffed && <span className="mr-1 text-[26px] text-paper-3">≈</span>}
          {fmt(D(lo.dps))}
        </p>
        <p className="text-[12.5px] text-paper-3">
          {prev ? (
            <>
              <Delta pct={deltaPct} className="font-medium" />
              <span className="ml-1.5">
                {tx("较上次 {0}", fmt(D(prev.dps)))}
              </span>
            </>
          ) : (
            tx("第一次计算")
          )}
        </p>
        {buffed && (
          <button
            type="button"
            onClick={onOpenBuffs}
            className="rounded px-1.5 py-0.5 text-[12px] text-jade transition-colors hover:bg-jade/10"
          >
            {buffLabel(lo.buffs)}
          </button>
        )}
      </div>
      <p className="mt-3 text-[12px] text-paper-3">{meta}</p>
    </section>
  );
}

/** 秒伤变化：折线图 + 最近一次技改 */
export function HistoryPanel({
  lo,
  onOpenChangelog,
}: {
  lo: Loadout;
  onOpenChangelog: () => void;
}) {
  const { D } = useBuffed(lo);
  const patchIdx = lo.history.map(p => p.kind).lastIndexOf("patch");
  const patch = patchIdx > 0 ? lo.history[patchIdx] : null;
  const patchDelta = patch
    ? ((patch.dps - lo.history[patchIdx - 1].dps) /
        lo.history[patchIdx - 1].dps) *
      100
    : 0;
  return (
    <section aria-label={tx("秒伤变化")}>
      <div className="relative h-[260px]">
        <div className="absolute inset-0">
          <DpsChart history={lo.history.map(p => ({ ...p, dps: D(p.dps) }))} />
        </div>
      </div>
      {patch && (
        <button
          type="button"
          onClick={onOpenChangelog}
          className="group -mx-1.5 mt-3 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12.5px] text-paper-3 transition-colors hover:bg-paper/[0.04]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gold"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-paper-2">
              {patch.label && tx(patch.label)}
            </span>
            {patch.detail && <span>{paren(patch.detail)}</span>}
            <span className="mx-1">·</span>
            <Delta pct={patchDelta} />
          </span>
          <span className="shrink-0 transition-colors group-hover:text-paper-2">
            {tx("修改记录")}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

/** 属性收益：收益条 + 加速段位 + 下一步建议 */
export function GainsPanel({
  lo,
  onTry,
}: {
  lo: Loadout;
  /** 把建议的装备放进配装器草稿 */
  onTry: (slotKey: string, itemId: number) => void;
}) {
  const { est, D } = useBuffed(lo);
  const haste = hasteWithBuffs(lo, est.haste);
  const from = haste.from;
  const hastePct = haste.nextValue
    ? Math.min(
        100,
        Math.max(3, ((haste.value - from) / (haste.nextValue - from)) * 100)
      )
    : 100;
  const { db } = useEquipDb(primaryAttr(lo.xinfa));
  const best = useMemo(() => (db ? bestUpgrade(lo, db) : null), [db, lo]);
  const maxGain = Math.max(...lo.gains.map(g => g.pct));

  return (
    <div className="max-w-[620px] divide-y divide-paper/[0.07]">
      <section aria-label={tx("属性收益")} className="pb-5">
        <p className="text-[12px] text-paper-3">
          {tx("每多一个该属性的附魔，秒伤增加多少")}
        </p>
        <ul className="mt-3 space-y-2.5">
          {lo.gains.map((g, i) => (
            <li
              key={g.attr}
              className="grid grid-cols-[64px_1fr_72px_48px] items-center gap-3"
            >
              <span
                className={cn(
                  "text-[13px]",
                  i === 0 ? "font-medium text-paper" : "text-paper-2"
                )}
              >
                {g.attr}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-paper/[0.05]">
                <span
                  className="block h-full rounded-full bg-jade"
                  style={{
                    width: `${(g.pct / maxGain) * 100}%`,
                    opacity: 1 - i * 0.09,
                  }}
                />
              </span>
              <span className="text-right text-[12.5px] tabular-nums text-paper-2">
                +{fmt(D(g.dps))}
              </span>
              <span className="text-right text-[12.5px] tabular-nums text-paper-3">
                {g.pct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={tx("加速段位")} className="py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={sectionTitle}>{tx("加速段位")}</h3>
          <p className="flex items-baseline gap-2 text-[12.5px]">
            <span className="font-medium text-paper">{haste.tier}</span>
            <span className="tabular-nums text-paper-2">
              {fmt(haste.value)}
            </span>
            {est.haste > 0 && (
              <span className="text-[11.5px] tabular-nums text-jade">
                {tx("含增益 +{0}", fmt(Math.round(est.haste)))}
              </span>
            )}
          </p>
        </div>
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-paper/[0.08]"
          role="progressbar"
          aria-valuemin={from}
          aria-valuemax={haste.nextValue ?? haste.value}
          aria-valuenow={haste.value}
          aria-label={
            haste.nextTier ? tx("距离{0}", haste.nextTier) : tx("加速段位")
          }
        >
          <div
            className="h-full rounded-full bg-gold/80"
            style={{ width: `${hastePct}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-paper-3">
          {haste.nextValue ? (
            <>
              {tx("再加{0}", " ")}
              <span className="tabular-nums text-paper-2">
                {fmt(haste.nextValue - haste.value)}
              </span>
              {tx(
                "{0}到{1}。加速按段位生效，不在上面的收益里",
                " ",
                haste.nextTier
              )}
            </>
          ) : (
            tx("已经是最高段")
          )}
        </p>
      </section>

      <section aria-label={tx("下一步建议")} className="pt-5">
        <h3 className={sectionTitle}>{tx("下一步建议")}</h3>
        {best ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13.5px] text-paper">
              {tx("把「{0}」换成", best.slotLabel)}
              <span className="font-medium"> {best.name}</span>
              <span className="ml-2 text-[12.5px] text-paper-3">
                {tx("秒伤")} <Delta pct={best.pct} className="font-medium" />
              </span>
            </p>
            <Btn
              size="xs"
              variant="secondary"
              onClick={() => onTry(best.slotKey, best.itemId)}
            >
              {tx("放进配装器")}
            </Btn>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-paper-2">
            {db ? tx("装备库里没有比现在更好的") : tx("正在从装备库里找…")}
          </p>
        )}
      </section>
    </div>
  );
}
