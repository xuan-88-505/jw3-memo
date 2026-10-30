import { AlertCircle, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { XinfaMark } from "@/components/brand/Marks";
import { Btn, IconBtn } from "@/components/common/ui";
import type { CalcBigKey, CalcInput, CalcSlotInput } from "@/data/calcTypes";
import { BIG_LEVEL_LABEL, BIG_SLOTS } from "@/data/enchants";
import { primaryAttr, type Loadout } from "@/data/gear";
import {
  attrName,
  calcStoneSource,
  computeSync,
  enchantsFor,
  equipOf,
  inputChanges,
  loadoutFromEngine,
  normSlot,
  seedInput,
  useCalcCatalog,
  type CalcCatalog,
  type EngineOk,
} from "@/lib/calcEngine";
import { KEY_INDEX } from "@/lib/dpsCalc";
import { cn } from "@/lib/utils";
import { SelectBox, inputCls } from "../../shared";
import { Delta, fmt } from "../Dashboard";
import { PanelStrip } from "../PanelStrip";
import { StonePicker } from "../StonePicker";
import { NativeEquipPicker } from "./NativeEquipPicker";
import { tx, txn } from "@/lib/i18n";

const selectCls = cn(inputCls(), "h-8 pl-2.5 text-[12.5px]");
const gemCls = cn(inputCls(), "h-8 w-[60px] px-1.5 text-center text-[12.5px]");
const GEM_MAX = 8;

/**
 * 配装器（当季）：界面是备忘录自己的，装备库和计算用内置的原版计算器（jx3dps-online）。
 * 改一下马上用原版算法重算面板、装分和秒伤；关掉不丢草稿，只有「保存」「另存为新配装」才写进配装。
 */
export function NativeGearDialog({
  open,
  onClose,
  lo,
  input,
  onInput,
  onSave,
  onSaveAs,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  lo: Loadout;
  /** 草稿；null 是还没改过，用配装里存的 */
  input: CalcInput | null;
  onInput: (next: CalcInput | null) => void;
  onSave: (next: Loadout, changes: string[]) => void;
  onSaveAs: (next: Loadout) => void;
  flash?: { slotKey: string; n: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { catalog: cat, failed, retry } = useCalcCatalog(lo.xinfa);

  // 打开时把焦点放进弹窗；Esc 关闭。菜单和下拉挂在别处，它们自己处理 Esc
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex animate-fade items-center justify-center bg-black/55 p-4"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full max-h-[860px] w-full max-w-[1240px] flex-col overflow-hidden rounded-xl bg-ink-3 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] outline-none ring-1 ring-paper/12"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-paper/[0.07] px-5 py-3">
          <h2 id={titleId} className="text-[16px] font-semibold text-paper">
            {tx("配装器")}
          </h2>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-paper-2">
            <XinfaMark xinfa={lo.xinfa} size={16} />
            <span className="truncate">{lo.name}</span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {failed ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-cinnabar-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {tx("计算器加载失败")}
                <button
                  type="button"
                  onClick={retry}
                  className="text-paper-2 underline underline-offset-2 hover:text-paper"
                >
                  {tx("重试")}
                </button>
              </span>
            ) : (
              !cat && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-paper-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {tx("正在加载当季装备库")}
                </span>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={tx("关闭")}
              title={tx("关闭，改动会留着")}
              className="-mr-1 ml-1 grid h-8 w-8 place-items-center rounded-md text-paper-3 transition-colors hover:bg-paper/[0.08] hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {cat ? (
          <Body
            cat={cat}
            lo={lo}
            input={input}
            onInput={onInput}
            onSave={onSave}
            onSaveAs={onSaveAs}
            flash={flash}
          />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center text-[13px] text-paper-3">
            {failed ? tx("计算器加载失败") : tx("正在加载当季装备库")}
          </div>
        )}
      </div>
    </div>
  );
}

function Body({
  cat,
  lo,
  input,
  onInput,
  onSave,
  onSaveAs,
  flash,
}: {
  cat: CalcCatalog;
  lo: Loadout;
  input: CalcInput | null;
  onInput: (next: CalcInput | null) => void;
  onSave: (next: Loadout, changes: string[]) => void;
  onSaveAs: (next: Loadout) => void;
  flash?: { slotKey: string; n: number } | null;
}) {
  const xinfa = lo.xinfa;
  const seed = useMemo(() => seedInput(lo, cat), [lo, cat]);
  const draft = input ?? seed.input;
  const result = useMemo(() => computeSync(xinfa, draft), [xinfa, draft]);
  // 存过原版结果的配装和存下的那份比；旧赛季配装没有可比的
  const base = useMemo(
    () => (lo.calc?.input ? computeSync(xinfa, seed.input) : null),
    [lo.calc?.input, xinfa, seed.input]
  );
  const ok = result.ok ? result : null;
  const baseOk = base?.ok ? base : null;
  const preview = useMemo(
    () => (ok ? loadoutFromEngine(lo, cat, draft, ok) : null),
    [ok, lo, cat, draft]
  );
  const basePreview = useMemo(
    () => (baseOk ? loadoutFromEngine(lo, cat, seed.input, baseOk) : null),
    [baseOk, lo, cat, seed.input]
  );
  const changes = useMemo(
    () => inputChanges(lo, seed.input, draft),
    [lo, seed.input, draft]
  );
  // 旧赛季配装第一次打开：没改也能保存（换成当季算法）
  const fresh = !lo.calc?.input;
  const dirty = changes.length > 0;
  const canSave = !!preview && (dirty || fresh);
  const stones = useMemo(() => calcStoneSource(cat), [cat]);
  const main = primaryAttr(xinfa);

  const set = (next: CalcInput) => onInput(next);
  const setSlot = (idx: string, s: CalcSlotInput | null) =>
    set({ ...draft, slots: { ...draft.slots, [idx]: s } });

  // 从装备列表点进来：定位并闪一下这个部位
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const el = rows.current[flash.slotKey];
    el?.scrollIntoView({ block: "center" });
    setLit(flash.slotKey);
    const t = window.setTimeout(() => setLit(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  const gainOf = (next: CalcInput) => {
    if (!ok) return 0;
    const r = computeSync(xinfa, next);
    return r.ok ? r.dps / ok.dps - 1 : 0;
  };

  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5">
        <div className="@container pb-6">
          {/* 属性面板吸顶，改了哪项标出涨跌 */}
          <div className="sticky top-0 z-10 -mx-5 border-b border-paper/[0.07] bg-ink-3/95 px-5 backdrop-blur">
            {preview ? (
              <PanelStrip
                xinfa={xinfa}
                panel={preview.panel}
                hasteValue={preview.haste.value}
                pct={preview.calc?.pct}
                base={
                  dirty && basePreview
                    ? {
                        panel: basePreview.panel,
                        hasteValue: basePreview.haste.value,
                        pct: basePreview.calc?.pct,
                      }
                    : undefined
                }
                note={draft.battle.buffOn ? tx("面板不含增益") : undefined}
              />
            ) : (
              <p className="flex h-[76px] items-center gap-2 text-[12.5px] text-cinnabar-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {tx("这套配装算不出来，换一件装备试试")}
              </p>
            )}
          </div>

          {/* 手动新建的配装原本只有示例装备，不算「旧赛季的」，直接用原版默认装备，不提示 */}
          {(seed.replaced.length > 0 || seed.stoneReplaced) &&
            !input &&
            lo.source !== "manual" && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/[0.08] px-3 py-2 text-[12.5px] leading-relaxed text-amber-200/90 ring-1 ring-inset ring-amber-400/20">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {seed.replaced.length > 0
                  ? txn(
                      "{0} 件装备是旧赛季的，当季装备库里没有，先换成了原版默认装备。保存后按当季计算。",
                      seed.replaced.length
                    )
                  : tx("五彩石是旧赛季的，先换成了原版默认五彩石。保存后按当季计算。")}
              </span>
            </p>
          )}

          {/* 表头：宽窗口才显示 */}
          <div
            aria-hidden="true"
            className="-mx-3 mt-4 hidden items-center gap-2 px-3 text-[11.5px] text-paper-3 @min-[880px]:flex"
          >
            <span className="w-[64px] shrink-0">{tx("部位")}</span>
            <span className="min-w-0 flex-1">{tx("装备")}</span>
            <span className="w-[150px] shrink-0">{tx("附魔")}</span>
            <span className="w-[80px] shrink-0">{tx("精炼")}</span>
            <span className="w-[196px] shrink-0">{tx("镶嵌")}</span>
            <span className="w-[124px] shrink-0">大附魔</span>
            <span className="w-7 shrink-0" />
          </div>

          <div className="-mx-3 mt-1 divide-y divide-paper/[0.07]">
            {lo.slots.map(slot => {
              const idx = KEY_INDEX[slot.key];
              if (!idx) return null;
              const s = draft.slots[idx] ?? null;
              const savedSlot = seed.input.slots[idx] ?? null;
              const e = s ? equipOf(cat, idx, s.id) : null;
              const big = BIG_SLOTS.find(b => b.key === slot.key);
              const bigKey = big?.key as CalcBigKey | undefined;
              const bigChanged =
                !!bigKey && (draft.big[bigKey] ?? 0) !== (seed.input.big[bigKey] ?? 0);
              const changed =
                JSON.stringify(s) !== JSON.stringify(savedSlot) || bigChanged;
              const enchants = enchantsFor(cat, idx);
              const holes = e?.镶嵌孔数组 ?? [];
              return (
                <div
                  key={slot.key}
                  ref={el => {
                    rows.current[slot.key] = el;
                  }}
                  className={cn(
                    "group/row relative flex flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors @min-[880px]:flex-row @min-[880px]:items-center @min-[880px]:gap-2",
                    lit === slot.key && "bg-cinnabar/[0.08] ring-1 ring-inset ring-cinnabar/30"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "flex w-[64px] shrink-0 items-center text-[12.5px]",
                        changed ? "text-paper" : "text-paper-3"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1 top-6 h-1.5 w-1.5 -translate-y-1/2 rounded-full @min-[880px]:top-1/2",
                          changed ? "bg-cinnabar" : "bg-transparent"
                        )}
                        aria-hidden="true"
                      />
                      {slot.label}
                      {changed && <span className="sr-only">{tx("（已改）")}</span>}
                    </span>
                    <NativeEquipPicker
                      cat={cat}
                      xinfa={xinfa}
                      idx={idx}
                      label={slot.label}
                      short={slot.short}
                      input={draft}
                      dps={ok?.dps ?? 0}
                      onPick={next => setSlot(idx, next)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-[72px] @min-[880px]:flex-nowrap @min-[880px]:pl-0">
                    {/* 附魔 */}
                    <div className="w-[150px] shrink-0">
                      {s && enchants.length ? (
                        <SelectBox
                          aria-label={tx("{0}附魔", slot.label)}
                          value={s.enchant ?? ""}
                          title={
                            enchants.find(f => f.id === s.enchant)?.附魔名称 ?? undefined
                          }
                          onChange={ev =>
                            setSlot(idx, {
                              ...s,
                              enchant: ev.target.value ? Number(ev.target.value) : null,
                            })
                          }
                          className={selectCls}
                          wrapClassName="w-full"
                        >
                          <option value="">{tx("不附")}</option>
                          {enchants.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.附魔效果简写}
                            </option>
                          ))}
                        </SelectBox>
                      ) : (
                        <span className="block px-2.5 text-[12px] text-paper-3/60">—</span>
                      )}
                    </div>

                    {/* 精炼 */}
                    <div className="w-[80px] shrink-0">
                      {s && e ? (
                        <SelectBox
                          aria-label={tx("{0}精炼", slot.label)}
                          value={s.refine}
                          onChange={ev =>
                            setSlot(idx, { ...s, refine: Number(ev.target.value) })
                          }
                          className={selectCls}
                          wrapClassName="w-full"
                        >
                          {Array.from(
                            { length: e.最大精炼等级 + 1 },
                            (_, i) => e.最大精炼等级 - i
                          ).map(n => (
                            <option key={n} value={n}>
                              {tx("精 {0}", n)}
                            </option>
                          ))}
                        </SelectBox>
                      ) : (
                        <span className="block px-2.5 text-[12px] text-paper-3/60">—</span>
                      )}
                    </div>

                    {/* 镶嵌：每个孔一个 */}
                    <div className="flex w-[196px] shrink-0 gap-1.5">
                      {s && holes.length ? (
                        holes.map((h, i) => {
                          const name = attrName(cat, h.镶嵌类型);
                          return (
                            <SelectBox
                              key={i}
                              aria-label={tx("{0}镶嵌孔 {1}（{2}）", slot.label, i + 1, name)}
                              title={tx("{0} {1} 级", name, s.gems[i] ?? 0)}
                              value={s.gems[i] ?? 0}
                              onChange={ev => {
                                const gems = [...s.gems];
                                gems[i] = Number(ev.target.value);
                                setSlot(idx, normSlot(cat, idx, { ...s, gems }));
                              }}
                              className={gemCls}
                              wrapClassName="shrink-0"
                              chevron={false}
                            >
                              {Array.from({ length: GEM_MAX + 1 }, (_, k) => GEM_MAX - k).map(
                                lv => (
                                  <option key={lv} value={lv}>
                                    {lv ? `${name} ${lv}` : tx("{0} 空", name)}
                                  </option>
                                )
                              )}
                            </SelectBox>
                          );
                        })
                      ) : (
                        <span className="px-2.5 text-[12px] text-paper-3/60">—</span>
                      )}
                    </div>

                    {/* 大附魔 */}
                    <div className="w-[124px] shrink-0">
                      {big && bigKey ? (
                        <SelectBox
                          aria-label={tx("{0}大附魔（{1}）", slot.label, big.label)}
                          value={draft.big[bigKey] ?? 0}
                          onChange={ev =>
                            set({
                              ...draft,
                              big: { ...draft.big, [bigKey]: Number(ev.target.value) },
                            })
                          }
                          className={selectCls}
                          wrapClassName="w-full"
                        >
                          {([2, 1, 0] as const).map(lv => (
                            <option key={lv} value={lv}>
                              {lv ? `${big.label} ${BIG_LEVEL_LABEL[lv]}` : tx("不附")}
                            </option>
                          ))}
                        </SelectBox>
                      ) : (
                        <span className="block px-2.5 text-[12px] text-paper-3/60">—</span>
                      )}
                    </div>

                    <div className="w-7 shrink-0">
                      {changed && (
                        <IconBtn
                          label={tx("还原{0}", slot.label)}
                          onClick={() =>
                            set({
                              ...draft,
                              slots: { ...draft.slots, [idx]: savedSlot },
                              big: bigKey
                                ? { ...draft.big, [bigKey]: seed.input.big[bigKey] ?? 0 }
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
                  draft.stone !== seed.input.stone ? "text-paper" : "text-paper-3"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    draft.stone !== seed.input.stone ? "bg-cinnabar" : "bg-transparent"
                  )}
                  aria-hidden="true"
                />
                五彩石
              </span>
              <div className="min-w-0 flex-1">
                <StonePicker
                  main={main}
                  value={draft.stone}
                  source={stones}
                  gain={name => gainOf({ ...draft, stone: name })}
                  onChange={stone => set({ ...draft, stone })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer
        lo={lo}
        ok={ok}
        baseOk={baseOk}
        dirty={dirty}
        fresh={fresh}
        changes={changes}
        canSave={canSave}
        onUndo={() => onInput(null)}
        onSave={() => preview && onSave(preview, changes)}
        onSaveAs={() => preview && onSaveAs(preview)}
      />
    </>
  );
}

/** 底部：秒伤（原版算法）、和存下的比、循环和战斗时间，保存 */
function Footer({
  lo,
  ok,
  baseOk,
  dirty,
  fresh,
  changes,
  canSave,
  onUndo,
  onSave,
  onSaveAs,
}: {
  lo: Loadout;
  ok: EngineOk | null;
  baseOk: EngineOk | null;
  dirty: boolean;
  fresh: boolean;
  changes: string[];
  canSave: boolean;
  onUndo: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-paper/[0.07] px-5 py-3">
      <div className="flex min-w-0 items-baseline gap-2.5" aria-live="polite">
        <span className="text-[12px] text-paper-3">{tx("秒伤")}</span>
        <span className="text-[20px] font-semibold tabular-nums text-paper">
          {ok ? fmt(ok.dps) : "—"}
        </span>
        {dirty && ok && baseOk ? (
          <>
            <Delta pct={(ok.dps / baseOk.dps - 1) * 100} className="text-[13px]" />
            <span className="truncate text-[12px] text-paper-3">
              {tx("原 {0}", fmt(baseOk.dps))}
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span title={changes.join("、")}>{txn("改了 {0} 处", changes.length)}</span>
            </span>
          </>
        ) : (
          <span className="text-[12px] text-paper-3">
            {fresh ? tx("还没保存过当季结果") : tx("未改动")}
          </span>
        )}
        {ok && (
          <span
            className="truncate text-[11.5px] text-paper-3"
            title={tx("循环和战斗时间来自原版计算器")}
          >
            {ok.loop.title || ok.loop.name}
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            {tx("{0} 秒", ok.time.toFixed(1))}
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Btn variant="ghost" size="md" disabled={!dirty} onClick={onUndo}>
          {tx("撤销")}
        </Btn>
        <Btn size="md" disabled={!canSave} onClick={onSaveAs}>
          {tx("另存为新配装")}
        </Btn>
        <Btn
          variant="primary"
          size="md"
          disabled={!canSave}
          onClick={onSave}
          title={fresh && !dirty ? tx("换成当季装备库和算法保存「{0}」", lo.name) : undefined}
        >
          {tx("保存")}
        </Btn>
      </div>
    </div>
  );
}
