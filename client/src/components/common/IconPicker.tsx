import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { ExternalLink, RefreshCw, Search, Star, X } from "lucide-react";
import { Anchored } from "@/components/common/Anchored";
import { COMMON_ICONS, XINFA_ICONS } from "@/data/iconIndex";
import { TALENTS } from "@/data/talents";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 宏图标选择，参考魔盒「云端宏」：
 * - 可以用任意游戏图标，最后存的是图标编号
 * - 按名称搜（本地索引，离线也能用），或按编号搜：单个、逗号分隔、1-100 范围
 * - 收藏常用的图标，下次放在最上面
 * - 本地找不到时去魔盒图标库查编号，再输入数字
 */
export const ICON_LIBRARY_URL = "https://www.jx3box.com/app/design/icon";
/** 魔盒默认图标：没设置时用 13 */
export const DEFAULT_MACRO_ICON = 13;
const MAX_RESULTS = 200;
const FAV_KEY = "tongdiao.iconFav.v1";
const FAV_MAX = 48;

interface IconItem {
  id: number;
  name: string;
}

// ---------- 本地索引：技能和奇穴的名称 → 图标编号 ----------

let entries: Array<IconItem & { xinfa: string }> | null = null;
let names: Map<number, string> | null = null;
function index() {
  if (entries && names) return { entries, names };
  entries = [];
  names = new Map();
  for (const [xinfa, v] of Object.entries(XINFA_ICONS)) {
    for (const [name, id] of v.skills) entries.push({ id, name, xinfa });
  }
  for (const [xinfa, layers] of Object.entries(TALENTS)) {
    for (const l of layers) {
      for (const o of l.options)
        entries.push({ id: o.icon, name: o.name, xinfa });
    }
  }
  for (const e of entries) if (!names.has(e.id)) names.set(e.id, e.name);
  return { entries, names };
}
/** 图标编号对应的技能或奇穴名称；本地没有时返回空字符串 */
export function iconName(id: number) {
  return index().names.get(id) ?? "";
}

/**
 * 按编号搜，写法和魔盒图标库一样：`13`、`2,4,6`（中英文逗号、顿号、斜杠、竖杠）、
 * `1-100` 或 `1~100`，可以混着写。不是这种写法时返回 null，按名称搜。
 */
export function parseIconQuery(q: string): number[] | null {
  const t = q.trim().replace(/\s*([-~－～])\s*/g, "$1");
  if (!t || !/^[\d\s,，、/|~\-－～]+$/.test(t) || !/\d/.test(t)) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (n: number) => {
    if (n > 0 && !seen.has(n) && out.length < MAX_RESULTS) {
      seen.add(n);
      out.push(n);
    }
  };
  for (const part of t.split(/[\s,，、/|]+/)) {
    const m = part.match(/^(\d+)[-~－～](\d+)$/);
    if (m) {
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b && out.length < MAX_RESULTS; i++) push(i);
    } else if (/^\d+$/.test(part)) {
      push(Number(part));
    }
  }
  return out;
}

function searchByName(q: string, xinfa: string): IconItem[] {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  const { entries: all } = index();
  const hit = all.filter(e => e.name.toLowerCase().includes(k));
  // 当前心法排前面；名字一样开头的排前面
  const score = (e: (typeof hit)[number]) =>
    (e.xinfa === xinfa ? 0 : 2) + (e.name.toLowerCase().startsWith(k) ? 0 : 1);
  hit.sort((a, b) => score(a) - score(b));
  return dedupe(hit).slice(0, MAX_RESULTS);
}

function dedupe(list: IconItem[], skip?: Set<number>) {
  const seen = new Set(skip);
  const out: IconItem[] = [];
  for (const it of list) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ id: it.id, name: it.name || iconName(it.id) });
  }
  return out;
}

/** 这个心法常用的图标：宏里常用的技能，宏库里常用的图标，再加上奇穴里的技能 */
function xinfaIcons(xinfa: string): IconItem[] {
  const v = XINFA_ICONS[xinfa];
  const skills = (v?.skills ?? []).map(([name, id]) => ({ id, name }));
  const used = (v?.used ?? []).map(id => ({ id, name: iconName(id) }));
  const talentSkills = (TALENTS[xinfa] ?? []).flatMap(l =>
    l.options.filter(o => o.isSkill).map(o => ({ id: o.icon, name: o.name }))
  );
  return dedupe([...skills, ...used, ...talentSkills]).slice(0, 42);
}

