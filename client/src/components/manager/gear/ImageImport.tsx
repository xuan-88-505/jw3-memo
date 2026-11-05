/**
 * 新建配装的「截图导入」：粘贴、拖进来或上传一张装备截图，识别出装备后按当季装备库建配装。
 * 识别见 lib/gearScan.ts；这里是状态、粘贴键和界面。
 *
 * - 弹窗打开时，在弹窗里任何地方粘贴截图都收（焦点在别的输入框里粘贴文字时不抢）。
 *   桌面版和奇穴截图一样拦下粘贴键直接读系统剪贴板：旧版 macOS 的 WebKit 焦点不在输入框时按 ⌘V 不触发 paste。
 *   剪贴板里是文字时贴进导入框，等于在导入框里粘贴。
 * - 截图卡片和三行导入框差不多高，贴图前后弹窗不跳。
 */
import { AlertTriangle, CheckCircle2, Loader2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconBtn } from "@/components/common/ui";
import { XINFA_LIST } from "@/data/seed";
import { calcSupported } from "@/lib/dpsCalc";
import {
  IS_DESKTOP,
  readClipboardImage,
  readClipboardText,
} from "@/lib/desktop";
import {
  GearScanError,
  prepareImage,
  requestScan,
  type ScanFail,
  type ScanMatch,
  type ScanResult,
} from "@/lib/gearScan";
import { getLang, tx, txn } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clipboardImages } from "../records/NoteImages";
import { isPasteKey, isTextField } from "../TalentScan";

export type ImageScan =
  | { state: "busy"; preview: string }
  | { state: "ok"; preview: string; result: ScanResult }
  | {
      state: "fail";
      /** 图片打不开时没有预览 */
      preview: string | null;
      reason: ScanFail;
      retryAfter?: number;
    };

/** 截图识别的状态；换图、移除时前一次的结果作废 */
export function useGearImage() {
  const [image, setImage] = useState<ImageScan | null>(null);
  const seq = useRef(0);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  const scan = async (my: number, dataUrl: string) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setImage({ state: "busy", preview: dataUrl });
    try {
      const result = await requestScan(dataUrl, c.signal);
      if (my === seq.current)
        setImage({ state: "ok", preview: dataUrl, result });
    } catch (e) {
      if (my !== seq.current || c.signal.aborted) return;
      setImage({
        state: "fail",
        preview: dataUrl,
        reason: e instanceof GearScanError ? e.code : "failed",
        retryAfter: e instanceof GearScanError ? e.retryAfter : undefined,
      });
    }
  };

  return {
    image,
    /** 一张新截图：先压缩，再识别 */
    async run(src: Blob | ImageData) {
      const my = ++seq.current;
      ctl.current?.abort();
      let dataUrl: string;
      try {
        dataUrl = await prepareImage(src);
      } catch (e) {
        if (my === seq.current)
          setImage({
            state: "fail",
            preview: null,
            reason: e instanceof GearScanError ? e.code : "decode",
          });
        return;
      }
      if (my === seq.current) await scan(my, dataUrl);
    },
    retry() {
      if (image?.state === "fail" && image.preview)
        void scan(++seq.current, image.preview);
    },
    clear() {
      seq.current++;
      ctl.current?.abort();
      setImage(null);
    },
  };
}

export type GearImage = ReturnType<typeof useGearImage>;

/**
 * 弹窗打开时收粘贴：截图交给 onImage，文字交给 onText（贴进导入框）。
 * 焦点在导入框（data-import-field）以外的输入框里粘贴文字时不管，那是在填名字。
 */
export function useImagePaste({
  enabled,
  onImage,
  onText,
}: {
  enabled: boolean;
  onImage: (src: Blob | ImageData) => void;
  onText: (text: string) => void;
}) {
  const latest = useRef({ onImage, onText });
  latest.current = { onImage, onText };

  useEffect(() => {
    if (!enabled) return;
    const inOtherField = (t: Element | null) =>
      isTextField(t) && !t?.closest("[data-import-field]");
    // 读系统剪贴板：先图片，再文字
    const fromClipboard = async () => {
      const img = await readClipboardImage();
      if (img) return latest.current.onImage(img);
      const text = (await readClipboardText()).trim();
      if (text) latest.current.onText(text);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!IS_DESKTOP || e.defaultPrevented || !isPasteKey(e)) return;
      // 焦点在输入框里时 paste 事件照常会来
      if (isTextField(document.activeElement)) return;
      e.preventDefault();
      void fromClipboard();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      const files = clipboardImages(e);
      if (files.length && !text) {
        e.preventDefault();
        latest.current.onImage(files[0]);
        return;
      }
      if (inOtherField(t)) return;
      if (text) {
        // 在导入框里粘贴文字是正常输入
        if (isTextField(t)) return;
        e.preventDefault();
        latest.current.onText(text);
        return;
      }
      // 桌面版有时 paste 里拿不到截图（系统剪贴板是 TIFF 等格式）：直接读系统剪贴板
      if (IS_DESKTOP) {
        e.preventDefault();
        void fromClipboard();
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("paste", onPaste);
    };
  }, [enabled]);
}

const join = (list: string[]) => list.join(getLang() === "zh" ? "、" : ", ");

/** 这张截图现在是什么情况：卡片里两行字 + 下面的说明 */
export interface ScanView {
  tone: "busy" | "ok" | "warn" | "error";
  title: string;
  detail?: string;
  /** 卡片下面的说明 */
  note?: ReactNode;
  /** 能不能按这张截图建配装 */
  ready: boolean;
  retry?: boolean;
}

