/**
 * 桌面版一键更新。只在管理窗口里用（权限文件 capabilities/updater.json 只给了管理窗口）。
 *
 * 流程：检查 → 有新版本时侧栏「设置」出现小点、设置页「版本」行出现「更新」→
 * 用户确认后下载（显示进度）→ 写盘并备份 data.json → 安装 →
 * Windows 安装程序自动关掉并重新打开软件；Mac 换好后由这里重启。
 * 下载最多试 3 次：前两次经我们的服务器转发；第三次带直连请求头重新检查，
 * 服务器返回 GitHub 的原始地址，改从 GitHub 直接下。三次都断了才报错。
 * 查到的新版本同时记进 localStorage（lib/update/notice.ts），面板的通知里也显示。
 *
 * 更新地址和公钥在 src-tauri/tauri.conf.json 的 plugins.updater；
 * 服务端见 server/update.ts。网页原型里这些函数都不会联网。
 */
import { useSyncExternalStore } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { IS_DESKTOP, copyDataBackup } from "@/lib/desktop";
import { DESKTOP_VERSION } from "@/lib/version";
import { acquireDataHold, releaseDataHold } from "./hold";
import { noticeVersion, writeUpdateNotice } from "./notice";

/** 下载安装包的最长时间 */
const DOWNLOAD_TIMEOUT = 15 * 60 * 1000;
/** 下载最多试几次；最后一次改从 GitHub 直接下 */
export const DOWNLOAD_TRIES = 3;
/** 断了以后等一会儿再试，避开短暂的断网 */
const RETRY_DELAY_MS = 1500;
/** 检查更新时带上，服务器返回 GitHub 的原始下载地址（server/update.ts 的 DIRECT_HEADER） */
const DIRECT_HEADERS = { "X-JW3-Download": "direct" };

export interface UpdateInfo {
  version: string;
  /** 更新内容（Release 正文前面的「本版更新」），可能为空 */
  notes: string;
  /** 发布时间，毫秒；没有时为 null */
  date: number | null;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "installing"
  | "error";

export type UpdateErrorStage =
  | "check"
  | "download"
  | "sync"
  | "save"
  | "install";

export interface UpdateState {
  phase: UpdatePhase;
  /** 检查到的新版本；没有新版本时为 null */
  available: UpdateInfo | null;
  /** 用户点的「检查更新」（不是启动时自动检查） */
  manual: boolean;
  /** 上次检查完成的时间 */
  checkedAt: number | null;
  received: number;
  total: number | null;
  /** 第几次下载（从 1 开始）；大于 1 表示前面断过，正在重试 */
  attempt: number;
  /** 这次下载是不是从 GitHub 直接下（不经我们的服务器） */
  direct: boolean;
  error: UpdateErrorStage | null;
}

const INITIAL: UpdateState = {
  phase: "idle",
  available: null,
  manual: false,
  checkedAt: null,
  received: 0,
  total: null,
  attempt: 1,
  direct: false,
  error: null,
};

let state: UpdateState = INITIAL;
let handle: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

export function getUpdateState() {
  return state;
}

const busy = () =>
  state.phase === "checking" ||
  state.phase === "downloading" ||
  state.phase === "installing";

/**
 * 检查有没有新版本。manual 为 true 时是用户点的，失败要告诉用户；
 * 自动检查失败（比如没联网）不打扰。返回检查结果：新版本信息、null（已是最新），
 * 失败时返回 undefined。
 * 正在检查时再调用，等同一次检查的结果；用户点的会把这次检查标成手动的。
 */
let inflight: Promise<UpdateInfo | null | undefined> | null = null;

export function checkForUpdate(
  manual: boolean
): Promise<UpdateInfo | null | undefined> {
  if (!IS_DESKTOP) return Promise.resolve(undefined);
  if (inflight) {
    if (manual && !state.manual) set({ manual: true });
    return inflight;
  }
  if (busy()) return Promise.resolve(undefined);
  // 用户正看着失败提示（比如更新弹窗里的「安装没有完成」）：定时的自动检查不把它刷掉
  if (!manual && state.phase === "error") return Promise.resolve(undefined);
  const run = runCheck(manual);
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

async function runCheck(
  manual: boolean
): Promise<UpdateInfo | null | undefined> {
  set({ phase: "checking", manual, error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const next = await check({ timeout: 20_000 });
    const old = handle;
    handle = next;
    if (old && old !== next) void old.close().catch(() => {});
    const info: UpdateInfo | null = next
      ? {
          version: next.version,
          notes: (next.body ?? "").trim(),
          date: parseDate(next.date),
        }
      : null;
    set({
      phase: "idle",
      available: info,
      checkedAt: Date.now(),
      received: 0,
      total: null,
    });
    writeUpdateNotice(info?.version ?? null);
    return info;
  } catch (err) {
    console.warn("检查更新失败", err);
    // 自动检查失败：保留之前查到的结果，不显示错误。中途用户点了检查就按手动的算
    set(
      state.manual
        ? { phase: "error", error: "check", checkedAt: Date.now() }
        : { phase: "idle" }
    );
    return undefined;
  }
}

/** 关掉错误提示，回到之前的状态 */
export function dismissUpdateError() {
  if (state.phase === "error") set({ phase: "idle", error: null });
}

const PENDING_KEY = "tongdiao.update.pending.v1";
interface Pending {
  from: string;
  to: string;
  at: number;
}

/**
 * 下载并安装新版本。顺序：下载 → 写盘 → 备份 data.json → 记下「正在更新」→ 安装。
 * Windows 上 install() 启动安装程序后软件会立刻退出，所以写盘和备份必须在它前面。
 */
export async function installUpdate() {
  if (!IS_DESKTOP || !handle || !state.available || busy()) return;
  let update = handle;
  let to = state.available.version;
  set({
    phase: "downloading",
    received: 0,
    total: null,
    attempt: 1,
    direct: false,
    error: null,
  });
  for (let attempt = 1; ; attempt++) {
    const direct = attempt === DOWNLOAD_TRIES;
    try {
      if (attempt > 1) {
        set({ attempt, direct, received: 0, total: null });
        await sleep(RETRY_DELAY_MS);
      }
      if (direct) {
        const next = await recheckDirect();
        if (!next) throw new Error("重新检查时没有新版本了");
        update = next;
        to = next.version;
      }
      await downloadOnce(update);
      break;
    } catch (err) {
      console.warn(`下载更新失败（第 ${attempt} 次）`, err);
      if (attempt >= DOWNLOAD_TRIES) {
        set({ phase: "error", error: "download" });
        return;
      }
    }
  }
  set({ phase: "installing" });
  // 锁定两个窗口的数据，确认改动都写进了 data.json，之后的改动不再生效（见 hold.ts）
  const held = await acquireDataHold().catch(() => "save" as const);
  if (held) {
    set({ phase: "error", error: held === "sync" ? "sync" : "save" });
    return;
  }
  await copyDataBackup().catch(() => null);
  const pending: Pending = { from: DESKTOP_VERSION, to, at: Date.now() };
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* 记不下也照常更新，只是重启后少一条提示 */
  }
  try {
    await update.install();
    // Windows 到不了这里（安装程序已接手）；Mac 已换好新版本，重启
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.warn("安装更新失败", err);
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    releaseDataHold();
    set({ phase: "error", error: "install" });
  }
}

const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));

