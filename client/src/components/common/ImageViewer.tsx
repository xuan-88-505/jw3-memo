import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/**
 * 看大图：挂到最近的 [data-layer-root]（管理窗口根节点），盖住整个窗口。
 * 用 Portal 挂出去，所以在弹窗里打开时，Esc 只关大图，不会把弹窗一起关掉。
 */
function ImageViewer({
  images,
  start,
  caption,
  fixed,
  onClose,
}: {
  images: NoteImage[];
  start: number;
  caption?: string;
  /** 挂在 body 上时用 fixed 铺满视口 */
  fixed: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = images.length;
  const img = images[Math.min(i, n - 1)];

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setI(v => Math.max(0, v - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setI(v => Math.min(n - 1, v + 1));
      } else if (e.key === "Tab") {
        // 焦点只在大图里转
        const items = Array.from(
          el.querySelectorAll<HTMLElement>("button:not(:disabled)")
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  if (!img) return null;
  const nav =
    "absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-paper/[0.08] text-paper ring-1 ring-inset ring-paper/10 transition-colors hover:bg-paper/[0.16] disabled:pointer-events-none disabled:opacity-0";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={
        n > 1 ? tx("查看图片，第 {0} 张，共 {1} 张", i + 1, n) : tx("查看图片")
      }
      className={cn(
        "inset-0 z-[60] flex animate-fade flex-col bg-black/90",
        fixed ? "fixed" : "absolute"
      )}
      // 大图在表格行、弹窗里打开，事件不再往外冒，免得点一下触发「修改记录」
      onClick={e => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 px-4">
        <p className="text-[13px] tabular-nums text-paper-2">
          {n > 1 ? `${i + 1} / ${n}` : ""}
        </p>
        <span className="flex-1" />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={tx("关闭")}
          title={tx("关闭（Esc）")}
          className="grid h-8 w-8 place-items-center rounded-md text-paper-2 transition-colors hover:bg-paper/[0.1] hover:text-paper"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-16"
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <img
          key={img.id}
          src={img.src}
          alt={tx("第 {0} 张图片", i + 1)}
          width={img.w}
          height={img.h}
          draggable={false}
          className="h-auto max-h-full w-auto max-w-full animate-fade rounded-md object-contain shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)]"
        />
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => setI(v => Math.max(0, v - 1))}
              disabled={i === 0}
              aria-label={tx("上一张")}
              title={tx("上一张（←）")}
              className={cn(nav, "left-4")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setI(v => Math.min(n - 1, v + 1))}
              disabled={i === n - 1}
              aria-label={tx("下一张")}
              title={tx("下一张（→）")}
              className={cn(nav, "right-4")}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      <div
        className="flex min-h-12 shrink-0 items-center justify-center px-6 py-3"
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {caption && (
          <p className="line-clamp-2 max-w-[720px] text-center text-[13px] leading-relaxed text-paper-2">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

/** 打开大图。返回的 node 放进组件里任意位置即可（会 Portal 到窗口根节点） */
export function useImageViewer() {
  const [st, setSt] = useState<{
    images: NoteImage[];
    index: number;
    caption?: string;
    host: HTMLElement;
  } | null>(null);
  const from = useRef<HTMLElement | null>(null);

  const open = useCallback(
    (images: NoteImage[], index: number, el: HTMLElement, caption?: string) => {
      from.current = el;
      setSt({
        images,
        index,
        caption,
        host:
          (el.closest("[data-layer-root]") as HTMLElement | null) ??
          document.body,
      });
    },
    []
  );
  const close = useCallback(() => {
    setSt(null);
    // 关掉后焦点回到点开它的缩略图
    requestAnimationFrame(() => from.current?.focus());
  }, []);

  const node = st
    ? createPortal(
        <ImageViewer
          images={st.images}
          start={st.index}
          caption={st.caption}
          fixed={st.host === document.body}
          onClose={close}
        />,
        st.host
      )
    : null;
  return { open, node };
}
