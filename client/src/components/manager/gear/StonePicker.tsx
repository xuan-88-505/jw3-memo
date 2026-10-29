import { Check, ChevronDown, Gem, Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  STONE_LEVELS,
  stoneDef,
  stoneFamilies,
  type StoneDef,
  type StoneFamily,
  type StoneLevel,
} from "@/data/enchants";
import type { Attr } from "@/data/gear";
import { cn } from "@/lib/utils";
import { inputCls } from "../shared";

/** 换成这颗石头（null 是不镶），秒伤相对当前选择变化多少（0.01 = 1%） */
export type StoneGain = (name: string | null) => number;

/** 一条属性在菜单里的身份：同一个词可能对应不同属性（击破 = 全属性 / 会心） */
const keyOf = (f: StoneFamily, i: number) => `${f.words[i]}|${f.labels[i]}`;

/** 列内排序：主属性在前，然后按常见程度 */
const ORDER = [
  "全属性",
  "攻击",
  "武伤",
  "会心",
  "会效",
  "破防",
  "无双",
  "破招",
  "加速",
];

const ALIAS: Record<string, string> = {
  会心效果: "会效",
  会效: "会效",
  内攻: "攻击",
  外攻: "攻击",
  内功攻击: "攻击",
  外功攻击: "攻击",
  全属: "全属性",
  武器伤害: "武伤",
};

const LEVEL_TOKEN: Record<string, StoneLevel> = {
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
};

function parseQuery(q: string, main: Attr) {
  const tokens = q
    .split(/[\s·,，、]+/)
    .map(t => t.trim())
    .filter(Boolean);
  let level: StoneLevel | null = null;
  const words: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^([1-6])级?$/);
    if (LEVEL_TOKEN[t]) level = LEVEL_TOKEN[t];
    else if (m) level = Number(m[1]) as StoneLevel;
    else words.push(t === "主属性" ? main : (ALIAS[t] ?? t));
  }
  return { level, words };
}

function matches(f: StoneFamily, t: string) {
  return f.words.some(w => w.includes(t)) || f.labels.some(l => l.includes(t));
}

function GainText({ p, className }: { p: number; className?: string }) {
  if (Math.abs(p) < 0.00005) return null;
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] tabular-nums",
        p > 0 ? "text-jade" : "text-paper-3",
        className
      )}
    >
      {p > 0 ? "+" : "−"}
      {Math.abs(p * 100).toFixed(2)}%
    </span>
  );
}

function attrText(s: StoneDef) {
  return s.attrs.map(a => `${a.label}${a.value}`).join(" ");
}

type Path = [string | null, string | null, string | null];

/**
 * 五彩石选择：参考交易行，按属性 1 → 属性 2 → 属性 3 一层一层选，最后选等级。
 * 在弹窗里展开（不浮出），避免被弹窗的滚动区裁掉。
 */
