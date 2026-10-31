import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import type { LoginCodeResponse } from "@shared/teamApi";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import { copyText } from "@/lib/format";
import { teamErrorText, useTeam } from "@/lib/team/TeamSync";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/**
 * 登录码：在另一台电脑上「亲友团 → 用登录码登录」时输入。10 分钟内有效，只能用一次；
 * 再生成一个，旧的就失效。memberId 不填是给自己；管理员可以给别人生成（对方换电脑时用）。
 */
export function LoginCodeDialog({
  open,
  onClose,
  memberId,
  memberName,
}: {
  open: boolean;
  onClose: () => void;
  memberId?: string;
  memberName?: string;
}) {
  const session = useTeam();
  const [res, setRes] = useState<LoginCodeResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      setRes(await session.loginCode(memberId));
      setNow(Date.now());
    } catch (err) {
      setRes(null);
      setError(teamErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  // 打开时生成一个；关掉时清掉，下次打开重新生成
  useEffect(() => {
    if (!open) {
      setRes(null);
      setError("");
      setCopied(false);
      return;
    }
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId]);

  // 倒计时
  useEffect(() => {
    if (!open || !res) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open, res]);

  const left = res
    ? Math.max(0, Math.round((Date.parse(res.expiresAt) - now) / 1000))
    : 0;
  const expired = !!res && left === 0;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  const onCopy = async () => {
    if (!res) return;
    if (!(await copyText(res.code))) {
      setError(tx("复制失败，请手动选中复制"));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const forOther = !!memberId;
  return (
    <InlineModal
      open={open}
      onClose={onClose}
      width={420}
      title={
        forOther
          ? tx("给 {0} 的登录码", memberName ?? "")
          : tx("在另一台电脑登录")
      }
      description={
        forOther
          ? tx("把登录码发给对方。在对方电脑上打开「亲友团 → 用登录码登录」输入。")
          : tx("在另一台电脑上打开备忘录，进入「亲友团 → 用登录码登录」，输入下面的登录码。")
      }
      footer={
        <>
          <Btn
            variant="ghost"
            size="md"
            onClick={() => void generate()}
            disabled={busy}
          >
            {tx("重新生成")}
          </Btn>
          <Btn variant="primary" size="md" onClick={onClose}>
            {tx("完成")}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col items-center pb-2 pt-1">
        <div className="flex h-14 items-center gap-2">
          {busy ? (
            <Loader2
              className="h-5 w-5 animate-spin text-paper-3"
              aria-label={tx("正在生成")}
            />
          ) : res ? (
            <>
              <span
                className={cn(
                  "select-all font-mono text-[28px] font-semibold tracking-[0.14em]",
                  expired ? "text-paper-3 line-through" : "text-paper"
                )}
              >
                {res.code}
              </span>
              {!expired && (
                <button
                  type="button"
                  onClick={() => void onCopy()}
                  aria-label={copied ? tx("已复制") : tx("复制登录码")}
                  title={copied ? tx("已复制") : tx("复制登录码")}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-md text-paper-3 transition-colors hover:bg-paper/[0.07] hover:text-paper",
                    copied && "text-jade hover:text-jade"
                  )}
                >
                  {copied ? (
                    <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </>
          ) : null}
        </div>
        <p
          role={error ? "alert" : undefined}
          aria-live="polite"
          className={cn(
            "min-h-[18px] text-[12px]",
            error ? "text-cinnabar-text" : "text-paper-3"
          )}
        >
          {error ||
            (res
              ? expired
                ? tx("已过期，点「重新生成」")
                : tx("{0} 后失效，只能用一次", mmss)
              : "")}
        </p>
      </div>
    </InlineModal>
  );
}
