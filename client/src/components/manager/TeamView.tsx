import { useRef, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Minus,
  Pencil,
  RefreshCw,
  UserMinus,
} from "lucide-react";
import { TEAM_LIMITS } from "@shared/teamApi";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn, IconBtn } from "@/components/common/ui";
import { ME_ID } from "@/data/seed";
import type { Member, Role } from "@/data/types";
import { ROLE_LABEL, absoluteTime, copyText } from "@/lib/format";
import { teamErrorText, useTeam } from "@/lib/team/TeamSync";
import { isOnline, me, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { LoginCodeDialog } from "./LoginCodeDialog";
import { SectionHeader, SelectBox } from "./shared";
import { TeamSetup } from "./TeamSetup";
import { monthDay, tx } from "@/lib/i18n";

const PERMS: { label: string; roles: Role[] }[] = [
  { label: "查看方案、复制宏", roles: ["admin", "editor", "viewer"] },
  { label: "管理自己的角色", roles: ["admin", "editor", "viewer"] },
  { label: "新建和修改方案", roles: ["admin", "editor"] },
  { label: "邀请成员、改权限、移除成员", roles: ["admin"] },
];

export function TeamView() {
  const { state } = useProto();
  if (!state.team) return <TeamSetup />;
  return <TeamDetail />;
}

function TeamDetail() {
  const { state, actions } = useProto();
  // 桌面版连服务器；网页原型（session 为 null）用模拟的动作
  const session = useTeam();
  const team = state.team!;
  const self = me(state);
  const isAdmin = self?.role === "admin";
  const online = isOnline(state);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [regen, setRegen] = useState(false);
  const [codeFor, setCodeFor] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** 调服务器：成功提示 ok，失败提示原因 */
  const call = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      actions.toast("manager", "success", ok);
      return true;
    } catch (err) {
      actions.toast("manager", "error", teamErrorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onCopy = async () => {
    const ok = await copyText(team.inviteCode);
    if (!ok) {
      actions.toast("manager", "error", tx("复制失败，请手动选中复制"));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    actions.toast("manager", "success", tx("邀请码已复制"));
  };

  const onRole = (m: Member, role: Role) => {
    const admins = state.members.filter(x => x.role === "admin");
    if (m.role === "admin" && role !== "admin" && admins.length === 1) {
      actions.toast(
        "manager",
        "error",
        tx("亲友团至少要有一个管理员。先把别人设成管理员。")
      );
      return;
    }
    const ok = tx("已把 {0} 设为{1}", m.name, ROLE_LABEL[role]);
    if (session) {
      void call(`role:${m.id}`, () => session.setRole(m.id, role), ok);
      return;
    }
    actions.setRole(m.id, role);
    actions.toast("manager", "success", ok);
  };

  return (
    <div>
      <SectionHeader
        title={
          <TeamName
            name={team.name}
            editable={isAdmin}
            online={online && !busy}
          />
        }
        right={
          // 邀请码只有管理员能看到（服务器只发给管理员）
          team.inviteCode && (
          <div
            role="group"
            aria-label={tx("邀请码")}
            title={tx("把邀请码发给亲友。新成员默认只读")}
            className="flex h-8 items-center rounded-md bg-paper/[0.04] pl-3 pr-1 ring-1 ring-inset ring-paper/10"
          >
            <span className="text-[12px] text-paper-3">{tx("邀请码")}</span>
            <span className="ml-2.5 select-all font-mono text-[14px] font-medium tracking-[0.08em] text-paper">
              {team.inviteCode}
            </span>
            <span
              className="ml-2.5 mr-1 h-4 w-px bg-paper/[0.12]"
              aria-hidden="true"
            />
            <IconBtn
              label={copied ? tx("已复制") : tx("复制邀请码")}
              onClick={onCopy}
              className={cn("h-7 w-7", copied && "text-jade hover:text-jade")}
            >
              {copied ? (
                <Check
                  className="h-3.5 w-3.5"
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </IconBtn>
            {isAdmin && (
              <IconBtn
                label={online ? tx("重新生成邀请码") : tx("离线时不能重新生成")}
                onClick={() => setRegen(true)}
                disabled={!online || !!busy}
                className="h-7 w-7"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </IconBtn>
            )}
          </div>
          )
        }
      />

      {session && <PendingBar />}

      <div className="-mx-3">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
            <tr>
              <th className="px-3 py-2.5 font-normal">{tx("成员")}</th>
              <th className="px-3 py-2.5 font-normal">{tx("权限")}</th>
              <th className="px-3 py-2.5 font-normal">{tx("角色数")}</th>
              <th className="px-3 py-2.5 font-normal">{tx("加入时间")}</th>
              <th className="px-3 py-2.5 text-right font-normal">
                <span className="sr-only">{tx("操作")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper/[0.07]">
            {state.members.map(m => {
              const count = state.characters.filter(
                c => c.ownerId === m.id
              ).length;
              const isMe = m.id === ME_ID;
              return (
                <tr
                  key={m.id}
                  className="transition-colors hover:bg-paper/[0.025]"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar member={m} size={28} />
                      <span className="whitespace-nowrap font-medium text-paper">
                        {m.name}
                      </span>
                      {isMe && (
                        <span className="whitespace-nowrap rounded-[4px] bg-paper/[0.08] px-1.5 text-[11px] text-paper-2">
                          {tx("你")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin ? (
                      <SelectBox
                        value={m.role}
                        onChange={e => onRole(m, e.target.value as Role)}
                        disabled={!online || !!busy}
                        aria-label={tx("{0} 的权限", m.name)}
                        className="h-7 rounded-md bg-paper/[0.04] pl-2.5 text-[12.5px] text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60 disabled:opacity-50"
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </SelectBox>
                    ) : (
                      <span
                        className={cn(
                          m.role === "admin" ? "text-gold" : "text-paper-2"
                        )}
                      >
                        {ROLE_LABEL[m.role]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-paper-2">{count}</td>
                  <td
                    className="px-3 py-2.5 text-paper-3"
                    title={absoluteTime(m.joinedAt)}
                  >
                    {monthDay(new Date(m.joinedAt))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {isAdmin && !isMe && (
                      // 窄窗口只显示图标，悬停看说明，避免挤得昵称换行
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {session && (
                          <Btn
                            variant="ghost"
                            size="xs"
                            onClick={() => setCodeFor(m)}
                            disabled={!online || !!busy}
                            title={tx("对方换电脑时，用登录码登录")}
                            aria-label={tx("登录码")}
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                          >
                            <span className="hidden lg:inline">{tx("登录码")}</span>
                          </Btn>
                        )}
                        <Btn
                          variant="ghost"
                          size="xs"
                          onClick={() => setRemoving(m)}
                          disabled={!online || !!busy}
                          title={tx("移除")}
                          aria-label={tx("移除")}
                          icon={<UserMinus className="h-3.5 w-3.5" />}
                        >
                          <span className="hidden lg:inline">{tx("移除")}</span>
                        </Btn>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-1 mt-7 border-t border-paper/[0.07] pt-7 text-[14px] font-medium text-paper">
        {tx("权限说明")}
      </h2>
      <div className="-mx-3">
        <table className="w-full text-[13px]">
          <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
            <tr>
              <th className="px-3 py-2 text-left font-normal">
                {tx("可以做什么")}
              </th>
              {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                <th key={r} className="w-24 px-3 py-2 text-center font-normal">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-paper/[0.07]">
            {PERMS.map(p => (
              <tr key={p.label}>
                <td className="px-3 py-2 text-paper-2">{tx(p.label)}</td>
                {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                  <td key={r} className="px-3 py-2 text-center">
                    {p.roles.includes(r) ? (
                      <Check
                        className="mx-auto h-4 w-4 text-jade"
                        aria-label={tx("可以")}
                      />
                    ) : (
                      <Minus
                        className="mx-auto h-4 w-4 text-paper-3/50"
                        aria-label={tx("不可以")}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InlineModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={tx("移除 {0}？", removing?.name)}
        description={tx("对方的角色会删除，保存过的版本保留。")}
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRemoving(null)}>
              {tx("取消")}
            </Btn>
            <Btn
              variant="primary"
              size="md"
              disabled={busy === "remove"}
              onClick={() => {
                if (!removing) return;
                const ok = tx("已移除 {0}", removing.name);
                if (session) {
                  const id = removing.id;
                  void call("remove", () => session.removeMember(id), ok).then(
                    () => setRemoving(null)
                  );
                  return;
                }
                actions.removeMember(removing.id);
                actions.toast("manager", "success", ok);
                setRemoving(null);
              }}
            >
              {tx("移除")}
            </Btn>
          </>
        }
      />
      <InlineModal
        open={regen}
        onClose={() => setRegen(false)}
        title={tx("重新生成邀请码？")}
        description={tx("旧邀请码会立刻失效。")}
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRegen(false)}>
              {tx("取消")}
            </Btn>
            <Btn
              variant="primary"
              size="md"
              disabled={busy === "invite"}
              onClick={() => {
                if (session) {
                  void call(
                    "invite",
                    () => session.resetInvite(),
                    tx("已生成新邀请码")
                  ).then(() => setRegen(false));
                  return;
                }
                actions.regenerateInvite();
                setRegen(false);
                actions.toast("manager", "success", tx("已生成新邀请码"));
              }}
            >
              {tx("重新生成")}
            </Btn>
          </>
        }
      />
      <LoginCodeDialog
        open={!!codeFor}
        onClose={() => setCodeFor(null)}
        memberId={codeFor?.id}
        memberName={codeFor?.name}
      />
    </div>
  );
}

/**
 * 加入前本机的方案、打本记录、避雷还没放进亲友团：编辑和管理员可以放进去；
 * 不要的话删掉（加入前已经自动备份过）。退出亲友团时没放进去的会放回本机。
 */
function PendingBar() {
  const { state, actions } = useProto();
  const session = useTeam();
  const [confirm, setConfirm] = useState(false);
  const p = session?.account?.pending;
  if (!session || !p || session.pendingCount === 0) return null;
  const role = me(state)?.role;
  const canEdit = role === "admin" || role === "editor";
  const records = p.raidLogs.length + p.blacklist.length;
  const text =
    p.schemes.length && records
      ? tx("加入前本机有 {0} 个方案、{1} 条记录，还没放进亲友团", p.schemes.length, records)
      : p.schemes.length
        ? tx("加入前本机有 {0} 个方案，还没放进亲友团", p.schemes.length)
        : tx("加入前本机有 {0} 条记录，还没放进亲友团", records);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-paper/[0.035] px-3.5 py-2.5 ring-1 ring-inset ring-paper/[0.08]">
      <p className="min-w-0 flex-1 text-[13px] text-paper-2">{text}</p>
      {!canEdit && (
        <span className="text-[12px] text-paper-3">
          {tx("编辑和管理员可以放进去")}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Btn variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          {tx("不要了")}
        </Btn>
        {canEdit && (
          <Btn
            variant="secondary"
            size="sm"
            disabled={!isOnline(state)}
            onClick={() => {
              session.mergePending();
              actions.toast("manager", "success", tx("已放进亲友团"));
            }}
          >
            {tx("放进亲友团")}
          </Btn>
        )}
      </span>
      <InlineModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={tx("不放进亲友团？")}
        description={tx("这些方案和记录会从本机删掉。加入前已经自动备份过一份数据。")}
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setConfirm(false)}>
              {tx("取消")}
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => {
                session.discardPending();
                setConfirm(false);
              }}
            >
              {tx("删掉")}
            </Btn>
          </>
        }
      />
    </div>
  );
}

const TEAM_NAME_MAX = TEAM_LIMITS.teamName;

/** 团名：管理员点铅笔直接改。回车或点别处保存，Esc 取消 */
function TeamName({
  name,
  editable,
  online,
}: {
  name: string;
  editable: boolean;
  online: boolean;
}) {
  const { actions } = useProto();
  const session = useTeam();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);

  const check = (n: string) =>
    !n
      ? tx("团名不能为空")
      : n.length > TEAM_NAME_MAX
        ? tx("团名最多 {0} 个字", TEAM_NAME_MAX)
        : "";

  const finish = () => {
    const n = value.trim();
    setEditing(false);
    setError("");
    if (cancelRef.current || n === name) {
      cancelRef.current = false;
      return;
    }
    const err = check(n);
    if (err) {
      actions.toast("manager", "error", tx("{0}，已恢复原名", err));
      return;
    }
    if (session) {
      session
        .renameTeam(n)
        .then(() =>
          actions.toast("manager", "success", tx("团名已改为「{0}」", n))
        )
        .catch(e =>
          actions.toast(
            "manager",
            "error",
            tx("{0}，已恢复原名", teamErrorText(e))
          )
        );
      return;
    }
    actions.renameTeam(n);
    actions.toast("manager", "success", tx("团名已改为「{0}」", n));
  };

  if (editing) {
    return (
      <span className="relative inline-block">
        <input
          autoFocus
          value={value}
          maxLength={24}
          spellCheck={false}
          aria-label={tx("团名")}
          aria-invalid={!!error}
          onFocus={e => e.currentTarget.select()}
          onChange={e => {
            setValue(e.target.value);
            setError("");
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const err = check(value.trim());
              if (err) setError(err);
              else e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              cancelRef.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={finish}
          className={cn(
            "-my-1 -ml-2 h-9 w-[300px] rounded-md bg-paper/[0.04] px-2 text-[20px] font-semibold text-paper outline-none ring-1 ring-inset",
            error ? "ring-cinnabar-text/70" : "ring-cinnabar-text/50"
          )}
        />
        {error && (
          <span
            role="alert"
            className="absolute left-0 top-full z-10 mt-2 whitespace-nowrap rounded-md bg-ink-3 px-2 py-1 font-sans text-[12px] font-normal text-cinnabar-text shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)] ring-1 ring-paper/12"
          >
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      {editable && (
        <IconBtn
          label={online ? tx("修改团名") : tx("离线时不能修改")}
          disabled={!online}
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          className="-my-1 h-7 w-7 text-paper-3"
        >
          <Pencil className="h-3.5 w-3.5" />
        </IconBtn>
      )}
    </span>
  );
}
