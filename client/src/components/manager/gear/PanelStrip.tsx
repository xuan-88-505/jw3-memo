import type { CSSProperties, ReactNode } from "react";
import type { CalcPct, PanelStats } from "@/data/gear";
import { cn } from "@/lib/utils";
import {
  panelRows,
  panelSame,
  showPanelValue,
  type PanelRow,
} from "./panelRows";
import { tx } from "@/lib/i18n";

function deltaText(d: number, unit: PanelRow["unit"]) {
  const sign = d > 0 ? "+" : "−";
  return `${sign}${showPanelValue(Math.abs(d), unit)}`;
}

/**
 * 面板属性（不含增益）。传 base 时和它比，变了的属性标出涨跌，用于配装器。
 * 左边是装分、气血，右边是影响秒伤的属性。
 */
export function PanelStrip({
  xinfa,
  panel,
  hasteValue,
  base,
  pct,
  footer,
  note,
  className,
}: {
  xinfa: string;
  panel: PanelStats;
  hasteValue: number;
  base?: { panel: PanelStats; hasteValue: number; pct?: CalcPct };
  /** 原版计算器算好的百分比；有就直接显示 */
  pct?: CalcPct;
  footer?: ReactNode;
  /** 显示在装分、气血下面的小字，例如开了增益时提示"不含增益" */
  note?: string;
  className?: string;
}) {
  const rows = panelRows(xinfa, panel, hasteValue, pct);
  const before = base
    ? panelRows(xinfa, base.panel, base.hasteValue, base.pct)
    : null;
  const diffOf = (r: PanelRow) => {
    const b = before?.find(x => x.key === r.key);
    if (!b) return null;
    const d = r.value - b.value;
    return panelSame(d, r.unit) ? null : { d, tierChanged: r.sub !== b.sub };
  };
  const meta = rows.filter(r => !r.core);
  const core = rows.filter(r => r.core);

  return (
    <section aria-label={tx("面板属性（不含增益）")} className={className}>
      <div className="flex items-stretch">
        <dl className="flex w-[116px] shrink-0 flex-col justify-center gap-1.5 border-r border-paper/[0.07] py-3 pr-4">
          {meta.map(r => {
            const diff = diffOf(r);
            return (
              <div
                key={r.key}
                className="flex items-baseline justify-between gap-2"
                title={r.title}
              >
                <dt className="text-[11.5px] text-paper-3">{r.label}</dt>
                <dd
                  className={cn(
                    "text-[12.5px] tabular-nums",
                    diff
                      ? diff.d > 0
                        ? "text-jade"
                        : "text-cinnabar-text"
                      : "text-paper-2"
                  )}
                >
                  {showPanelValue(r.value, r.unit)}
                </dd>
              </div>
            );
          })}
          {note && <p className="text-[10.5px] text-paper-3">{note}</p>}
        </dl>
        {/* 面板够宽时一行排开；窄窗口分两行，每行 5 格 */}
        <div className="@container min-w-0 flex-1">
          <dl
            className="grid grid-cols-5 gap-y-3 px-1.5 py-3 @min-[640px]:grid-cols-[var(--cols)]"
            style={
              {
                "--cols": `repeat(${core.length}, minmax(0, 1fr))`,
              } as CSSProperties
            }
          >
            {core.map(r => {
              const diff = diffOf(r);
              const tone = diff
                ? diff.d > 0
                  ? "text-jade"
                  : "text-cinnabar-text"
                : "";
              return (
                <div key={r.key} className="min-w-0 px-2" title={r.title}>
                  <dt className="truncate text-[11.5px] text-paper-3">
                    {r.label}
                  </dt>
                  <dd
                    className={cn(
                      "mt-0.5 truncate text-[15px] font-semibold leading-tight tabular-nums",
                      tone || "text-paper"
                    )}
                  >
                    {showPanelValue(r.value, r.unit)}
                  </dd>
                  <dd
                    className={cn(
                      "mt-0.5 min-h-[15px] truncate text-[11px] tabular-nums",
                      tone || "text-paper-3"
                    )}
                  >
                    {diff
                      ? r.key === "haste" && diff.tierChanged
                        ? `${deltaText(diff.d, r.unit)} ${r.sub}`
                        : deltaText(diff.d, r.unit)
                      : r.sub}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
      {footer}
    </section>
  );
}
