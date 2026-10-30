import type { PointerEvent as ReactPointerEvent } from "react";
import { resizeCursor, type ResizeDir } from "@/lib/panelSize";

/**
 * 面板四边和四角的隐形热区：鼠标移上去变成缩放光标，按住拖动调整大小。
 * 不显示任何图标，和系统窗口一样。边 6px，角 12px。
 * 放在一个 relative 的容器里，铺满它。
 */
const ZONES: { dir: ResizeDir; className: string }[] = [
  { dir: "n", className: "left-3 right-3 top-0 h-1.5" },
  { dir: "s", className: "bottom-0 left-3 right-3 h-1.5" },
  { dir: "w", className: "bottom-3 left-0 top-3 w-1.5" },
  { dir: "e", className: "bottom-3 right-0 top-3 w-1.5" },
  { dir: "nw", className: "left-0 top-0 h-3 w-3" },
  { dir: "ne", className: "right-0 top-0 h-3 w-3" },
  { dir: "sw", className: "bottom-0 left-0 h-3 w-3" },
  { dir: "se", className: "bottom-0 right-0 h-3 w-3" },
];

export function ResizeEdges({
  onResizeStart,
}: {
  onResizeStart: (dir: ResizeDir, e: ReactPointerEvent) => void;
}) {
  return (
    <>
      {ZONES.map(z => (
        <div
          key={z.dir}
          aria-hidden="true"
          data-resize={z.dir}
          className={`absolute z-[70] touch-none ${z.className}`}
          style={{ cursor: resizeCursor(z.dir) }}
          onPointerDown={e => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(z.dir, e);
          }}
          // 双击边缘不触发标题栏的「回到原位」
          onDoubleClick={e => e.stopPropagation()}
        />
      ))}
    </>
  );
}