export function StonePicker({
  id,
  main,
  value,
  gain,
  onChange,
}: {
  id?: string;
  main: Attr;
  value: string | null;
  gain: StoneGain;
  onChange: (name: string | null) => void;
}) {
  const uid = useId();
  const families = stoneFamilies(main);
  const current = stoneDef(main, value);
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<Path>([null, null, null]);
  const [level, setLevel] = useState<StoneLevel>(6);
  const [hoverLv, setHoverLv] = useState<StoneLevel | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const toggle = () => {
    if (open) return close();
    const fam = current
      ? families.find(f => f.short === current.short)
      : undefined;
    setPath(
      fam ? [keyOf(fam, 0), keyOf(fam, 1), keyOf(fam, 2)] : [null, null, null]
    );
    setLevel(current?.level ?? 6);
    setHoverLv(null);
    setQuery("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: "nearest" });
    searchRef.current?.focus();
    // 弹窗在自己身上监听 Esc；这里在捕获阶段先拦下，只收起选择器
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!panelRef.current?.contains(document.activeElement)) return;
      e.stopPropagation();
      e.preventDefault();
      if (searchRef.current && searchRef.current.value) setQuery("");
      else close(true);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // 只在打开时绑定一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = useMemo(() => parseQuery(query, main), [query, main]);
  const searching = query.trim().length > 0;
  const shownLevel = searching && q.level ? q.level : level;

  // 每种石头在当前等级下的秒伤变化
  const gains = useMemo(() => {
    const m = new Map<string, number>();
    if (!open) return m;
    for (const f of families)
      m.set(f.short, gain(f.levels[shownLevel - 1].name));
    return m;
  }, [open, families, gain, shownLevel]);

  const optionsAt = (i: number) => {
    const pool = families.filter(f =>
      path.slice(0, i).every((k, j) => keyOf(f, j) === k)
    );
    if (i > 0 && !path[i - 1]) return [];
    const map = new Map<
      string,
      { key: string; word: string; label: string; best: number; f: StoneFamily }
    >();
    for (const f of pool) {
      const key = keyOf(f, i);
      const g = gains.get(f.short) ?? 0;
      const hit = map.get(key);
      if (!hit || g > hit.best)
        map.set(key, { key, word: f.words[i], label: f.labels[i], best: g, f });
    }
    const rank = (l: string) => (l === main ? -1 : ORDER.indexOf(l));
    return Array.from(map.values()).sort(
      (a, b) =>
        rank(a.label) - rank(b.label) || a.word.localeCompare(b.word, "zh")
    );
  };

  const family =
    path[2] !== null
      ? families.find(f => [0, 1, 2].every(i => keyOf(f, i) === path[i]))
      : undefined;

  const results = useMemo(() => {
    if (!searching) return [];
    return families
      .filter(f => q.words.every(t => matches(f, t)))
      .sort((a, b) => (gains.get(b.short) ?? 0) - (gains.get(a.short) ?? 0));
  }, [searching, families, q, gains]);

  /** viaKey：用键盘进入下一栏时，落到的第一项同时选上；鼠标点击只移焦点 */
  const choose = (i: number, key: string, moveFocus = true, viaKey = false) => {
    setPath(prev => {
      if (prev[i] === key) return prev;
      const next: Path = [...prev] as Path;
      next[i] = key;
      for (let j = i + 1; j < 3; j++) next[j] = null;
      return next;
    });
    setHoverLv(null);
    if (moveFocus) focusCol(i + 1, viaKey);
  };

  /** 把焦点移到第 i 栏；autoSelect 时，这一栏还没选的话落到的第一项同时选上 */
  function focusCol(i: number, autoSelect = true) {
    requestAnimationFrame(() => {
      const col = colRefs.current[i];
      const checked = col?.querySelector<HTMLElement>('[aria-checked="true"]');
      const el = checked ?? col?.querySelector<HTMLElement>('[role="radio"]');
      el?.focus();
      if (autoSelect && !checked && i < 3 && el?.dataset.key)
        choose(i, el.dataset.key, false);
    });
  }

  const pickFamily = (f: StoneFamily) => {
    setPath([keyOf(f, 0), keyOf(f, 1), keyOf(f, 2)]);
    if (q.level) setLevel(q.level);
    setQuery("");
    setHoverLv(null);
    focusCol(3);
  };

  const commit = (name: string | null) => {
    onChange(name);
    close(true);
  };

  /** 方向键：上下在一栏里移动，左右换栏 */
  const onColKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      colRefs.current[i]?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      const el = items[(n + items.length) % items.length];
      el?.focus();
      // 前三栏：选择跟着焦点走，下一栏马上更新；等级栏只预览，回车才选定
      if (i < 3 && el?.dataset.key) choose(i, el.dataset.key, false);
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") {
      if (at <= 0) {
        e.preventDefault();
        searchRef.current?.focus();
      } else go(at - 1);
    } else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "ArrowRight" && i < 3) {
      e.preventDefault();
      const key = (document.activeElement as HTMLElement | null)?.dataset.key;
      if (key) choose(i, key, true, true);
      else focusCol(i + 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusCol(i - 1);
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    if (searching)
      colRefs.current[4]?.querySelector<HTMLElement>("button")?.focus();
    else focusCol(0);
  };

  const previewLv = hoverLv ?? level;
  const preview = family ? family.levels[previewLv - 1] : null;

  const optionCls = (on: boolean) =>
    cn(
      "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[12.5px] transition-colors",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cinnabar-text/60",
      on
        ? "bg-paper/[0.08] text-paper"
        : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
    );

  const COLS = ["属性 1", "属性 2", "属性 3"];

  return (
    <div>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        className={cn(
          inputCls(),
          "flex h-8 items-center gap-2 pl-2.5 pr-2 text-left text-[12.5px]",
          open && "ring-cinnabar-text/60"
        )}
      >
        <Gem className="h-3.5 w-3.5 shrink-0 text-paper-3" aria-hidden="true" />
        {current ? (
          <>
            <span className="shrink-0 text-paper">{current.label}</span>
            <span className="min-w-0 truncate text-paper-3">
              {attrText(current)}
            </span>
          </>
        ) : (
          <span className="text-paper-3">不镶</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${uid}-panel`}
          className="mt-1.5 scroll-mb-16 overflow-hidden rounded-lg bg-paper/[0.04] ring-1 ring-inset ring-paper/10"
        >
          {/* 搜索 */}
          <div className="flex h-9 items-center gap-2 border-b border-paper/[0.07] px-2.5">
            <Search
              className="h-3.5 w-3.5 shrink-0 text-paper-3"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="搜属性或名称，如 会效 灭气"
              aria-label="搜索五彩石"
              className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-paper placeholder:text-paper-3/70 focus:outline-none"
            />
            {searching && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="清空搜索"
                title="清空搜索"
                className="grid h-6 w-6 place-items-center rounded-md text-paper-3 hover:bg-paper/[0.06] hover:text-paper-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {searching ? (
            // 搜索结果：选中后回到分层，最后选等级
            <div
              ref={el => {
                colRefs.current[4] = el;
              }}
              role="listbox"
              aria-label="搜索结果"
              className="h-[244px] overflow-y-auto p-1"
              onKeyDown={e => {
                const items = Array.from(
                  colRefs.current[4]?.querySelectorAll<HTMLElement>("button") ??
                    []
                );
                const at = items.indexOf(document.activeElement as HTMLElement);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  items[Math.min(at + 1, items.length - 1)]?.focus();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (at <= 0) searchRef.current?.focus();
                  else items[at - 1]?.focus();
                }
              }}
            >
              {results.length ? (
                results.map(f => {
                  const s = f.levels[shownLevel - 1];
                  return (
                    <button
                      key={f.short}
                      type="button"
                      role="option"
                      aria-selected={current?.short === f.short}
                      onClick={() => pickFamily(f)}
                      className={optionCls(current?.short === f.short)}
                    >
                      <span className="shrink-0">{s.label}</span>
                      <span className="min-w-0 truncate text-[11.5px] text-paper-3">
                        {attrText(s)}
                      </span>
                      <GainText
                        p={gains.get(f.short) ?? 0}
                        className="ml-auto"
                      />
                    </button>
                  );
                })
              ) : (
                <p className="grid h-full place-items-center text-[12.5px] text-paper-3">
                  没有找到「{query.trim()}」
                </p>
              )}
            </div>
          ) : (
            <div className="grid h-[244px] grid-cols-[1fr_1fr_1fr_76px] divide-x divide-paper/[0.07]">
              {COLS.map((title, i) => {
                const opts = optionsAt(i);
                return (
                  <div key={title} className="flex min-h-0 min-w-0 flex-col">
                    <p
                      id={`${uid}-col${i}`}
                      className="px-2.5 pb-1 pt-2 text-[11px] text-paper-3"
                    >
                      {title}
                    </p>
                    <div
                      ref={el => {
                        colRefs.current[i] = el;
                      }}
                      role="radiogroup"
                      aria-labelledby={`${uid}-col${i}`}
                      onKeyDown={onColKey(i)}
                      className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-1"
                    >
                      {opts.map(o => {
                        const on = path[i] === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={
                              on || (!path[i] && o === opts[0]) ? 0 : -1
                            }
                            data-key={o.key}
                            onClick={() => choose(i, o.key)}
                            title={`${o.label}（${o.word}）`}
                            className={optionCls(on)}
                          >
                            <span className="shrink-0">{o.label}</span>
                            <span className="min-w-0 truncate text-[11px] text-paper-3">
                              {o.word}
                            </span>
                            <GainText p={o.best} className="ml-auto" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* 等级 */}
              <div className="flex min-h-0 min-w-0 flex-col">
                <p
                  id={`${uid}-col3`}
                  className="px-2.5 pb-1 pt-2 text-[11px] text-paper-3"
                >
                  等级
                </p>
                <div
                  ref={el => {
                    colRefs.current[3] = el;
                  }}
                  role="radiogroup"
                  aria-labelledby={`${uid}-col3`}
                  onKeyDown={onColKey(3)}
                  onMouseLeave={() => setHoverLv(null)}
                  className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-1"
                >
                  {family &&
                    [...family.levels].reverse().map(s => {
                      const isCur = s.name === value;
                      const on = s.level === level;
                      return (
                        <button
                          key={s.name}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={`${STONE_LEVELS[s.level - 1]}级`}
                          tabIndex={on ? 0 : -1}
                          onClick={() => commit(s.name)}
                          onMouseEnter={() => setHoverLv(s.level)}
                          onFocus={() => setHoverLv(s.level)}
                          className={optionCls(on)}
                        >
                          <span className="shrink-0">
                            {STONE_LEVELS[s.level - 1]}
                          </span>
                          {isCur ? (
                            <Check
                              className="ml-auto h-3.5 w-3.5 text-cinnabar-text"
                              aria-label="当前"
                            />
                          ) : (
                            <GainText p={gain(s.name)} className="ml-auto" />
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* 预览 + 不镶 */}
          <div className="flex h-9 items-center gap-2 border-t border-paper/[0.07] pl-2.5 pr-1.5 text-[12px]">
            {preview && !searching ? (
              <p className="flex min-w-0 items-center gap-2" aria-live="polite">
                <span className="shrink-0 text-paper">{preview.label}</span>
                <span className="min-w-0 truncate text-paper-3">
                  {attrText(preview)}
                </span>
                {preview.estimated && (
                  <span
                    className="shrink-0 text-[11px] text-paper-3/80"
                    title="壹到肆级按五级比例换算"
                  >
                    估算
                  </span>
                )}
              </p>
            ) : (
              <span className="text-paper-3/80">
                {searching ? `${results.length} 种` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => commit(null)}
              className={cn(
                "ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] transition-colors",
                value === null
                  ? "text-paper"
                  : "text-paper-3 hover:bg-paper/[0.06] hover:text-paper-2"
              )}
            >
              {value === null && (
                <Check
                  className="h-3 w-3 text-cinnabar-text"
                  aria-hidden="true"
                />
              )}
              不镶
              {value !== null && <GainText p={gain(null)} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
