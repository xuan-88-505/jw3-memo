/**
 * 面板尺寸。桌面版的窗口限制在 src-tauri/src/lib.rs（PANEL_* 常量），两边要一致。
 *
 * 最小 300 × 380：顶部的头像、角色名和 3 个按钮放得下；
 * 宏列表至少露出 3 条，最底下的「新建方案」也在。
 * 最大 600 × 1000：再宽列表只是多出空白；再高超出常见笔记本屏幕。
 */
export const PANEL_DEFAULT = { w: 360, h: 500 } as const;
export const PANEL_MIN = { w: 300, h: 380 } as const;
export const PANEL_MAX = { w: 600, h: 1000 } as const;

export interface PanelSize {
  w: number;
  h: number;
}

/** 面板矩形：左上角坐标和宽高 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 拖动的边或角：n 上、s 下、e 右、w 左，角是两个字母 */
export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** 可以占用的区域（不压到任务栏、菜单栏） */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/** 尺寸限制在最小、最大之间；读到的旧数据不合规时也能纠正 */
export function clampSize(s: PanelSize): PanelSize {
  return {
    w: Math.round(clamp(s.w, PANEL_MIN.w, PANEL_MAX.w)),
    h: Math.round(clamp(s.h, PANEL_MIN.h, PANEL_MAX.h)),
  };
}

/**
 * 拖动边或角之后的新矩形。对边保持不动：拖左边时右边不动，拖上边时下边不动。
 * 宽高限制在最小、最大之间；给了 bounds 时不拖出这个区域。
 */
export function resizeRect(
  start: Rect,
  dir: ResizeDir,
  dx: number,
  dy: number,
  bounds?: Bounds
): Rect {
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  let w = start.w;
  let h = start.h;
  if (dir.includes("e")) w = start.w + dx;
  if (dir.includes("w")) w = start.w - dx;
  if (dir.includes("s")) h = start.h + dy;
  if (dir.includes("n")) h = start.h - dy;
  let maxW: number = PANEL_MAX.w;
  let maxH: number = PANEL_MAX.h;
  if (bounds) {
    if (dir.includes("e")) maxW = Math.min(maxW, bounds.right - start.x);
    if (dir.includes("w")) maxW = Math.min(maxW, right - bounds.left);
    if (dir.includes("s")) maxH = Math.min(maxH, bounds.bottom - start.y);
    if (dir.includes("n")) maxH = Math.min(maxH, bottom - bounds.top);
  }
  // 起始尺寸已经贴着区域边缘时，至少保持原样，不会被反向挤小
  w = Math.round(
    clamp(w, PANEL_MIN.w, Math.max(maxW, Math.min(start.w, PANEL_MAX.w)))
  );
  h = Math.round(
    clamp(h, PANEL_MIN.h, Math.max(maxH, Math.min(start.h, PANEL_MAX.h)))
  );
  return {
    x: dir.includes("w") ? right - w : start.x,
    y: dir.includes("n") ? bottom - h : start.y,
    w,
    h,
  };
}

const CURSOR: Record<ResizeDir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};
export const resizeCursor = (dir: ResizeDir) => CURSOR[dir];

/**
 * 按住边或角拖动：用屏幕坐标算位移，窗口跟着变时也不会抖。
 * 每帧最多回调一次 onChange；松开时回调 onEnd。
 * scale：模拟桌面缩小显示时，屏幕上的 1px 对应面板的 1 / scale px。
 */
export function trackResize(
  e: {
    screenX: number;
    screenY: number;
    pointerId: number;
    target: EventTarget;
  },
  dir: ResizeDir,
  opts: {
    start: () => Rect | null;
    scale?: number;
    bounds?: Bounds;
    onChange: (r: Rect) => void;
    onEnd?: (r: Rect | null) => void;
  }
) {
  const sx = e.screenX;
  const sy = e.screenY;
  const scale = opts.scale ?? 1;
  const el = e.target as Element;
  try {
    el.setPointerCapture?.(e.pointerId);
  } catch {
    /* 有的环境不支持捕获指针，靠 window 上的监听兜底 */
  }
  let frame = 0;
  let last: Rect | null = null;
  let pending: { x: number; y: number } | null = null;
  const flush = () => {
    frame = 0;
    const base = opts.start();
    if (!base || !pending) return;
    last = resizeRect(base, dir, pending.x, pending.y, opts.bounds);
    opts.onChange(last);
  };
  const move = (ev: PointerEvent) => {
    pending = { x: (ev.screenX - sx) / scale, y: (ev.screenY - sy) / scale };
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const prevCursor = document.body.style.cursor;
  const prevSelect = document.body.style.userSelect;
  document.body.style.cursor = resizeCursor(dir);
  document.body.style.userSelect = "none";
  const up = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
    document.body.style.cursor = prevCursor;
    document.body.style.userSelect = prevSelect;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    opts.onEnd?.(last);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
