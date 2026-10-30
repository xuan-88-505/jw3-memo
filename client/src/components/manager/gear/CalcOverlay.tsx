import { AlertTriangle, ArrowLeft, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/common/ui";
import { XinfaMark } from "@/components/brand/Marks";
import type { Loadout } from "@/data/gear";
import {
  CALC_ONLINE,
  calcUrl,
  hasBundledCalc,
  isCalcMessage,
  missingSlotKeys,
  preloadEquipDb,
  writeSeed,
  type CalcResult,
} from "@/lib/dpsCalc";
import { tx } from "@/lib/i18n";
import { useProto } from "@/state/store";
import { fmt } from "./Dashboard";

type Phase = "checking" | "loading" | "ready" | "failed";

/** 计算器第一次载入要解压 70 MB 的数据，慢的机器也给够时间 */
const LOAD_TIMEOUT = 30_000;

/**
 * 内置的原版配装计算器，铺满管理窗口。
 * 计算器里每改一次，装备、面板、装分和秒伤就带回配装页；左上角返回。
 * 网页版没有内置计算器时用在线版，结果不会带回。
 */
export function CalcOverlay({
  lo,
  onClose,
}: {
  lo: Loadout;
  onClose: () => void;
}) {
  const { actions } = useProto();
  const [mode, setMode] = useState<"bundled" | "online" | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [missing, setMissing] = useState<string[]>([]);
  // 种子没写进去（计算器照常能用，只是装备要在里面重选）和被去掉的五彩石、小附魔
  const [seedError, setSeedError] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [seedTotal, setSeedTotal] = useState(0);
  const [last, setLast] = useState<CalcResult | null>(null);
  // 重试时换一个 key，iframe 重新载入
  const [attempt, setAttempt] = useState(0);
  // 打开时的配装：返回时和它比，秒伤变了才记一笔
  const opened = useRef({ id: lo.id, dps: lo.dps, first: !lo.calc });
  const pending = useRef<CalcResult | null>(null);
  const flushTimer = useRef<number | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState("");

  const flush = () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const r = pending.current;
    pending.current = null;
    if (r) actions.applyCalcResult(opened.current.id, r);
  };

  // 有内置计算器就先写种子（12 件装备），再载入；没有就用在线版
  useEffect(() => {
    let alive = true;
    setPhase("checking");
    hasBundledCalc().then(ok => {
      if (!alive) return;
      if (ok) {
        void preloadEquipDb(lo.xinfa);
        writeSeed(lo);
        setSrc(calcUrl(lo));
      } else {
        setSrc(CALC_ONLINE);
      }
      setMode(ok ? "bundled" : "online");
      setPhase("loading");
    });
    return () => {
      alive = false;
    };
    // 只在打开和重试时读一次配装；计算器里的改动会回写到 lo，不能因此重新载入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (phase !== "loading") return;
    const t = window.setTimeout(() => setPhase("failed"), LOAD_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [phase, attempt]);

  // 计算器的消息：同源、同一套配装才收
  useEffect(() => {
    if (mode !== "bundled") return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!isCalcMessage(d) || d.loadoutId !== opened.current.id) return;
      if (d.type === "ready") setPhase("ready");
      else if (d.type === "escape") closeRef.current();
      else if (d.type === "seeded") {
        setMissing(missingSlotKeys(d.missing));
        setDropped(d.dropped ?? []);
        setSeedTotal(d.total ?? 0);
        setSeedError(false);
      } else if (d.type === "error") {
        if (d.stage === "seed") setSeedError(true);
        else setPhase("failed");
      } else if (d.type === "result") {
        setPhase("ready");
        setLast(d.result);
        setMissing(missingSlotKeys(d.result.missing ?? []));
        // 拖动滑条之类会连续算很多次，停下来再写进配装
        pending.current = d.result;
        if (flushTimer.current) window.clearTimeout(flushTimer.current);
        flushTimer.current = window.setTimeout(flush, 400);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 意外卸载（比如切走了页面）也把最后一次结果写进去
  useEffect(
    () => () => flush(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  const close = () => {
    flush();
    const o = opened.current;
    actions.recordCalcDps(o.id, o.dps, o.first);
    if (last && last.dps !== o.dps) {
      actions.toast(
        "manager",
        "success",
        tx("已带回：装分 {0}，木桩秒伤 {1}", fmt(last.score), fmt(last.dps))
      );
    }
    onClose();
  };

  // 计算器里按 Esc 走消息回来，消息监听只挂一次，要用 ref 拿到最新的 close
  const closeRef = useRef(close);
  closeRef.current = close;

  const slotName = (key: string) =>
    tx(lo.slots.find(s => s.key === key)?.label ?? key);

  const notes: string[] = [];
  if (seedError) {
    notes.push(tx("配装页的装备没能带进计算器，请在计算器里选装备"));
  } else {
    if (missing.length > 0 && missing.length >= seedTotal) {
      notes.push(
        tx(
          "配装页的 {0} 件装备在计算器的装备库里都找不到（计算器只收当前版本的装备），请在计算器里选装备",
          missing.length
        )
      );
    } else if (missing.length > 0) {
      notes.push(
        tx(
          "计算器的装备库里没有这 {0} 件，装分和秒伤没算它们，请在计算器里重新选：{1}",
          missing.length,
          missing.map(slotName).join(tx("、"))
        )
      );
    }
    if (dropped.includes("enchant")) {
      notes.push(tx("五彩石和小附魔计算器不认，没带过去，请在计算器里重新选"));
    } else if (dropped.includes("stone")) {
      notes.push(tx("五彩石计算器不认，没带过去，请在计算器里重新选"));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tx("原版配装计算器")}
      className="absolute inset-0 z-40 flex animate-fade flex-col bg-ink"
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-paper/[0.08] bg-ink-2 pl-2 pr-4">
        <Btn
          ref={backRef}
          variant="ghost"
          size="md"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={close}
        >
          {tx("返回配装")}
        </Btn>
        <span className="h-4 w-px bg-paper/10" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <XinfaMark xinfa={lo.xinfa} size={20} />
          <span className="min-w-0 truncate text-[13px] font-medium text-paper">
            {lo.name}
          </span>
          <span
            className="hidden shrink-0 text-[12px] text-paper-3 sm:inline"
            title={tx("原版计算器：jx3dps-online，按 BSD-3-Clause 许可内置")}
          >
            {tx("原版配装计算器")}
          </span>
        </div>
        <p
          className="shrink-0 text-[12px] tabular-nums text-paper-3"
          aria-live="polite"
        >
          {mode === "online"
            ? tx("在线版，结果不会带回配装页")
            : last
              ? tx(
                  "已带回 · 装分 {0} · 秒伤 {1}",
                  fmt(last.score),
                  fmt(last.dps)
                )
              : phase === "ready"
                ? tx("改动会自动带回配装页")
                : null}
        </p>
      </header>

      {notes.length > 0 && (
        <div className="flex shrink-0 items-start gap-2 border-b border-gold/20 bg-gold/[0.08] px-4 py-2 text-[12.5px] text-gold">
          <AlertTriangle
            className="mt-[2px] h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
            {notes.map(n => (
              <p key={n}>{n}</p>
            ))}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {src && phase !== "failed" && (
          <iframe
            key={attempt}
            src={src}
            title={tx("原版配装计算器")}
            className="h-full w-full border-0"
            // 在线版没有桥接，载入完就算好了
            onLoad={() => mode === "online" && setPhase("ready")}
          />
        )}
        {(phase === "checking" || phase === "loading") && (
          <div className="absolute inset-0 grid place-items-center bg-ink">
            <p className="flex items-center gap-2 text-[13px] text-paper-3">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {tx("正在载入计算器")}
            </p>
          </div>
        )}
        {phase === "failed" && (
          <div className="absolute inset-0 grid place-items-center bg-ink">
            <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-6 w-6 text-gold" aria-hidden="true" />
              <p className="text-[14px] font-medium text-paper">
                {tx("计算器没有载入成功")}
              </p>
              <p className="text-[12.5px] text-paper-3">
                {mode === "online"
                  ? tx("在线版需要联网，检查网络后再试")
                  : tx("可以再试一次；还不行就重启备忘录")}
              </p>
              <div className="mt-1 flex gap-2">
                <Btn variant="ghost" size="md" onClick={close}>
                  {tx("返回配装")}
                </Btn>
                <Btn
                  variant="primary"
                  size="md"
                  icon={<RotateCw className="h-3.5 w-3.5" />}
                  onClick={() => setAttempt(n => n + 1)}
                >
                  {tx("重试")}
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
