import { useId, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  TEAM_LIMITS,
  normalizeInviteCode,
  normalizeLoginCode,
} from "@shared/teamApi";
import { Btn } from "@/components/common/ui";
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

/**
 * 输错时输入框左右抖一下（系统开了减少动态效果时不抖）。
 * 用 Web Animations，不改 className，重新渲染不会打断。
 */
function shake(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 360, easing: "ease-out" }
  );
}

type Busy = "create" | "join" | "login" | null;

/**
 * 桌面版：昵称 → 创建 /「或」/ 用邀请码加入；第二台电脑点下面的「用登录码登录」。
 * 加入、登录前本机数据会先自动备份一份。
 */
function DesktopSetup({ session }: { session: TeamSession }) {
  const { state, actions } = useProto();
  const self = me(state);
  const [mode, setMode] = useState<"new" | "login">("new");
  const [busy, setBusy] = useState<Busy>(null);
  const [nick, setNick] = useState(self?.name ?? "");
  const [nickError, setNickError] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [login, setLogin] = useState("");
  const [loginError, setLoginError] = useState("");
  const nickId = useId();
  const nameId = useId();
  const codeId = useId();
  const loginId = useId();
  const nickRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);
  const locked = busy !== null;

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
  const fail = (err: unknown, where: "name" | "code" | "login") => {
    const text = teamErrorText(err);
    const code = err instanceof TeamApiError ? err.code : null;
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
    where: "name" | "code" | "login"
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
    void run("login", () => session.login(c), tx("已登录亲友团"), "login");
  };

  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;

  if (mode === "login")
    return (
      <SetupFrame>
        <Step
          className="mt-10"
          label={tx("用登录码登录")}
          htmlFor={loginId}
          hint={
            <span className={loginError ? "text-cinnabar-text" : undefined}>
              {loginError ||
                tx("在已经登录的电脑上打开「设置 → 账号」，生成登录码")}
            </span>
          }
        >
          <input
            ref={loginRef}
            id={loginId}
            value={login}
            autoFocus
            onChange={e => {
              setLogin(e.target.value);
              setLoginError("");
            }}
            onKeyDown={e => e.key === "Enter" && !locked && signIn()}
            placeholder="XXXX-XXXX"
            maxLength={12}
            disabled={locked}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!loginError}
            aria-describedby={`${loginId}-msg`}
            className={cn(
              inputCls(!!loginError),
              "h-9 flex-1 font-mono uppercase tracking-wider placeholder:tracking-normal"
            )}
          />
          <Btn
            variant="primary"
            size="md"
            onClick={signIn}
            disabled={locked}
            className="h-9 min-w-[76px] px-4"
          >
            {busy === "login" ? spinner : tx("登录")}
          </Btn>
        </Step>
        <SwitchLink disabled={locked} onClick={() => setMode("new")}>
          {tx("还没加入过？创建或用邀请码加入")}
        </SwitchLink>
      </SetupFrame>
    );

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
        {tx("在别的电脑加入过？用登录码登录")}
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
