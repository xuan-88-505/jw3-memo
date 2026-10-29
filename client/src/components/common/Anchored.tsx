import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 贴着触发按钮弹出的浮层。挂到最近的 [data-layer-root]（管理窗口根节点），
 * 不会被表格的滚动区裁掉；模拟桌面里窗口整体缩放时按缩放比例换算位置。
 * 下面放不下就往上弹；点外面、按 Esc 关闭（Esc 不会顺带关掉外层弹窗）。
 */
export function Anchored({
  anchor,
  open,
  onClose,
  width,
  maxHeight = 440,
  align = "start",
  label,
  className,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width: number;
  maxHeight?: number;
  align?: "start" | "end";
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current;
    if (!a) return;
    const host =
      (a.closest("[data-layer-root]") as HTMLElement | null) ?? document.body;
    const hr = host.getBoundingClientRect();
    const scale = host.offsetWidth ? hr.width / host.offsetWidth : 1;
    const r = a.getBoundingClientRect();
    const hw = host.offsetWidth || window.innerWidth;
    const hh = host.offsetHeight || window.innerHeight;
    const top = (r.top - hr.top) / scale;
    const bottom = (r.bottom - hr.top) / scale;
    const left0 = (r.left - hr.left) / scale;
    const right0 = (r.right - hr.left) / scale;
    const w = Math.min(width, hw - 16);
    const below = hh - bottom - 8;
    const above = top - 8;
    const up = below < Math.min(maxHeight, 280) && above > below;
    const h = Math.max(160, Math.min(maxHeight, up ? above - 4 : below - 4));
    const left = Math.max(
      8,
      Math.min(align === "end" ? right0 - w : left0, hw - w - 8)
    );
    setRoot(host);
    setPos(
      up
        ? { left, bottom: hh - top + 4, width: w, maxHeight: h }
        : { left, top: bottom + 4, width: w, maxHeight: h }
    );
  }, [anchor, width, maxHeight, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, onClose, anchor]);

  if (!open || !pos || !root) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }}
      className={cn(
        "z-50 flex animate-fade flex-col overflow-hidden rounded-xl bg-ink-3 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-paper/12",
        className
      )}
    >
      {children}
    </div>,
    root
  );
}
