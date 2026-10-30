import { useEffect, useRef, useState } from "react";
import type { DpsPoint } from "@/data/gear";
import { cn } from "@/lib/utils";
import { compactNumber, monthDay, tx, colon } from "@/lib/i18n";

const PAD = { l: 46, r: 16, t: 26, b: 24 };

/** 222.9万 */
export function wan(n: number) {
  return compactNumber(n);
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function longDate(iso: string) {
  const d = new Date(iso);
  return monthDay(d);
}

/** 估算 10px 文字宽度：中文约 10px，其他约 6px */
function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fff]/.test(ch) ? 10 : 6;
  return w;
}

/**
 * 秒伤变化：每次变化一个点，横轴等距排列。
 * 技改点用金色竖虚线标出，换装点在点上方写短标签。
 * 标签从最新往前放，和已放的标签重叠就只留点，悬停仍可看到完整说明。
 */
export function DpsChart({ history }: { history: DpsPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 420, h: 188 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setBox({
        w: Math.max(240, Math.round(width)),
        h: Math.max(160, Math.round(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (history.length < 2) {
    const p = history[0];
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center">
        <p className="text-[22px] font-semibold tabular-nums text-paper">
          {p ? p.dps.toLocaleString("en-US") : "—"}
        </p>
        <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-paper-3">
          {tx("以后每次换装、技改后都会在这里记一个点")}
        </p>
      </div>
    );
  }

  const { w: W, h: H } = box;
  const n = history.length;
  const vals = history.map(p => p.dps);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, hi * 0.01);
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.25;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const pts = history.map((p, i) => [x(i), y(p.dps)] as const);
  const line = pts
    .map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[n - 1][0].toFixed(1)},${H - PAD.b} L${pts[0][0].toFixed(1)},${H - PAD.b} Z`;
  const ticks = [
    yMin + (yMax - yMin) * 0.12,
    (yMin + yMax) / 2,
    yMax - (yMax - yMin) * 0.18,
  ];

  // 标签放置：技改标签在顶部一行，换装标签在点上方
  type Lbl = {
    i: number;
    cx: number;
    cy: number;
    w: number;
    text: string;
    kind: "patch" | "gear";
  };
  const placed: Lbl[] = [];
  const overlaps = (a: Lbl) =>
    placed.some(
      b =>
        Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + 6 &&
        Math.abs(a.cy - b.cy) < 13
    );
  for (let i = n - 1; i >= 0; i--) {
    const p = history[i];
    if ((p.kind !== "patch" && p.kind !== "gear") || !p.label) continue;
    const w = textWidth(tx(p.label));
    const half = w / 2;
    const cx = Math.min(
      Math.max(pts[i][0], PAD.l + half),
      W - PAD.r - half + 8
    );
    const cand: Lbl = {
      i,
      cx,
      cy: p.kind === "patch" ? PAD.t - 12 : pts[i][1] - 12,
      w,
      text: tx(p.label),
      kind: p.kind,
    };
    if (!overlaps(cand)) placed.push(cand);
  }

  return (
    <div ref={ref} className="h-full min-h-[160px] w-full">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        role="img"
        aria-label={tx(
          "秒伤变化：从 {0} 的 {1} 到 {2} 的 {3}",
          longDate(history[0].at),
          history[0].dps.toLocaleString("en-US"),
          longDate(history[n - 1].at),
          history[n - 1].dps.toLocaleString("en-US")
        )}
      >
        <defs>
          <linearGradient id="dps-area" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-jade)"
              stopOpacity="0.22"
            />
            <stop offset="100%" stopColor="var(--color-jade)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-paper/[0.06]"
            />
            <text
              x={PAD.l - 8}
              y={y(v) + 3.5}
              textAnchor="end"
              className="fill-paper-3 text-[10px] tabular-nums"
            >
              {wan(v)}
            </text>
          </g>
        ))}
        {/* 技改：金色竖虚线 */}
        {history.map((p, i) =>
          p.kind === "patch" ? (
            <line
              key={`m${i}`}
              x1={pts[i][0]}
              x2={pts[i][0]}
              y1={PAD.t - 4}
              y2={H - PAD.b}
              stroke="var(--color-gold)"
              strokeDasharray="3 3"
              strokeOpacity="0.7"
            />
          ) : null
        )}
        <path d={area} fill="url(#dps-area)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-jade)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {history.map((p, i) => {
          const last = i === n - 1;
          return (
            <circle
              key={i}
              cx={pts[i][0]}
              cy={pts[i][1]}
              r={last ? 4 : 3}
              className={cn(last ? "fill-jade" : "fill-ink-3")}
              stroke="var(--color-jade)"
              strokeWidth="1.5"
            >
              <title>
                {`${longDate(p.at)} · ${p.dps.toLocaleString("en-US")}${p.label ? ` · ${tx(p.label)}` : ""}${p.detail ? `${colon()}${p.detail}` : ""}`}
              </title>
            </circle>
          );
        })}
        {placed.map(l => (
          <text
            key={`l${l.i}`}
            x={l.cx}
            y={l.cy + 3.5}
            textAnchor="middle"
            className={cn(
              "text-[10px]",
              l.kind === "patch" ? "fill-gold font-medium" : "fill-paper-2"
            )}
          >
            {l.text}
          </text>
        ))}
        <text
          x={PAD.l}
          y={H - 6}
          className="fill-paper-3 text-[10px] tabular-nums"
        >
          {shortDate(history[0].at)}
        </text>
        <text
          x={W - PAD.r}
          y={H - 6}
          textAnchor="end"
          className="fill-paper-3 text-[10px] tabular-nums"
        >
          {shortDate(history[n - 1].at)}
        </text>
      </svg>
    </div>
  );
}
