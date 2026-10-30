/**
 * 截图识别奇穴：方案页「奇穴」标题右边的按钮，和奇穴上方的结果提示。
 *
 * - 在方案页任何地方按 Ctrl+V / ⌘V 粘贴截图就识别；弹窗里、剪贴板里有文字时不管。
 * - 点按钮先读剪贴板里的图片，没有图片就打开选文件。
 * - 认出的层直接改进草稿，没认出的层保持原样；提示里可以撤销。
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ScanLine,
  X,
} from "lucide-react";
import type { Platform } from "@/data/types";
import { layersOf } from "@/data/seed";
import { Btn } from "@/components/common/ui";
import { readClipboardImage } from "@/lib/desktop";
import { pasteHint } from "@/lib/format";
import { getLang, tx } from "@/lib/i18n";
import {
  TalentScanError,
  mergePicks,
  preloadTalentIcons,
  scanTalents,
} from "@/lib/talentScan";
import { clipboardImages } from "./records/NoteImages";

type Notice =
  | {
      kind: "done";
      found: number;
      missed: number[];
      before: number[];
      after: number[];
    }
  | { kind: "same"; found: number; missed: number[] }
  | { kind: "error"; text: string };

/** 至少认出这么多层才算奇穴截图 */
const MIN_FOUND = 3;

const joinLayers = (layers: number[]) =>
  layers.join(getLang() === "zh" ? "、" : ", ");

export function useTalentScan({
  xinfa,
  resetKey,
  talents,
  enabled,
  onApply,
}: {
  xinfa: string;
  /** 换方案时清掉提示 */
  resetKey: string;
  talents: number[];
  enabled: boolean;
  onApply: (next: number[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 换方案后，之前没跑完的识别结果作废
  const seq = useRef(0);
  const latest = useRef({ xinfa, talents, onApply, busy });
  latest.current = { xinfa, talents, onApply, busy };

  useEffect(() => {
    seq.current += 1;
    setBusy(false);
    setNotice(null);
  }, [resetKey]);

  // 打开方案页后空闲时先下载图标
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => preloadTalentIcons(xinfa), 800);
    return () => window.clearTimeout(id);
  }, [xinfa, enabled]);

  // 手动改了奇穴，撤销就没意义了，提示收起
  useEffect(() => {
    if (notice?.kind === "done" && talents.join() !== notice.after.join())
      setNotice(null);
  }, [talents, notice]);

  const run = async (src: Blob | ImageData) => {
    if (latest.current.busy) return;
    const my = ++seq.current;
    const { xinfa } = latest.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await scanTalents(src, xinfa);
      if (my !== seq.current) return;
      // 真截图能认出 8–9 层；只认出一两层多半是别的图里碰巧像，不改
      if (r.found < MIN_FOUND) {
        setNotice({
          kind: "error",
          text: tx("没认出奇穴。截图要包含奇穴图标，并且是{0}的", xinfa),
        });
        return;
      }
      const before = latest.current.talents;
      const pool = (layersOf(xinfa)[6]?.options ?? []).map(o => o.pos);
      const after = mergePicks(before, r.picks, pool);
      const missed = r.picks.flatMap((p, i) => (p === null ? [i + 1] : []));
      if (after.join() === before.join()) {
        setNotice({ kind: "same", found: r.found, missed });
        return;
      }
      latest.current.onApply(after);
      setNotice({ kind: "done", found: r.found, missed, before, after });
    } catch (e) {
      if (my !== seq.current) return;
      const code = e instanceof TalentScanError ? e.code : "decode";
      setNotice({
        kind: "error",
        text:
          code === "icons"
            ? tx("奇穴图标下载失败，检查网络后再试")
            : code === "empty"
              ? tx("{0}还没有奇穴数据", xinfa)
              : tx("图片打不开，换一张试试"),
      });
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  // 方案页任何地方粘贴截图
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('[role="dialog"]')) return;
      const files = clipboardImages(e);
      if (!files.length) return;
      // 从网页复制的内容同时带文字和图片，这时按普通文字粘贴
      if (e.clipboardData?.getData("text/plain").trim()) return;
      e.preventDefault();
      void runRef.current(files[0]);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);

  const choose = () => fileRef.current?.click();
  const pick = async () => {
    if (latest.current.busy) return;
    const img = await readClipboardImage();
    if (img) void runRef.current(img);
    else choose();
  };
  const undo = () => {
    if (notice?.kind !== "done") return;
    latest.current.onApply(notice.before);
    setNotice(null);
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      tabIndex={-1}
      aria-hidden="true"
      onChange={e => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void runRef.current(f);
      }}
    />
  );

  return {
    busy,
    notice,
    pick,
    choose,
    undo,
    dismiss: () => setNotice(null),
    fileInput,
  };
}

