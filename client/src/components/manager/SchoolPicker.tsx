import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { XinfaMark } from "@/components/brand/Marks";
import { Anchored } from "@/components/common/Anchored";
import {
  LIUPAI_XINFA,
  SCHOOL_GROUPS,
  schoolColor,
  schoolLabel,
  schoolOf,
  schoolXinfa,
} from "@/data/seed";
import type { Character } from "@/data/types";
import { cn } from "@/lib/utils";
import { Field, SelectBox, inputCls } from "./shared";
import { tx, paren, colon } from "@/lib/i18n";

/** 角色的门派选择：门派必选，心法可不选（=这个门派的心法都玩），流派另外勾 */
export type SchoolValue = Pick<Character, "school" | "only" | "liupai">;

const MENU_H = 340;

function scrollBox(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p.getBoundingClientRect();
  }
  return { top: 0, bottom: window.innerHeight };
}

function Dot({ school }: { school: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-[2px]"
      style={{ background: schoolColor(school) }}
      aria-hidden="true"
    />
  );
}

/**
 * 级联菜单：左边门派，右边这个门派的心法。
 * 点门派 = 只选门派（心法都玩）；点右边的心法 = 只玩这一个。流派在底部单独勾，不关菜单。
 */
export function SchoolMenu({
  value,
  onChange,
  disabled,
  label,
}: {
  value: SchoolValue;
  onChange: (v: SchoolValue) => void;
  disabled?: boolean;
  /** 读屏用，如「云间鹤」的门派和心法 */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value.school);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const toggle = () => {
    if (open) return close();
    const t = triggerRef.current!;
    const r = t.getBoundingClientRect();
    const box = scrollBox(t);
    const below = box.bottom - r.bottom;
    const above = r.top - box.top;
    // 下面放不下、上面空间更大时向上展开
    setUp(below < MENU_H && above > below);
    setActive(value.school);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const cur = leftRef.current?.querySelector<HTMLElement>(
      '[aria-checked="true"]'
    );
    cur?.scrollIntoView({ block: "nearest" });
    cur?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
    // 只在打开时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (school: string, only: string | null) => {
    // 只有一个心法的门派，选门派和选心法是一回事，统一存为 null
    const xs = schoolXinfa(school);
    onChange({
      school,
      only: xs.length > 1 ? only : null,
      liupai: value.liupai,
    });
    close(true);
  };

  const onLeftKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      leftRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      rightRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    }
  };
  const onRightKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      rightRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? i + 1 : i - 1;
      items[(n + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      leftRef.current
        ?.querySelector<HTMLElement>(`[data-school="${active}"]`)
        ?.focus();
    }
  };

  const xs = schoolXinfa(active);
  const isCurrent = active === value.school;
  const rightOptions: { only: string | null; title: string; sub?: string }[] =
    xs.length > 1
      ? [
          { only: null, title: tx("全部心法"), sub: xs.join(" · ") },
          ...xs.map(x => ({ only: x, title: x })),
        ]
      : xs.map(() => ({ only: null, title: xs[0] }));

  return (
    <span ref={wrapRef} className="relative -ml-1.5 inline-flex">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}${colon()}${schoolLabel(value)}`}
        title={disabled ? tx("离线时不能修改") : tx("修改门派和心法")}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md pl-1.5 pr-1 text-[12px] text-paper-3 transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cinnabar-text/50",
          !disabled && "hover:bg-paper/[0.05] hover:text-paper-2",
          open && "bg-paper/[0.05] text-paper-2",
          disabled && "cursor-default"
        )}
      >
        <span>{schoolLabel(value)}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label={tx("{0}：选门派和心法", label)}
          className={cn(
            "absolute left-0 z-30 flex w-[340px] animate-fade flex-col overflow-hidden rounded-xl bg-ink-3 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-paper/12",
            up ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <div className="flex min-h-0">
            <div
              ref={leftRef}
              role="radiogroup"
              aria-label={tx("门派")}
              onKeyDown={onLeftKey}
              className="scroll-thin max-h-[272px] w-[128px] shrink-0 overflow-y-auto border-r border-paper/[0.07] p-1"
            >
              {SCHOOL_GROUPS.map(g => {
                const cur = g.school === value.school;
                return (
                  <button
                    key={g.school}
                    type="button"
                    role="radio"
                    aria-checked={cur}
                    data-school={g.school}
                    tabIndex={cur ? 0 : -1}
                    onMouseEnter={() => setActive(g.school)}
                    onFocus={() => setActive(g.school)}
                    onClick={() => pick(g.school, null)}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none",
                      g.school === active
                        ? "bg-paper/[0.07] text-paper"
                        : "text-paper-2",
                      "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cinnabar-text/50"
                    )}
                  >
                    <Dot school={g.school} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        cur && "font-medium"
                      )}
                    >
                      {g.school}
                    </span>
                    {cur ? (
                      <Check
                        className="h-3.5 w-3.5 text-cinnabar-text"
                        aria-hidden="true"
                      />
                    ) : (
                      g.xinfa.length > 1 && (
                        <ChevronRight
                          className="h-3 w-3 text-paper-3"
                          aria-hidden="true"
                        />
                      )
                    )}
                  </button>
                );
              })}
            </div>

            <div
              ref={rightRef}
              role="radiogroup"
              aria-label={tx("{0}的心法", active)}
              onKeyDown={onRightKey}
              className="min-w-0 flex-1 p-1"
            >
              {rightOptions.map(o => {
                const checked = isCurrent && value.only === o.only;
                return (
                  <button
                    key={o.title}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={-1}
                    onClick={() => pick(active, o.only)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-paper/[0.06]",
                      "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cinnabar-text/50"
                    )}
                  >
                    <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center">
                      {checked && (
                        <Check
                          className="h-3.5 w-3.5 text-cinnabar-text"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-[12.5px]",
                          checked ? "font-medium text-paper" : "text-paper-2"
                        )}
                      >
                        {o.title}
                      </span>
                      {o.sub && (
                        <span className="block text-[11.5px] text-paper-3">
                          {o.sub}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-paper/[0.07] px-3 py-2">
            <span className="text-[11.5px] text-paper-3">{tx("流派")}</span>
            {LIUPAI_XINFA.map(x => (
              <label
                key={x}
                className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-paper-2"
                title={tx("任何门派都能学")}
              >
                <input
                  type="checkbox"
                  checked={value.liupai.includes(x)}
                  onChange={e =>
                    onChange({
                      ...value,
                      liupai: e.target.checked
                        ? [...value.liupai, x]
                        : value.liupai.filter(y => y !== x),
                    })
                  }
                  className="h-3.5 w-3.5 accent-[var(--color-cinnabar)]"
                />
                {schoolOf(x)} · {x}
              </label>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/** 表单里的门派 + 心法（可不选）+ 流派。弹窗里用原生下拉，不会被滚动区裁掉 */
export function SchoolFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SchoolValue;
  onChange: (v: SchoolValue) => void;
  idPrefix: string;
}) {
  const xs = schoolXinfa(value.school);
  return (
    <>
      <Field label={tx("门派")} htmlFor={`${idPrefix}-school`}>
        <SelectBox
          id={`${idPrefix}-school`}
          value={value.school}
          onChange={e =>
            onChange({ ...value, school: e.target.value, only: null })
          }
          wrapClassName="w-full"
          className={inputCls()}
        >
          {SCHOOL_GROUPS.map(g => (
            <option key={g.school}>{g.school}</option>
          ))}
        </SelectBox>
      </Field>
      <Field label={tx("心法")} htmlFor={`${idPrefix}-xinfa`}>
        <SelectBox
          id={`${idPrefix}-xinfa`}
          value={value.only ?? ""}
          disabled={xs.length < 2}
          onChange={e => onChange({ ...value, only: e.target.value || null })}
          wrapClassName="w-full"
          className={inputCls()}
        >
          {xs.length > 1 ? (
            <>
              <option value="">{tx("全部心法")}</option>
              {xs.map(x => (
                <option key={x}>{x}</option>
              ))}
            </>
          ) : (
            <option value="">{xs[0]}</option>
          )}
        </SelectBox>
      </Field>
      <div className="col-span-2 flex items-center gap-3">
        <span className="text-[12.5px] font-medium text-paper">
          {tx("流派")}
        </span>
        {LIUPAI_XINFA.map(x => (
          <label
            key={x}
            title={tx("任何门派都能学")}
            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-paper-2"
          >
            <input
              type="checkbox"
              checked={value.liupai.includes(x)}
              onChange={e =>
                onChange({
                  ...value,
                  liupai: e.target.checked
                    ? [...value.liupai, x]
                    : value.liupai.filter(y => y !== x),
                })
              }
              className="h-3.5 w-3.5 accent-[var(--color-cinnabar)]"
            />
            {schoolOf(x)} · {x}
          </label>
        ))}
      </div>
    </>
  );
}

/**
 * 必须选到具体心法的地方（方案、配装）：先选门派或流派，再选心法。
 * 只有一个心法时第二个下拉不可改。disabledReason 返回文字时这个心法不能选
 */
export function XinfaPairSelect({
  value,
  onChange,
  id,
  disabledReason,
  autoFocus,
}: {
  value: string;
  onChange: (xinfa: string) => void;
  /** 弹窗打开时先聚焦门派下拉 */
  autoFocus?: boolean;
  /** 心法下拉的 id，给外面的 Field 用 */
  id: string;
  disabledReason?: (xinfa: string) => string | false;
}) {
  const school = schoolOf(value);
  const xs = schoolXinfa(school);
  const firstOk = (s: string) =>
    schoolXinfa(s).find(x => !disabledReason?.(x)) ?? schoolXinfa(s)[0];
  const allDisabled = (s: string) =>
    !!disabledReason && schoolXinfa(s).every(x => disabledReason(x));
  const schoolOption = (s: string) => (
    <option key={s} value={s} disabled={allDisabled(s)}>
      {allDisabled(s) ? tx("{0}（都有了）", s) : s}
    </option>
  );
  const liupaiSchools = Array.from(new Set(LIUPAI_XINFA.map(schoolOf)));
  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectBox
        aria-label={tx("门派")}
        data-autofocus={autoFocus || undefined}
        value={school}
        onChange={e => onChange(firstOk(e.target.value))}
        wrapClassName="w-full"
        className={inputCls()}
      >
        {SCHOOL_GROUPS.map(g => schoolOption(g.school))}
        <optgroup label={tx("流派")}>
          {liupaiSchools.map(schoolOption)}
        </optgroup>
      </SelectBox>
      <SelectBox
        id={id}
        value={value}
        disabled={xs.length < 2}
        onChange={e => onChange(e.target.value)}
        wrapClassName="w-full"
        className={inputCls()}
      >
        {xs.map(x => {
          const reason = disabledReason?.(x);
          return (
            <option key={x} value={x} disabled={!!reason}>
              {reason ? `${x}${paren(reason)}` : x}
            </option>
          );
        })}
      </SelectBox>
    </div>
  );
}

/**
 * 一个按钮选到具体心法（面板新建用）。按钮显示心法图标和「门派 · 心法」。
 * 点开是级联菜单：左边门派（流派在最后），右边这个门派的心法。
 * 只有一个心法的门派，点门派就选好；两个心法的，点右边的心法。
 * 菜单挂到 [data-layer-root]，不会被表单的滚动区裁掉；Esc 只关菜单。
 */
export function XinfaMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (xinfa: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(280);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const school = schoolOf(value);
  const toggle = () => {
    if (open) return setOpen(false);
    // 菜单和按钮一样宽；面板很窄时也至少 248px，两栏放得下
    setWidth(Math.max(248, triggerRef.current?.offsetWidth ?? 280));
    setOpen(true);
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${tx("心法")}${colon()}${school} · ${value}`}
        className={cn(
          inputCls(),
          "flex items-center gap-2 pl-1.5 pr-2 text-left",
          open && "ring-paper/[0.18]"
        )}
      >
        <XinfaMark xinfa={value} size={20} />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-paper-3">{school} · </span>
          {value}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      <Anchored
        anchor={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        width={width}
        maxHeight={320}
        label={tx("修改门派和心法")}
      >
        <XinfaMenuBody
          id={menuId}
          value={value}
          onPick={x => {
            setOpen(false);
            onChange(x);
            triggerRef.current?.focus();
          }}
        />
      </Anchored>
    </>
  );
}

