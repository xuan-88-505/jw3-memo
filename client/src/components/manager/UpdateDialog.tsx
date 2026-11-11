/**
 * 设置页「版本」行和一键更新弹窗。状态来自 lib/update/appUpdate.ts。
 *
 * - 没有新版本：显示版本号和「检查更新」。
 * - 有新版本：版本号后面金色写「新版本 x.y.z」，按钮变成「更新」，点了打开弹窗。
 * - 弹窗：更新内容 → 「更新并重启」→ 下载进度 → 安装中；失败时可以重试或去下载页。
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Btn } from "@/components/common/ui";
import { InlineModal } from "@/components/common/overlay";
import { RELEASES_URL, openExternal } from "@/lib/desktop";
import {
  checkForUpdate,
  dismissUpdateError,
  formatMB,
  getUpdateState,
  installUpdate,
  useAppUpdate,
  type UpdateErrorStage,
} from "@/lib/update/appUpdate";
import { relativeTime } from "@/lib/format";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";
import { useProto } from "@/state/store";

/** 版本行右边的按钮和说明文字；放在 SettingRow 里用 */
export function useUpdateRow() {
  const { state, actions } = useProto();
  const u = useAppUpdate();
  const [open, setOpen] = useState(false);
  const checking = u.phase === "checking" && u.manual;
  const checkFailed = u.phase === "error" && u.error === "check";

  // 用户点的检查：已是最新、失败都用提示条告诉用户；有新版本直接打开弹窗
  const check = async () => {
    const info = await checkForUpdate(true);
    if (info === null)
      actions.toast("manager", "success", tx("已是最新版本 {0}", APP_VERSION));
    else if (info) setOpen(true);
    else
      actions.toast("manager", "error", tx("检查更新失败，请检查网络后再试"));
  };

  // 面板通知里点了「更新」：已查到新版本就直接打开弹窗，否则先检查一次
  useEffect(() => {
    if (state.managerIntent !== "app-update") return;
    actions.clearIntent();
    if (getUpdateState().available) setOpen(true);
    else void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.managerIntent]);

  const desc = (
    <span>
      {APP_VERSION}
      {u.available && (
        <>
          {" · "}
          <span className="text-gold">
            {tx("新版本 {0}", u.available.version)}
          </span>
        </>
      )}
      {!u.available && checkFailed && (
        <>
          {" · "}
          <button
            type="button"
            onClick={() => void openExternal(RELEASES_URL)}
            className="text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
          >
            {tx("去下载页")}
          </button>
        </>
      )}
    </span>
  );

  const action = u.available ? (
    <Btn size="sm" variant="primary" onClick={() => setOpen(true)}>
      {tx("更新")}
    </Btn>
  ) : (
    <Btn
      size="sm"
      onClick={() => void check()}
      disabled={checking}
      icon={
        checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
      }
    >
      {checking ? tx("正在检查") : tx("检查更新")}
    </Btn>
  );

  const dialog = <UpdateDialog open={open} onClose={() => setOpen(false)} />;
  return { desc, action, dialog };
}

const ERROR_TEXT: Record<UpdateErrorStage, string> = {
  check: "检查更新失败，请检查网络后再试",
  download: "下载没有完成，请检查网络后重试",
  sync: "亲友团还在同步，等一会儿再试",
  save: "数据没能写进文件，这次先不更新",
  install: "安装没有完成。可以重试，或去下载页手动安装",
};

