import { Sparkles } from "lucide-react";
import { useId, useMemo } from "react";
import {
  BIG_LEVEL_LABEL,
  BIG_SLOTS,
  configDelta,
  enchantOptions,
  stonesFor,
  type BigLevel,
  type GearConfig,
} from "@/data/enchants";
import {
  applyConfig,
  hasteOf,
  primaryAttr,
  statDeltaDpsPct,
  type Loadout,
} from "@/data/gear";
import { cn } from "@/lib/utils";
import { SelectBox, inputCls } from "../shared";
import { Delta, fmt } from "./Dashboard";

const selectCls = cn(inputCls(), "h-8 pl-2.5 text-[12.5px]");

function pctText(p: number) {
  if (Math.abs(p) < 0.00005) return "";
  return ` ${p > 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(2)}%`;
}

/**
 * 小附魔、大附魔、五彩石。base 是改之前的配装，用来估算秒伤；
 * 每个选项后面的百分比是"换成它"相对当前选择的秒伤变化。
 */
export function EnchantEditor({
  base,
  value,
  onChange,
}: {
  base: Loadout;
  value: GearConfig;
  onChange: (c: GearConfig) => void;
}) {
  const uid = useId();
  const main = primaryAttr(base.xinfa);
  const preview = useMemo(() => applyConfig(base, value), [base, value]);
  const gainOf = (next: GearConfig) =>
    statDeltaDpsPct(preview, configDelta(main, value, next));

  const stones = useMemo(() => {
    return stonesFor(main)
      .map(s => ({ s, p: gainOf({ ...value, stone: s.name }) }))
      .sort((a, b) => b.p - a.p);
    // gainOf 只依赖 preview 和 value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main, preview, value]);

  const recommend = () => {
    let next: GearConfig = {
      ...value,
      big: { hat: 2, coat: 2, belt: 2, wrist: 2, shoes: 2 },
    };
    // 逐个部位挑秒伤最高的（包含加速跨段）
    for (const s of base.slots) {
      const opts = enchantOptions(main, s.key);
      if (!opts.length) continue;
      const cur = applyConfig(base, next);
      const best = opts
        .map(o => {
          const cand = {
            ...next,
            enchants: { ...next.enchants, [s.key]: o.id },
          };
          return {
            id: o.id,
            p: statDeltaDpsPct(cur, configDelta(main, next, cand)),
          };
        })
        .sort((a, b) => b.p - a.p)[0];
      next = { ...next, enchants: { ...next.enchants, [s.key]: best.id } };
    }
    const cur = applyConfig(base, next);
    const stone = stonesFor(main)
      .map(st => ({
        name: st.name,
        p: statDeltaDpsPct(
          cur,
          configDelta(main, next, { ...next, stone: st.name })
        ),
      }))
      .sort((a, b) => b.p - a.p)[0];
    onChange({ ...next, stone: stone?.name ?? next.stone });
  };

  const changed = preview.dps !== base.dps;
  const pct = base.dps ? preview.dps / base.dps - 1 : 0;
  const hasteBefore = base.haste.tier;
  const hasteAfter = hasteOf(preview.haste.value).tier;

  return (
    <div className="space-y-5">
      {/* 小附魔 */}
      <fieldset>
        <div className="flex items-center justify-between">
          <legend className="text-[12.5px] font-medium text-paper">
            小附魔
          </legend>
          <button
            type="button"
            onClick={recommend}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-paper-3 hover:bg-paper/[0.05] hover:text-paper"
            title="大附魔全英雄，小附魔、五彩石按秒伤挑最高的"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            一键推荐
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {base.slots.map(s => {
            const opts = enchantOptions(main, s.key);
            const cur = value.enchants[s.key] ?? "";
            const id = `${uid}-en-${s.key}`;
            return (
              <div
                key={s.key}
                className="grid grid-cols-[48px_1fr] items-center gap-2"
              >
                <label htmlFor={id} className="text-[12px] text-paper-3">
                  {s.label}
                </label>
                <SelectBox
                  id={id}
                  value={cur}
                  onChange={e =>
                    onChange({
                      ...value,
                      enchants: {
                        ...value.enchants,
                        [s.key]: e.target.value || null,
                      },
                    })
                  }
                  wrapClassName="w-full min-w-0"
                  className={selectCls}
                >
                  {opts.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                      {o.color === "蓝" ? "（节日）" : ""}
                      {o.id === cur
                        ? ""
                        : pctText(
                            gainOf({
                              ...value,
                              enchants: { ...value.enchants, [s.key]: o.id },
                            })
                          )}
                    </option>
                  ))}
                  <option value="">
                    不附魔
                    {cur
                      ? pctText(
                          gainOf({
                            ...value,
                            enchants: { ...value.enchants, [s.key]: null },
                          })
                        )
                      : ""}
                  </option>
                </SelectBox>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* 大附魔 */}
      <fieldset>
        <legend className="text-[12.5px] font-medium text-paper">大附魔</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {BIG_SLOTS.map(b => {
            const cur = value.big[b.key];
            const id = `${uid}-big-${b.key}`;
            return (
              <div key={b.key} className="min-w-0">
                <label
                  htmlFor={id}
                  className="block text-[12px] text-paper-3"
                  title={`${b.effect}${b.estimated ? "（秒伤是估算）" : ""}`}
                >
                  {b.label}
                </label>
                <SelectBox
                  id={id}
                  value={String(cur)}
                  onChange={e =>
                    onChange({
                      ...value,
                      big: {
                        ...value.big,
                        [b.key]: Number(e.target.value) as BigLevel,
                      },
                    })
                  }
                  wrapClassName="mt-1 w-full min-w-0"
                  className={selectCls}
                >
                  {([2, 1, 0] as BigLevel[]).map(lv => (
                    <option key={lv} value={lv}>
                      {BIG_LEVEL_LABEL[lv]}
                      {lv === cur
                        ? ""
                        : pctText(
                            gainOf({
                              ...value,
                              big: { ...value.big, [b.key]: lv },
                            })
                          )}
                    </option>
                  ))}
                </SelectBox>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* 五彩石 */}
      <div>
        <label
          htmlFor={`${uid}-stone`}
          className="text-[12.5px] font-medium text-paper"
        >
          五彩石
        </label>
        <SelectBox
          id={`${uid}-stone`}
          value={value.stone ?? ""}
          onChange={e => onChange({ ...value, stone: e.target.value || null })}
          wrapClassName="mt-2 w-full"
          className={selectCls}
        >
          {stones.map(({ s, p }, i) => (
            <option key={s.name} value={s.name}>
              {s.short}　{s.attrs.map(a => `${a.label}${a.value}`).join(" ")}
              {s.name === value.stone ? "" : pctText(p)}
              {i === 0 && s.name !== value.stone ? "（最佳）" : ""}
            </option>
          ))}
          <option value="">不镶</option>
        </SelectBox>
      </div>

      {changed && (
        // 固定在弹窗滚动区底部，改哪一项都能马上看到结果
        <div className="sticky bottom-0 -mb-2 bg-ink-2 pb-2 pt-1">
          <p
            className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-ink px-3 py-2 text-[12.5px] text-paper-3 ring-1 ring-inset ring-paper/8"
            aria-live="polite"
          >
            秒伤
            <span className="tabular-nums">{fmt(base.dps)}</span>
            <span aria-hidden="true">→</span>
            <span className="font-medium tabular-nums text-paper">
              {fmt(preview.dps)}
            </span>
            <Delta pct={pct * 100} className="text-[12.5px]" />
            {hasteAfter !== hasteBefore && (
              <span className="text-cinnabar-text">
                加速{hasteBefore} → {hasteAfter}
              </span>
            )}
            <span className="ml-auto text-[11.5px]">估算</span>
          </p>
        </div>
      )}
    </div>
  );
}
