import { Check, Info, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Jx3Icon } from "@/components/brand/Marks";
import { FilterChip } from "@/components/common/FilterChip";
import { Btn, Segmented } from "@/components/common/ui";
import type { Loadout } from "@/data/gear";
import {
  FOOD_CATS,
  NO_BUFFS,
  PRESET_LABEL,
  TEAM_TYPES,
  applyPreset,
  buffGroup,
  buffPresets,
  buffProfile,
  effectPct,
  effectSummary,
  enableTeamBuff,
  estimateBuffs,
  teamMult,
  type BuffSelection,
  type TeamDef,
  foodLabel,
  foodSummary,
} from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { SelectBox } from "../shared";
import { fmt } from "./Dashboard";

/** 分区：不套卡片，分区之间用分隔线 */
const section = "py-5 first:pt-0 last:pb-0";
const sectionTitle = "text-[14px] font-medium text-paper";
const selectCls =
  "h-8 rounded-md bg-paper/[0.04] pl-2.5 text-[13px] text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus-visible:ring-cinnabar/60";

/** +1.23%：开着的用青色，没开的（潜在收益）用灰色 */
function Gain({
  pct,
  on = true,
  hideZero = false,
}: {
  pct: number;
  on?: boolean;
  /** 区块标题的合计：没有收益时什么都不显示 */
  hideZero?: boolean;
}) {
  const v = pct * 100;
  if (Math.abs(v) < 0.005) {
    if (hideZero) return null;
    return <span className="tabular-nums text-paper-3">—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        on ? (v > 0 ? "text-jade" : "text-cinnabar-text") : "text-paper-3"
      )}
    >
      {v > 0 ? "+" : "−"}
      {Math.abs(v).toFixed(2)}%
    </span>
  );
}

/** 数字输入：输入时允许临时为空，失焦或回车时按范围修正 */
function NumField({
  value,
  min,
  max,
  label,
  suffix,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  suffix: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const bad = draft === "" || !Number.isFinite(n) || n < min || n > max;
  const commit = () => {
    if (!Number.isFinite(n) || draft === "") {
      setDraft(String(value));
      return;
    }
    const v = Math.min(max, Math.max(min, Math.round(n)));
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <label className="flex items-center gap-1 text-[12px] text-paper-3">
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={bad}
        value={draft}
        title={`${min}–${max}`}
        onChange={e => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "h-7 w-11 rounded-md bg-paper/[0.04] px-1.5 text-right text-[12.5px] tabular-nums text-paper ring-1 ring-inset focus:outline-none",
          bad
            ? "ring-cinnabar/70"
            : "ring-paper/10 focus-visible:ring-cinnabar/60"
        )}
      />
      <span className="tabular-nums">{suffix}</span>
    </label>
  );
}

function CheckBox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset transition-colors",
        checked
          ? "bg-cinnabar text-white ring-cinnabar"
          : "bg-paper/[0.04] ring-paper/25 hover:ring-paper/40"
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

type TeamFilter = "on" | "all" | string;

