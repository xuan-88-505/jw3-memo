import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { InlineModal } from "@/components/common/overlay";
import { Btn, Segmented } from "@/components/common/ui";
import { FIELD } from "@/components/common/surface";
import { DESKTOP_PLATFORM, IS_DESKTOP } from "@/lib/desktop";
import {
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_CONTENT_MAX,
  charLength,
  clearDraftAfterSend,
  loadDraft,
  saveDraft,
  sendFeedback,
  type FeedbackDraft,
  type FeedbackKind,
  type SendResult,
} from "@/lib/feedback";
import { tx, useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProto } from "@/state/store";

/** 不同类型给不同的提示，引导用户写清楚 */
const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: "哪里出了问题？做了什么操作后出现的？",
  idea: "想要什么功能，或者哪里用着不顺手？",
  other: "想说什么都可以写在这里",
};

function errorText(r: Exclude<SendResult, { ok: true }>) {
  switch (r.reason) {
    case "rate_limited":
      return tx("发得太频繁了，{0} 分钟后再试", Math.max(1, Math.ceil(r.retryAfter / 60)));
    case "invalid":
      return tx("内容格式不对，改一下再试");
    case "server":
      return tx("服务器出错了，稍后再试");
    default:
      return tx("没发出去，检查网络后再试");
  }
}

/** 浏览器自己的联网状态（桌面版断网时也会变） */
function useNavigatorOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function FeedbackDialog({
  open,
  onClose,
  appVersion,
}: {
  open: boolean;
  onClose: () => void;
  appVersion: string;
}) {
  const { state, actions } = useProto();
  const lang = useLang();
  const netOnline = useNavigatorOnline();
  const offline = !netOnline || state.dataState === "offline";
  const [draft, setDraft] = useState<FeedbackDraft>(loadDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const contactId = useId();

  // 每次打开：读草稿、清掉上次的错误、光标放进内容框
  // （InlineModal 的聚焦先执行，这里后执行，所以光标在内容框里）
  useEffect(() => {
    if (!open) return;
    setDraft(loadDraft());
    setError(null);
    textRef.current?.focus();
  }, [open]);

  const update = (patch: Partial<FeedbackDraft>) => {
    setDraft(d => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
    setError(null);
  };

  const len = charLength(draft.content);
  const empty = !draft.content.trim();
  const canSend = !empty && !sending && !offline;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const r = await sendFeedback({ ...draft, appVersion, lang });
    setSending(false);
    if (r.ok) {
      clearDraftAfterSend(draft.contact);
      setDraft(loadDraft());
      actions.toast("manager", "success", tx("已发送，谢谢反馈"));
      onClose();
      return;
    }
    setError(errorText(r));
  };

  // Ctrl / ⌘ + Enter 发送
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const platformName = IS_DESKTOP
    ? DESKTOP_PLATFORM === "mac"
      ? "Mac"
      : "Windows"
    : tx("网页版");
  const status = error ?? (offline ? tx("离线时不能发送，联网后再试") : null);

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={tx("意见反馈")}
      width={480}
      bodyMaxHeight={460}
      footer={
        <>
          {status && (
            <p
              role={error ? "alert" : undefined}
              className={cn(
                "mr-auto flex min-w-0 items-start gap-1.5 text-[12.5px] leading-snug",
                error ? "text-cinnabar-text" : "text-gold"
              )}
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{status}</span>
            </p>
          )}
          <Btn size="md" variant="ghost" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn
            size="md"
            variant="primary"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            icon={
              sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : undefined
            }
          >
            {sending ? tx("正在发送") : tx("发送")}
          </Btn>
        </>
      }
    >
      <div className="pb-1" onKeyDown={onKeyDown}>
        <Segmented<FeedbackKind>
          label={tx("反馈类型")}
          value={draft.kind}
          onChange={kind => update({ kind })}
          options={[
            { value: "bug", label: tx("问题") },
            { value: "idea", label: tx("建议") },
            { value: "other", label: tx("其他") },
          ]}
        />
        <textarea
          ref={textRef}
          value={draft.content}
          onChange={e => update({ content: e.target.value })}
          maxLength={FEEDBACK_CONTENT_MAX}
          rows={6}
          aria-label={tx("反馈内容")}
          placeholder={tx(PLACEHOLDER[draft.kind])}
          className={cn(
            FIELD,
            "scroll-thin mt-3 block w-full resize-none rounded-md px-3 py-2 text-[13px] leading-[1.7] text-paper placeholder:text-paper-3/70"
          )}
        />
        {/* 字数放在输入框下面，弱化；快到上限时变金色 */}
        <div className="mt-1 flex justify-end">
          <span
            className={cn(
              "text-[11.5px] tabular-nums text-paper-3",
              len > FEEDBACK_CONTENT_MAX * 0.9 && "text-gold"
            )}
          >
            {len} / {FEEDBACK_CONTENT_MAX}
          </span>
        </div>
        <label
          htmlFor={contactId}
          className="mt-2 block text-[12.5px] text-paper-2"
        >
          {tx("联系方式")}
          {/* 中日文是全角括号，自带间距；英韩西的译文自带前导空格 */}
          <span className="whitespace-pre text-paper-3">{tx("（选填）")}</span>
        </label>
        <input
          id={contactId}
          value={draft.contact}
          onChange={e => update({ contact: e.target.value })}
          maxLength={FEEDBACK_CONTACT_MAX}
          placeholder={tx("QQ、微信或邮箱，方便回复你")}
          className={cn(
            FIELD,
            "mt-1.5 h-8 w-full rounded-md px-3 text-[13px] text-paper placeholder:text-paper-3/70"
          )}
        />
        <p className="mt-3 text-[12px] leading-relaxed text-paper-3">
          {tx("只有作者能看到 · 会附带版本 {0} · {1}", appVersion, platformName)}
        </p>
      </div>
    </InlineModal>
  );
}
