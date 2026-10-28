import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Minus, Square, X } from "lucide-react";
import { BrandSeal } from "@/components/brand/Marks";
import type { Platform } from "@/data/types";
import { cn } from "@/lib/utils";

export const SCREEN_W = 1440;
export const SCREEN_H = 900;

const ScaleCtx = createContext(1);
export const useStageScale = () => useContext(ScaleCtx);

/** 固定 1440 × 900 的模拟屏幕，按容器宽度等比缩小 */
export function Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / SCREEN_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full">
      <div
        className="relative mx-auto overflow-hidden rounded-[14px] bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] ring-1 ring-paper/12"
        style={{ width: SCREEN_W * scale, height: SCREEN_H * scale }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left select-none"
          style={{
            width: SCREEN_W,
            height: SCREEN_H,
            transform: `scale(${scale})`,
          }}
        >
          <ScaleCtx.Provider value={scale}>{children}</ScaleCtx.Provider>
        </div>
      </div>
    </div>
  );
}

/** 管理窗口的外框：Windows 标题栏按钮 / Mac 红绿灯 */
export function WindowFrame({
  platform,
  title,
  onClose,
  children,
  className,
  style,
}: {
  platform: Platform;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const mac = platform === "mac";
  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "absolute flex animate-fade flex-col overflow-hidden bg-ink-2 shadow-[0_40px_90px_-20px_rgb(0_0_0/0.85),0_0_0_1px_rgb(255_255_255/0.09)]",
        mac ? "rounded-[12px]" : "rounded-[8px]",
        className
      )}
      style={style}
    >
      {mac ? (
        <div className="relative flex h-[30px] shrink-0 items-center border-b border-black/40 bg-ink px-3">
          <div className="group flex items-center gap-2">
            <button
              type="button"
              aria-label="关闭窗口"
              onClick={onClose}
              className="grid h-3 w-3 place-items-center rounded-full bg-[#ff5f57] ring-1 ring-black/20"
            >
              <X
                className="h-2 w-2 text-black/60 opacity-0 group-hover:opacity-100"
                strokeWidth={3}
              />
            </button>
            <button
              type="button"
              aria-label="最小化"
              onClick={onClose}
              className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/20"
            />
            <span
              className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/20"
              aria-hidden="true"
            />
          </div>
          <span className="pointer-events-none absolute inset-x-0 text-center text-[12.5px] font-medium text-paper-2">
            {title}
          </span>
        </div>
      ) : (
        <div className="flex h-8 shrink-0 items-center border-b border-black/40 bg-ink pl-3">
          <BrandSeal size={14} />
          <span className="ml-2 text-[12px] text-paper-2">{title}</span>
          <div className="ml-auto flex h-full">
            <button
              type="button"
              aria-label="最小化"
              onClick={onClose}
              className="grid h-full w-11 place-items-center text-paper-2 hover:bg-paper/[0.08]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="grid h-full w-11 place-items-center text-paper-3"
              aria-hidden="true"
            >
              <Square className="h-3 w-3" />
            </span>
            <button
              type="button"
              aria-label="关闭窗口"
              onClick={onClose}
              className="grid h-full w-11 place-items-center text-paper-2 hover:bg-[#c42b1c] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** 演示说明：金色虚线框，和产品界面区分开 */
export function DemoNote({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-lg border border-dashed border-gold/60 bg-[#1a1712]/90 px-3 py-2 text-[12.5px] leading-relaxed text-gold shadow-lg backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
