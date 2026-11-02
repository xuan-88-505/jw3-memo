import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  TEAM_LIMITS,
  normalizeInviteCode,
  normalizeLoginCode,
} from "@shared/teamApi";
import { Btn, Segmented } from "@/components/common/ui";
import { PixelScene } from "@/components/brand/PixelIcon";
import { SEED_TEAM } from "@/data/seed";
import { TeamApiError } from "@/lib/team/api";
import {
  teamErrorText,
  useTeam,
  type TeamSession,
} from "@/lib/team/TeamSync";
import { isOnline, me, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader, inputCls } from "./shared";
import { PasswordInput, shake } from "./AccountFields";
import { tx } from "@/lib/i18n";

const NAME_MAX = 12;

/**
 * 还没加入亲友团：上下排列，居中。
 * 插图 → 标题和一句说明 → 创建 → 「或」→ 用邀请码加入。自己的数据都会保留
 * 桌面版连服务器；网页原型用模拟的动作。
 */
export function TeamSetup() {
  const session = useTeam();
  if (session) return <DesktopSetup session={session} />;
  return <DemoSetup />;
}

function DemoSetup() {
  const { state, actions } = useProto();
  const online = isOnline(state);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const nameId = useId();
  const codeId = useId();

  const create = () => {
    const n = name.trim();
    if (!n) return setNameError(tx("先填名字"));
    if (n.length > NAME_MAX) return setNameError(tx("最多 {0} 个字", NAME_MAX));
    actions.createTeam(n);
    actions.toast("manager", "success", tx("已创建「{0}」", n));
  };
  const join = () => {
    if (!code.trim()) return setCodeError(tx("先输入邀请码"));
    if (!actions.joinTeam(code)) return setCodeError(tx("邀请码无效或已过期"));
    actions.toast("manager", "success", tx("已加入「{0}」", SEED_TEAM.name));
  };

  return (
    <SetupFrame>
          <Step
            className="mt-10"
            label={tx("创建亲友团")}
            htmlFor={nameId}
            hint={
              <span className={nameError ? "text-cinnabar-text" : undefined}>
                {nameError || tx("你的角色和方案会一起带进去")}
              </span>
            }
          >
            <input
              id={nameId}
              value={name}
              onChange={e => {
                setName(e.target.value);
                setNameError("");
              }}
              onKeyDown={e => e.key === "Enter" && create()}
              placeholder={tx("亲友团名字")}
              maxLength={20}
              disabled={!online}
              aria-invalid={!!nameError}
              aria-describedby={`${nameId}-msg`}
              className={cn(inputCls(!!nameError), "h-9 flex-1")}
            />
            <Btn
              variant="primary"
              size="md"
              onClick={create}
              disabled={!online}
              className="h-9 min-w-[76px] px-4"
            >
              {tx("创建")}
            </Btn>
          </Step>

          <div
            className="my-7 flex items-center gap-3 text-[12px] text-paper-3"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-paper/[0.08]" />
            {tx("或")}
            <span className="h-px flex-1 bg-paper/[0.08]" />
          </div>

          <Step
            label={tx("用邀请码加入")}
            htmlFor={codeId}
            hint={
              codeError ? (
                <span className="text-cinnabar-text">{codeError}</span>
              ) : (
                <>
                  {tx("演示码{0}", " ")}
                  <button
                    type="button"
                    className="font-mono text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
                    onClick={() => {
                      setCode(SEED_TEAM.inviteCode);
                      setCodeError("");
                    }}
                  >
                    {SEED_TEAM.inviteCode}
                  </button>
                </>
              )
            }
          >
            <input
              id={codeId}
              value={code}
              onChange={e => {
                setCode(e.target.value);
                setCodeError("");
              }}
              onKeyDown={e => e.key === "Enter" && join()}
              placeholder="TD-XXXX-XXXX"
              disabled={!online}
              aria-invalid={!!codeError}
              aria-describedby={`${codeId}-msg`}
              className={cn(
                inputCls(!!codeError),
                "h-9 flex-1 font-mono uppercase tracking-wider placeholder:tracking-normal"
              )}
            />
            <Btn
              variant="secondary"
              size="md"
              onClick={join}
              disabled={!online}
              className="h-9 min-w-[76px] px-4"
            >
              {tx("加入")}
            </Btn>
          </Step>
    </SetupFrame>
  );
}

