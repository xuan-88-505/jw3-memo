import { useState } from "react";
import { Huangji } from "./Huangji";
import { XINFA_META } from "@/data/seed";
import { cn } from "@/lib/utils";

/** 朱砂方印：两道平行短横，像两根调到同一个音的琴弦 */
export function BrandSeal({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="22" height="22" rx="4.5" fill="#D2462F" />
      <rect
        x="3.2"
        y="3.2"
        width="17.6"
        height="17.6"
        rx="3"
        fill="none"
        stroke="#F6D9CF"
        strokeOpacity="0.35"
      />
      <path
        d="M6.5 9.4h11"
        stroke="#FFF4EC"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 14.6h11"
        stroke="#FFF4EC"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const seal = size === "lg" ? 28 : size === "md" ? 22 : 18;
  const text =
    size === "lg"
      ? "text-[22px]"
      : size === "md"
        ? "text-[17px]"
        : "text-[14px]";
  return (
    <span className="inline-flex items-center gap-2">
      <BrandSeal size={seal} />
      <span
        className={cn(
          "font-serif font-semibold tracking-[0.18em] text-paper",
          text
        )}
      >
        同调
      </span>
    </span>
  );
}

/** 托盘 / 菜单栏用的单色图标 */
export function TrayGlyph({
  size = 18,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="4.5"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
      <path
        d="M7 9.4h10M7 14.6h10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 托盘 / 菜单栏图标：黄鸡大笑 */
export function HuangjiLaugh({ size = 22 }: { size?: number }) {
  return <Huangji mood="laugh" size={size} />;
}

/** 心法标记：方印里一个字 */
export function XinfaMark({
  xinfa,
  size = 28,
  className,
}: {
  xinfa: string;
  size?: number;
  className?: string;
}) {
  const meta = XINFA_META[xinfa] ?? {
    short: xinfa.slice(0, 1),
    color: "#968F82",
    school: "",
  };
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[6px] font-serif font-semibold",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        color: meta.color,
        background: `${meta.color}1f`,
        boxShadow: `inset 0 0 0 1px ${meta.color}55`,
      }}
      title={meta.school ? `${meta.school} · ${xinfa}` : xinfa}
    >
      {meta.short}
    </span>
  );
}

/** 魔盒图标，加载失败时显示名字的第一个字 */
export function Jx3Icon({
  id,
  name,
  size = 32,
  className,
  dim,
}: {
  id: number;
  name: string;
  size?: number;
  className?: string;
  dim?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[6px] bg-ink-4 ring-1 ring-inset ring-paper/10",
        dim && "opacity-45 grayscale",
        className
      )}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span
          className="font-serif text-paper-2"
          style={{ fontSize: Math.round(size * 0.45) }}
        >
          {name.slice(0, 1)}
        </span>
      ) : (
        <img
          src={`https://icon.jx3box.com/icon/${id}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
