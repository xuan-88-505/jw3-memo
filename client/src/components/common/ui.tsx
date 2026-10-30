import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import type { Member, SyncStatus } from "@/data/types";
import { Huangji, chickSize, moodFor } from "@/components/brand/Huangji";
import { CROWN_H, CROWN_W, Crown } from "@/components/brand/Crown";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

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
        size === "md" && "h-8 px-3.5 text-[13px]",
        variant === "primary" &&
          "bg-cinnabar-fill text-[#FFF7F0] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.35)] hover:bg-cinnabar active:bg-[#a9361f] active:shadow-none",
        variant === "secondary" &&
          "bg-paper/[0.06] text-paper shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] ring-1 ring-inset ring-paper/10 hover:bg-paper/[0.10] active:bg-paper/[0.08] active:shadow-none",
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
  size?: "xs" | "sm" | "md";
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md bg-paper/[0.04] p-0.5 ring-1 ring-inset ring-paper/10"
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
                : size === "md"
                  ? "h-7 px-3 text-[13px]"
                  : "h-6 px-2.5 text-[12.5px]",
              active
                ? "bg-paper/[0.10] text-paper shadow-[0_1px_0_rgb(255_255_255/0.05)_inset]"
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
          className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-[4px] bg-paper/[0.06] px-1 font-sans text-[10.5px] font-medium text-paper-2 ring-1 ring-inset ring-paper/12"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * 成员头像：圆形（角色头像是圆角方形，一眼分清人和角色）。
 * 默认是黄鸡表情，没设置时按名字稳定取一个；上传了图片就显示图片。
 */
export function Avatar({
  member,
  size = 24,
  animated = false,
}: {
  member: Pick<Member, "name" | "color" | "avatar" | "author">;
  size?: number;
  animated?: boolean;
}) {
  const face = <AvatarFace member={member} size={size} animated={animated} />;
  return member.author ? <AuthorFrame size={size}>{face}</AuthorFrame> : face;
}

/**
 * 作者头像框：金色金属描边 + 歪戴的像素皇冠。
 * 描边和皇冠都画在头像外面，不改变头像占的位置；小于 24 的头像夹在文字里，只留描边。
 */
function AuthorFrame({
  size,
  children,
}: {
  size: number;
  children: ReactNode;
}) {
  const ring = size >= 24 ? 2 : 1.5;
  const gap = size >= 24 ? 1.5 : 1;
  const cell = size >= 48 ? 2 : 1;
  const cw = CROWN_W * cell;
  const ch = CROWN_H * cell;
  return (
    <span
      className="relative inline-grid shrink-0"
      style={{ width: size, height: size }}
    >
      {children}
      <span
        aria-hidden="true"
        className="author-glow pointer-events-none absolute"
        style={{ inset: -(ring + gap) }}
      >
        <span
          className="author-ring absolute inset-0 rounded-full"
          style={{ ["--ring" as string]: `${ring}px` }}
        />
      </span>
      {size >= 24 && (
        <Crown
          cell={cell}
          className="pointer-events-none absolute drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]"
          style={{
            left: Math.round(size * 0.72 - cw / 2),
            top: -Math.round(ch * 0.66),
            transform: "rotate(18deg)",
          }}
        />
      )}
    </span>
  );
}

function AvatarFace({
  member,
  size,
  animated,
}: {
  member: Pick<Member, "name" | "color" | "avatar">;
  size: number;
  animated: boolean;
}) {
  const av = member.avatar ?? { kind: "preset", mood: moodFor(member.name) };
  if (av.kind === "upload") {
    return (
      <span
        className="relative inline-block shrink-0 overflow-hidden rounded-full bg-paper/[0.06]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img
          src={av.src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-paper/15" />
      </span>
    );
  }
  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: `${member.color}26`,
        boxShadow: `inset 0 0 0 1px ${member.color}55`,
      }}
      aria-hidden="true"
    >
      <Huangji
        mood={av.mood}
        size={chickSize(size, true)}
        animated={animated}
      />
    </span>
  );
}

/** 朱砂小方印徽标，用于"有更新"的数量 */
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
      <span
        title={version ? tx("游戏里是 v{0}", version) : undefined}
        className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-jade"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
        {tx("已是最新")}
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
        {tx("有更新")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-paper-3">
      <Circle className="h-3 w-3" aria-hidden="true" />
      {tx("无方案")}
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
      ? tx("已是最新")
      : status === "pending" || status === "never"
        ? tx("有更新")
        : tx("无方案");
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
