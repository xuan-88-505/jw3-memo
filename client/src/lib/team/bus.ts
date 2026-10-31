/**
 * 管理窗口和面板之间的亲友团事件。同步只在管理窗口跑；面板需要知道
 * 是不是离线，也要能在点「重试」时请管理窗口马上同步一次。
 * 网页原型里这些函数什么都不做。
 */
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { IS_DESKTOP, WINDOW_LABEL } from "@/lib/desktop";

const EVT_STATUS = "tongdiao://team-status";
const EVT_SYNC = "tongdiao://team-sync";
const STATUS_KEY = "tongdiao.teamOnline";

export interface BusStatus {
  /** 在亲友团里并且连不上服务器 */
  offline: boolean;
}

export function lastBusStatus(): BusStatus {
  try {
    return { offline: localStorage.getItem(STATUS_KEY) === "offline" };
  } catch {
    return { offline: false };
  }
}

export function emitStatus(s: BusStatus) {
  try {
    if (s.offline) localStorage.setItem(STATUS_KEY, "offline");
    else localStorage.removeItem(STATUS_KEY);
  } catch {
    /* 本地存储不可用时只发事件 */
  }
  if (IS_DESKTOP) void emit(EVT_STATUS, s).catch(() => {});
}

export function onStatus(cb: (s: BusStatus) => void): Promise<UnlistenFn> {
  if (!IS_DESKTOP) return Promise.resolve(() => {});
  return listen<BusStatus>(EVT_STATUS, e => cb(e.payload));
}

/** 本窗口里的同步请求监听（管理窗口自己点「重试」时不用绕系统事件） */
const localSync = new Set<() => void>();

/** 请管理窗口马上同步一次 */
export function requestSync() {
  if (WINDOW_LABEL === "manager") {
    localSync.forEach(cb => cb());
    return;
  }
  if (IS_DESKTOP) void emit(EVT_SYNC, null).catch(() => {});
}

export function onSyncRequest(cb: () => void): Promise<UnlistenFn> {
  localSync.add(cb);
  const drop = () => void localSync.delete(cb);
  if (!IS_DESKTOP) return Promise.resolve(drop);
  return listen(EVT_SYNC, () => cb()).then(off => () => {
    drop();
    off();
  });
}
