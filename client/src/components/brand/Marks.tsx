import { useState, useId } from "react";
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

/**
 * 托盘 / 菜单栏图标：黄鸡大笑（照剑三表情重画的矢量版）。
 * 小于 28px 时省掉眉毛、牙缝这些细节，描边加粗，保证任务栏里看得清。
 */
export function HuangjiLaugh({ size = 22 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const small = size < 28;
  const ink = "#5A2E0E";
  const outline = small ? 4 : 2.8;
  const mouth =
    "M15.5 39.5 Q32 37.5 48.5 39.5 C49 51 42 58 32 58 C22 58 15 51 15.5 39.5 Z";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <radialGradient id={`hj-head-${uid}`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFF27A" />
          <stop offset="0.55" stopColor="#FFD51C" />
          <stop offset="1" stopColor="#F4AE08" />
        </radialGradient>
        <clipPath id={`hj-mouth-${uid}`}>
          <path d={mouth} />
        </clipPath>
      </defs>

      {/* 头：水滴形 */}
      <path
        d="M33 4 C38 10 47 15 53 23 C58 30 60 37 59 44 C57.5 55 46 61 32 61 C18 61 6.5 55 5 44 C4 37 6 30 11 23 C17 15 28 10 33 4 Z"
        fill={`url(#hj-head-${uid})`}
        stroke={ink}
        strokeWidth={outline}
        strokeLinejoin="round"
      />
      {/* 头顶卷边 */}
      {small ? (
        <path
          d="M17 23.5 C25 18 40 17.5 48 22"
          fill="none"
          stroke="#D98E00"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M16.5 23.5 C24 17.5 41 16.5 49 21.5 L48 25 C40 20.5 25 21 17.5 27 Z"
          fill="#F2B400"
          stroke={ink}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
      {/* 眉毛 */}
      {!small && (
        <path
          d="M18.5 28.6 L25.5 27.8 M38.5 27.8 L45.5 28.6"
          stroke={ink}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {/* 眯眼 */}
      <path
        d="M18.5 35 Q22 29.5 25.5 35 M38.5 35 Q42 29.5 45.5 35"
        fill="none"
        stroke={ink}
        strokeWidth={small ? 3.4 : 2.6}
        strokeLinecap="round"
      />
      {/* 腮红 */}
      <ellipse
        cx="13.2"
        cy="39.5"
        rx="3.6"
        ry="2.3"
        fill="#FF8A3D"
        opacity="0.85"
      />
      <ellipse
        cx="50.8"
        cy="39.5"
        rx="3.6"
        ry="2.3"
        fill="#FF8A3D"
        opacity="0.85"
      />

      {/* 大嘴 */}
      <path d={mouth} fill="#C8141E" />
      <g clipPath={`url(#hj-mouth-${uid})`}>
        <ellipse cx="32" cy="53" rx="12" ry="6.5" fill="#EE3B30" />
        <rect x="14" y="37" width="36" height="6.2" fill="#FFFFFF" />
        <rect x="25" y="53.6" width="14" height="5" fill="#FFFFFF" />
        {!small && (
          <path
            d="M21 39 V43.2 M26.5 38.6 V43.2 M32 38.5 V43.2 M37.5 38.6 V43.2 M43 39 V43.2 M29.7 53.6 V58 M34.3 53.6 V58"
            stroke={ink}
            strokeWidth="0.9"
          />
        )}
      </g>
      <path
        d={mouth}
        fill="none"
        stroke={ink}
        strokeWidth={small ? 3 : 2.4}
        strokeLinejoin="round"
      />
    </svg>
  );
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
