import { ArrowRight, Info } from "lucide-react";
import { useMemo } from "react";
import { bestUpgrade, primaryAttr, type Loadout } from "@/data/gear";
import { Btn } from "@/components/common/ui";
import { buffLabel, estimateBuffs, hasteWithBuffs } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { PanelStrip } from "./PanelStrip";
import { DpsChart } from "./DpsChart";
import { useEquipDb } from "./useEquipDb";

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

const cardTitle = "text-[12px] font-medium text-paper-3";

export function Dashboard({
  loadout: lo,
  onTry,
  onOpenChangelog,
  onOpenBuffs,
}: {
  loadout: Loadout;
  /** 把建议的装备放进配装器草稿 */
  onTry: (slotKey: string, itemId: number) => void;
  onOpenChangelog: () => void;
  onOpenBuffs: () => void;
}) {
  // 所有秒伤都按当前增益显示，前后可比
  const est = estimateBuffs(lo, lo.buffs);
  const f = 1 + est.pct;
  const D = (n: number) => Math.round(n * f);
  const haste = hasteWithBuffs(lo, est.haste);
  const buffed = est.pct > 0.00005;
  const prev = lo.history.length > 1 ? lo.history[lo.history.length - 2] : null;
  const deltaPct = prev ? ((lo.dps - prev.dps) / prev.dps) * 100 : 0;
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

  // 最近一次技改，以及它带来的变化
  const patchIdx = lo.history.map(p => p.kind).lastIndexOf("patch");
  const patch = patchIdx > 0 ? lo.history[patchIdx] : null;
  const patchDelta = patch
    ? ((patch.dps - lo.history[patchIdx - 1].dps) /
        lo.history[patchIdx - 1].dps) *
      100
    : 0;

  return (
    <div>
      {/* 不套卡片：同一行的几块用竖分隔线隔开，行之间用横分隔线 */}
      <div className="grid grid-cols-3 divide-x divide-paper/[0.07] border-b border-paper/[0.07] pb-5">
        <section className="pr-6" aria-label="木桩秒伤">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cardTitle}>木桩秒伤</h3>
            <button
              type="button"
              onClick={onOpenBuffs}
              className={cn(
                "-my-1 rounded px-1.5 py-0.5 text-[11.5px] transition-colors",
                buffed
                  ? "bg-jade/10 text-jade hover:bg-jade/15"
                  : "text-paper-3 hover:bg-paper/[0.05] hover:text-paper-2"
              )}
            >
              {buffed ? buffLabel(lo.buffs) : "+ 增益"}
            </button>
          </div>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-paper">
            {buffed && <span className="mr-1 text-[20px] text-paper-3">≈</span>}
            {fmt(D(lo.dps))}
          </p>
          <p className="mt-2.5 text-[12px] text-paper-3">
            {prev ? (
              <>
                <Delta pct={deltaPct} className="font-medium" />
                <span className="ml-1.5">较上次 {fmt(D(prev.dps))}</span>
              </>
            ) : (
              "第一次计算"
            )}
          </p>
        </section>

        <section className="px-6" aria-label="加速段位">
          <h3 className={cardTitle}>加速段位</h3>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-[24px] font-semibold leading-none text-paper">
              {haste.tier}
            </span>
            <span className="text-[13px] tabular-nums text-paper-2">
              {fmt(haste.value)}
            </span>
            {est.haste > 0 && (
              <span className="text-[11.5px] tabular-nums text-jade">
                含增益 +{fmt(Math.round(est.haste))}
              </span>
            )}
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper/[0.08]"
            role="progressbar"
            aria-valuemin={from}
            aria-valuemax={haste.nextValue ?? haste.value}
            aria-valuenow={haste.value}
            aria-label={haste.nextTier ? `距离${haste.nextTier}` : "加速段位"}
          >
            <div
              className="h-full rounded-full bg-gold/80"
              style={{ width: `${hastePct}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-paper-3">
            {haste.nextValue ? (
              <>
                再加{" "}
                <span className="tabular-nums text-paper-2">
                  {fmt(haste.nextValue - haste.value)}
                </span>{" "}
                到{haste.nextTier}
              </>
            ) : (
              "已经是最高段"
            )}
          </p>
        </section>

        <section className="flex flex-col pl-6" aria-label="下一步建议">
          <h3 className={cardTitle}>下一步建议</h3>
          {best ? (
            <>
              <p className="mt-2 text-[13.5px] leading-snug text-paper">
                把「{best.slotLabel}」换成
                <span className="font-medium"> {best.name}</span>
              </p>
              <p className="mt-1.5 text-[12px] text-paper-3">
                秒伤 <Delta pct={best.pct} className="font-medium" />
              </p>
              <div className="mt-auto pt-2">
                <Btn
                  size="xs"
                  variant="ghost"
                  className="-ml-2"
                  onClick={() => onTry(best.slotKey, best.itemId)}
                >
                  去配装器
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Btn>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-paper-2">
              {db ? "装备库里没有比现在更好的" : "正在从装备库里找…"}
            </p>
          )}
        </section>
      </div>

      <PanelStrip
        className="border-b border-paper/[0.07]"
        xinfa={lo.xinfa}
        panel={lo.panel}
        hasteValue={lo.haste.value}
        note={buffed ? "不含增益" : undefined}
      />

      <div className="grid grid-cols-[1fr_1.15fr] divide-x divide-paper/[0.07] pt-5">
        <section className="pr-6" aria-label="属性收益">
          <div className="flex items-center gap-1.5">
            <h3 className={cardTitle}>属性收益</h3>
            <span title="每多一个该属性的附魔，秒伤增加多少。按收益从高到低排列。">
              <Info
                className="h-3.5 w-3.5 text-paper-3/70"
                aria-label="说明：每多一个该属性的附魔，秒伤增加多少"
              />
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {lo.gains.map((g, i) => (
              <li
                key={g.attr}
                className="grid grid-cols-[56px_1fr_64px_44px] items-center gap-2"
              >
                <span
                  className={cn(
                    "text-[12.5px]",
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
                <span className="text-right text-[12px] tabular-nums text-paper-2">
                  +{fmt(D(g.dps))}
                </span>
                <span className="text-right text-[12px] tabular-nums text-paper-3">
                  {g.pct.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-paper-3">
            加速按段位生效，看上面的「加速段位」
          </p>
        </section>

        <section className="flex flex-col pl-6" aria-label="秒伤变化">
          <h3 className={cardTitle}>秒伤变化</h3>
          <div className="relative mt-1 min-h-[160px] flex-1">
            <div className="absolute inset-0">
              <DpsChart
                history={lo.history.map(p => ({ ...p, dps: D(p.dps) }))}
              />
            </div>
          </div>
          {patch && (
            <button
              type="button"
              onClick={onOpenChangelog}
              className="group -mx-1 mt-1 flex items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] text-paper-3 transition-colors hover:bg-paper/[0.04]"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-gold"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-paper-2">{patch.label}</span>
                {patch.detail && <span>（{patch.detail}）</span>}
                <span className="mx-1">·</span>
                <Delta pct={patchDelta} />
              </span>
              <span className="shrink-0 text-paper-3 transition-colors group-hover:text-paper-2">
                技改记录
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
