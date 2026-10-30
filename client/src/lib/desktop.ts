/**
 * 桌面版（Tauri）接入。网页原型里 IS_DESKTOP 为 false，这里的函数都不会被调用。
 *
 * 两个窗口加载同一个页面，按窗口 label 选择界面：
 * - panel：托盘 / 菜单栏弹出的面板
 * - manager：管理窗口
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Platform } from "@/data/types";
import type { Hotkey } from "@/lib/hotkey";

export const IS_DESKTOP =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type DesktopWindow = "panel" | "manager";

export const WINDOW_LABEL: DesktopWindow | null = IS_DESKTOP
  ? (getCurrentWindow().label as DesktopWindow)
  : null;

/** 桌面版按真实系统决定快捷键写法和面板样式 */
export const DESKTOP_PLATFORM: Platform =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent)
    ? "mac"
    : "win";

/** 发布页：检查更新时打开 */
export const RELEASES_URL = "https://github.com/xuan-88-505/jw3-memo/releases";

/** 面板请管理窗口打开某一页 */
export interface OpenManagerRequest {
  section?: string;
  schemeId?: string;
  intent?: unknown;
}

const EVT_DATA = "tongdiao://data-changed";
const EVT_OPEN = "tongdiao://open-manager";
const EVT_SHOWN = "tongdiao://panel-shown";

// ---------- 数据文件 ----------

export function loadData() {
  return invoke<string | null>("load_data");
}

export function saveData(json: string) {
  return invoke<void>("save_data", { json });
}

/** data.json 读不出来时改名留作备份；返回备份的文件名 */
export function backupData() {
  return invoke<string | null>("backup_data");
}

/** 另一个窗口保存了数据 */
export function onDataChanged(cb: () => void): Promise<UnlistenFn> {
  return listen<string>(EVT_DATA, e => {
    if (e.payload !== WINDOW_LABEL) cb();
  });
}

/** 弹出保存对话框，把内容写到用户选的位置；用户取消时返回 false */
export async function exportFile(name: string, contents: string) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: name,
    filters: [{ name: "备忘录数据", extensions: ["json"] }],
  });
  if (!path) return false;
  await invoke("write_text_file", { path, contents });
  return true;
}

// ---------- 面板 ----------

export const togglePanel = () => invoke<void>("toggle_panel");
export const hidePanel = () => invoke<void>("hide_panel");
export const setPinned = (pinned: boolean) =>
  invoke<void>("set_pinned", { pinned });
export const resetPanelPosition = () => invoke<void>("reset_panel_position");
export const startDragging = () => getCurrentWindow().startDragging();
export const setTrayBadge = (count: number) =>
  invoke<void>("set_tray_badge", { count });

export function onPanelShown(cb: () => void): Promise<UnlistenFn> {
  return listen(EVT_SHOWN, () => cb());
}

// ---------- 管理窗口 ----------

export function openManager(req: OpenManagerRequest) {
  return invoke<void>("open_manager", { req });
}

export function onOpenManager(
  cb: (req: OpenManagerRequest) => void
): Promise<UnlistenFn> {
  return listen<OpenManagerRequest>(EVT_OPEN, e => cb(e.payload ?? {}));
}

// ---------- 系统功能 ----------

export async function writeClipboard(text: string) {
  const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeText(text);
}

export async function openExternal(url: string) {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

/** 页面里的外链在系统浏览器里打开，不在软件窗口里跳转 */
export function installExternalLinks() {
  document.addEventListener(
    "click",
    e => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      const href = a?.getAttribute("href");
      if (!href || !/^(https?:|mailto:)/i.test(href)) return;
      e.preventDefault();
      void openExternal(href);
    },
    true
  );
}

/** Hotkey → 系统快捷键写法，如 Control+Alt+KeyQ */
export function accelerator(hk: Hotkey) {
  const mods = [
    hk.ctrl && "Control",
    hk.alt && "Alt",
    hk.shift && "Shift",
    hk.meta && "Super",
  ].filter(Boolean);
  return [...mods, hk.code].join("+");
}

/**
 * 注册全局快捷键，替换之前注册的。返回 false 表示被别的软件占用或写法不支持。
 * 游戏全屏时也能用。
 */
export async function registerHotkey(hk: Hotkey, onPress: () => void) {
  const gs = await import("@tauri-apps/plugin-global-shortcut");
  await gs.unregisterAll();
  try {
    await gs.register(accelerator(hk), e => {
      if (e.state === "Pressed") onPress();
    });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterHotkeys() {
  const gs = await import("@tauri-apps/plugin-global-shortcut");
  await gs.unregisterAll();
}

/** 开机自启：和设置保持一致 */
export async function syncAutostart(want: boolean) {
  const auto = await import("@tauri-apps/plugin-autostart");
  const now = await auto.isEnabled();
  if (now === want) return;
  if (want) await auto.enable();
  else await auto.disable();
}
