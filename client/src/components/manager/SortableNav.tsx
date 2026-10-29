import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import type { ManagerSection } from "@/data/types";
import { cn } from "@/lib/utils";

export interface NavItem {
  key: ManagerSection;
  label: string;
  icon: LucideIcon;
}

/** 按住多久进入拖动 */
const LONG_PRESS_MS = 350;
/** 按住期间移动超过这个距离（屏幕像素），就当作普通点击或滑动，不进入拖动 */
const MOVE_TOLERANCE = 6;

interface DragState {
  key: ManagerSection;
  from: number;
  over: number;
  /** 被拖项相对原位置的偏移，单位是未缩放的布局像素 */
  dy: number;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * 侧栏导航。长按一项后拖动排序，松手生效，拖动中按 Esc 取消。
 * 不显示拖动图标；键盘用 Alt + ↑/↓ 移动当前项。
 */
export function SortableNav({
  items,
  activeKey,
  disabled,
  onSelect,
  onReorder,
  trailing,
}: {
  items: NavItem[];
  activeKey: ManagerSection;
  disabled: boolean;
  onSelect: (key: ManagerSection) => void;
  onReorder: (keys: ManagerSection[]) => void;
  trailing: (key: ManagerSection) => ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const press = useRef<{
    index: number;
    key: ManagerSection;
    pointerId: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  /** 拖动结束后紧跟着的 click 不算导航 */
  const swallowClick = useRef(false);
  /** 每一格的高度（布局像素）、屏幕缩放比例、开始拖动时的指针位置 */
  const geo = useRef({ slot: 38, scale: 1, startY: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announce, setAnnounce] = useState("");

  const keys = items.map(i => i.key);
  const labelOf = (k: ManagerSection) =>
    items.find(i => i.key === k)?.label ?? "";

  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const commit = (from: number, to: number) => {
    if (from === to) return;
    onReorder(moveItem(keys, from, to));
    setAnnounce(`已把「${labelOf(keys[from])}」移到第 ${to + 1} 位`);
  };

  // 拖动中按 Esc：放回原位
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      clearPress();
      swallowClick.current = true;
      setDrag(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag]);

  useEffect(() => clearPress, []);

  const onPointerDown = (
    e: PointerEvent<HTMLButtonElement>,
    index: number,
    key: ManagerSection
  ) => {
    swallowClick.current = false;
    if (disabled || e.button !== 0) return;
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      const p = press.current;
      const list = listRef.current;
      if (!p || !list) return;
      const lis = Array.from(list.children) as HTMLElement[];
      const first = lis[0];
      // 模拟桌面整体做了缩放：屏幕像素 ÷ 缩放比例 = 布局像素
      const scale = first.getBoundingClientRect().height / first.offsetHeight;
      geo.current = {
        slot:
          lis.length > 1
            ? lis[1].offsetTop - first.offsetTop
            : first.offsetHeight,
        scale: scale || 1,
        startY: p.y,
      };
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* 指针已经抬起 */
      }
      setDrag({ key, from: index, over: index, dy: 0 });
    }, LONG_PRESS_MS);
    press.current = {
      index,
      key,
      pointerId,
      x: e.clientX,
      y: e.clientY,
      timer,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p) return;
    if (!drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE)
        clearPress();
      return;
    }
    const { slot, scale, startY } = geo.current;
    const n = items.length;
    const raw = (e.clientY - startY) / scale;
    // 最多拖出列表首尾半格
    const dy = Math.max(
      -(drag.from + 0.5) * slot,
      Math.min((n - 1 - drag.from + 0.5) * slot, raw)
    );
    const over = Math.max(
      0,
      Math.min(n - 1, Math.round(drag.from + dy / slot))
    );
    setDrag(d => (d ? { ...d, dy, over } : d));
  };

  const onPointerUp = () => {
    const wasPressing = !!press.current;
    clearPress();
    if (!wasPressing || !drag) return;
    swallowClick.current = true;
    commit(drag.from, drag.over);
    setDrag(null);
  };

  const onPointerCancel = () => {
    clearPress();
    if (drag) {
      swallowClick.current = true;
      setDrag(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled || !e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const to = e.key === "ArrowUp" ? index - 1 : index + 1;
    if (to < 0 || to >= items.length) return;
    commit(index, to);
  };

  return (
    <>
      <ul ref={listRef} className="space-y-0.5">
        {items.map((n, i) => {
          const active = activeKey === n.key;
          const Icon = n.icon;
          const lifted = drag?.key === n.key;
          let ty = 0;
          if (drag) {
            const { from, over, dy } = drag;
            const slot = geo.current.slot;
            if (i === from) ty = dy;
            else if (from < over && i > from && i <= over) ty = -slot;
            else if (from > over && i >= over && i < from) ty = slot;
          }
          return (
            <li
              key={n.key}
              className={cn("relative", lifted && "z-10")}
              style={{
                transform: ty ? `translateY(${ty}px)` : undefined,
                transition:
                  drag && !lifted
                    ? "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                    : undefined,
              }}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={e => {
                  if (swallowClick.current) {
                    swallowClick.current = false;
                    e.preventDefault();
                    return;
                  }
                  onSelect(n.key);
                }}
                onPointerDown={e => onPointerDown(e, i, n.key)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onContextMenu={e => {
                  if (press.current || drag) e.preventDefault();
                }}
                onKeyDown={e => onKeyDown(e, i)}
                aria-current={active ? "page" : undefined}
                aria-describedby="nav-sort-hint"
                className={cn(
                  "relative flex h-9 w-full select-none items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-[background-color,color,box-shadow,transform] duration-150",
                  active
                    ? "bg-paper/[0.08] font-medium text-paper"
                    : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper",
                  lifted &&
                    "scale-[1.03] cursor-grabbing bg-ink-3 text-paper shadow-[0_10px_28px_-6px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-paper/[0.14] hover:bg-ink-3"
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-2 h-5 w-[2px] rounded-full bg-cinnabar"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">{n.label}</span>
                {trailing(n.key)}
              </button>
            </li>
          );
        })}
      </ul>
      <p id="nav-sort-hint" className="sr-only">
        长按拖动可以调整顺序，也可以按 Alt 加上下方向键移动
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
