import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useProto, type ToastSurface } from "@/state/store";
import { cn } from "@/lib/utils";

/**
 * 内嵌弹窗：绝对定位在最近的 relative 容器里（面板或管理窗口），
 * 不用 Portal，这样在缩放后的模拟屏幕里位置也正确。
 */
export function InlineModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 420,
  dismissible = true,
  tone = "default",
  bodyMaxHeight = 400,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  dismissible?: boolean;
  tone?: "default" | "warning";
  /** 内容区最高多少像素，超出后内容区滚动 */
  bodyMaxHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 读屏用标题作为弹窗名称、说明作为描述
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      "[data-autofocus], input, textarea, select, button"
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
      }
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 grid animate-fade place-items-center bg-black/55 p-4"
      onPointerDown={e => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-ink-2 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-paper/12"
        style={{ maxWidth: width }}
      >
        <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
          {tone === "warning" && (
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gold/15 text-gold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-serif text-[16px] font-semibold text-paper"
            >
              {title}
            </h2>
            {description && (
              <div
                id={descId}
                className="mt-1 text-[13px] leading-relaxed text-paper-2"
              >
                {description}
              </div>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="-mr-1 grid h-7 w-7 place-items-center rounded-md text-paper-3 hover:bg-paper/[0.08] hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {children && (
          <div
            className="scroll-thin min-h-0 overflow-y-auto px-5 py-2"
            style={{ maxHeight: bodyMaxHeight }}
          >
            {children}
          </div>
        )}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 px-5 pb-4 pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ToastStack({
  surface,
  className,
}: {
  surface: ToastSurface;
  className?: string;
}) {
  const { state, actions } = useProto();
  const toasts = state.toasts.filter(t => t.surface === surface);
  if (!toasts.length) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-50 flex flex-col items-center gap-2 px-3",
        className
      )}
      aria-live="polite"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex max-w-full animate-toast items-start gap-2 rounded-lg bg-ink-4 px-3 py-2 text-[12.5px] leading-snug text-paper shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)] ring-1",
            t.kind === "success" && "ring-jade/35",
            t.kind === "error" && "ring-cinnabar/50",
            t.kind === "info" && "ring-paper/15"
          )}
        >
          {t.kind === "success" && (
            <CheckCircle2
              className="mt-px h-4 w-4 shrink-0 text-jade"
              aria-hidden="true"
            />
          )}
          {t.kind === "error" && (
            <AlertTriangle
              className="mt-px h-4 w-4 shrink-0 text-cinnabar-text"
              aria-hidden="true"
            />
          )}
          {t.kind === "info" && (
            <Info
              className="mt-px h-4 w-4 shrink-0 text-paper-2"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0">{t.text}</span>
          <button
            type="button"
            onClick={() => actions.dismissToast(t.id)}
            aria-label="关闭提示"
            className="-mr-1 ml-1 text-paper-3 hover:text-paper"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function OfflineBar({ compact }: { compact?: boolean }) {
  const { state, actions } = useProto();
  if (state.dataState !== "offline") return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 border-b border-gold/25 bg-gold/[0.09] text-gold",
        compact ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]"
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">离线，显示的是上次同步的内容</span>
      <button
        type="button"
        onClick={actions.retry}
        className="shrink-0 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline"
      >
        重试
      </button>
    </div>
  );
}
