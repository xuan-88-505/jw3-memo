/**
 * 粘贴奇穴：方案页「奇穴」标题右边的「粘贴 ⌘V」按钮，和奇穴上方的结果提示。面板「新建奇穴」也用。
 * 能导入两类内容：奇穴截图（在本机比对图标）；魔盒宏页面复制的奇穴编码、奇穴文字、奇穴序列（lib/talentCode）。
 *
 * - 主要用法是键盘：在方案页任何地方按 Ctrl+V / ⌘V 就导入；弹窗里不管。
 *   焦点在输入框里时按普通文字粘贴，不当成奇穴。
 *   桌面版不等 paste 事件：拦下粘贴键，直接读系统剪贴板。旧版 macOS 的 WebKit 在焦点不在输入框时
 *   按 ⌘V 不触发 paste（WebKit bug 75891，2025 年才修），只靠 paste 在 Mac 上没反应。
 *   网页版和菜单「编辑 → 粘贴」仍然走 paste 事件。
 * - 点按钮和按 ⌘V 一样：先读剪贴板里的图片，再读文字。剪贴板里没有奇穴时只提示，不打开选文件；
 *   方案页的提示里有「选择图片」，可以从文件选截图。
 * - 面板（filePicker=false）没有「选择图片」：系统的选文件窗口会抢走焦点，面板一失焦就收起。
 * - 魔盒内容是别的心法时（面板新建方案传 xinfas），直接切过去；撤销时切回来。
 * - 截图先在本机比当前心法的图标；认出不到 7 层时，截图发到服务器读奇穴名字（lib/talentNames），
 *   在全部心法里对。是别的心法：能切（xinfas 里有）就切过去；不能切时提示，给 onCreateFor「新建{0}」。
 *   服务器没结果时，本机认出 3 层以上照旧用本机的。
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
import { defaultTalents, layersOf } from "@/data/seed";
import { TALENTS } from "@/data/talents";
import { Btn } from "@/components/common/ui";
import {
  DESKTOP_PLATFORM,
  IS_DESKTOP,
  readClipboardImage,
  readClipboardText,
} from "@/lib/desktop";
import { pasteHint } from "@/lib/format";
import { getLang, tx, txn } from "@/lib/i18n";
import { GearScanError } from "@/lib/gearScan";
import {
  type NameMatch,
  matchTalentNames,
  requestTalentNames,
} from "@/lib/talentNames";
import {
  type TalentImport,
  needsFetch,
  parseTalentText,
  resolveTalentImport,
} from "@/lib/talentCode";
import {
  TalentScanError,
  type TalentScanResult,
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
  /** 截图是别的心法、这里切不过去：提示是哪个心法，可以给它新建方案 */
  | {
      kind: "other";
      xinfa: string;
      current: string;
      found: number;
      talents: number[];
    }
  /** pick：截图出错时可以改选图片；魔盒文字出错时选图片没有意义，不给 */
  | { kind: "error"; text: string; pick?: boolean }
  /** 点了粘贴，剪贴板里没有奇穴：说明怎么做，不算出错 */
  | { kind: "empty"; text: string };

/** 至少认出这么多层才算奇穴 */
const MIN_FOUND = 3;
/** 本机认出这么多层就不用再问服务器 */
const LOCAL_ENOUGH = 7;

const ALL_XINFA = Object.keys(TALENTS);

/** 这个心法第 7–9 层共用的选项 */
const poolOf = (xinfa: string) =>
  (layersOf(xinfa)[6]?.options ?? []).map(o => o.pos);

/**
 * 同一个心法：服务器按名字对上的层为准（名字比糊掉的图标可靠），本机认出的层补上没对上的；
 * 第 7–9 层不重复。
 */
function combine(local: (number | null)[] | null, named: NameMatch | null) {
  const picks = Array.from({ length: 9 }, (_, i) => named?.picks[i] ?? null);
  local?.forEach((p, i) => {
    if (p === null || picks[i] !== null) return;
    if (i >= 6 && [6, 7, 8].some(j => picks[j] === p)) return;
    picks[i] = p;
  });
  return { picks, found: picks.filter(p => p !== null).length };
}

const joinLayers = (layers: number[]) =>
  layers.join(getLang() === "zh" ? "、" : ", ");

/** 焦点在能输入文字的地方：粘贴的文字交给它 */
export const isTextField = (t: Element | null) =>
  !!t?.closest(
    'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable=""], [contenteditable="true"]'
  );

/** 焦点不在弹窗和输入框里：这时的粘贴归奇穴 */
const focusOutside = () => {
  const a = document.activeElement;
  return !a?.closest('[role="dialog"]') && !isTextField(a);
};

