/**
 * 「有新版本」的记录，管理窗口写、面板读。
 *
 * 检查更新只在管理窗口里跑（lib/update/appUpdate.ts），面板拿不到检查结果。
 * 两个窗口同源，共用 localStorage：管理窗口查到新版本时写进来，查到已是最新时删掉；
 * 面板靠 storage 事件知道变化，在通知里显示一行「新版本」。
 * 记下的版本不比当前版本新（比如已经更新过）时当作没有。
 */
import { useSyncExternalStore } from "react";
import { isNewerVersion } from "@shared/semver";
import { IS_DESKTOP } from "@/lib/desktop";
import { DESKTOP_VERSION } from "@/lib/version";

const KEY = "tongdiao.update.available.v1";
const local = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 记下查到的新版本；null 表示已是最新，删掉记录 */
export function writeUpdateNotice(version: string | null) {
  try {
    if (version) localStorage.setItem(KEY, JSON.stringify({ version }));
    else localStorage.removeItem(KEY);
  } catch {
    return;
  }
  // storage 事件只发给别的窗口，这个窗口自己通知
  local.forEach(l => l());
}

function subscribe(l: () => void) {
  local.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    local.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** 把记录解析成版本号；不是比当前新的合法版本就返回 null */
export function noticeVersion(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "string" && isNewerVersion(v, DESKTOP_VERSION)
      ? v
      : null;
  } catch {
    return null;
  }
}

/** 有可以更新的新版本时返回版本号，否则 null。网页原型里一直是 null */
export function useUpdateNotice(): string | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return IS_DESKTOP ? noticeVersion(raw) : null;
}