// ---------- 收藏：存在这台电脑上，所有选择器共用 ----------

const favListeners = new Set<() => void>();
let favCache: number[] | null = null;
function readFavs(): number[] {
  if (favCache) return favCache;
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    favCache = Array.isArray(v) ? v.filter(n => Number.isInteger(n)) : [];
  } catch {
    favCache = [];
  }
  return favCache;
}
function toggleFav(id: number) {
  const cur = readFavs();
  const next = cur.includes(id)
    ? cur.filter(n => n !== id)
    : [id, ...cur].slice(0, FAV_MAX);
  favCache = next;
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    // 存不下就只在这次打开时有效
  }
  favListeners.forEach(f => f());
}
function useFavs() {
  return useSyncExternalStore(
    cb => {
      favListeners.add(cb);
      return () => favListeners.delete(cb);
    },
    readFavs,
    readFavs
  );
}

// ---------- 界面 ----------

/** 图标按钮：点开选择浮层。只读时只显示图标 */
export function IconPickerButton({
  xinfa,
  value,
  name,
  onChange,
  size = 30,
  disabled,
}: {
  xinfa: string;
  value: number;
  /** 宏名称，图片加载失败时显示第一个字 */
  name: string;
  onChange: (icon: number) => void;
  size?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (disabled) return <IconImage id={value} name={name} size={size} />;
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tx("换图标")}
        title={tx("换图标")}
        className="group/icon relative shrink-0 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-cinnabar-text/60"
      >
        <IconImage id={value} name={name} size={size} />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 grid place-items-center rounded-[6px] bg-black/55 text-paper opacity-0 transition-opacity group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100",
            open && "opacity-100"
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </span>
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        width={332}
        maxHeight={460}
        label={tx("选择图标")}
      >
        <IconPickerPanel
          xinfa={xinfa}
          value={value}
          onPick={id => {
            onChange(id);
            setOpen(false);
            btn.current?.focus();
          }}
        />
      </Anchored>
    </>
  );
}