/** 这台电脑的粘贴键：Mac ⌘V，Windows Ctrl+V */
export const isPasteKey = (e: KeyboardEvent) =>
  !e.repeat &&
  !e.shiftKey &&
  !e.altKey &&
  (e.key.toLowerCase() === "v" || e.code === "KeyV") &&
  (DESKTOP_PLATFORM === "mac"
    ? e.metaKey && !e.ctrlKey
    : e.ctrlKey && !e.metaKey);

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
  onCreateFor,
}: {
  xinfa: string;
  /** 换方案时清掉提示 */
  resetKey: string;
  talents: number[];
  enabled: boolean;
  onApply: (next: number[]) => void;
  /** 提示里给「选择图片」，从文件选截图；面板里关掉 */
  filePicker?: boolean;
  /** 提示里写的粘贴快捷键 */
  pasteKey?: string;
  /** 魔盒内容属于这些心法时可以直接切过去（面板：这个角色的心法） */
  xinfas?: string[];
  onSwitchXinfa?: (xinfa: string) => void;
  /** 截图是别的心法、又切不过去时：给那个心法新建方案（带上认出的奇穴） */
  onCreateFor?: (xinfa: string, talents: number[]) => void;
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
    onCreateFor,
    busy,
  });
  latest.current = {
    xinfa,
    xinfas,
    talents,
    onApply,
    onSwitchXinfa,
    onCreateFor,
    busy,
  };
  const pasteKeyRef = useRef(pasteKey);
  pasteKeyRef.current = pasteKey;

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
    const after = mergePicks(before, picks, poolOf(target));
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
      // ① 本机比当前心法的图标：截图不上传
      let local: TalentScanResult | null = null;
      let localErr: string | null = null;
      try {
        local = await scanTalents(src, xinfa);
      } catch (e) {
        localErr = e instanceof TalentScanError ? e.code : "decode";
      }
      if (my !== seq.current) return;
      if (localErr === "decode") {
        setNotice({
          kind: "error",
          pick: true,
          text: tx("图片打不开，换一张试试"),
        });
        return;
      }
      if (local && local.found >= LOCAL_ENOUGH) {
        apply(xinfa, local.picks, local.found, "image");
        return;
      }
      // 只认出一两层多半是别的图里碰巧像，不算
      const localPicks = local && local.found >= MIN_FOUND ? local.picks : null;

      // ② 本机没认全：截图发服务器读奇穴名字，在全部心法里对
      let named: NameMatch | null = null;
      let remoteErr: GearScanError | null = null;
      try {
        const r = await requestTalentNames(src);
        if (my !== seq.current) return;
        named = matchTalentNames(r.names, { current: xinfa, hint: r.xinfa });
      } catch (e) {
        if (my !== seq.current) return;
        remoteErr =
          e instanceof GearScanError ? e : new GearScanError("failed");
      }

      // ③ 是别的心法：能切就切过去，切不过去就提示
      if (named && named.xinfa !== xinfa && !localPicks) {
        const { xinfas: canSwitch, onSwitchXinfa } = latest.current;
        if (onSwitchXinfa && canSwitch?.includes(named.xinfa)) {
          apply(named.xinfa, named.picks, named.found, "image");
          return;
        }
        setNotice({
          kind: "other",
          xinfa: named.xinfa,
          current: xinfa,
          found: named.found,
          talents: mergePicks(
            defaultTalents(),
            named.picks,
            poolOf(named.xinfa)
          ),
        });
        return;
      }

      // ④ 同一个心法：名字和图标合起来
      const same = named && named.xinfa === xinfa ? named : null;
      const c = combine(localPicks, same);
      if (c.found >= MIN_FOUND) {
        apply(xinfa, c.picks, c.found, "image");
        return;
      }
      setNotice({
        kind: "error",
        pick: true,
        text:
          remoteErr?.code === "network"
            ? localErr === "icons"
              ? tx("奇穴图标下载失败，检查网络后再试")
              : tx("连不上服务器，联网后再试")
            : remoteErr?.code === "rate_limited"
              ? txn(
                  "识别得太频繁了，{0} 分钟后再试",
                  Math.max(1, Math.ceil((remoteErr.retryAfter ?? 60) / 60))
                )
              : remoteErr?.code === "too_large"
                ? tx("图片太大了，换一张小点的截图")
                : tx("没认出奇穴。截图里要有奇穴图标或名字"),
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

  /**
   * 读剪贴板：先图片，再魔盒文字。fromButton：点了按钮，没有奇穴时说明怎么做；
   * 按粘贴键时和普通粘贴一样，别的文字不提示。
   */
  const fromClipboard = async (fromButton: boolean) => {
    if (latest.current.busy) return;
    const img = await readClipboardImage();
    if (img) {
      void runRef.current(img);
      return;
    }
    const text = await readClipboardText();
    const imp = parseTalentText(text);
    if (imp && (await runTextRef.current(imp))) return;
    if (fromButton || !text.trim())
      setNotice({
        kind: "empty",
        text: tx(
          "剪贴板里没有奇穴。截图或在魔盒复制奇穴后按 {0} 粘贴",
          pasteKeyRef.current
        ),
      });
  };
  const fromClipboardRef = useRef(fromClipboard);
  fromClipboardRef.current = fromClipboard;

  // 方案页任何地方粘贴截图或魔盒奇穴
  useEffect(() => {
    if (!enabled) return;
    // 桌面版：焦点不在输入框时按粘贴键，拦下按键（不会再触发 paste），直接读系统剪贴板
    const onKey = (e: KeyboardEvent) => {
      if (!IS_DESKTOP || e.defaultPrevented) return;
      if (!isPasteKey(e) || !focusOutside()) return;
      e.preventDefault();
      void fromClipboardRef.current(false);
    };
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
      if (!files.length) {
        // 桌面版有时 paste 里拿不到截图（系统剪贴板是 TIFF 等格式）：直接读系统剪贴板
        if (IS_DESKTOP && !isTextField(t)) {
          e.preventDefault();
          void fromClipboardRef.current(false);
        }
        return;
      }
      e.preventDefault();
      void runRef.current(files[0]);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("paste", onPaste);
    };
  }, [enabled]);

  const choose = () => fileRef.current?.click();
  const pick = () => fromClipboard(true);
  /** 截图是别的心法：给它新建方案 */
  const createFor = () => {
    if (notice?.kind !== "other") return;
    latest.current.onCreateFor?.(notice.xinfa, notice.talents);
    setNotice(null);
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
    createFor: onCreateFor ? createFor : undefined,
    dismiss: () => setNotice(null),
    fileInput: filePicker ? fileInput : null,
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
  const key = pasteHint(platform);
  return (
    <Btn
      variant="secondary"
      size="xs"
      title={tx("粘贴奇穴截图或魔盒复制的奇穴（{0}），自动选上", key)}
      aria-label={tx("粘贴奇穴")}
      aria-keyshortcuts={platform === "mac" ? "Meta+V" : "Control+V"}
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
      {tx("粘贴")}
      {/* 键盘粘贴才是主要用法：快捷键直接写在按钮上 */}
      <kbd
        aria-hidden="true"
        className="ml-0.5 font-sans text-[11px] font-normal tracking-normal text-paper-3"
      >
        {key}
      </kbd>
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
  onCreate,
  onWriteMacro,
  onClose,
}: {
  busy: boolean;
  notice: Notice | null;
  onUndo: () => void;
  /** 没有时不显示「选择图片」 */
  onChoose?: () => void;
  /** 截图是别的心法：「新建{0}」 */
  onCreate?: () => void;
  /** 面板新建：选好奇穴后接着写这个方案的宏 */
  onWriteMacro?: () => void;
  onClose: () => void;
}) {
  // 管理窗口里粘贴时可能正看着上面的宏：提示条出现、变化时滚到看得见的地方（已经看得见就不动）
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    ref.current?.scrollIntoView?.({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [busy, notice]);
  // 识别中和结果用同一个提示条，读屏会读出变化
  if (busy || !notice)
    return (
      <div ref={ref} role="status" className={ROW}>
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
    notice.kind === "error" || notice.kind === "empty"
      ? notice.text
      : notice.kind === "other"
        ? tx("这是{0}的奇穴，当前是{1}", notice.xinfa, notice.current)
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
            : notice.switched
              ? tx("已切到{0}，认出 {1} 层", notice.switched, notice.found)
              : tx("认出 {0} 层，已选上", notice.found);
  const text = [head, missedText].filter(Boolean).join(tx("；"));
  const actions = [
    notice.kind === "other" && onCreate && (
      <Btn key="create" variant="ghost" size="xs" onClick={onCreate}>
        {tx("新建{0}", notice.xinfa)}
      </Btn>
    ),
    notice.kind === "done" && onWriteMacro && (
      <Btn key="macro" variant="ghost" size="xs" onClick={onWriteMacro}>
        {tx("写宏")}
      </Btn>
    ),
    notice.kind === "done" && (
      <Btn key="undo" variant="ghost" size="xs" onClick={onUndo}>
        {tx("撤销")}
      </Btn>
    ),
    ((notice.kind === "error" && notice.pick) || notice.kind === "empty") &&
      onChoose && (
        <Btn key="choose" variant="ghost" size="xs" onClick={onChoose}>
          {tx("选择图片")}
        </Btn>
      ),
  ].filter(Boolean);
  const Icon =
    notice.kind === "error" || notice.kind === "other"
      ? AlertTriangle
      : notice.kind === "same" || notice.kind === "empty"
        ? Info
        : CheckCircle2;
  return (
    <div ref={ref} role="status" className={ROW}>
      <Icon
        className={
          notice.kind === "error"
            ? "mt-1 h-4 w-4 shrink-0 text-cinnabar-text"
            : notice.kind === "other"
              ? "mt-1 h-4 w-4 shrink-0 text-amber"
              : notice.kind === "same" || notice.kind === "empty"
                ? "mt-1 h-4 w-4 shrink-0 text-paper-3"
                : "mt-1 h-4 w-4 shrink-0 text-jade"
        }
        aria-hidden="true"
      />
      {actions.length > 1 ? (
        // 两个按钮时放到文字下面：窄面板、长语言里文字不会被挤成一条
        <div className="min-w-0 flex-1">
          <p>{text}</p>
          <div className="-ml-2 mt-1 flex flex-wrap gap-1">{actions}</div>
        </div>
      ) : (
        <>
          <p className="min-w-0 flex-1">{text}</p>
          {actions}
        </>
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
