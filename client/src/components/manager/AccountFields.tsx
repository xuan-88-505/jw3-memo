import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";
import { inputCls } from "./shared";

/**
 * 输错时左右抖一下（系统开了减少动态效果时不抖）。
 * 用 Web Animations，不改 className，重新渲染不会打断。
 */
export function shake(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 360, easing: "ease-out" }
  );
}

/** 密码框：右边的眼睛按钮切换显示/隐藏，方便确认没输错 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { invalid?: boolean }
>(function PasswordInput({ invalid, className, disabled, ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="off"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(inputCls(!!invalid), "h-9 w-full pr-9", className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        disabled={disabled}
        aria-label={show ? tx("隐藏密码") : tx("显示密码")}
        aria-pressed={show}
        title={show ? tx("隐藏密码") : tx("显示密码")}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-paper-3 transition-colors hover:text-paper disabled:opacity-45"
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
