import { useEffect, useRef, type PointerEvent } from "react";
import { useReducedMotion } from "@/components/brand/Huangji";
import { ResizeEdges } from "@/components/panel/ResizeEdges";
import { fromControl } from "@/components/desktop/DesktopScreen";
import { TrayPanel } from "@/components/panel/TrayPanel";
import {
  DESKTOP_PLATFORM,
  getPanelRect,
  hidePanel,
  openManager,
  registerHotkey,
  resetPanelPosition,
  setPanelRect,
  setPinned,
  setTrayBadge,
  setTrayMotion,
  setUiTexts,
  startDragging,
  togglePanel,
  unregisterHotkeys,
} from "@/lib/desktop";
import { tx, useLang } from "@/lib/i18n";
import { trackResize, type Rect, type ResizeDir } from "@/lib/panelSize";
import { cn } from "@/lib/utils";
import { myCharacters, pendingCount, useProto } from "@/state/store";

/** 两次按下间隔小于这个值算双击 */
const DOUBLE_MS = 350;

/**
 * 桌面版的托盘面板窗口。页面铺满窗口；窗口默认 360 × 500，可以拖边缘调大小。
 * 显示、收起、位置、大小由系统窗口负责（见 src-tauri/src/lib.rs）。
 */
export default function DesktopPanel() {
  const { state, actions } = useProto();
  const mac = DESKTOP_PLATFORM === "mac";

  // Mac 的面板窗口是透明的，圆角由页面画
  useEffect(() => {
    document.documentElement.classList.add("desktop-panel");
    if (mac) document.documentElement.classList.add("desktop-mac");
  }, [mac]);

  // 全局快捷键：游戏全屏时也能开关面板
  const hk = state.hotkeys[state.platform];
  useEffect(() => {
    void registerHotkey(hk, () => void togglePanel()).then(ok => {
      if (!ok) console.warn("快捷键注册失败，可能被别的软件占用");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hk.ctrl, hk.alt, hk.shift, hk.meta, hk.code]);
  useEffect(() => () => void unregisterHotkeys(), []);

  // 置顶：系统窗口按这个决定失去焦点时收不收起
  useEffect(() => {
    void setPinned(state.pinned);
  }, [state.pinned]);

  // 托盘提示里的更新数
  const pending = pendingCount(state);
  const lang = useLang();
  useEffect(() => {
    void setTrayBadge(
      pending,
      pending > 0 ? tx("备忘录 · {0} 条更新", pending) : tx("备忘录")
    );
  }, [pending, lang]);
  // 托盘黄鸡动效；系统开了"减少动态效果"时不动
  const reduced = useReducedMotion();
  useEffect(() => {
    void setTrayMotion(reduced ? "off" : state.trayMotion);
  }, [state.trayMotion, reduced]);
  // 托盘菜单和窗口标题跟着界面语言
  useEffect(() => {
    void setUiTexts({
      title: tx("备忘录"),
      open: tx("打开备忘录"),
      quit: tx("退出"),
    });
  }, [lang]);

  // Esc 收起（置顶时不收）；1–9 切换角色
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape" && !state.pinned) {
        void hidePanel();
        return;
      }
      if (
        !typing &&
        /^[1-9]$/.test(e.key) &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const c = myCharacters(state)[Number(e.key) - 1];
        if (c) actions.selectCharacter(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, actions]);

  // 按住标题栏空白处拖动；双击回到托盘旁
  const lastDown = useRef(0);
  const onHeaderPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || fromControl(e.target)) return;
    const now = Date.now();
    if (now - lastDown.current < DOUBLE_MS) {
      lastDown.current = 0;
      void resetPanelPosition();
      return;
    }
    lastDown.current = now;
    void startDragging();
  };

  // Mac 拖边缘调大小：系统不支持无边框窗口的拖边缘缩放，由页面算新位置和大小。
  // Windows 由系统处理，不用页面上的热区。
  const startRect = useRef<Rect | null>(null);
  const onResizeStart = (dir: ResizeDir, e: PointerEvent) => {
    startRect.current = null;
    void getPanelRect().then(r => {
      startRect.current = r;
    });
    const moved = dir.includes("n") || dir.includes("w");
    trackResize(e, dir, {
      start: () => startRect.current,
      onChange: r => void setPanelRect(r, moved),
    });
  };

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden",
        mac ? "bg-transparent" : "bg-ink"
      )}
    >
      {/* 换语言时只重新挂载面板界面；快捷键和事件监听留在外层，不重新注册 */}
      <TrayPanel
        key={lang}
        className={cn(
          "desktop-solid h-full w-full shadow-none",
          // Windows 11 的无边框窗口由系统画圆角和阴影
          !mac && "rounded-none"
        )}
        onHeaderPointerDown={onHeaderPointerDown}
        onOpenManager={(section, schemeId, intent) => {
          void openManager({ section, schemeId, intent });
          if (!state.pinned) void hidePanel();
        }}
      />
      {mac && <ResizeEdges onResizeStart={onResizeStart} />}
    </div>
  );
}
