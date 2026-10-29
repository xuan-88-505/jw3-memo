import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { XINFA_GROUPS } from "@/data/seed";
import { Jx3Icon } from "@/components/brand/Marks";
import type { SchemeDiff } from "@/lib/diff";
import { LAYER_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 按"旧 → 新"展示两个版本的差异 */
export function DiffDetails({
  diff,
  compact,
}: {
  diff: SchemeDiff;
  compact?: boolean;
}) {
  if (diff.total === 0) {
    return <p className="text-[12.5px] text-paper-3">内容没有变化。</p>;
  }
  return (
    <div className="space-y-3">
      {diff.talents.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.1em] text-paper-3">
            奇穴
          </p>
          <ul className="space-y-1">
            {diff.talents.map(t => (
              <li
                key={t.layer}
                className="flex items-center gap-2 text-[12.5px]"
              >
                <span className="w-11 shrink-0 font-serif text-paper-3">
                  第{LAYER_LABEL[t.layer - 1]}重
                </span>
                {t.from && (
                  <>
                    <Jx3Icon
                      id={t.from.icon}
                      name={t.from.name}
                      size={20}
                      dim
                    />
                    <span className="text-paper-3 line-through">
                      {t.from.name}
                    </span>
                    <span className="text-paper-3">→</span>
                  </>
                )}
                <Jx3Icon id={t.to.icon} name={t.to.name} size={20} />
                <span className="font-medium text-paper">{t.to.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.macros.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.1em] text-paper-3">
            宏
          </p>
          <div className="space-y-2">
            {diff.macros.map(m => (
              <div key={m.macroId}>
                <p className="mb-1 text-[12.5px]">
                  <span
                    className={cn(
                      "font-medium",
                      m.kind === "removed"
                        ? "text-paper-3 line-through"
                        : "text-paper"
                    )}
                  >
                    {m.name}
                  </span>
                  <span className="ml-2 text-paper-3">
                    {m.kind === "added" && "新增"}
                    {m.kind === "removed" && "删除"}
                    {m.kind === "renamed" && `改名，原来叫「${m.oldName}」`}
                    {m.kind === "changed" &&
                      (m.oldName !== m.name
                        ? `内容有改动，原来叫「${m.oldName}」`
                        : "内容有改动")}
                  </span>
                </p>
                {m.ops.length > 0 && (m.kind === "changed" || !compact) && (
                  <pre className="scroll-thin overflow-x-auto rounded-md bg-ink py-1 font-mono text-[11.5px] leading-[1.7] ring-1 ring-inset ring-paper/8">
                    {m.ops
                      .filter(o => !compact || o.type !== "same")
                      .map((o, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex pr-3",
                            o.type === "add" && "bg-jade/[0.10]",
                            o.type === "del" && "bg-cinnabar/[0.08]"
                          )}
                        >
                          <span
                            className={cn(
                              "w-6 shrink-0 select-none text-center",
                              o.type === "add"
                                ? "text-jade"
                                : o.type === "del"
                                  ? "text-cinnabar-text"
                                  : "text-paper-3/50"
                            )}
                            aria-label={
                              o.type === "add"
                                ? "新"
                                : o.type === "del"
                                  ? "旧"
                                  : undefined
                            }
                          >
                            {o.type === "add"
                              ? "+"
                              : o.type === "del"
                                ? "−"
                                : " "}
                          </span>
                          <span
                            className={cn(
                              "whitespace-pre",
                              o.type === "del"
                                ? "text-paper-3 line-through decoration-paper-3/50"
                                : "text-paper",
                              o.type === "same" && "text-paper-2"
                            )}
                          >
                            {o.text || " "}
                          </span>
                        </div>
                      ))}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function diffSummary(diff: SchemeDiff): string {
  const parts: string[] = [];
  if (diff.talents.length) parts.push(`奇穴 ${diff.talents.length} 处`);
  if (diff.macros.length) parts.push(`宏 ${diff.macros.length} 个`);
  return parts.join(" · ") || "无变化";
}

export function SectionHeader({
  title,
  description,
  right,
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
      <div className="min-w-0">
        <h1 className="cinnabar-rule font-serif text-[20px] font-semibold leading-tight text-paper">
          {title}
        </h1>
        {description && (
          <p className="mt-3.5 text-[13px] text-paper-3">{description}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-paper">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {(error || hint) && (
        <p
          role={error ? "alert" : undefined}
          className={cn(
            "mt-1.5 text-[12px]",
            error ? "text-cinnabar-text" : "text-paper-3"
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const inputCls = (error?: boolean) =>
  cn(
    "h-9 w-full rounded-md bg-ink px-3 text-[13px] text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2 disabled:opacity-50",
    error
      ? "ring-cinnabar/70 focus:ring-cinnabar"
      : "ring-paper/12 focus:ring-cinnabar-text/60"
  );

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-paper/12 px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-4 text-paper-2 ring-1 ring-inset ring-paper/10">
        {icon}
      </span>
      <p className="mt-4 font-serif text-[15px] font-semibold text-paper">
        {title}
      </p>
      {description && (
        <p className="mt-1.5 max-w-[340px] text-[12.5px] leading-relaxed text-paper-3">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * 统一的下拉框：去掉系统自带箭头，换成和图标一致的箭头，右边留出间距。
 * 点开仍是系统菜单，键盘和读屏照常可用。
 */
export function SelectBox({
  className,
  wrapClassName,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }) {
  return (
    <span className={cn("relative inline-flex", wrapClassName)}>
      <select
        {...rest}
        className={cn(
          "w-full cursor-pointer appearance-none pr-8 disabled:cursor-default",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-3"
        aria-hidden="true"
      />
    </span>
  );
}

/** 心法选项：按门派分组。disabledReason 返回文字时，这个心法不能选，文字显示在括号里 */
export function XinfaOptions({
  disabledReason,
}: {
  disabledReason?: (xinfa: string) => string | false;
}) {
  return (
    <>
      {XINFA_GROUPS.map(g => (
        <optgroup key={g.school} label={g.school}>
          {g.xinfa.map(x => {
            const reason = disabledReason?.(x);
            return (
              <option key={x} value={x} disabled={!!reason}>
                {reason ? `${x}（${reason}）` : x}
              </option>
            );
          })}
        </optgroup>
      ))}
    </>
  );
}
