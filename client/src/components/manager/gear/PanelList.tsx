import type { PanelStats } from "@/data/gear";
import { cn } from "@/lib/utils";
import { panelRows, showPanelValue } from "./panelRows";
import { tx } from "@/lib/i18n";

/** 两两一行的属性：数值短，放得下 */
const PAIRED = ["score", "hp", "primary", "attack"];

/**
 * 左栏的角色面板（不含增益），排法照参考站：
 * 装分、气血、主属性、攻击两两一行；其余每项一行，左边等级，右边百分比。
 */
export function PanelList({
  xinfa,
  panel,
  hasteValue,
  note,
  className,
}: {
  xinfa: string;
  panel: PanelStats;
  hasteValue: number;
  note?: string;
  className?: string;
}) {
  const rows = panelRows(xinfa, panel, hasteValue);
  const paired = rows.filter(r => PAIRED.includes(r.key));
  const single = rows.filter(r => !PAIRED.includes(r.key));
  return (
    <section aria-label={tx("面板属性")} className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-medium text-paper-2">{tx("面板")}</h3>
        {note && <span className="text-[11px] text-paper-3">{note}</span>}
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 border-b border-paper/[0.07] pb-1.5">
        {paired.map(r => (
          <div
            key={r.key}
            className="flex h-8 items-center justify-between gap-2"
            title={r.title}
          >
            <dt className="shrink-0 text-[12.5px] text-paper-3">{r.label}</dt>
            <dd className="truncate text-[13px] tabular-nums text-paper">
              {showPanelValue(r.value, r.unit)}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="pt-1.5">
        {single.map(r => (
          <div
            key={r.key}
            className="flex h-8 items-center gap-2"
            title={r.title}
          >
            <dt className="w-10 shrink-0 text-[12.5px] text-paper-3">
              {r.label}
            </dt>
            <dd
              className={cn(
                "min-w-0 flex-1 truncate text-right text-[11.5px] tabular-nums text-paper-3",
                !r.sub && "invisible"
              )}
            >
              {r.sub ?? "-"}
            </dd>
            <dd className="w-[72px] shrink-0 text-right text-[13px] font-medium tabular-nums text-paper">
              {showPanelValue(r.value, r.unit)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
