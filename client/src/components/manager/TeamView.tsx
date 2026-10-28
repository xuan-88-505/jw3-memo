import { useState } from "react";
import { Check, Copy, Minus, RefreshCw, UserMinus } from "lucide-react";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn } from "@/components/common/ui";
import { ME_ID } from "@/data/seed";
import type { Member, Role } from "@/data/types";
import { ROLE_LABEL, absoluteTime, copyText } from "@/lib/format";
import { isOnline, me, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./shared";

const PERMS: { label: string; roles: Role[] }[] = [
  { label: "查看方案、复制宏", roles: ["admin", "editor", "viewer"] },
  { label: "管理自己的角色和同步状态", roles: ["admin", "editor", "viewer"] },
  { label: "新建和修改方案", roles: ["admin", "editor"] },
  { label: "邀请成员、改权限、移除成员", roles: ["admin"] },
];

export function TeamView() {
  const { state, actions } = useProto();
  const team = state.team!;
  const self = me(state);
  const isAdmin = self?.role === "admin";
  const online = isOnline(state);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [regen, setRegen] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(team.inviteCode);
    if (!ok) {
      actions.toast("manager", "error", "复制失败，请手动选中邀请码复制。");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    actions.toast(
      "manager",
      "success",
      "邀请码已复制。发给亲友，让他们在同调面板里输入。"
    );
  };

  const onRole = (m: Member, role: Role) => {
    const admins = state.members.filter(x => x.role === "admin");
    if (m.role === "admin" && role !== "admin" && admins.length === 1) {
      actions.toast(
        "manager",
        "error",
        "亲友团至少要有一个管理员。先把别人设成管理员。"
      );
      return;
    }
    actions.setRole(m.id, role);
    actions.toast(
      "manager",
      "success",
      `已把 ${m.name} 设为${ROLE_LABEL[role]}`
    );
  };

  return (
    <div>
      <SectionHeader
        title={`亲友团 · ${team.name}`}
        description={`${state.members.length} 位成员。大家共用方案，各自管理自己的角色。`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-ink-3 px-5 py-4 ring-1 ring-inset ring-paper/8">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-paper-3">邀请码</p>
          <p className="mt-1 select-all font-mono text-[22px] font-medium tracking-[0.12em] text-paper">
            {team.inviteCode}
          </p>
          <p className="mt-1 text-[12px] text-paper-3">
            新成员加入后默认是只读，管理员可以改成编辑。
            {!isAdmin && "只有管理员能重新生成邀请码。"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn
            variant="primary"
            size="md"
            onClick={onCopy}
            icon={
              copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
          >
            {copied ? "已复制" : "复制邀请码"}
          </Btn>
          {isAdmin && (
            <Btn
              variant="secondary"
              size="md"
              onClick={() => setRegen(true)}
              disabled={!online}
              title={online ? "旧邀请码会失效" : "离线时不能操作"}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              重新生成
            </Btn>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-paper/8">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-ink-3 text-[12px] text-paper-3">
            <tr>
              <th className="px-4 py-2.5 font-normal">成员</th>
              <th className="px-4 py-2.5 font-normal">权限</th>
              <th className="px-4 py-2.5 font-normal">角色数</th>
              <th className="px-4 py-2.5 font-normal">加入时间</th>
              <th className="px-4 py-2.5 text-right font-normal">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper/[0.06]">
            {state.members.map(m => {
              const count = state.characters.filter(
                c => c.ownerId === m.id
              ).length;
              const isMe = m.id === ME_ID;
              return (
                <tr key={m.id} className="hover:bg-paper/[0.02]">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar member={m} size={28} />
                      <span className="font-medium text-paper">{m.name}</span>
                      {isMe && (
                        <span className="rounded-[4px] bg-paper/[0.08] px-1.5 text-[11px] text-paper-2">
                          你
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <select
                        value={m.role}
                        onChange={e => onRole(m, e.target.value as Role)}
                        disabled={!online}
                        aria-label={`${m.name} 的权限`}
                        className="h-7 rounded-md bg-ink px-2 text-[12.5px] text-paper ring-1 ring-inset ring-paper/12 focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60"
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
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
                  <td className="px-4 py-2.5 text-paper-2">{count}</td>
                  <td
                    className="px-4 py-2.5 text-paper-3"
                    title={absoluteTime(m.joinedAt)}
                  >
                    {new Date(m.joinedAt).getMonth() + 1}月
                    {new Date(m.joinedAt).getDate()}日
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isAdmin && !isMe && (
                      <Btn
                        variant="ghost"
                        size="xs"
                        onClick={() => setRemoving(m)}
                        disabled={!online}
                        icon={<UserMinus className="h-3.5 w-3.5" />}
                      >
                        移除
                      </Btn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-[12px] tracking-[0.1em] text-paper-3">
        权限说明
      </h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-paper/8">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-3 text-[12px] text-paper-3">
            <tr>
              <th className="px-4 py-2 text-left font-normal">可以做什么</th>
              {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                <th key={r} className="w-24 px-4 py-2 text-center font-normal">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-paper/[0.06]">
            {PERMS.map(p => (
              <tr key={p.label}>
                <td className="px-4 py-2 text-paper-2">{p.label}</td>
                {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                  <td key={r} className="px-4 py-2 text-center">
                    {p.roles.includes(r) ? (
                      <Check
                        className="mx-auto h-4 w-4 text-jade"
                        aria-label="可以"
                      />
                    ) : (
                      <Minus
                        className="mx-auto h-4 w-4 text-paper-3/50"
                        aria-label="不可以"
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
        title={`移除 ${removing?.name}？`}
        description="对方会退出亲友团，他的角色和同步记录也会删除。他保存过的方案版本会保留在技改记录里。"
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRemoving(null)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => {
                if (removing) {
                  actions.removeMember(removing.id);
                  actions.toast(
                    "manager",
                    "success",
                    `已移除 ${removing.name}`
                  );
                }
                setRemoving(null);
              }}
            >
              移除
            </Btn>
          </>
        }
      />
      <InlineModal
        open={regen}
        onClose={() => setRegen(false)}
        title="重新生成邀请码？"
        description="旧邀请码会立刻失效。已经加入的成员不受影响。"
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRegen(false)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => {
                actions.regenerateInvite();
                setRegen(false);
                actions.toast(
                  "manager",
                  "success",
                  "已生成新的邀请码，旧的已失效。"
                );
              }}
            >
              重新生成
            </Btn>
          </>
        }
      />
    </div>
  );
}
