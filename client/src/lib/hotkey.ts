import type { Platform } from "@/data/types";

/** 全局快捷键。code 用 KeyboardEvent.code（如 KeyQ、Digit1、F5），不受输入法和 ⌥ 字符影响 */
export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Windows 上是 Win 键，Mac 上是 ⌘ */
  meta: boolean;
  code: string;
}

/** 默认用三键组合，避开游戏里常用的 Alt / Ctrl + 单键 */
export const DEFAULT_HOTKEYS: Record<Platform, Hotkey> = {
  win: { ctrl: true, alt: true, shift: false, meta: false, code: "KeyQ" },
  mac: { ctrl: true, alt: true, shift: false, meta: false, code: "KeyQ" },
};

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

export function isModifierCode(code: string) {
  return MODIFIER_CODES.has(code);
}

const NAMED: Record<string, string> = {
  Space: "空格",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Tab: "Tab",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export function keyLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `小键盘 ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return NAMED[code] ?? code;
}

/** 按平台习惯排序：Windows 用文字，Mac 用 ⌃⌥⇧⌘ 符号 */
export function modifierParts(
  m: Pick<Hotkey, "ctrl" | "alt" | "shift" | "meta">,
  platform: Platform
) {
  const parts: string[] = [];
  if (platform === "mac") {
    if (m.ctrl) parts.push("⌃");
    if (m.alt) parts.push("⌥");
    if (m.shift) parts.push("⇧");
    if (m.meta) parts.push("⌘");
  } else {
    if (m.ctrl) parts.push("Ctrl");
    if (m.alt) parts.push("Alt");
    if (m.shift) parts.push("Shift");
    if (m.meta) parts.push("Win");
  }
  return parts;
}

export function hotkeyParts(hk: Hotkey, platform: Platform) {
  return [...modifierParts(hk, platform), keyLabel(hk.code)];
}

export function hotkeyText(hk: Hotkey, platform: Platform) {
  return hotkeyParts(hk, platform).join(" + ");
}

export function matchHotkey(e: KeyboardEvent, hk: Hotkey) {
  return (
    e.code === hk.code &&
    e.ctrlKey === hk.ctrl &&
    e.altKey === hk.alt &&
    e.shiftKey === hk.shift &&
    e.metaKey === hk.meta
  );
}

export function sameHotkey(a: Hotkey, b: Hotkey) {
  return (
    a.code === b.code &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

export function hotkeyFromEvent(e: KeyboardEvent): Hotkey {
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    code: e.code,
  };
}

/** 组合写成 "ctrl+alt+KeyQ" 这样的键，方便查表 */
function sig(hk: Hotkey) {
  return [
    hk.ctrl && "ctrl",
    hk.alt && "alt",
    hk.shift && "shift",
    hk.meta && "meta",
    hk.code,
  ]
    .filter(Boolean)
    .join("+");
}

/** 系统或常用编辑快捷键，不能用 */
const RESERVED: Record<Platform, Record<string, string>> = {
  win: {
    "alt+F4": "关闭窗口",
    "alt+Tab": "切换窗口",
    "alt+Escape": "切换窗口",
    "ctrl+Escape": "开始菜单",
    "ctrl+alt+Delete": "系统安全界面",
    "ctrl+shift+Escape": "任务管理器",
    "ctrl+KeyC": "复制",
    "ctrl+KeyV": "粘贴",
    "ctrl+KeyX": "剪切",
    "ctrl+KeyZ": "撤销",
    "ctrl+KeyA": "全选",
    "ctrl+KeyS": "保存",
    "meta+KeyL": "锁屏",
    "meta+KeyD": "显示桌面",
    "meta+KeyE": "文件资源管理器",
    "meta+KeyR": "运行",
    "meta+Tab": "任务视图",
    "shift+meta+KeyS": "截图",
  },
  mac: {
    "meta+KeyQ": "退出程序",
    "meta+KeyW": "关闭窗口",
    "meta+Tab": "切换程序",
    "meta+Space": "聚焦搜索",
    "ctrl+Space": "切换输入法",
    "meta+KeyC": "复制",
    "meta+KeyV": "粘贴",
    "meta+KeyX": "剪切",
    "meta+KeyZ": "撤销",
    "meta+KeyA": "全选",
    "meta+KeyS": "保存",
    "ctrl+meta+KeyQ": "锁屏",
    "shift+meta+Digit3": "截图",
    "shift+meta+Digit4": "截图",
    "shift+meta+Digit5": "截图",
  },
};

/**
 * 原型里模拟"注册失败：被其他软件占用"。
 * 正式版只能知道注册失败，不知道是哪个软件；这里列的是常见软件的默认键。
 */
const TAKEN: Record<Platform, Record<string, string>> = {
  win: {
    "ctrl+alt+KeyA": "常见于 QQ 截图",
    "alt+KeyA": "常见于微信截图",
    "ctrl+alt+KeyZ": "常见于 QQ 提取消息",
    "alt+KeyZ": "常见于 NVIDIA 游戏叠加层",
  },
  mac: {
    "ctrl+meta+KeyA": "常见于微信截图",
  },
};

export type HotkeyCheck =
  | { ok: true; warn?: string }
  | { ok: false; error: string };

export function checkHotkey(hk: Hotkey, platform: Platform): HotkeyCheck {
  const text = hotkeyText(hk, platform);
  if (!hk.ctrl && !hk.alt && !hk.meta) {
    return {
      ok: false,
      error:
        platform === "mac"
          ? "至少要带 ⌃、⌥ 或 ⌘ 其中一个"
          : "至少要带 Ctrl、Alt 或 Win 其中一个",
    };
  }
  const s = sig(hk);
  const reserved = RESERVED[platform][s];
  if (reserved)
    return { ok: false, error: `${text} 是系统的「${reserved}」，换一个` };
  const taken = TAKEN[platform][s];
  if (taken)
    return { ok: false, error: `${text} 已被其他软件占用（${taken}），换一个` };
  // 只带一个修饰键的两键组合，游戏里常用来绑技能
  const mods = [hk.ctrl, hk.alt, hk.shift, hk.meta].filter(Boolean).length;
  if (platform === "win" && mods === 1 && (hk.ctrl || hk.alt)) {
    return {
      ok: true,
      warn: "两键组合在游戏里常用，可能冲突。建议再加一个 Ctrl、Alt 或 Shift",
    };
  }
  return { ok: true };
}
