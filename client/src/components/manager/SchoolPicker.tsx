import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
          { only: null, title: "全部心法", sub: xs.join(" · ") },
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
        aria-label={`${label}：${schoolLabel(value)}`}
        title={disabled ? "离线时不能修改" : "修改门派和心法"}
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
          aria-label={`${label}：选门派和心法`}
          className={cn(
            "absolute left-0 z-30 flex w-[340px] animate-fade flex-col overflow-hidden rounded-xl bg-ink-3 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-paper/12",
            up ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <div className="flex min-h-0">
            <div
              ref={leftRef}
              role="radiogroup"
              aria-label="门派"
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
              aria-label={`${active}的心法`}
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
            <span className="text-[11.5px] text-paper-3">流派</span>
            {LIUPAI_XINFA.map(x => (
              <label
                key={x}
                className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-paper-2"
                title="任何门派都能学"
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
      <Field label="门派" htmlFor={`${idPrefix}-school`}>
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
      <Field label="心法" htmlFor={`${idPrefix}-xinfa`}>
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
              <option value="">全部心法</option>
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
        <span className="text-[12.5px] font-medium text-paper">流派</span>
        {LIUPAI_XINFA.map(x => (
          <label
            key={x}
            title="任何门派都能学"
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
      {allDisabled(s) ? `${s}（都有了）` : s}
    </option>
  );
  const liupaiSchools = Array.from(new Set(LIUPAI_XINFA.map(schoolOf)));
  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectBox
        aria-label="门派"
        data-autofocus={autoFocus || undefined}
        value={school}
        onChange={e => onChange(firstOk(e.target.value))}
        wrapClassName="w-full"
        className={inputCls()}
      >
        {SCHOOL_GROUPS.map(g => schoolOption(g.school))}
        <optgroup label="流派">{liupaiSchools.map(schoolOption)}</optgroup>
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
              {reason ? `${x}（${reason}）` : x}
            </option>
          );
        })}
      </SelectBox>
    </div>
  );
}