/** 增益：小药小吃（含家园）、团队增益、阵眼。选项格式照开源计算器，秒伤是估算 */
export function BuffsView({
  loadout: lo,
  onChange,
  onNotice,
}: {
  loadout: Loadout;
  onChange: (sel: BuffSelection) => void;
  onNotice: (text: string) => void;
}) {
  const sel = lo.buffs ?? NO_BUFFS;
  const group = buffGroup(lo.xinfa);
  const profile = buffProfile(lo.xinfa);
  const presets = buffPresets(lo.xinfa);
  const est = useMemo(() => estimateBuffs(lo, sel), [lo, sel]);
  const onCount = Object.values(sel.team).filter(t => t.on).length;
  const [filter, setFilter] = useState<TeamFilter>(onCount ? "on" : "常用增益");

  // 每个选项单独的收益，用来排序和显示
  const foodPct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of group.foods) m[f.n] = effectPct(lo, f.e);
    return m;
  }, [lo, group]);
  const zhenPct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const z of group.zhen) m[z.n] = effectPct(lo, z.e);
    return m;
  }, [lo, group]);

  const base = lo.dps;
  const buffed = Math.round(base * (1 + est.pct));
  const set = (patch: Partial<BuffSelection>) =>
    onChange({ ...sel, ...patch, preset: null });

  /* ---------- 阵眼 ---------- */
  const zhen = group.zhen.find(z => z.n === sel.zhen);
  const zhenSorted = [...group.zhen].sort(
    (a, b) => zhenPct[b.n] - zhenPct[a.n]
  );

  /* ---------- 小药 ---------- */
  const foodsByCat = FOOD_CATS.map(cat => ({
    cat,
    items: group.foods
      .filter(f => f.c === cat)
      .sort((a, b) => foodPct[b.n] - foodPct[a.n]),
  })).filter(x => x.items.length);
  const eatenCount = foodsByCat.filter(x => sel.foods[x.cat]).length;
  const pickBestFoods = () => {
    const foods: Record<string, string> = {};
    for (const { cat, items } of foodsByCat) {
      if (items[0] && foodPct[items[0].n] > 0) foods[cat] = items[0].n;
    }
    set({ foods });
  };

  /* ---------- 团队增益 ---------- */
  const teamRows = group.team.filter(t =>
    filter === "on"
      ? sel.team[t.n]?.on
      : filter === "all"
        ? true
        : t.t === filter
  );
  const toggleTeam = (def: TeamDef, on: boolean) => {
    if (on) {
      const { next, turnedOff } = enableTeamBuff(sel, def);
      onChange(next);
      if (turnedOff.length) {
        onNotice(
          `和「${def.n}」不能同时开，已关掉「${turnedOff.join("」「")}」`
        );
      }
    } else {
      const team = { ...sel.team };
      delete team[def.n];
      set({ team });
    }
  };
  const patchTeam = (
    def: TeamDef,
    patch: { layers?: number; cov?: number }
  ) => {
    const cur = sel.team[def.n];
    if (!cur) return;
    set({ team: { ...sel.team, [def.n]: { ...cur, ...patch } } });
  };
  const typeCount = (key: string) => group.team.filter(t => t.t === key).length;
  /** 某一类里已开的个数，显示在分类胶囊上 */
  const onInType = (key: string) =>
    group.team.filter(t => t.t === key && sel.team[t.n]?.on).length;

  const presetValue = sel.preset ?? "";

  return (
    <div className="divide-y divide-paper/[0.07]">
      {/* 汇总：预设 + 估算秒伤 */}
      <section
        className={cn(section, "flex flex-wrap items-center gap-x-4 gap-y-3")}
        aria-label="增益汇总"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="增益预设"
            value={presetValue}
            onChange={name => onChange(applyPreset(lo.xinfa, name))}
            options={presets.map(p => ({
              value: p.name,
              label: PRESET_LABEL[p.name] ?? p.name,
            }))}
          />
          {sel.preset === null && (
            <span className="rounded bg-paper/[0.07] px-1.5 py-px text-[11.5px] text-paper-2">
              自定义
            </span>
          )}
          {profile.generic && (
            <span
              className="rounded bg-gold/10 px-1.5 py-px text-[11.5px] text-gold"
              title={`计算器还不支持${lo.xinfa}，预设按同类心法生成`}
            >
              通用预设
            </span>
          )}
        </div>
        <div className="ml-auto flex items-baseline gap-2 text-[13px] text-paper-3">
          {est.pct > 0.00005 ? (
            <>
              <span className="tabular-nums">{fmt(base)}</span>
              <span aria-hidden="true">→</span>
              <span className="sr-only">加增益后约</span>
              <span className="text-[20px] font-semibold tabular-nums text-paper">
                ≈ {fmt(buffed)}
              </span>
              <Gain pct={est.pct} />
            </>
          ) : (
            <>
              木桩秒伤
              <span className="text-[20px] font-semibold tabular-nums text-paper">
                {fmt(base)}
              </span>
            </>
          )}
          <span
            className="self-center text-paper-3"
            title="按属性收益估算；正式版交给计算器重算"
          >
            <Info className="h-3.5 w-3.5" aria-label="估算说明" />
          </span>
        </div>
      </section>

      {/* 阵眼 */}
      <section className={section} aria-label="阵眼">
        <div className="flex items-center gap-3">
          <h3 className={cn(sectionTitle, "w-16 shrink-0")}>阵眼</h3>
          {zhen ? (
            <Jx3Icon id={zhen.i} name={zhen.n} size={30} />
          ) : (
            <span
              className="h-[30px] w-[30px] shrink-0 rounded-[6px] bg-paper/[0.04] ring-1 ring-inset ring-paper/10"
              aria-hidden="true"
            />
          )}
          <SelectBox
            aria-label="选择阵眼"
            value={sel.zhen}
            onChange={e => set({ zhen: e.target.value })}
            className={cn(selectCls, "w-56")}
          >
            <option value="">不开阵眼</option>
            {zhenSorted.map(z => (
              <option key={z.n} value={z.n}>
                {z.n}　≈ +{(zhenPct[z.n] * 100).toFixed(1)}%
              </option>
            ))}
          </SelectBox>
          <p
            className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-relaxed text-paper-3"
            title={zhen?.d}
          >
            {zhen ? zhen.d : "团队里开阵的人决定，选和副本里一样的"}
          </p>
          <span className="w-16 shrink-0 text-right text-[13px]">
            <Gain pct={est.zhen} hideZero />
          </span>
        </div>
      </section>

      {/* 小药小吃 */}
      <section className={section} aria-label="小药小吃">
        <div className="mb-3 flex items-center gap-2">
          <h3 className={sectionTitle}>小药小吃</h3>
          <span className="text-[12px] tabular-nums text-paper-3">
            {eatenCount}/{foodsByCat.length}
          </span>
          <Btn
            variant="ghost"
            size="xs"
            className="ml-auto"
            icon={<Sparkles className="h-3 w-3" />}
            onClick={pickBestFoods}
          >
            每类选收益最高
          </Btn>
          <span className="w-16 text-right text-[13px]">
            <Gain pct={est.foods} hideZero />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {foodsByCat.map(({ cat, items }) => {
            const cur = items.find(f => f.n === sel.foods[cat]);
            return (
              <div key={cat} className="flex items-start gap-2.5">
                <span className="w-14 shrink-0 pt-1.5 text-[12.5px] text-paper-3">
                  {cat}
                </span>
                {cur ? (
                  <Jx3Icon id={cur.i} name={cur.n} size={30} />
                ) : (
                  <span
                    className="h-[30px] w-[30px] shrink-0 rounded-[6px] bg-paper/[0.04] ring-1 ring-inset ring-paper/10"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <SelectBox
                    aria-label={cat}
                    value={cur?.n ?? ""}
                    wrapClassName="w-full"
                    onChange={e => {
                      const foods = { ...sel.foods };
                      if (e.target.value) foods[cat] = e.target.value;
                      else delete foods[cat];
                      set({ foods });
                    }}
                    className={cn(selectCls, "w-full")}
                  >
                    <option value="">不吃</option>
                    {items.map(f => (
                      <option key={f.n} value={f.n}>
                        {foodLabel(f, profile.main)}
                      </option>
                    ))}
                  </SelectBox>
                  <p className="mt-1 truncate text-[11.5px] text-paper-3">
                    {cur ? foodSummary(cur, profile.main) : "\u00a0"}
                  </p>
                </div>
                <span className="w-14 shrink-0 pt-1.5 text-right text-[12.5px]">
                  {cur ? <Gain pct={foodPct[cur.n]} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 团队增益 */}
      <section className={section} aria-label="团队增益">
        <div className="mb-3 flex items-center gap-2">
          <h3 className={sectionTitle}>团队增益</h3>
          <span className="ml-auto text-[13px]">
            <Gain pct={est.team} hideZero />
          </span>
        </div>
        <div
          role="group"
          aria-label="团队增益分类"
          className="mb-3 flex flex-wrap items-center gap-1.5"
        >
          {(onCount > 0 || filter === "on") && (
            <>
              <FilterChip
                label="已开"
                count={onCount}
                selected={filter === "on"}
                onSelect={() => setFilter("on")}
              />
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-paper/10" />
            </>
          )}
          {TEAM_TYPES.filter(t => typeCount(t.key)).map(t => (
            <FilterChip
              key={t.key}
              label={t.label}
              count={onInType(t.key)}
              selected={filter === t.key}
              onSelect={() => setFilter(t.key)}
            />
          ))}
          <FilterChip
            label="全部"
            selected={filter === "all"}
            onSelect={() => setFilter("all")}
          />
        </div>

        {teamRows.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-6 text-[12.5px] text-paper-3">
            还没开团队增益
            <Btn size="xs" onClick={() => setFilter("常用增益")}>
              看常用
            </Btn>
          </div>
        ) : (
          <ul className="divide-y divide-paper/[0.07]">
            {teamRows.map(def => {
              const st = sel.team[def.n];
              const on = !!st?.on;
              const pct = on
                ? (est.items[def.n] ?? 0)
                : effectPct(
                    lo,
                    def.e,
                    teamMult(def, {
                      on: true,
                      layers: def.L,
                      cov: def.cov,
                    })
                  );
              return (
                <li
                  key={def.n}
                  className={cn(
                    "flex items-center gap-3 py-2",
                    !on && "opacity-80"
                  )}
                >
                  <CheckBox
                    checked={on}
                    label={def.n}
                    onChange={v => toggleTeam(def, v)}
                  />
                  <Jx3Icon id={def.i} name={def.n} size={28} dim={!on} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-[13px]">
                      <span
                        className={cn(
                          "font-medium",
                          on ? "text-paper" : "text-paper-2"
                        )}
                      >
                        {def.n}
                      </span>
                      {def.s && (
                        <span className="text-[11.5px] text-paper-3">
                          {def.s}
                        </span>
                      )}
                    </p>
                    <p
                      className="truncate text-[11.5px] text-paper-3"
                      title={def.d}
                    >
                      {def.d || effectSummary(def.e)}
                    </p>
                  </div>
                  {/* 层数、覆盖率各占固定宽度，没有的留空，保证上下对齐 */}
                  <div className="flex w-[108px] shrink-0 justify-end">
                    {on && def.maxL > 0 && (
                      <NumField
                        label={`${def.n} 层数`}
                        value={st.layers}
                        min={1}
                        max={def.maxL}
                        suffix={`/${def.maxL} 层`}
                        onCommit={v => patchTeam(def, { layers: v })}
                      />
                    )}
                  </div>
                  <div className="flex w-[92px] shrink-0 justify-end">
                    {on && def.covEdit && (
                      <NumField
                        label={`${def.n} 覆盖率`}
                        value={st.cov}
                        min={0}
                        max={100}
                        suffix="% 覆盖"
                        onCommit={v => patchTeam(def, { cov: v })}
                      />
                    )}
                  </div>
                  <span className="w-16 shrink-0 text-right text-[12.5px]">
                    <Gain pct={pct} on={on} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