export function UpdateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const u = useAppUpdate();
  const info = u.available;
  // 方案编辑器里没点「保存」的修改不写进文件，重启后就没了：先提醒
  const drafts = Object.keys(useProto().state.drafts).length;
  const working = u.phase === "downloading" || u.phase === "installing";
  const failed = u.phase === "error" && u.error && u.error !== "check";

  // 没有可更新的版本了（比如重新检查后已是最新）就关掉
  useEffect(() => {
    if (open && !info) onClose();
  }, [open, info, onClose]);

  if (!info) return null;

  const close = () => {
    if (working) return;
    dismissUpdateError();
    onClose();
  };
  const start = () => {
    dismissUpdateError();
    void installUpdate();
  };

  const pct =
    u.total && u.total > 0 ? Math.min(100, (u.received / u.total) * 100) : null;

  return (
    <InlineModal
      open={open}
      onClose={close}
      dismissible={!working}
      width={440}
      bodyMaxHeight={320}
      title={tx("更新到 {0}", info.version)}
      description={
        info.date
          ? tx(
              "{0}发布 · 现在是 {1}",
              relativeTime(new Date(info.date).toISOString(), Date.now(), true),
              APP_VERSION
            )
          : tx("现在是 {0}", APP_VERSION)
      }
      footer={
        working ? (
          <UpdateProgress
            phase={u.phase}
            received={u.received}
            total={u.total}
            pct={pct}
            attempt={u.attempt}
            direct={u.direct}
          />
        ) : (
          <>
            {failed && (
              <Btn
                variant="ghost"
                size="md"
                onClick={() => void openExternal(RELEASES_URL)}
                className="mr-auto"
              >
                {tx("去下载页")}
              </Btn>
            )}
            <Btn variant="ghost" size="md" onClick={close}>
              {tx("以后再说")}
            </Btn>
            <Btn variant="primary" size="md" onClick={start} data-autofocus>
              {failed ? tx("重试") : tx("更新并重启")}
            </Btn>
          </>
        )
      }
    >
      <ReleaseNotes text={info.notes} />
      <p
        role={failed ? "alert" : undefined}
        className={cn(
          "mt-3 text-[12.5px] leading-relaxed",
          failed ? "text-cinnabar-text" : "text-paper-3"
        )}
      >
        {failed && u.error
          ? tx(ERROR_TEXT[u.error])
          : tx("更新时软件会先保存数据，然后关掉，装好后自动重新打开。")}
      </p>
      {drafts > 0 && !failed && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-gold">
          {tx("方案库里有 {0} 个方案没保存，更新后这些修改会丢掉", drafts)}
        </p>
      )}
    </InlineModal>
  );
}

function UpdateProgress({
  phase,
  received,
  total,
  pct,
  attempt,
  direct,
}: {
  phase: string;
  received: number;
  total: number | null;
  pct: number | null;
  /** 第几次下载；大于 1 表示前面断过 */
  attempt: number;
  /** 这次从 GitHub 直接下 */
  direct: boolean;
}) {
  const installing = phase === "installing";
  const got = formatMB(received);
  const all = total ? formatMB(total) : null;
  // 断过一次：说明在重下；最后一次换了线路：说明改从 GitHub 下
  const label = installing
    ? tx("正在安装，软件马上会重新打开")
    : direct
      ? all
        ? tx("改从 GitHub 下载 {0} / {1} MB", got, all)
        : tx("改从 GitHub 下载 {0} MB", got)
      : attempt > 1
        ? all
          ? tx("网络断了，正在重新下载 {0} / {1} MB", got, all)
          : tx("网络断了，正在重新下载 {0} MB", got)
        : all
          ? tx("正在下载 {0} / {1} MB", got, all)
          : tx("正在下载 {0} MB", got);
  return (
    <div className="w-full" role="status" aria-live="polite">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-paper-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span className="tabular-nums">{label}</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-paper/[0.08]"
        role="progressbar"
        aria-label={tx("更新进度")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          installing ? 100 : pct === null ? undefined : Math.round(pct)
        }
      >
        <div
          className={cn(
            "h-full rounded-full bg-gold transition-[width] duration-200 ease-out",
            pct === null && !installing && "w-1/3 animate-pulse"
          )}
          style={
            installing
              ? { width: "100%" }
              : pct === null
                ? undefined
                : { width: `${pct}%` }
          }
        />
      </div>
    </div>
  );
}

/**
 * 更新内容。Release 正文是 Markdown：「## 标题」显示成小标题，「- 」显示成列表，
 * 去掉 ** 和 ` 这些记号；不解析链接和图片。
 */
function ReleaseNotes({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\*\*|`/g, "").trimEnd())
    .filter(l => l.trim());
  if (!lines.length)
    return (
      <p className="text-[13px] text-paper-3">{tx("这一版没有写更新内容。")}</p>
    );
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-paper-2">
      {lines.map((l, i) => {
        const h = /^#{1,6}\s+(.*)$/.exec(l);
        if (h)
          return (
            <p
              key={i}
              className={cn("font-medium text-paper", i > 0 && "pt-1.5")}
            >
              {h[1]}
            </p>
          );
        const li = /^\s*[-*]\s+(.*)$/.exec(l);
        if (li)
          return (
            <p key={i} className="flex gap-2">
              <span className="select-none text-paper-3" aria-hidden="true">
                ·
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{li[1]}</span>
            </p>
          );
        return (
          <p key={i} className="[overflow-wrap:anywhere]">
            {l}
          </p>
        );
      })}
    </div>
  );
}
