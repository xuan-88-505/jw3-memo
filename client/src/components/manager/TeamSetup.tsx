import { useId, useState, type ReactNode } from "react";
import { Btn } from "@/components/common/ui";
import { PixelScene } from "@/components/brand/PixelIcon";
import { SEED_TEAM } from "@/data/seed";
import { isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader, inputCls } from "./shared";
import { tx } from "@/lib/i18n";

const NAME_MAX = 12;

/**
 * 还没加入亲友团：上下排列，居中。
 * 插图 → 标题和一句说明 → 创建 → 「或」→ 用邀请码加入。自己的数据都会保留
 */
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
        </div>
      </div>
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
