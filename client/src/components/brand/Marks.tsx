import { useEffect, useState } from "react";
import { Huangji, huangjiSrc } from "./Huangji";
import { XINFA_META } from "@/data/seed";
import { xinfaIconUrl } from "@/data/xinfaIcons";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/** 品牌标记：黄鸡大笑（游戏表情第 1 帧），和托盘图标、应用图标同一只 */
export function BrandSeal({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden="true">
      <Huangji mood="大笑" size={size} />
    </span>
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
        {tx("备忘录")}
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

/** 托盘 / 菜单栏图标：黄鸡大笑。animated 时播放游戏原版的 2 帧动图 */
export function HuangjiLaugh({
  size = 22,
  animated = false,
}: {
  size?: number;
  animated?: boolean;
}) {
  // 先把动图下载好，第一次悬停时不会闪一下
  useEffect(() => {
    new Image().src = huangjiSrc("大笑", true);
  }, []);
  return <Huangji mood="大笑" size={size} animated={animated} />;
}

/** 心法标记：游戏里的心法图标；没有图标或加载失败时，显示方印里一个字 */
export function XinfaMark({
  xinfa,
  size = 28,
  className,
}: {
  xinfa: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const meta = XINFA_META[xinfa] ?? {
    short: xinfa.slice(0, 1),
    color: "#968F82",
    school: "",
  };
  const label = meta.school ? `${meta.school} · ${xinfa}` : xinfa;
  const src = xinfaIconUrl(xinfa);
  if (src && !failed) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center", className)}
        style={{ width: size, height: size }}
        title={label}
      >
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-contain"
        />
      </span>
    );
  }
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
      title={label}
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
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[6px] bg-paper/[0.06] ring-1 ring-inset ring-paper/10",
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
