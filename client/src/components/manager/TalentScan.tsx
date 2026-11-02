/**
 * 导入奇穴：方案页「奇穴」标题右边的「导入」按钮，和奇穴上方的结果提示。面板「新建奇穴」也用。
 * 能导入两类内容：奇穴截图（在本机比对图标）；魔盒宏页面复制的奇穴编码、奇穴文字、奇穴序列（lib/talentCode）。
 *
 * - 在方案页任何地方按 Ctrl+V / ⌘V 粘贴就导入；弹窗里不管。
 *   焦点在输入框里时按普通文字粘贴，不当成奇穴。
 * - 点按钮先读剪贴板里的图片，再读文字；都不是奇穴就打开选文件。
 * - 面板（filePicker=false）不打开选文件：系统的选文件窗口会抢走焦点，面板一失焦就收起。
 *   剪贴板里没有奇穴时提示先复制。
 * - 魔盒内容是这个角色的另一个心法时（面板传 xinfas），直接切过去；撤销时切回来。
 * - 认出的层直接改进草稿，没认出的层保持原样；提示里可以撤销。
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Info,
  Loader2,
  X,
} from "lucide-react";
import type { Platform } from "@/data/types";
import { layersOf } from "@/data/seed";
import { TALENTS } from "@/data/talents";
import { Btn } from "@/components/common/ui";
import { readClipboardImage, readClipboardText } from "@/lib/desktop";
import { pasteHint } from "@/lib/format";
import { getLang, tx } from "@/lib/i18n";
import {
  type TalentImport,
  needsFetch,
  parseTalentText,
  resolveTalentImport,
} from "@/lib/talentCode";
import {
  TalentScanError,
  mergePicks,
  preloadTalentIcons,
  scanTalents,
} from "@/lib/talentScan";
import { clipboardImages } from "./records/NoteImages";

/** image = 截图识别；jx3box = 魔盒复制的奇穴 */
type Source = "image" | "jx3box";

type Notice =
  | {
      kind: "done";
      source: Source;
      found: number;
      missed: number[];
      before: number[];
      after: number[];
      /** 切到了这个心法；撤销时切回 prevXinfa */
      switched?: string;
      prevXinfa?: string;
    }
  | { kind: "same"; source: Source; found: number; missed: number[] }
  /** pick：截图出错时可以改选图片；魔盒文字出错时选图片没有意义，不给 */
  | { kind: "error"; text: string; pick?: boolean };

/** 至少认出这么多层才算奇穴 */
const MIN_FOUND = 3;

const ALL_XINFA = Object.keys(TALENTS);

const joinLayers = (layers: number[]) =>
  layers.join(getLang() === "zh" ? "、" : ", ");

/** 焦点在能输入文字的地方：粘贴的文字交给它 */
const isTextField = (t: Element | null) =>
  !!t?.closest(
    'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable=""], [contenteditable="true"]'
  );