export function scanView({
  image,
  match,
  matching,
  matchFailed,
  native,
  bundled,
  xinfa,
  switched,
}: {
  image: ImageScan;
  match: ScanMatch | null;
  matching: boolean;
  matchFailed: boolean;
  /** 这个心法能用备忘录的配装器（当季装备库） */
  native: boolean;
  /** 内置计算器在不在（网页版没有）；null 是还在查 */
  bundled: boolean | null;
  xinfa: string;
  /** 按截图换了心法 */
  switched: boolean;
}): ScanView {
  if (image.state === "busy")
    return {
      tone: "busy",
      title: tx("正在识别…"),
      detail: tx("一般要 10 秒左右"),
      ready: false,
    };
  if (image.state === "fail") {
    const r = image.reason;
    return {
      tone: "error",
      title:
        r === "decode"
          ? tx("图片打不开，换一张试试")
          : r === "network"
            ? tx("连不上服务器，联网后再试")
            : r === "rate_limited"
              ? txn(
                  "识别得太频繁了，{0} 分钟后再试",
                  Math.max(1, Math.ceil((image.retryAfter ?? 60) / 60))
                )
              : r === "too_large"
                ? tx("图片太大了，换一张小点的截图")
                : tx("没识别出来，再试一次"),
      ready: false,
      retry: r === "network" || r === "failed",
    };
  }
  const res = image.result;
  if (res.notGear || !res.items.length)
    return {
      tone: "warn",
      title: tx("截图里没认出装备"),
      detail: tx("换一张看得清装备名的截图"),
      ready: false,
    };
  // 截图是配装器不支持的心法（太虚剑意等）：不拿当前心法的装备库硬对
  const sx = res.xinfa;
  if (sx && sx !== xinfa && XINFA_LIST.includes(sx) && !calcSupported(sx))
    return {
      tone: "warn",
      title: tx("{0}的配装器还不支持，截图对不上装备", sx),
      ready: false,
    };
  if (bundled === false)
    return {
      tone: "warn",
      title: tx("网页版不能按截图建配装"),
      detail: tx("在桌面版里粘贴这张截图"),
      ready: false,
    };
  if (!native)
    return {
      tone: "warn",
      title: tx("{0}的配装器还不支持，截图对不上装备", xinfa),
      ready: false,
    };
  if (matchFailed)
    return {
      tone: "error",
      title: tx("当季装备库没加载出来"),
      detail: tx("检查网络后再试"),
      ready: false,
    };
  if (matching || !match)
    return {
      tone: "busy",
      title: tx("正在对照当季装备库…"),
      ready: false,
    };
  if (match.found === 0)
    return {
      tone: "warn",
      title: tx("截图里的装备当季装备库里都没有"),
      detail: tx("可能是旧赛季的装备，或者不是{0}的", xinfa),
      ready: false,
    };
  const detail = [
    switched ? tx("按截图选了{0}", xinfa) : xinfa,
    match.refine !== null && tx("精炼 {0}", match.refine),
    match.stone === "found" && match.input.stone,
  ]
    .filter(Boolean)
    .join(" · ");
  const lacking = [...match.missing, ...match.absent];
  return {
    tone: "ok",
    title: txn("认出 {0} 件装备", match.found),
    detail,
    // 4 个以内列部位名；再多就只说个数，不列一长串
    note: lacking.length
      ? lacking.length > 4
        ? tx(
            "{0} 个部位没认出来，先用原版默认装备，建好后可以在配装器里换",
            lacking.length
          )
        : tx(
            "{0}没认出来，先用原版默认装备，建好后可以在配装器里换",
            join(lacking)
          )
      : match.stone === "missing"
        ? tx("五彩石当季没有，先用原版默认五彩石")
        : undefined,
    ready: true,
  };
}

/** 截图卡片：缩略图 + 识别状态，替换导入框 */
export function ScanChip({
  image,
  view,
  onRemove,
  onRetry,
}: {
  image: ImageScan;
  view: ScanView;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const Icon =
    view.tone === "busy"
      ? Loader2
      : view.tone === "ok"
        ? CheckCircle2
        : image.state === "fail" && image.reason === "network"
          ? WifiOff
          : AlertTriangle;
  return (
    // tabIndex=-1：导入框换成截图卡片时焦点落在这里（见 ImportField），Esc 还能关弹窗
    <div
      data-scan-chip
      tabIndex={-1}
      className="mt-2 flex min-h-[86px] items-center gap-3 rounded-lg bg-paper/[0.04] p-2 pr-2.5 outline-none ring-1 ring-inset ring-paper/10"
    >
      {image.preview ? (
        <img
          src={image.preview}
          alt={tx("装备截图")}
          className="h-[68px] w-[68px] shrink-0 rounded-md object-cover object-top ring-1 ring-inset ring-paper/10"
        />
      ) : (
        <div className="h-[68px] w-[68px] shrink-0 rounded-md bg-paper/[0.05]" />
      )}
      <div
        className="min-w-0 flex-1 text-[12.5px]"
        role="status"
        aria-live="polite"
      >
        <p
          className={cn(
            "flex items-start gap-1.5",
            view.tone === "error"
              ? "text-cinnabar-text"
              : view.tone === "warn"
                ? "text-gold"
                : "text-paper"
          )}
        >
          <Icon
            className={cn(
              "mt-px h-4 w-4 shrink-0",
              view.tone === "busy" && "animate-spin text-paper-2",
              view.tone === "ok" && "text-jade"
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">{view.title}</span>
        </p>
        {(view.detail || view.retry) && (
          <p className="mt-0.5 pl-[22px] text-paper-3">
            {view.detail}
            {view.retry && (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper",
                  view.detail && "ml-1.5"
                )}
              >
                {tx("重试")}
              </button>
            )}
          </p>
        )}
      </div>
      <IconBtn label={tx("移除")} onClick={onRemove} className="self-start">
        <X className="h-4 w-4" />
      </IconBtn>
    </div>
  );
}