const ITEM_CLS =
  "flex h-8 w-full shrink-0 items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cinnabar-text/50";

function XinfaMenuBody({
  id,
  value,
  onPick,
}: {
  id: string;
  value: string;
  onPick: (xinfa: string) => void;
}) {
  const school = schoolOf(value);
  const [active, setActive] = useState(school);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number>(undefined);
  const liupai = Array.from(new Set(LIUPAI_XINFA.map(schoolOf)));
  // 菜单出现时把当前门派滚进来并聚焦，键盘可以直接上下选
  useEffect(() => {
    const cur = leftRef.current?.querySelector<HTMLElement>(
      '[aria-checked="true"]'
    );
    cur?.scrollIntoView({ block: "nearest" });
    cur?.focus({ preventScroll: true });
    return () => window.clearTimeout(hoverTimer.current);
  }, []);
  // 鼠标在门派上停一下才换右边：斜着移到右边时划过别的门派，右边不会跟着变
  const hoverSchool = (s: string | null) => {
    window.clearTimeout(hoverTimer.current);
    if (s) hoverTimer.current = window.setTimeout(() => setActive(s), 150);
  };
  const focusRight = () =>
    requestAnimationFrame(() => {
      const r = rightRef.current;
      (
        r?.querySelector<HTMLElement>('[aria-checked="true"]') ??
        r?.querySelector<HTMLElement>('[role="radio"]')
      )?.focus();
    });
  const pickSchool = (s: string) => {
    const xs = schoolXinfa(s);
    if (xs.length === 1) return onPick(xs[0]);
    hoverSchool(null);
    setActive(s);
    focusRight();
  };
  const onLeftKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      leftRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusRight();
    }
  };
  const onRightKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      rightRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? i + 1 : i - 1;
      items[(n + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      leftRef.current
        ?.querySelector<HTMLElement>(`[data-school="${active}"]`)
        ?.focus();
    }
  };
  const schoolItem = (s: string) => {
    const cur = s === school;
    return (
      <button
        key={s}
        type="button"
        role="radio"
        aria-checked={cur}
        data-school={s}
        tabIndex={cur ? 0 : -1}
        onMouseEnter={() => hoverSchool(s)}
        onMouseLeave={() => hoverSchool(null)}
        onFocus={() => setActive(s)}
        onClick={() => pickSchool(s)}
        className={cn(
          ITEM_CLS,
          s === active
            ? "bg-paper/[0.07] text-paper"
            : "text-paper-2 hover:bg-paper/[0.04]"
        )}
      >
        <Dot school={s} />
        <span className={cn("min-w-0 flex-1 truncate", cur && "font-medium")}>
          {s}
        </span>
        {schoolXinfa(s).length > 1 && (
          <ChevronRight
            className="h-3 w-3 shrink-0 text-paper-3"
            aria-hidden="true"
          />
        )}
      </button>
    );
  };

  return (
    <div id={id} className="flex min-h-0 flex-1">
      <div
        ref={leftRef}
        role="radiogroup"
        aria-label={tx("门派")}
        onKeyDown={onLeftKey}
        className="scroll-thin flex min-h-0 w-[46%] shrink-0 flex-col overflow-y-auto border-r border-paper/[0.07] p-1"
      >
        {SCHOOL_GROUPS.map(g => schoolItem(g.school))}
        <div className="mx-2 mb-1 mt-2 truncate text-[11px] text-paper-3">
          {tx("流派")}
        </div>
        {liupai.map(schoolItem)}
      </div>
      <div
        ref={rightRef}
        role="radiogroup"
        aria-label={tx("{0}的心法", active)}
        onKeyDown={onRightKey}
        className="flex min-w-0 flex-1 flex-col p-1"
      >
        {schoolXinfa(active).map(x => {
          const checked = x === value;
          return (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={-1}
              onClick={() => onPick(x)}
              className={cn(
                ITEM_CLS,
                "pl-1.5 hover:bg-paper/[0.06]",
                checked ? "font-medium text-paper" : "text-paper-2"
              )}
            >
              <XinfaMark xinfa={x} size={18} />
              <span className="min-w-0 flex-1 truncate">{x}</span>
              {checked && (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-cinnabar-text"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
