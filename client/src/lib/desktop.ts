/**
 * 桌面版（Tauri）接入。网页原型里 IS_DESKTOP 为 false，这里的函数都不会被调用。
 *
 * 两个窗口加载同一个页面，按窗口 label 选择界面：
 * - panel：托盘 / 菜单栏弹出的面板
 * - manager：管理窗口
 */
import type { Rect } from "@/lib/panelSize";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Platform } from "@/data/types";
import type { Hotkey } from "@/lib/hotkey";
import { tx } from "@/lib/i18n";

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
/** 已发布的网站。桌面版页面不在网站上，调用服务器接口（如意见反馈）时用这个地址 */
export const SITE_ORIGIN = "https://tongdiao-k5ujnxu8.manus.space";

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

/**
 * 写 data.json。expected 是写之前读到的文件内容（没有文件时为空字符串）：
 * 文件已被另一个窗口改过时不写，返回 "conflict" 错误。不传就直接写。
 */
export function saveData(json: string, expected?: string) {
  return invoke<void>("save_data", { json, expected: expected ?? null });
}
export function isSaveConflict(err: unknown) {
  return String(err).includes("conflict");
}

/** data.json 读不出来时改名留作备份；返回备份的文件名 */
export function backupData() {
  return invoke<string | null>("backup_data");
}

/** 复制一份 data.json 留作备份（原文件不动）；返回备份的文件名 */
export function copyDataBackup() {
  return invoke<string | null>("copy_data_backup");
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
    filters: [{ name: tx("备忘录数据"), extensions: ["json"] }],
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
/** 回到托盘旁；size 为 true 时大小也回到默认 */
export const resetPanelPosition = (opts?: { size?: boolean }) =>
  invoke<void>("reset_panel_position", { size: opts?.size ?? false });
/** 面板窗口的位置和大小（逻辑像素）。Mac 拖边缘调大小时用 */
export async function getPanelRect(): Promise<Rect | null> {
  const r = await invoke<[number, number, number, number] | null>(
    "get_panel_rect"
  );
  return r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : null;
}
/** moved：拖的是左边或上边，位置也跟着变 */
export const setPanelRect = (r: Rect, moved: boolean) =>
  invoke<void>("set_panel_rect", { ...r, moved });
export const startDragging = () => getCurrentWindow().startDragging();
export const setTrayBadge = (count: number, tip: string) =>
  invoke<void>("set_tray_badge", { count, tip });
/** 托盘黄鸡动效：悬停时 / 一直动 / 不动（见 src-tauri/src/tray_motion.rs） */
export const setTrayMotion = (mode: "hover" | "always" | "off") =>
  invoke<void>("set_tray_motion", { mode });
/** 托盘菜单和窗口标题，按界面语言 */
export const setUiTexts = (texts: {
  title: string;
  open: string;
  quit: string;
}) => invoke<void>("set_ui_texts", texts);

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

/**
 * 读剪贴板里的图片；没有图片或读不了返回 null。
 * 桌面版用剪贴板插件（返回像素），网页版用浏览器剪贴板接口。
 */
export async function readClipboardImage(): Promise<Blob | ImageData | null> {
  try {
    if (IS_DESKTOP) {
      const { readImage } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      const img = await readImage();
      try {
        const { width, height } = await img.size();
        const rgba = await img.rgba();
        if (!width || !height) return null;
        return new ImageData(new Uint8ClampedArray(rgba), width, height);
      } finally {
        // 图片在 Rust 端占着资源，读完释放
        void img.close().catch(() => {});
      }
    }
    const items = (await navigator.clipboard?.read?.()) ?? [];
    for (const it of items) {
      const type = it.types.find(t => t.startsWith("image/"));
      if (type) return await it.getType(type);
    }
  } catch {
    // 剪贴板里不是图片、没有权限，都按没有图片处理
  }
  return null;
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