/** 页面外框：标题、插图、一句说明，下面放各步操作 */
function SetupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SectionHeader title={tx("亲友团")} />
      {/* 窗口矮于 760 时去掉外围留白，最小窗口 960 × 640 也不用滚动 */}
      <div className="flex flex-1 flex-col items-center justify-center pb-12 pt-6 [@media(max-height:760px)]:pb-1 [@media(max-height:760px)]:pt-0">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            {/* 鼠标停在插图上时黄鸡才跳，输入时不分心 */}
            <div className="empty-state">
              <PixelScene name="team" className="pixel-hop" />
            </div>
            <h2 className="mt-7 text-[17px] font-semibold text-paper">
              {tx("还没加入亲友团")}
            </h2>
            <p className="mt-2 text-balance text-[13px] leading-relaxed text-paper-3">
              {tx("和亲友共用方案和记录，谁改了什么都看得到")}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

type Busy = "create" | "join" | "login" | "password" | null;

/** 设置页的「登录」按钮：下次打开亲友团页时直接显示登录界面 */
let loginIntent = false;
export function openTeamLogin() {
  loginIntent = true;
}

const fieldLabel = "mb-2 block text-[13.5px] font-medium text-paper";

/**
 * 桌面版：昵称 → 创建 /「或」/ 用邀请码加入；在别的电脑加入过点下面的「登录」，
 * 用账号密码或登录码登录。
 * 加入、登录前本机数据会先自动备份一份。
 */