function IconPickerPanel({
  xinfa,
  value,
  onPick,
}: {
  xinfa: string;
  value: number;
  onPick: (id: number) => void;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<IconItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const favs = useFavs();
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const ids = parseIconQuery(q);
  const results = useMemo<IconItem[] | null>(() => {
    if (!q.trim()) return null;
    if (ids) return ids.map(id => ({ id, name: iconName(id) }));
    return searchByName(q, xinfa);
    // ids 由 q 决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, xinfa]);
  const sections = useMemo(() => {
    const fav = favs.map(id => ({ id, name: iconName(id) }));
    const mine = xinfaIcons(xinfa);
    const common = dedupe(
      COMMON_ICONS.map(id => ({ id, name: iconName(id) })),
      new Set(mine.map(m => m.id))
    );
    return [
      { key: "fav", label: tx("收藏"), items: fav },
      { key: "xinfa", label: xinfa, items: mine },
      { key: "common", label: tx("常用"), items: common },
    ].filter(s => s.items.length > 0);
  }, [favs, xinfa]);
  const shown = hover ?? { id: value, name: iconName(value) };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results?.[0]) {
      e.preventDefault();
      onPick(results[0].id);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 p-2.5 pb-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-[22px] top-[19px] h-3.5 w-3.5 text-paper-3"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          aria-label={tx("搜图标")}
          aria-describedby={`${uid}-hint`}
          placeholder={tx("搜技能名或编号")}
          className="h-8 w-full rounded-md bg-paper/[0.05] pl-8 pr-8 text-[13px] text-paper ring-1 ring-inset ring-paper/10 placeholder:text-paper-3/80 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label={tx("清空")}
            className="absolute right-[16px] top-[16px] grid h-5 w-5 place-items-center rounded text-paper-3 hover:bg-paper/[0.08] hover:text-paper"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <p id={`${uid}-hint`} className="sr-only">
          {tx("可以输入编号，多个用逗号隔开，范围写成 1-100")}
        </p>
      </div>
      <div
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5"
        onMouseLeave={() => setHover(null)}
      >
        {results ? (
          results.length > 0 ? (
            <IconGrid
              label={
                ids
                  ? tx("编号 {0} 个", results.length)
                  : tx("找到 {0} 个", results.length)
              }
              items={results}
              value={value}
              favs={favs}
              onPick={onPick}
              onHover={setHover}
              hideBroken={!!ids}
            />
          ) : (
            <div className="px-3 py-8 text-center">
              <p className="text-[12.5px] text-paper-2">
                {tx("没找到「{0}」", q.trim())}
              </p>
              <p className="mt-1 text-[12px] text-paper-3">
                {tx("去魔盒图标库查到编号，再输入数字")}
              </p>
            </div>
          )
        ) : (
          sections.map(s => (
            <IconGrid
              key={s.key}
              label={s.label}
              items={s.items}
              value={value}
              favs={favs}
              onPick={onPick}
              onHover={setHover}
            />
          ))
        )}
      </div>
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-t border-paper/[0.07] px-3">
        <IconImage id={shown.id} name={shown.name || "?"} size={24} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] text-paper">
            {shown.name || tx("图标")}
          </p>
          <p className="font-mono text-[11px] text-paper-3">#{shown.id}</p>
        </div>
        <a
          href={ICON_LIBRARY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-paper-3 transition-colors hover:bg-paper/[0.06] hover:text-paper"
        >
          {tx("魔盒图标库")}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function IconGrid({
  label,
  items,
  value,
  favs,
  onPick,
  onHover,
  hideBroken,
}: {
  label: string;
  items: IconItem[];
  value: number;
  favs: number[];
  onPick: (id: number) => void;
  onHover: (it: IconItem | null) => void;
  /** 按编号搜时，不存在的编号直接不显示 */
  hideBroken?: boolean;
}) {
  const uid = useId();
  return (
    <section aria-labelledby={uid} className="pt-3">
      <h3 id={uid} className="mb-1.5 px-0.5 text-[11.5px] text-paper-3">
        {label}
      </h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1">
        {items.map(it => (
          <IconCell
            key={it.id}
            item={it}
            selected={it.id === value}
            fav={favs.includes(it.id)}
            onPick={onPick}
            onHover={onHover}
            hideBroken={hideBroken}
          />
        ))}
      </ul>
    </section>
  );
}

function IconCell({
  item,
  selected,
  fav,
  onPick,
  onHover,
  hideBroken,
}: {
  item: IconItem;
  selected: boolean;
  fav: boolean;
  onPick: (id: number) => void;
  onHover: (it: IconItem | null) => void;
  hideBroken?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (broken && hideBroken) return null;
  const label = item.name ? `${item.name} #${item.id}` : `#${item.id}`;
  return (
    <li
      className="group/cell relative grid place-items-center"
      onMouseEnter={() => onHover(item)}
    >
      <button
        type="button"
        onClick={() => onPick(item.id)}
        onFocus={() => onHover(item)}
        aria-pressed={selected}
        aria-label={label}
        title={label}
        className={cn(
          "grid h-[38px] w-[38px] place-items-center rounded-[7px] outline-none transition-colors hover:bg-paper/[0.08] focus-visible:ring-2 focus-visible:ring-cinnabar-text/60",
          selected && "bg-cinnabar/15 ring-2 ring-cinnabar-text/80"
        )}
      >
        <IconImage
          id={item.id}
          name={item.name || String(item.id)}
          size={32}
          onError={() => setBroken(true)}
        />
      </button>
      <button
        type="button"
        onClick={() => toggleFav(item.id)}
        aria-label={fav ? tx("取消收藏 {0}", label) : tx("收藏 {0}", label)}
        aria-pressed={fav}
        title={fav ? tx("取消收藏") : tx("收藏")}
        className={cn(
          "absolute -right-0.5 -top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-ink-3 text-paper-3 opacity-0 shadow ring-1 ring-paper/15 transition-opacity hover:text-gold focus-visible:opacity-100 group-hover/cell:opacity-100",
          fav && "text-gold"
        )}
      >
        <Star className={cn("h-2.5 w-2.5", fav && "fill-current")} />
      </button>
    </li>
  );
}

/** 魔盒图标图片；加载失败时显示名字的第一个字 */
export function IconImage({
  id,
  name,
  size,
  onError,
}: {
  id: number;
  name: string;
  size: number;
  onError?: () => void;
}) {
  const [failed, setFailed] = useState<number | null>(null);
  const bad = failed === id;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[6px] bg-paper/[0.06] ring-1 ring-inset ring-paper/10"
      style={{ width: size, height: size }}
    >
      {bad ? (
        <span
          className="font-serif text-paper-2"
          style={{ fontSize: Math.round(size * 0.45) }}
          aria-hidden="true"
        >
          {name.slice(0, 1)}
        </span>
      ) : (
        <img
          src={`https://icon.jx3box.com/icon/${id}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          onError={() => {
            setFailed(id);
            onError?.();
          }}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
