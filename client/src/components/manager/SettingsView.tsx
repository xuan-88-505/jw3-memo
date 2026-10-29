import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Btn } from "@/components/common/ui";
import {
  DEFAULT_HOTKEYS,
  checkHotkey,
  hotkeyFromEvent,
  hotkeyParts,
  hotkeyText,
  isModifierCode,
  modifierParts,
  sameHotkey,
  type Hotkey,
} from "@/lib/hotkey";
import { useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./shared";

type Held = Pick<Hotkey, "ctrl" | "alt" | "shift" | "meta">;
const NONE: Held = { ctrl: false, alt: false, shift: false, meta: false };

export function SettingsView() {
  const { state, actions } = useProto();
  const platform = state.platform;
  const hk = state.hotkeys[platform];
  const def = DEFAULT_HOTKEYS[platform];
  const isDefault = sameHotkey(hk, def);
  const current = checkHotkey(hk, platform);

  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<Held>(NONE);
  const [error, setError] = useState("");
  const fieldRef = useRef<HTMLButtonElement>(null);

  const stop = () => {
    setRecording(false);
    setHeld(NONE);
    actions.setRecordingHotkey(false);
  };
  const start = () => {
    setError("");
    setHeld(NONE);
    setRecording(true);
    actions.setRecordingHotkey(true);
  };

  // 离开页面时恢复全局快捷键
  useEffect(() => () => actions.setRecordingHotkey(false), [actions]);

  useEffect(() => {
    if (!recording) return;
    const read = (e: KeyboardEvent): Held => ({
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (e.code === "Escape" && plain) {
        setError("");
        stop();
        return;
      }
      if (isModifierCode(e.code)) {
        setHeld(read(e));
        return;
      }
      const next = hotkeyFromEvent(e);
      const r = checkHotkey(next, platform);
      if (!r.ok) {
        // 留在录制状态，可以直接再按一次
        setError(r.error);
        setHeld(NONE);
        return;
      }
      setError("");
      stop();
      if (!sameHotkey(next, hk)) {
        actions.setHotkey(platform, next);
        actions.toast(
          "manager",
          "success",
          `快捷键改成 ${hotkeyText(next, platform)}`
        );
      }
    };
    const onUp = (e: KeyboardEvent) => setHeld(read(e));
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
    // stop 只改本组件状态，不需要放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, platform, hk, actions]);

  const heldParts = modifierParts(held, platform);

  return (
    <div className="max-w-[680px]">
      <SectionHeader title="设置" />
      <section className="rounded-xl bg-ink-3 ring-1 ring-inset ring-paper/8">
        <div className="flex items-center gap-6 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="hk-label" className="text-[14px] font-medium text-paper">
              呼出面板
            </h2>
            <p className="mt-1 text-[12.5px] text-paper-3">
              全局快捷键，游戏里也能用 · 只对这台电脑生效
            </p>
          </div>

          <button
            ref={fieldRef}
            type="button"
            aria-labelledby="hk-label"
            aria-describedby="hk-msg"
            onClick={() => (recording ? stop() : start())}
            onBlur={() => {
              if (recording) {
                setError("");
                stop();
              }
            }}
            className={cn(
              "flex h-10 w-[248px] shrink-0 items-center gap-2 rounded-lg px-3 text-left transition-colors",
              recording
                ? "bg-cinnabar/[0.07] ring-2 ring-inset ring-cinnabar-text/60"
                : "bg-ink ring-1 ring-inset ring-paper/12 hover:ring-paper/25"
            )}
          >
            {recording ? (
              <>
                <span
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cinnabar"
                  aria-hidden="true"
                />
                {heldParts.length ? (
                  <KeyChips keys={[...heldParts, "…"]} />
                ) : (
                  <span className="text-[13px] text-paper-2">
                    按下新的组合键
                  </span>
                )}
                <span className="ml-auto text-[11.5px] text-paper-3">
                  Esc 取消
                </span>
              </>
            ) : (
              <>
                <KeyChips keys={hotkeyParts(hk, platform)} />
                <span className="ml-auto text-[12px] text-paper-3">修改</span>
              </>
            )}
          </button>
        </div>

        <div id="hk-msg" aria-live="polite" className="px-5">
          {recording && error && (
            <Message tone="error" className="pb-4">
              {error}
            </Message>
          )}
          {!recording && current.ok && current.warn && (
            <Message tone="warn" className="pb-4">
              {current.warn}
            </Message>
          )}
          {!recording && !isDefault && (
            <div className="-ml-2 pb-3">
              <Btn
                variant="ghost"
                size="xs"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => {
                  actions.resetHotkey(platform);
                  actions.toast(
                    "manager",
                    "success",
                    `已恢复默认 ${hotkeyText(def, platform)}`
                  );
                }}
              >
                恢复默认（{hotkeyText(def, platform)}）
              </Btn>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function KeyChips({ keys }: { keys: string[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-grid h-6 min-w-6 place-items-center rounded-[5px] bg-ink-4 px-1.5 font-sans text-[12px] font-medium text-paper ring-1 ring-inset ring-paper/15"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

function Message({
  tone,
  className,
  children,
}: {
  tone: "error" | "warn";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[12.5px]",
        tone === "error" ? "text-cinnabar-text" : "text-gold",
        className
      )}
    >
      <AlertTriangle
        className="mt-px h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      {children}
    </p>
  );
}