function DesktopSetup({ session }: { session: TeamSession }) {
  const { state, actions } = useProto();
  const self = me(state);
  const [mode, setMode] = useState<"new" | "login">(() =>
    loginIntent ? "login" : "new"
  );
  // 只在挂载后清掉，开发模式下初始化函数会跑两次
  useEffect(() => {
    loginIntent = false;
  }, []);
  const [method, setMethod] = useState<"password" | "code">("password");
  const [busy, setBusy] = useState<Busy>(null);
  const [nick, setNick] = useState(self?.name ?? "");
  const [nickError, setNickError] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [login, setLogin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [remember, setRemember] = useState(true);
  /** 输错密码后要把光标放回密码框；等表单不再禁用后再放 */
  const [refocusPw, setRefocusPw] = useState(0);
  const nickId = useId();
  const nameId = useId();
  const codeId = useId();
  const loginId = useId();
  const userId = useId();
  const pwId = useId();
  const nickRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const pwFieldsRef = useRef<HTMLDivElement>(null);
  const locked = busy !== null;
  useEffect(() => {
    if (refocusPw && !locked) pwRef.current?.focus();
  }, [refocusPw, locked]);

  const checkNick = () => {
    const n = nick.trim();
    const err = !n
      ? tx("先填昵称")
      : n.length > TEAM_LIMITS.nickname
        ? tx("最多 {0} 个字", TEAM_LIMITS.nickname)
        : "";
    setNickError(err);
    if (err) nickRef.current?.focus();
    return err ? null : n;
  };

  /** 按错误类型放到对应输入框下面 */
  const fail = (
    err: unknown,
    where: "name" | "code" | "login" | "password"
  ) => {
    const text = teamErrorText(err);
    const code = err instanceof TeamApiError ? err.code : null;
    if (where === "password") {
      if (code === "rate_limited") {
        const sec = (err as TeamApiError).retryAfter ?? 60;
        setPwError(
          tx("试的次数太多，{0} 分钟后再试", Math.max(1, Math.ceil(sec / 60)))
        );
      } else setPwError(text);
      if (code === "credentials_invalid") {
        // 和系统登录一样：抖一下，清空密码，光标回到密码框
        shake(pwFieldsRef.current);
        setPassword("");
        setRefocusPw(n => n + 1);
      }
      return;
    }
    if (code === "nickname_taken") {
      setNickError(text);
      shake(nickRef.current);
      return;
    }
    if (where === "name") setNameError(text);
    if (where === "code") {
      setCodeError(text);
      if (code === "invite_invalid") shake(codeRef.current);
    }
    if (where === "login") {
      setLoginError(text);
      if (code === "code_invalid") shake(loginRef.current);
    }
  };

  const run = async (
    kind: Exclude<Busy, null>,
    fn: () => Promise<void>,
    ok: string,
    where: "name" | "code" | "login" | "password"
  ) => {
    setBusy(kind);
    try {
      await fn();
      actions.toast("manager", "success", ok);
    } catch (err) {
      fail(err, where);
      setBusy(null);
    }
  };

  const create = () => {
    const n = name.trim();
    if (!n) return setNameError(tx("先填名字"));
    if (n.length > TEAM_LIMITS.teamName)
      return setNameError(tx("最多 {0} 个字", TEAM_LIMITS.teamName));
    const nickname = checkNick();
    if (!nickname) return;
    void run(
      "create",
      () => session.create({ teamName: n, nickname }),
      tx("已创建「{0}」", n),
      "name"
    );
  };
  const join = () => {
    const c = normalizeInviteCode(code);
    if (!c) return setCodeError(tx("先输入邀请码"));
    if (!/^TD-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(c)) {
      setCodeError(tx("邀请码是 TD- 开头的 8 位字母和数字"));
      shake(codeRef.current);
      return;
    }
    const nickname = checkNick();
    if (!nickname) return;
    setCode(c);
    void run(
      "join",
      () => session.join({ inviteCode: c, nickname }),
      tx("已加入亲友团"),
      "code"
    );
  };
  const signIn = () => {
    const c = normalizeLoginCode(login);
    if (!c) return setLoginError(tx("先输入登录码"));
    if (c.length !== 8) {
      setLoginError(tx("登录码是 8 位字母和数字"));
      shake(loginRef.current);
      return;
    }
    void run(
      "login",
      () => session.login(c, remember),
      tx("已登录亲友团"),
      "login"
    );
  };
  const signInPassword = () => {
    const u = username.trim();
    if (!u) {
      setPwError(tx("先填用户名"));
      userRef.current?.focus();
      return;
    }
    if (!password) {
      setPwError(tx("先填密码"));
      pwRef.current?.focus();
      return;
    }
    void run(
      "password",
      () => session.loginPassword({ username: u, password, remember }),
      tx("已登录亲友团"),
      "password"
    );
  };

  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;

  const rememberBox = (
    <label
      title={tx("不勾选时，退出软件后自动退出登录")}
      className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-paper-2"
    >
      <input
        type="checkbox"
        checked={remember}
        onChange={e => setRemember(e.target.checked)}
        disabled={locked}
        className="h-3.5 w-3.5 accent-[var(--color-cinnabar)]"
      />
      {tx("记住我")}
    </label>
  );
  const footer = (kind: "password" | "login") => (
    <div className="mt-1 flex items-center justify-between gap-3">
      {rememberBox}
      <Btn
        type="submit"
        variant="primary"
        size="md"
        disabled={locked}
        className="h-9 min-w-[76px] px-4"
      >
        {busy === kind ? spinner : tx("登录")}
      </Btn>
    </div>
  );

  if (mode === "login") {
    const pane = (on: boolean) =>
      cn("[grid-area:1/1]", !on && "invisible");
    return (
      <SetupFrame>
        <div className="mt-8 flex justify-center">
          <Segmented
            size="md"
            label={tx("登录方式")}
            value={method}
            onChange={m => {
              if (locked) return;
              setMethod(m);
              window.setTimeout(
                () =>
                  (m === "password" ? userRef : loginRef).current?.focus(),
                0
              );
            }}
            options={[
              { value: "password", label: tx("账号密码") },
              { value: "code", label: tx("登录码") },
            ]}
          />
        </div>
        {/* 两种方式叠在同一格里，切换时高度不变，下面的链接不跳 */}
        <div className="mt-6 grid">
          <form
            className={pane(method === "password")}
            aria-hidden={method !== "password"}
            onSubmit={e => {
              e.preventDefault();
              if (!locked) signInPassword();
            }}
          >
            <div ref={pwFieldsRef}>
              <label htmlFor={userId} className={fieldLabel}>
                {tx("用户名")}
              </label>
              <input
                ref={userRef}
                id={userId}
                value={username}
                autoFocus
                onChange={e => {
                  setUsername(e.target.value);
                  setPwError("");
                }}
                maxLength={64}
                disabled={locked}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="username"
                aria-invalid={!!pwError || undefined}
                aria-describedby={`${pwId}-msg`}
                className={cn(inputCls(!!pwError), "h-9 w-full")}
              />
              <label htmlFor={pwId} className={cn(fieldLabel, "mt-3")}>
                {tx("密码")}
              </label>
              <PasswordInput
                ref={pwRef}
                id={pwId}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setPwError("");
                }}
                maxLength={200}
                disabled={locked}
                autoComplete="current-password"
                invalid={!!pwError}
                aria-describedby={`${pwId}-msg`}
              />
            </div>
            <p
              id={`${pwId}-msg`}
              role={pwError ? "alert" : undefined}
              className={cn(
                "mt-2 min-h-[18px] text-[12px]",
                pwError ? "text-cinnabar-text" : "text-paper-3"
              )}
            >
              {pwError || tx("在「设置 → 账号」里设置过登录密码才能用")}
            </p>
            {footer("password")}
          </form>
          <form
            className={pane(method === "code")}
            aria-hidden={method !== "code"}
            onSubmit={e => {
              e.preventDefault();
              if (!locked) signIn();
            }}
          >
            <label htmlFor={loginId} className={fieldLabel}>
              {tx("登录码")}
            </label>
            <input
              ref={loginRef}
              id={loginId}
              value={login}
              onChange={e => {
                setLogin(e.target.value);
                setLoginError("");
              }}
              placeholder="XXXX-XXXX"
              maxLength={12}
              disabled={locked}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!loginError || undefined}
              aria-describedby={`${loginId}-msg`}
              className={cn(
                inputCls(!!loginError),
                "h-9 w-full font-mono uppercase tracking-wider placeholder:tracking-normal"
              )}
            />
            <p
              id={`${loginId}-msg`}
              role={loginError ? "alert" : undefined}
              className={cn(
                "mt-2 min-h-[18px] text-[12px]",
                loginError ? "text-cinnabar-text" : "text-paper-3"
              )}
            >
              {loginError ||
                tx("在已经登录的电脑上打开「设置 → 账号」，生成登录码")}
            </p>
            {footer("login")}
          </form>
        </div>
        <SwitchLink disabled={locked} onClick={() => setMode("new")}>
          {tx("还没加入过？创建或用邀请码加入")}
        </SwitchLink>
      </SetupFrame>
    );
  }

  return (
    <SetupFrame>
      <Step
        className="mt-10"
        label={tx("你的昵称")}
        htmlFor={nickId}
        hint={
          <span className={nickError ? "text-cinnabar-text" : undefined}>
            {nickError || tx("亲友团里显示的名字，不能和别人重复")}
          </span>
        }
      >
        <input
          ref={nickRef}
          id={nickId}
          value={nick}
          onChange={e => {
            setNick(e.target.value);
            setNickError("");
          }}
          maxLength={TEAM_LIMITS.nickname}
          disabled={locked}
          spellCheck={false}
          aria-invalid={!!nickError}
          aria-describedby={`${nickId}-msg`}
          className={cn(inputCls(!!nickError), "h-9 flex-1")}
        />
      </Step>

      <Step
        className="mt-5"
        label={tx("创建亲友团")}
        htmlFor={nameId}
        hint={
          <span className={nameError ? "text-cinnabar-text" : undefined}>
            {nameError || tx("你的角色和方案会一起带进去")}
          </span>
        }
      >
        <input
          id={nameId}
          value={name}
          onChange={e => {
            setName(e.target.value);
            setNameError("");
          }}
          onKeyDown={e => e.key === "Enter" && !locked && create()}
          placeholder={tx("亲友团名字")}
          maxLength={TEAM_LIMITS.teamName}
          disabled={locked}
          aria-invalid={!!nameError}
          aria-describedby={`${nameId}-msg`}
          className={cn(inputCls(!!nameError), "h-9 flex-1")}
        />
        <Btn
          variant="primary"
          size="md"
          onClick={create}
          disabled={locked}
          className="h-9 min-w-[76px] px-4"
        >
          {busy === "create" ? spinner : tx("创建")}
        </Btn>
      </Step>

      <div
        className="my-5 flex items-center gap-3 text-[12px] text-paper-3"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-paper/[0.08]" />
        {tx("或")}
        <span className="h-px flex-1 bg-paper/[0.08]" />
      </div>

      <Step
        label={tx("用邀请码加入")}
        htmlFor={codeId}
        hint={
          <span className={codeError ? "text-cinnabar-text" : undefined}>
            {codeError || tx("加入后默认只读，你的角色、配装和便签会一起带进去")}
          </span>
        }
      >
        <input
          ref={codeRef}
          id={codeId}
          value={code}
          onChange={e => {
            setCode(e.target.value);
            setCodeError("");
          }}
          onKeyDown={e => e.key === "Enter" && !locked && join()}
          placeholder="TD-XXXX-XXXX"
          maxLength={16}
          disabled={locked}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!codeError}
          aria-describedby={`${codeId}-msg`}
          className={cn(
            inputCls(!!codeError),
            "h-9 flex-1 font-mono uppercase tracking-wider placeholder:tracking-normal"
          )}
        />
        <Btn
          variant="secondary"
          size="md"
          onClick={join}
          disabled={locked}
          className="h-9 min-w-[76px] px-4"
        >
          {busy === "join" ? spinner : tx("加入")}
        </Btn>
      </Step>

      <SwitchLink disabled={locked} onClick={() => setMode("login")}>
        {tx("在别的电脑加入过？登录")}
      </SwitchLink>
    </SetupFrame>
  );
}

function SwitchLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="text-[12.5px] text-paper-3 underline decoration-paper/25 underline-offset-[3px] transition-colors hover:text-paper disabled:opacity-45"
      >
        {children}
      </button>
    </div>
  );
}

/** 一步操作：标题、一行输入框 + 按钮、下面一行提示或错误 */
function Step({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[13.5px] font-medium text-paper"
      >
        {label}
      </label>
      <div className="flex gap-2">{children}</div>
      <p
        id={`${htmlFor}-msg`}
        className="mt-2 min-h-[18px] text-[12px] text-paper-3"
      >
        {hint}
      </p>
    </section>
  );
}
