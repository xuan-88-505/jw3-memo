/**
 * 一键更新安装前的「锁定数据」。
 *
 * 安装程序一接手，软件就会退出（Windows 立刻退出，Mac 换好文件后重启）。
 * 所以安装前要确认两个窗口的改动都已经写进 data.json，并且之后不会再有新改动：
 *
 * 1. 暂停亲友团同步：先把等着推送的改动推上去，再等正在跑的同步跑完。
 *    不能直接拦下同步结果，否则服务器以为本机已经拿到了，本机却没存下。
 * 2. 本窗口锁定：能写进 data.json 的改动不再生效（store 里按 isDataHold() 拦下）。
 * 3. 通知面板窗口锁定并立刻写盘，等它回复写好了。
 * 4. 本窗口立刻写盘，写完再看一眼，直到没有没写进文件的改动。
 *
 * 任何一步失败都解除锁定，不安装。
 */
import { emit, listen } from "@tauri-apps/api/event";
import { IS_DESKTOP, WINDOW_LABEL } from "@/lib/desktop";

const EVT_HOLD = "tongdiao://update-hold";
const EVT_HOLD_ACK = "tongdiao://update-hold-ack";
/** 面板写盘的最长等待 */
const PANEL_WAIT = 8_000;
/** 正在跑的亲友团同步最长等待 */
const SYNC_WAIT = 20_000;
/** 面板自己解除锁定的时限：管理窗口没来得及通知解除时，不让面板一直改不了 */
const PANEL_HOLD_MAX = 120_000;

interface HoldMessage {
  id: string;
  on: boolean;
}
interface HoldAck {
  id: string;
  ok: boolean;
}

let held = false;
/** 是否在锁定中。锁定时能写进 data.json 的改动不生效 */
export function isDataHold() {
  return held;
}

type HoldListener = () => void;
const blockedListeners = new Set<HoldListener>();
/** 锁定期间有改动被拦下时调用（用来提示一次） */
export function onHoldBlocked(cb: HoldListener) {
  blockedListeners.add(cb);
  return () => {
    blockedListeners.delete(cb);
  };
}
export function notifyHoldBlocked() {
  blockedListeners.forEach(cb => cb());
}

/* ---------- 亲友团同步 ---------- */
export interface SyncHooks {
  /** 推送等着的改动，停掉之后的同步；返回正在跑的那次同步 */
  pause: () => Promise<void>;
  resume: () => void;
}
let syncHooks: SyncHooks | null = null;
export function registerSyncHooks(h: SyncHooks) {
  syncHooks = h;
  return () => {
    if (syncHooks === h) syncHooks = null;
  };
}

/* ---------- 写盘 ---------- */
type Flush = () => Promise<boolean>;
let flushStrict: Flush | null = null;
/** store 注册本窗口的严格写盘：写完再看一眼，直到干净；读不到文件就失败 */
export function registerStrictFlush(f: Flush) {
  flushStrict = f;
  return () => {
    if (flushStrict === f) flushStrict = null;
  };
}

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    p.then(
      v => {
        window.clearTimeout(t);
        resolve(v);
      },
      () => {
        window.clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

let releaseTimer = 0;
/**
 * 面板窗口：收到管理窗口的锁定通知后锁定、写盘、回复；收到解除通知后解除。
 * 在 store 里调用一次。管理窗口和网页原型里什么都不做。
 */
export function installPanelHoldListener(): () => void {
  if (!IS_DESKTOP || WINDOW_LABEL !== "panel") return () => {};
  const off = listen<HoldMessage>(EVT_HOLD, async e => {
    const msg = e.payload;
    if (!msg || typeof msg.id !== "string") return;
    window.clearTimeout(releaseTimer);
    if (!msg.on) {
      held = false;
      return;
    }
    held = true;
    releaseTimer = window.setTimeout(() => {
      held = false;
    }, PANEL_HOLD_MAX);
    const ok = flushStrict ? await flushStrict().catch(() => false) : false;
    void emit(EVT_HOLD_ACK, { id: msg.id, ok } satisfies HoldAck);
  });
  return () => {
    void off.then(f => f());
  };
}

function askPanel(id: string): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    let unlisten: (() => void) | null = null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      unlisten?.();
      resolve(ok);
    };
    const t = window.setTimeout(() => finish(false), PANEL_WAIT);
    void listen<HoldAck>(EVT_HOLD_ACK, e => {
      if (e.payload?.id === id) finish(!!e.payload.ok);
    })
      .then(f => {
        if (done) f();
        else unlisten = f;
        // 先挂好回复的监听再发通知，免得面板回得太快收不到
        return emit(EVT_HOLD, { id, on: true } satisfies HoldMessage);
      })
      .catch(() => finish(false));
  });
}

let currentId: string | null = null;
let syncPaused = false;

/** 解除锁定：两个窗口都恢复，亲友团同步继续 */
export function releaseDataHold() {
  held = false;
  if (currentId) {
    void emit(EVT_HOLD, {
      id: currentId,
      on: false,
    } satisfies HoldMessage).catch(() => null);
    currentId = null;
  }
  if (syncPaused) {
    syncPaused = false;
    syncHooks?.resume();
  }
}

export type HoldFailure = "sync" | "panel" | "save";

/**
 * 管理窗口：锁定两个窗口的数据并确认都写进了文件。
 * 成功返回 null（保持锁定，接着安装）；失败返回原因并解除锁定。
 */
export async function acquireDataHold(): Promise<HoldFailure | null> {
  if (!IS_DESKTOP) return null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (syncHooks) {
    syncPaused = true;
    const idle = await timeout(
      syncHooks.pause().then(() => true),
      SYNC_WAIT,
      false
    );
    if (!idle) {
      releaseDataHold();
      return "sync";
    }
  }
  held = true;
  currentId = id;
  if (!(await askPanel(id))) {
    releaseDataHold();
    return "panel";
  }
  const ok = flushStrict ? await flushStrict().catch(() => false) : false;
  if (!ok) {
    releaseDataHold();
    return "save";
  }
  return null;
}
