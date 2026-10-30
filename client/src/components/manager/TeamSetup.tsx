import { useId, useState } from "react";
import { LogIn, Plus } from "lucide-react";
import { Btn } from "@/components/common/ui";
import { SEED_TEAM } from "@/data/seed";
import { isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader, inputCls } from "./shared";
import { tx } from "@/lib/i18n";

const NAME_MAX = 12;

/** 还没加入亲友团：创建一个，或用邀请码加入。自己的数据都会保留 */
export function TeamSetup() {
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
    <div>
      <SectionHeader title={tx("亲友团")} />
      <div className="grid max-w-[760px] grid-cols-1 divide-y divide-paper/[0.07] min-[880px]:grid-cols-2 min-[880px]:divide-x min-[880px]:divide-y-0">
        <Card
          icon={<Plus className="h-4 w-4" aria-hidden="true" />}
          title={tx("创建亲友团")}
          htmlFor={nameId}
        >
          <div className="flex gap-2">
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
              className={cn(inputCls(!!nameError), "flex-1")}
            />
            <Btn
              variant="primary"
              size="md"
              onClick={create}
              disabled={!online}
            >
              {tx("创建")}
            </Btn>
          </div>
          <p
            id={`${nameId}-msg`}
            className={cn(
              "mt-1.5 min-h-[18px] text-[12px]",
              nameError ? "text-cinnabar-text" : "text-paper-3"
            )}
          >
            {nameError || tx("你的角色和方案会一起带进去")}
          </p>
        </Card>
        <Card
          icon={<LogIn className="h-4 w-4" aria-hidden="true" />}
          title={tx("用邀请码加入")}
          htmlFor={codeId}
        >
          <div className="flex gap-2">
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
                "flex-1 font-mono uppercase tracking-wider placeholder:tracking-normal"
              )}
            />
            <Btn
              variant="secondary"
              size="md"
              onClick={join}
              disabled={!online}
            >
              {tx("加入")}
            </Btn>
          </div>
          <p
            id={`${codeId}-msg`}
            className={cn(
              "mt-1.5 min-h-[18px] text-[12px]",
              codeError ? "text-cinnabar-text" : "text-paper-3"
            )}
          >
            {codeError || (
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
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  htmlFor,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-6 first:pt-0 last:pb-0 min-[880px]:px-7 min-[880px]:py-1 min-[880px]:first:pl-0 min-[880px]:last:pr-0">
      <label
        htmlFor={htmlFor}
        className="mb-3 flex items-center gap-2 text-[13.5px] font-medium text-paper"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-paper/[0.06] text-paper-2">
          {icon}
        </span>
        {title}
      </label>
      {children}
    </section>
  );
}
