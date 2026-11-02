import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  TEAM_LIMITS,
  passwordProblem,
  usernameProblem,
  type SetAccountRequest,
} from "@shared/teamApi";
import { Btn } from "@/components/common/ui";
import { InlineModal } from "@/components/common/overlay";
import { TeamApiError } from "@/lib/team/api";
import { teamErrorText, useTeam } from "@/lib/team/TeamSync";
import { ME_ID } from "@/data/seed";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";
import { useProto } from "@/state/store";
import { PasswordInput, shake } from "./AccountFields";
import { inputCls } from "./shared";

const fieldLabel = "mb-1.5 block text-[13px] font-medium text-paper";

function Hint({
  id,
  error,
  text,
}: {
  id: string;
  error: string;
  text: string;
}) {
  return (
    <p
      id={id}
      role={error ? "alert" : undefined}
      className={cn(
        "mt-1.5 min-h-[18px] text-[12px]",
        error ? "text-cinnabar-text" : "text-paper-3"
      )}
    >
      {error || text}
    </p>
  );
}

function SaveFooter({
  formId,
  busy,
  onCancel,
}: {
  formId: string;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      <Btn variant="ghost" size="md" onClick={onCancel} disabled={busy}>
        {tx("取消")}
      </Btn>
      <Btn
        type="submit"
        form={formId}
        variant="primary"
        size="md"
        disabled={busy}
        icon={
          busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
        }
      >
        {tx("保存")}
      </Btn>
    </>
  );
}

/** 改昵称：亲友团里显示的名字，不能和别人重复 */
export function NicknameDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const session = useTeam();
  const current = state.members.find(m => m.id === ME_ID)?.name ?? "";
  const [name, setName] = useState(current);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const formId = useId();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(current);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const n = name.trim();
    if (!n) {
      setError(tx("先填昵称"));
      shake(ref.current);
      return;
    }
    if (Array.from(n).length > TEAM_LIMITS.nickname) {
      setError(tx("最多 {0} 个字", TEAM_LIMITS.nickname));
      shake(ref.current);
      return;
    }
    if (n === current || !session) return onClose();
    setBusy(true);
    try {
      await session.updateMe({ name: n });
      actions.toast("manager", "success", tx("已更新个人资料"));
      onClose();
    } catch (err) {
      setError(teamErrorText(err));
      shake(ref.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <InlineModal
      open={open}
      onClose={() => !busy && onClose()}
      title={tx("改昵称")}
      width={380}
      footer={<SaveFooter formId={formId} busy={busy} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={e => {
          e.preventDefault();
          if (!busy) void save();
        }}
      >
        <input
          ref={ref}
          id={id}
          data-autofocus
          value={name}
          aria-label={tx("昵称")}
          onChange={e => {
            setName(e.target.value);
            setError("");
          }}
          maxLength={TEAM_LIMITS.nickname + 4}
          disabled={busy}
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-msg`}
          className={cn(inputCls(!!error), "h-9 w-full")}
        />
        <Hint
          id={`${id}-msg`}
          error={error}
          text={tx("亲友团里显示的名字，不能和别人重复")}
        />
      </form>
    </InlineModal>
  );
}

/**
 * 设置或修改登录密码。第一次两项都要填；修改时密码留空就是不改。
 * 不需要邮箱：忘了密码，在还登录着的电脑上直接改，或者找管理员要登录码
 */
export function LoginPasswordDialog({
  open,
  onClose,
  username: current,
}: {
  open: boolean;
  onClose: () => void;
  /** 现在的用户名；没设置过是 null */
  username: string | null;
}) {
  const { actions } = useProto();
  const session = useTeam();
  const [username, setUsername] = useState(current ?? "");
  const [password, setPassword] = useState("");
  const [userError, setUserError] = useState("");
  const [pwError, setPwError] = useState("");
  const [busy, setBusy] = useState(false);
  const userId = useId();
  const pwId = useId();
  const formId = useId();
  const userRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const first = current === null;

  useEffect(() => {
    if (!open) return;
    setUsername(current ?? "");
    setPassword("");
    setUserError("");
    setPwError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const userRule = tx(
    "{0}–{1} 个字，可以用中文、字母、数字和 _ - .",
    TEAM_LIMITS.usernameMin,
    TEAM_LIMITS.usernameMax
  );
  const pwRule = tx("至少 {0} 位，不能和用户名相同", TEAM_LIMITS.passwordMin);

  const badUser = (text: string) => {
    setUserError(text);
    shake(userRef.current);
    userRef.current?.focus();
  };
  const badPassword = (text: string) => {
    setPwError(text);
    shake(pwRef.current);
    pwRef.current?.focus();
  };

  const save = async () => {
    const u = username.trim();
    const problem = usernameProblem(u);
    if (problem === "empty") return badUser(tx("先填用户名"));
    if (problem) return badUser(userRule);
    const changedName = first || u !== current;
    if ((first || password) && passwordProblem(password, u)) {
      return badPassword(password ? pwRule : tx("先填密码"));
    }
    const body: SetAccountRequest = {
      ...(changedName ? { username: u } : {}),
      ...(password ? { password } : {}),
    };
    if (!body.username && !body.password) return onClose();
    if (!session) return;
    setBusy(true);
    try {
      await session.setLogin(body);
      actions.toast(
        "manager",
        "success",
        first ? tx("已设置登录密码") : tx("已保存")
      );
      onClose();
    } catch (err) {
      const code = err instanceof TeamApiError ? err.code : null;
      const text = teamErrorText(err);
      if (code === "username_taken" || code === "username_invalid")
        badUser(text);
      else badPassword(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <InlineModal
      open={open}
      onClose={() => !busy && onClose()}
      title={first ? tx("设置登录密码") : tx("修改登录密码")}
      description={
        first
          ? tx("设置后，换电脑或退出后可以用用户名和密码登录。不需要邮箱。")
          : undefined
      }
      width={400}
      footer={<SaveFooter formId={formId} busy={busy} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={e => {
          e.preventDefault();
          if (!busy) void save();
        }}
      >
        <label htmlFor={userId} className={fieldLabel}>
          {tx("用户名")}
        </label>
        <input
          ref={userRef}
          id={userId}
          data-autofocus
          value={username}
          onChange={e => {
            setUsername(e.target.value);
            setUserError("");
          }}
          maxLength={TEAM_LIMITS.usernameMax + 8}
          disabled={busy}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="username"
          aria-invalid={!!userError || undefined}
          aria-describedby={`${userId}-msg`}
          className={cn(inputCls(!!userError), "h-9 w-full")}
        />
        <Hint id={`${userId}-msg`} error={userError} text={userRule} />
        <label htmlFor={pwId} className={cn(fieldLabel, "mt-2")}>
          {first ? tx("密码") : tx("新密码")}
        </label>
        <PasswordInput
          ref={pwRef}
          id={pwId}
          value={password}
          onChange={e => {
            setPassword(e.target.value);
            setPwError("");
          }}
          placeholder={first ? undefined : tx("不改就留空")}
          maxLength={TEAM_LIMITS.passwordMax + 8}
          disabled={busy}
          autoComplete="new-password"
          invalid={!!pwError}
          aria-describedby={`${pwId}-msg`}
        />
        <Hint id={`${pwId}-msg`} error={pwError} text={pwRule} />
      </form>
    </InlineModal>
  );
}
