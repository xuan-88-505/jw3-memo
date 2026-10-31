/**
 * 亲友团同步引擎（只在桌面版的管理窗口里运行；管理窗口关闭时只是隐藏，引擎一直在）。
 *
 * - 拉取：启动时、面板弹出、管理窗口获得焦点（20 秒内只拉一次）、点「重试」、
 *   恢复联网时，以及每 10 分钟一次。
 * - 推送：本机数据变了 1.5 秒后推；窗口隐藏时马上推。
 * - 离线：dataState 设成 offline（面板和管理窗口都显示离线条，共用数据不能保存），
 *   每分钟自动重试。
 * - 令牌失效（被移出亲友团、在别处退出）：先备份，再按退出处理。
 *
 * 网页原型没有这个 Provider，useTeam() 返回 null，界面继续用原型里的模拟动作。
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthResult,
  EntityRecord,
  LoginCodeResponse,
  MemberPatch,
  TeamRole,
} from "@shared/teamApi";
import { ME_ID } from "@/data/seed";
import type { CharacterAvatar, Scheme } from "@/data/types";
import { DESKTOP_PLATFORM, copyDataBackup, onPanelShown, openManager } from "@/lib/desktop";
import { tx } from "@/lib/i18n";
import { me, useProto, type ProtoState } from "@/state/store";
import {
  clearAccount,
  emptyPending,
  loadAccount,
  newAccount,
  pendingCountOf,
  saveAccount,
  type Account,
} from "./account";
import {
  TeamApiError,
  assetUrl,
  isOffline,
  isUnauthorized,
  teamApi,
} from "./api";
import { emitStatus, onSyncRequest } from "./bus";
import {
  avatarToServer,
  collectEntities,
  collectionsOf,
  entityKey,
  hashJson,
  isDataUrl,
  membersFromServer,
  replaceImages,
  stableJson,
  teamFromServer,
} from "./mapping";
import {
  applyOps,
  applyPushResults,
  batches,
  buildChange,
  filterPending,
  mergePending,
  planConflict,
  planPull,
  planPush,
  prepareJoin,
  prepareLeave,
  tooLarge,
  type Op,
  type Outgoing,
} from "./sync";

export type TeamStatus = "idle" | "syncing" | "offline";

export interface TeamSession {
  account: Account | null;
  status: TeamStatus;
  /** 加入时本机有、还没放进亲友团的方案和记录 */
  pendingCount: number;
  syncNow: () => Promise<void>;
  create: (p: { teamName: string; nickname: string }) => Promise<void>;
  join: (p: { inviteCode: string; nickname: string }) => Promise<void>;
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** memberId 是本地 id（自己是 ME_ID） */
  loginCode: (memberId?: string) => Promise<LoginCodeResponse>;
  updateMe: (p: { name?: string; avatar?: CharacterAvatar }) => Promise<void>;
  setRole: (memberId: string, role: TeamRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  resetInvite: () => Promise<void>;
  renameTeam: (name: string) => Promise<void>;
  mergePending: () => void;
  discardPending: () => void;
}

const Ctx = createContext<TeamSession | null>(null);

/** 桌面版管理窗口里是同步引擎；网页原型和面板里是 null */
export function useTeam() {
  return useContext(Ctx);
}

/** 接口错误转成界面文字（服务器的说明是中文，常见的按当前语言显示） */
export function teamErrorText(err: unknown): string {
  if (!(err instanceof TeamApiError)) return tx("出错了，请稍后再试");
  switch (err.code) {
    case "offline":
      return tx("连不上服务器，检查网络后再试");
    case "invite_invalid":
      return tx("邀请码不对或已失效");
    case "code_invalid":
      return tx("登录码不对或已过期");
    case "nickname_taken":
      return tx("这个昵称已经有人用了");
    case "last_admin":
      return tx("亲友团至少要有一个管理员");
    case "forbidden":
      return tx("没有权限");
    case "unauthorized":
      return tx("登录已失效，请重新加入");
    case "too_large":
      return tx("内容太大，没有保存");
    case "rate_limited":
      return err.retryAfter
        ? tx("操作太频繁，{0} 秒后再试", err.retryAfter)
        : tx("操作太频繁，稍后再试");
    default:
      return tx(err.message);
  }
}

