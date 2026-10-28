import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import type { Member, SyncStatus } from "@/data/types";
import { cn } from "@/lib/utils";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type BtnSize = "xs" | "sm" | "md";

export const Btn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: BtnSize;
    icon?: ReactNode;
  }
>(function Btn(
  { variant = "secondary", size = "sm", icon, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-100 disabled:opacity-45",
        size === "xs" && "h-6 px-2 text-[12px]",
        size === "sm" && "h-7 px-2.5 text-[12.5px]",
        size === "md" && "h-9 px-3.5 text-[14px]",
        variant === "primary" &&
          "bg-cinnabar-fill text-[#FFF7F0] hover:bg-cinnabar active:bg-[#a9361f]",
        variant === "secondary" &&
          "bg-ink-4 text-paper ring-1 ring-inset ring-paper/10 hover:bg-ink-5 active:bg-ink-4",
        variant === "ghost" &&
          "text-paper-2 hover:bg-paper/[0.07] hover:text-paper",
        variant === "quiet" && "text-paper-3 hover:text-paper",
        variant === "danger" &&
          "text-cinnabar-text ring-1 ring-inset ring-cinnabar/40 hover:bg-cinnabar/10",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconBtn({
  label,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
      className={cn(
        "inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-paper-2 transition-colors hover:bg-paper/[0.08] hover:text-paper disabled:opacity-40",
        active &&
          "bg-cinnabar/15 text-cinnabar-text hover:bg-cinnabar/20 hover:text-cinnabar-text",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  label,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "xs" | "sm";
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md bg-ink p-0.5 ring-1 ring-inset ring-paper/10"
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "whitespace-nowrap rounded-[5px] font-medium transition-colors disabled:opacity-35",
              size === "xs"
                ? "h-5 px-2 text-[11.5px]"
                : "h-6 px-2.5 text-[12.5px]",
              active
                ? "bg-ink-4 text-paper shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]"
                : "text-paper-3 hover:text-paper"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Kbd({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map(k => (
        <kbd
          key={k}
          className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-[4px] bg-ink-4 px-1 font-sans text-[10.5px] font-medium text-paper-2 ring-1 ring-inset ring-paper/12"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function Avatar({
  member,
  size = 24,
}: {
  member: Pick<Member, "name" | "color">;
  size?: number;
}) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.46),
        color: member.color,
        background: `${member.color}26`,
        boxShadow: `inset 0 0 0 1px ${member.color}55`,
      }}
      aria-hidden="true"
    >
      {member.name.slice(0, 1)}
    </span>
  );
}

/** 朱砂小方印徽标，用于待同步数量 */
export function SealBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      key={count}
      className={cn(
        "inline-grid h-[16px] min-w-[16px] animate-pop place-items-center rounded-[4px] bg-cinnabar px-1 text-[10.5px] font-semibold leading-none text-white",
        className
      )}
    >
      {count}
    </span>
  );
}

export function StatusPill({
  status,
  version,
}: {
  status: SyncStatus;
  version?: number;
}) {
  if (status === "synced") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-jade">
        <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
        已同步{version ? ` v${version}` : ""}
      </span>
    );
  }
  if (status === "pending" || status === "never") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] bg-cinnabar/14 px-1.5 py-0.5 text-[12px] font-medium text-cinnabar-text ring-1 ring-inset ring-cinnabar/35">
        <span
          className="h-1.5 w-1.5 rounded-[1.5px] bg-cinnabar"
          aria-hidden="true"
        />
        {status === "never" ? "没同步过" : "待同步"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-paper-3">
      <Circle className="h-3 w-3" aria-hidden="true" />
      无方案
    </span>
  );
}

export function StatusDot({ status }: { status: SyncStatus }) {
  const cls =
    status === "synced"
      ? "bg-jade"
      : status === "pending" || status === "never"
        ? "bg-cinnabar"
        : "bg-paper-3/50";
  const label =
    status === "synced"
      ? "已同步"
      : status === "pending"
        ? "待同步"
        : status === "never"
          ? "没同步过"
          : "无方案";
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-[2px]", cls)}
      role="img"
      aria-label={label}
    />
  );
}

export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[11.5px] font-medium tracking-[0.12em] text-paper-3">
        {children}
      </h3>
      {right}
    </div>
  );
}