export function TalentScanButton({
  busy,
  platform,
  onClick,
}: {
  busy: boolean;
  platform: Platform;
  onClick: () => void;
}) {
  const hint = tx("粘贴（{0}）或选择奇穴截图，自动选上", pasteHint(platform));
  return (
    <Btn
      variant="secondary"
      size="xs"
      title={hint}
      aria-label={tx("识别截图")}
      aria-busy={busy || undefined}
      disabled={busy}
      // 文字不变，只换图标，免得按钮宽度跳
      icon={
        busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
        )
      }
      onClick={onClick}
    >
      {tx("识别截图")}
    </Btn>
  );
}

// 识别中和结果同高（36px），换内容时不跳
const ROW =
  "mb-3 flex items-start gap-2 rounded-lg bg-paper/[0.04] py-1.5 pl-3 pr-1.5 text-[12.5px] leading-6 text-paper-2 ring-1 ring-inset ring-paper/10";

export function TalentScanNotice({
  busy,
  notice,
  onUndo,
  onChoose,
  onClose,
}: {
  busy: boolean;
  notice: Notice | null;
  onUndo: () => void;
  onChoose: () => void;
  onClose: () => void;
}) {
  // 识别中和结果用同一个提示条，读屏会读出变化
  if (busy || !notice)
    return (
      <div role="status" className={ROW}>
        <Loader2
          className="mt-1 h-4 w-4 shrink-0 animate-spin text-paper-3"
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1">{tx("正在识别…")}</p>
      </div>
    );
  const missedText =
    "missed" in notice && notice.missed.length
      ? tx("第 {0} 层没认出，保持原样", joinLayers(notice.missed))
      : "";
  const text =
    notice.kind === "error"
      ? notice.text
      : notice.kind === "same"
        ? [tx("认出 {0} 层，和现在的一样", notice.found), missedText]
            .filter(Boolean)
            .join(tx("；"))
        : [tx("认出 {0} 层，已选上", notice.found), missedText]
            .filter(Boolean)
            .join(tx("；"));
  const Icon =
    notice.kind === "error"
      ? AlertTriangle
      : notice.kind === "same"
        ? Info
        : CheckCircle2;
  return (
    <div role="status" className={ROW}>
      <Icon
        className={
          notice.kind === "error"
            ? "mt-1 h-4 w-4 shrink-0 text-cinnabar-text"
            : notice.kind === "same"
              ? "mt-1 h-4 w-4 shrink-0 text-paper-3"
              : "mt-1 h-4 w-4 shrink-0 text-jade"
        }
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1">{text}</p>
      {notice.kind === "done" && (
        <Btn variant="ghost" size="xs" onClick={onUndo}>
          {tx("撤销")}
        </Btn>
      )}
      {notice.kind === "error" && (
        <Btn variant="ghost" size="xs" onClick={onChoose}>
          {tx("选择图片")}
        </Btn>
      )}
      <button
        type="button"
        aria-label={tx("关闭")}
        title={tx("关闭")}
        onClick={onClose}
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-paper-3 transition-colors hover:bg-paper/[0.08] hover:text-paper"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