const PULL_EVERY = 10 * 60_000;
const PUSH_DELAY = 1500;
const OFFLINE_RETRY = 60_000;
const PULL_THROTTLE = 20_000;

const sameJson = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

async function dataUrlBlob(src: string) {
  return (await fetch(src)).blob();
}

function schemeLabel(s: Scheme) {
  return s.title || `${s.xinfa} ${s.mode}`;
}

function replaceScheme(list: Scheme[], id: string, next: Scheme | null) {
  const rest = list.filter(s => s.id !== id);
  if (!next) return rest;
  const i = list.findIndex(s => s.id === id);
  if (i < 0) return [...list, next];
  return list.map(s => (s.id === id ? next : s));
}

export function TeamSyncProvider({ children }: { children: ReactNode }) {
  const { state, actions } = useProto();
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [account, setAccount] = useState<Account | null>(loadAccount);
  const [status, setStatus] = useState<TeamStatus>("idle");
  const accRef = useRef(account);

  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  if (!engine.current)
    engine.current = createEngine({
      state: () => stateRef.current,
      actions: () => {
        const a = actionsRef.current;
        return {
          ...a,
          // React 要到下一次渲染才更新 state。引擎在同一轮里接着读（拉取后马上推送），
          // 所以这里先把结果写进 stateRef，免得用旧数据推送、盖掉刚拉到的内容
          applyTeam: (fn: (s: ProtoState) => Partial<ProtoState>) => {
            const cur = stateRef.current;
            stateRef.current = { ...cur, ...fn(cur) };
            a.applyTeam(fn);
          },
        };
      },
      account: () => accRef.current,
      saveAccount: a => {
        accRef.current = a;
        setAccount(a);
        if (a) saveAccount(a);
        else clearAccount();
      },
      setStatus,
    });
  const e = engine.current;

  // 启动：有账号就同步；文件里还记着亲友团但本机没有账号（比如换了系统账户）就按退出处理
  useEffect(() => {
    e.start();
    if (accRef.current) void e.run("full");
    else if (stateRef.current.team) e.leaveLocal(null);
    const offSync = onSyncRequest(() => void e.run("full", { force: true }));
    const offShown = onPanelShown(() => e.pullSoon());
    const onFocus = () => e.pullSoon();
    const onOnline = () => void e.run("full", { force: true });
    const onVisible = () => {
      if (document.visibilityState === "hidden") e.flushPush();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void e.run("full"), PULL_EVERY);
    return () => {
      void offSync.then(f => f());
      void offShown.then(f => f());
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      e.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 本机数据变了：稍后推送（拉下来写进本地的改动也会触发，但推送前比对哈希，不会推回去）
  useEffect(() => {
    if (accRef.current) e.pushSoon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.schemes,
    state.characters,
    state.raidLogs,
    state.blacklist,
    state.links,
    state.loadouts,
    state.notes,
  ]);

  const value = useMemo<TeamSession>(
    () => ({
      account,
      status,
      pendingCount: account ? pendingCountOf(account.pending) : 0,
      syncNow: () => e.run("full", { force: true }),
      create: e.create,
      join: e.join,
      login: e.login,
      logout: e.logout,
      loginCode: e.loginCode,
      updateMe: e.updateMe,
      setRole: e.setRole,
      removeMember: e.removeMember,
      resetInvite: e.resetInvite,
      renameTeam: e.renameTeam,
      mergePending: e.mergePending,
      discardPending: e.discardPending,
    }),
    [account, status, e]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

interface EngineDeps {
  state: () => ProtoState;
  actions: () => ReturnType<typeof useProto>["actions"];
  account: () => Account | null;
  saveAccount: (a: Account | null) => void;
  setStatus: (s: TeamStatus) => void;
}

function createEngine(d: EngineDeps) {
  let running: Promise<void> | null = null;
  let queued: "full" | "push" | null = null;
  let backoffUntil = 0;
  let lastPull = 0;
  let pushTimer = 0;
  let retryTimer = 0;
  let disposed = false;
  /** 上次广播给面板的离线状态；没变就不再发 */
  let offlineNow: boolean | null = null;
  /** 同一句错误 1 分钟内只提示一次 */
  const lastError = { text: "", at: 0 };

  const toast = (kind: "success" | "error" | "info", text: string) =>
    d.actions().toast("manager", kind, text);
  const reportError = (text: string) => {
    const now = Date.now();
    if (text === lastError.text && now - lastError.at < 60_000) return;
    lastError.text = text;
    lastError.at = now;
    toast("error", text);
  };

  const patchAccount = (fn: (a: Account) => Account) => {
    const a = d.account();
    if (a) d.saveAccount(fn(a));
  };

  const setOffline = (offline: boolean) => {
    const s = d.state();
    if (offline && s.dataState !== "offline") d.actions().setDataState("offline");
    if (!offline && s.dataState === "offline") d.actions().setDataState("normal");
    if (offlineNow !== offline) emitStatus({ offline });
    offlineNow = offline;
    d.setStatus(offline ? "offline" : "idle");
  };

  const scheduleRetry = (ms: number) => {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => void run("full", { force: true }), ms);
  };

  /* ---------- 拉取 ---------- */

  async function pull() {
    const a = d.account();
    if (!a) return;
    const full = a.seq === 0 || a.needFull;
    d.setStatus("syncing");
    const res = await teamApi.sync(a.token, full ? 0 : a.seq);
    const cur = d.account();
    if (!cur || cur.token !== a.token) return;
    lastPull = Date.now();
    const s = d.state();
    const members = membersFromServer(res.members, cur.memberId);
    const plan = planPull(
      collectionsOf(s),
      cur,
      res.entities,
      cur.memberId,
      full,
      new Set(members.map(m => m.id))
    );
    const team = teamFromServer(res.team);
    d.actions().applyTeam(st => {
      const out: Partial<ProtoState> = applyOps(collectionsOf(st), plan.ops);
      if (!sameJson(st.members, members)) out.members = members;
      if (!sameJson(st.team, team)) out.team = team;
      return out;
    });
    let pending = cur.pending;
    if (cur.seq === 0 && pendingCountOf(pending)) {
      // 第一次拉到亲友团的数据：同心法同模式的方案亲友团里已经有了，不再并入
      const preview = { ...collectionsOf(s), ...applyOps(collectionsOf(s), plan.ops) };
      const r = filterPending(pending, preview);
      pending = r.pending;
      if (r.skipped.length)
        toast(
          "info",
          tx(
            "亲友团里已经有这些方案，本机的没有并入：{0}",
            r.skipped.map(schemeLabel).join("、")
          )
        );
    }
    d.saveAccount({
      ...cur,
      seq: res.seq,
      shadow: plan.shadow,
      rejected: plan.rejected,
      needFull: false,
      pending,
    });
  }

  /* ---------- 推送 ---------- */

  /** 先把 data URL 图片传上去，换成网站地址；本地数据也一起换掉 */
  async function uploadImages(out: Outgoing[], token: string, myId: string) {
    const need = Array.from(new Set(out.flatMap(o => o.uploads)));
    if (!need.length) return { out, failed: [] as Outgoing[] };
    const map = new Map<string, string>();
    const bad = new Set<string>();
    for (const src of need) {
      try {
        const r = await teamApi.uploadFile(token, await dataUrlBlob(src));
        map.set(src, assetUrl(r.src));
      } catch (err) {
        if (
          err instanceof TeamApiError &&
          (err.code === "too_large" || err.code === "invalid")
        )
          bad.add(src);
        else throw err;
      }
    }
    const ready: Outgoing[] = [];
    const failed: Outgoing[] = [];
    const keys = new Set<string>();
    for (const o of out) {
      if (o.uploads.some(u => bad.has(u))) {
        failed.push(o);
        continue;
      }
      if (!o.uploads.length) {
        ready.push(o);
        continue;
      }
      const data = replaceImages(o.kind, o.data, map);
      keys.add(o.key);
      ready.push({
        ...o,
        data,
        hash: hashJson(data),
        uploads: [],
        change: buildChange(o.kind, o.id, data, o.change.baseVersion, myId),
      });
    }
    if (keys.size)
      d.actions().applyTeam(st => {
        const c = collectionsOf(st);
        const ents = collectEntities(c);
        const ops: Op[] = [];
        for (const key of keys) {
          const ent = ents.get(key);
          if (ent)
            ops.push({
              kind: ent.kind,
              id: ent.id,
              data: replaceImages(ent.kind, ent.data, map),
            });
        }
        return applyOps(c, ops);
      });
    return { out: ready, failed };
  }

  function handleConflict(
    acc: Account,
    c: { key: string; id: string; current?: EntityRecord }
  ): Account {
    const s = d.state();
    const local = s.schemes.find(x => x.id === c.id);
    const plan = planConflict(local, c.current, acc.memberId);
    const shadow = { ...acc.shadow };
    if (plan.type === "recreate") {
      if (plan.shadow) shadow[c.key] = plan.shadow;
      else delete shadow[c.key];
      return { ...acc, shadow };
    }
    shadow[c.key] = plan.shadow;
    if (plan.type === "adopt") {
      d.actions().applyTeam(st => ({
        schemes: replaceScheme(st.schemes, c.id, plan.scheme),
      }));
      return { ...acc, shadow };
    }
    d.actions().applyTeam(st => ({
      schemes: replaceScheme(st.schemes, c.id, plan.scheme),
      drafts: { ...st.drafts, [c.id]: plan.draft },
      pendingConflict: st.pendingConflict ?? plan.conflict,
      managerSection: "schemes",
      schemesPage: "list",
      selectedSchemeId: c.id,
    }));
    // 管理窗口隐藏着（在面板里保存的）：打开它，让用户看到冲突提示
    if (document.visibilityState === "hidden")
      void openManager({ section: "schemes", schemeId: c.id }).catch(() => {});
    return { ...acc, shadow };
  }

  /** 返回这次有没有真的请求服务器（没有要推的就不算） */
  async function push(): Promise<boolean> {
    let contacted = false;
    for (let round = 0; round < 4; round++) {
      const a = d.account();
      if (!a) return contacted;
      const s = d.state();
      const skip = new Set(s.pendingConflict ? [s.pendingConflict.schemeId] : []);
      const plan = planPush(collectionsOf(s), a, a.memberId, me(s)?.role, skip);
      if (plan.drop.length)
        patchAccount(x => {
          const shadow = { ...x.shadow };
          for (const k of plan.drop) delete shadow[k];
          return { ...x, shadow };
        });
      if (!plan.out.length) return contacted;
      d.setStatus("syncing");
      contacted = true;
      const up = await uploadImages(plan.out, a.token, a.memberId);
      const ready = up.out.filter(o => !tooLarge(o));
      const rejectedNow = [...up.failed, ...up.out.filter(tooLarge)];
      if (rejectedNow.length) {
        patchAccount(x => {
          const rejected = { ...x.rejected };
          for (const o of rejectedNow) rejected[o.key] = o.hash;
          return { ...x, rejected };
        });
        reportError(tx("有 {0} 项内容或图片太大，没有同步", rejectedNow.length));
      }
      for (const batch of batches(ready)) {
        const cur = d.account();
        if (!cur || cur.token !== a.token) return contacted;
        const res = await teamApi.push(cur.token, batch.map(o => o.change));
        const now = d.account();
        if (!now || now.token !== a.token) return contacted;
        const r = applyPushResults(now, batch, res.results);
        let next: Account = {
          ...now,
          shadow: r.shadow,
          rejected: r.rejected,
          // 这期间没有别人写入：序号直接跟上，下次不用再拉自己刚推的
          seq: res.seq === now.seq + r.okCount ? res.seq : now.seq,
          needFull: now.needFull || r.errors.some(x => x.error === "forbidden"),
        };
        for (const c of r.conflicts) next = handleConflict(next, c);
        d.saveAccount(next);
        if (r.errors.length) {
          const forbidden = r.errors.filter(x => x.error === "forbidden").length;
          reportError(
            forbidden
              ? tx("有 {0} 项改动没有权限，已恢复成亲友团里的内容", forbidden)
              : tx("有 {0} 项改动没有同步：{1}", r.errors.length, tx(r.errors[0].message))
          );
        }
        if (r.conflicts.length) return contacted;
      }
    }
    return contacted;
  }

  /* ---------- 调度 ---------- */

  async function cycle(mode: "full" | "push") {
    const a = d.account();
    if (!a || disposed) return;
    try {
      const pulled = mode === "full" || a.seq === 0 || a.needFull;
      if (pulled) await pull();
      const pushed = await push();
      // 没有请求服务器（没有要推的）：不知道现在连不连得上，状态保持不变
      if (!pulled && !pushed) {
        d.setStatus(d.state().dataState === "offline" ? "offline" : "idle");
        return;
      }
      const was = d.state().dataState === "offline";
      setOffline(false);
      if (was) window.clearTimeout(retryTimer);
      patchAccount(x => ({ ...x, lastSyncAt: new Date().toISOString() }));
    } catch (err) {
      if (isUnauthorized(err)) {
        await copyDataBackup().catch(() => null);
        leaveLocal(d.account());
        toast("error", tx("登录已失效，已退出亲友团。你自己的角色、配装和便签都还在"));
        return;
      }
      if (isOffline(err)) {
        setOffline(true);
        scheduleRetry(OFFLINE_RETRY);
        return;
      }
      d.setStatus(d.state().dataState === "offline" ? "offline" : "idle");
      if (err instanceof TeamApiError && err.code === "rate_limited") {
        const wait = (err.retryAfter ?? 60) * 1000;
        backoffUntil = Date.now() + wait;
        scheduleRetry(wait);
        return;
      }
      console.error("亲友团同步失败", err);
      reportError(tx("同步失败：{0}", teamErrorText(err)));
    }
  }

  function run(mode: "full" | "push", opts: { force?: boolean } = {}): Promise<void> {
    if (disposed || !d.account()) return Promise.resolve();
    if (!opts.force && Date.now() < backoffUntil) return Promise.resolve();
    if (opts.force) backoffUntil = 0;
    if (running) {
      if (queued !== "full") queued = mode;
      return running;
    }
    const p = (async () => {
      let m: "full" | "push" | null = mode;
      while (m && !disposed) {
        queued = null;
        await cycle(m);
        m = queued;
      }
    })().finally(() => {
      running = null;
    });
    running = p;
    return p;
  }

  function pushSoon() {
    window.clearTimeout(pushTimer);
    if (document.visibilityState === "hidden") {
      pushTimer = 0;
      void run("push");
      return;
    }
    pushTimer = window.setTimeout(() => {
      pushTimer = 0;
      void run("push");
    }, PUSH_DELAY);
  }

  function flushPush() {
    if (!pushTimer) return;
    window.clearTimeout(pushTimer);
    pushTimer = 0;
    void run("push");
  }

  function pullSoon() {
    if (Date.now() - lastPull < PULL_THROTTLE) return;
    void run("full");
  }

  /* ---------- 加入、登录、退出 ---------- */

  const backup = () => copyDataBackup().catch(() => null);

  async function uploadAvatar(token: string, av: CharacterAvatar) {
    if (av.kind !== "upload" || !isDataUrl(av.src)) return av;
    const r = await teamApi.uploadFile(token, await dataUrlBlob(av.src));
    return { kind: "upload", src: assetUrl(r.src) } as CharacterAvatar;
  }

  /** 头像还没上传（data URL）时先不带，拿到令牌后再传 */
  function avatarForCreate(av: CharacterAvatar | undefined) {
    if (!av) return null;
    if (av.kind === "upload" && isDataUrl(av.src)) return null;
    return avatarToServer(av);
  }

  async function begin(res: AuthResult, mode: "create" | "join" | "login") {
    // 改本机数据前先备份一份 data.json（接口成功后才备份，输错码不会多出备份）
    await backup();
    const s = d.state();
    const prevAvatar = me(s)?.avatar;
    let acc = newAccount(res.token, res.memberId, res.team.id);
    const members = membersFromServer(res.members, res.memberId);
    const base: Partial<ProtoState> = {
      team: teamFromServer(res.team),
      members,
      pendingConflict: null,
    };
    if (mode === "create") {
      d.actions().applyTeam(() => base);
    } else {
      const plan = prepareJoin(collectionsOf(s));
      acc = { ...acc, pending: plan.pending };
      d.actions().applyTeam(() => ({ ...plan.collections, ...base, drafts: {} }));
    }
    d.saveAccount(acc);
    setOffline(false);
    // 本机上传过的头像：拿到令牌后传上去
    if (
      mode !== "login" &&
      prevAvatar?.kind === "upload" &&
      isDataUrl(prevAvatar.src)
    ) {
      try {
        const av = await uploadAvatar(res.token, prevAvatar);
        await teamApi.patchMember(res.token, res.memberId, {
          avatar: avatarToServer(av),
        });
        d.actions().updateMe({ avatar: av });
      } catch {
        toast("error", tx("头像没有传上去，可以稍后在个人资料里重新上传"));
      }
    }
    await run("full", { force: true });
  }

  async function create(p: { teamName: string; nickname: string }) {
    const self = me(d.state());
    const res = await teamApi.create({
      teamName: p.teamName,
      nickname: p.nickname,
      ...(self?.color ? { color: self.color } : {}),
      avatar: avatarForCreate(self?.avatar),
      platform: DESKTOP_PLATFORM,
    });
    await begin(res, "create");
  }

  async function join(p: { inviteCode: string; nickname: string }) {
    const self = me(d.state());
    const res = await teamApi.join({
      inviteCode: p.inviteCode,
      nickname: p.nickname,
      ...(self?.color ? { color: self.color } : {}),
      avatar: avatarForCreate(self?.avatar),
      platform: DESKTOP_PLATFORM,
    });
    await begin(res, "join");
  }

  async function login(code: string) {
    const res = await teamApi.login(code, DESKTOP_PLATFORM);
    await begin(res, "login");
  }

  /** 本机按退出处理：留下自己的东西，去掉别人的 */
  function leaveLocal(a: Account | null) {
    window.clearTimeout(pushTimer);
    window.clearTimeout(retryTimer);
    pushTimer = 0;
    d.saveAccount(null);
    emitStatus({ offline: false });
    offlineNow = false;
    d.setStatus("idle");
    d.actions().applyTeam(st => {
      const self = me(st);
      return {
        ...prepareLeave(collectionsOf(st), a?.pending ?? null),
        team: null,
        members: self
          ? [{ ...self, role: "admin" as TeamRole }]
          : st.members.filter(m => m.id === ME_ID),
        pendingConflict: null,
        dataState: st.dataState === "offline" ? "normal" : st.dataState,
      };
    });
  }

  async function logout() {
    const a = d.account();
    if (!a) return;
    await backup();
    // 先把没推完的改动推上去；连不上也照样退出
    await run("push").catch(() => {});
    try {
      await teamApi.logout(a.token);
    } catch {
      /* 令牌在服务器上留着也没关系，本机已经删了 */
    }
    leaveLocal(d.account() ?? a);
  }

  const need = () => {
    const a = d.account();
    if (!a) throw new TeamApiError("unauthorized", 401, "还没加入亲友团");
    return a;
  };
  const serverId = (a: Account, id: string) => (id === ME_ID ? a.memberId : id);

  /** 会话操作失败时：令牌失效按退出处理，其余把错误交给界面显示 */
  async function guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isUnauthorized(err)) {
        await backup();
        leaveLocal(d.account());
      }
      throw err;
    }
  }

  const loginCode = (memberId?: string) =>
    guard(() => {
      const a = need();
      return teamApi.loginCode(
        a.token,
        memberId && memberId !== ME_ID ? memberId : undefined
      );
    });

  const updateMe = (p: { name?: string; avatar?: CharacterAvatar }) =>
    guard(async () => {
      const a = need();
      const patch: MemberPatch = {};
      let avatar = p.avatar;
      if (avatar) {
        avatar = await uploadAvatar(a.token, avatar);
        patch.avatar = avatarToServer(avatar);
      }
      if (p.name !== undefined) patch.nickname = p.name;
      await teamApi.patchMember(a.token, a.memberId, patch);
      d.actions().updateMe({
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(avatar ? { avatar } : {}),
      });
    });

  const setRole = (memberId: string, role: TeamRole) =>
    guard(async () => {
      const a = need();
      await teamApi.patchMember(a.token, serverId(a, memberId), { role });
      d.actions().applyTeam(st => ({
        members: st.members.map(m => (m.id === memberId ? { ...m, role } : m)),
      }));
    });

  const removeMember = (memberId: string) =>
    guard(async () => {
      const a = need();
      await teamApi.removeMember(a.token, serverId(a, memberId));
      const gone = d
        .state()
        .characters.filter(c => c.ownerId === memberId)
        .map(c => entityKey("character", c.id));
      patchAccount(x => {
        const shadow = { ...x.shadow };
        for (const k of gone) delete shadow[k];
        return { ...x, shadow };
      });
      d.actions().applyTeam(st => ({
        members: st.members.filter(m => m.id !== memberId),
        characters: st.characters.filter(c => c.ownerId !== memberId),
      }));
    });

  const resetInvite = () =>
    guard(async () => {
      const a = need();
      const r = await teamApi.resetInvite(a.token);
      d.actions().applyTeam(st =>
        st.team ? { team: { ...st.team, inviteCode: r.inviteCode } } : {}
      );
    });

  const renameTeam = (name: string) =>
    guard(async () => {
      const a = need();
      const r = await teamApi.renameTeam(a.token, name);
      d.actions().applyTeam(st =>
        st.team ? { team: { ...st.team, name: r.team.name } } : {}
      );
    });

  function mergePendingNow() {
    const a = d.account();
    if (!a) return;
    const p = a.pending;
    d.actions().applyTeam(st => mergePending(collectionsOf(st), p));
    d.saveAccount({ ...a, pending: emptyPending() });
  }

  function discardPending() {
    patchAccount(x => ({ ...x, pending: emptyPending() }));
  }

  /** 开发模式下 React 会挂载两次，第二次挂载时重新启用 */
  function start() {
    disposed = false;
  }

  function dispose() {
    disposed = true;
    window.clearTimeout(pushTimer);
    window.clearTimeout(retryTimer);
  }

  return {
    run,
    start,
    pushSoon,
    flushPush,
    pullSoon,
    leaveLocal,
    dispose,
    create,
    join,
    login,
    logout,
    loginCode,
    updateMe,
    setRole,
    removeMember,
    resetInvite,
    renameTeam,
    mergePending: mergePendingNow,
    discardPending,
  };
}