/** 下载一次，进度写进 state；断了、超时都抛错 */
async function downloadOnce(update: Update) {
  let received = 0;
  await update.download(
    ev => {
      if (ev.event === "Started") {
        set({ total: ev.data.contentLength ?? null });
      } else if (ev.event === "Progress") {
        received += ev.data.chunkLength;
        set({ received });
      }
    },
    // 网络卡住时不要一直转圈：15 分钟还没下完就算这次失败
    { timeout: DOWNLOAD_TIMEOUT }
  );
}

/**
 * 带直连请求头重新检查一次，拿到下载地址是 GitHub 原始地址的更新。
 * 换掉手上的更新对象；版本变了（刚好又发了新版）就按新版本显示。
 */
async function recheckDirect(): Promise<Update | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const next = await check({ timeout: 20_000, headers: DIRECT_HEADERS });
  if (!next) return null;
  const old = handle;
  handle = next;
  if (old && old !== next) void old.close().catch(() => {});
  if (next.version !== state.available?.version) {
    set({
      available: {
        version: next.version,
        notes: (next.body ?? "").trim(),
        date: parseDate(next.date),
      },
    });
    writeUpdateNotice(next.version);
  }
  return next;
}

/**
 * 重启后看上次的更新有没有完成：
 * 版本变成了目标版本 → "done"；没变且是 30 分钟内的更新 → "failed"；其他情况不提示。
 */
export function takePendingResult(): {
  result: "done" | "failed";
  to: string;
} | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    if (typeof p.to !== "string" || typeof p.at !== "number") return null;
    if (p.to === DESKTOP_VERSION) return { result: "done", to: p.to };
    if (Date.now() - p.at < 30 * 60 * 1000 && p.from === DESKTOP_VERSION)
      return { result: "failed", to: p.to };
  } catch {
    /* 内容不对就当没有 */
  }
  return null;
}

/** 启动后多久第一次自动检查、之后每隔多久再查一次 */
const FIRST_CHECK_MS = 8_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * 管理窗口启动时调用：处理上次更新的结果，然后定时自动检查。返回停止函数。
 * onResult 用来弹提示、打开设置页（由调用方按界面语言写文案）。
 */
export function startUpdateWatcher(
  onResult: (r: { result: "done" | "failed"; to: string }) => void
) {
  if (!IS_DESKTOP) return () => {};
  // 记下的新版本已经不比现在新（比如刚更新过）就删掉，面板不再提示
  try {
    const raw = localStorage.getItem("tongdiao.update.available.v1");
    if (raw && !noticeVersion(raw)) writeUpdateNotice(null);
  } catch {
    /* ignore */
  }
  const pending = takePendingResult();
  if (pending) onResult(pending);
  const first = window.setTimeout(
    () => void checkForUpdate(false),
    FIRST_CHECK_MS
  );
  const timer = window.setInterval(
    () => void checkForUpdate(false),
    CHECK_EVERY_MS
  );
  return () => {
    window.clearTimeout(first);
    window.clearInterval(timer);
  };
}

function parseDate(d: string | undefined | null): number | null {
  if (!d) return null;
  // 插件按 RFC 3339 给时间（如 "2026-11-03T06:00:00Z"，commands.rs 里 format(Rfc3339)），
  // Date 能直接解析；解析不了时只取日期部分，按 UTC 零点算
  const t = Date.parse(d);
  if (!Number.isNaN(t)) return t;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 字节数写成 MB，保留一位小数 */
export function formatMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}