export function useTalentScan({
  xinfa,
  resetKey,
  talents,
  enabled,
  onApply,
  filePicker = true,
  pasteKey = "Ctrl+V",
  xinfas,
  onSwitchXinfa,
}: {
  xinfa: string;
  /** 换方案时清掉提示 */
  resetKey: string;
  talents: number[];
  enabled: boolean;
  onApply: (next: number[]) => void;
  /** 剪贴板里没有奇穴时打开选文件；面板里关掉 */
  filePicker?: boolean;
  /** 关掉选文件时，提示里写的粘贴快捷键 */
  pasteKey?: string;
  /** 魔盒内容属于这些心法时可以直接切过去（面板：这个角色的心法） */
  xinfas?: string[];
  onSwitchXinfa?: (xinfa: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 换方案后，之前没跑完的识别结果作废
  const seq = useRef(0);
  // 导入时自己切了心法（resetKey 跟着变），这一次不清提示
  const skipReset = useRef(false);
  const latest = useRef({
    xinfa,
    xinfas,
    talents,
    onApply,
    onSwitchXinfa,
    busy,
  });
  latest.current = { xinfa, xinfas, talents, onApply, onSwitchXinfa, busy };

  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
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

  /** 把每层的选择合进当前奇穴；target 和当前心法不同时先切心法 */
  const apply = (
    target: string,
    picks: (number | null)[],
    found: number,
    source: Source
  ) => {
    const { xinfa, talents: before } = latest.current;
    const pool = (layersOf(target)[6]?.options ?? []).map(o => o.pos);
    const after = mergePicks(before, picks, pool);
    const missed = picks.flatMap((p, i) => (p === null ? [i + 1] : []));
    const switched = target !== xinfa ? target : undefined;
    if (!switched && after.join() === before.join()) {
      setNotice({ kind: "same", source, found, missed });
      return;
    }
    if (switched) {
      skipReset.current = true;
      latest.current.onSwitchXinfa?.(target);
    }
    latest.current.onApply(after);
    setNotice({
      kind: "done",
      source,
      found,
      missed,
      before,
      after,
      switched,
      prevXinfa: switched ? xinfa : undefined,
    });
  };

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
          pick: true,
        });
        return;
      }
      apply(xinfa, r.picks, r.found, "image");
    } catch (e) {
      if (my !== seq.current) return;
      const code = e instanceof TalentScanError ? e.code : "decode";
      setNotice({
        kind: "error",
        pick: true,
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

  /**
   * 导入魔盒复制的奇穴。返回 false = 不是奇穴（序列、文字对不上），交给调用方处理；
   * 编码一定是奇穴，对不上也提示。
   */
  const runText = async (imp: TalentImport) => {
    if (latest.current.busy) return true;
    const my = ++seq.current;
    const { xinfa, xinfas } = latest.current;
    // 别的版本的编码要下载数据，期间显示「正在识别…」
    const slow = needsFetch(imp);
    if (slow) setBusy(true);
    setNotice(null);
    try {
      const r = await resolveTalentImport(imp, {
        xinfa,
        xinfas,
        allXinfa: ALL_XINFA,
        layersOf,
        minFound: MIN_FOUND,
      });
      if (my !== seq.current) return true;
      if (r.ok) {
        apply(r.xinfa, r.picks, r.found, "jx3box");
        return true;
      }
      if (r.reason === "nomatch" && imp.kind !== "code") return false;
      setNotice({
        kind: "error",
        text:
          r.reason === "origin"
            ? tx("这是怀旧服的镇派编码，这里只能导入旗舰端奇穴")
            : r.reason === "xinfa"
              ? tx("这是{0}的奇穴，当前是{1}", r.xinfa ?? "", xinfa)
              : r.reason === "empty"
                ? tx("{0}还没有奇穴数据", r.xinfa ?? xinfa)
                : r.reason === "version"
                  ? tx(
                      "没拿到魔盒 {0} 版本的奇穴数据，检查网络后再试",
                      r.version ?? ""
                    )
                  : tx("这个奇穴编码和{0}对不上，没有改动", xinfa),
      });
      return true;
    } finally {
      if (slow && my === seq.current) setBusy(false);
    }
  };
  const runTextRef = useRef(runText);
  runTextRef.current = runText;

  // 方案页任何地方粘贴截图或魔盒奇穴
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('[role="dialog"]')) return;
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (text) {
        // 输入框里粘贴文字是正常输入，不抢
        if (isTextField(t)) return;
        const imp = parseTalentText(text);
        if (!imp) return;
        e.preventDefault();
        void runTextRef.current(imp);
        return;
      }
      const files = clipboardImages(e);
      if (!files.length) return;
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
    if (img) {
      void runRef.current(img);
      return;
    }
    const imp = parseTalentText(await readClipboardText());
    if (imp && (await runTextRef.current(imp))) return;
    if (filePicker) choose();
    else
      setNotice({
        kind: "error",
        text: tx(
          "剪贴板里没有奇穴。截图或在魔盒复制奇穴后按 {0} 粘贴",
          pasteKey
        ),
      });
  };
  const undo = () => {
    if (notice?.kind !== "done") return;
    if (notice.prevXinfa) {
      skipReset.current = true;
      latest.current.onSwitchXinfa?.(notice.prevXinfa);
    }
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
    /** 关掉选文件时没有 */
    choose: filePicker ? choose : undefined,
    undo,
    dismiss: () => setNotice(null),
    fileInput: filePicker ? fileInput : null,
  };
}

export function TalentScanButton({
  busy,
  platform,
  onClick,
  pasteOnly = false,
}: {
  busy: boolean;
  platform: Platform;
  onClick: () => void;
  /** 只读剪贴板、不选文件（面板） */
  pasteOnly?: boolean;
}) {
  const hint = pasteOnly
    ? tx("粘贴奇穴截图或魔盒复制的奇穴（{0}），自动选上", pasteHint(platform))
    : tx(
        "粘贴奇穴截图或魔盒复制的奇穴（{0}），自动选上；剪贴板里没有就选择截图",
        pasteHint(platform)
      );
  return (
    <Btn
      variant="secondary"
      size="xs"
      title={hint}
      aria-label={tx("导入奇穴")}
      aria-busy={busy || undefined}
      disabled={busy}
      // 文字不变，只换图标，免得按钮宽度跳
      icon={
        busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
        )
      }
      onClick={onClick}
    >
      {tx("导入")}
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
  /** 没有时不显示「选择图片」 */
  onChoose?: () => void;
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
  const head =
    notice.kind === "error"
      ? notice.text
      : notice.kind === "same"
        ? notice.source === "jx3box"
          ? tx("和魔盒奇穴一样，没有改动")
          : tx("认出 {0} 层，和现在的一样", notice.found)
        : notice.source === "jx3box"
          ? notice.switched
            ? tx(
                "已切到{0}，按魔盒奇穴选上 {1} 层",
                notice.switched,
                notice.found
              )
            : tx("按魔盒奇穴选上 {0} 层", notice.found)
          : tx("认出 {0} 层，已选上", notice.found);
  const text = [head, missedText].filter(Boolean).join(tx("；"));
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
      {notice.kind === "error" && notice.pick && onChoose && (
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
