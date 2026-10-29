import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Anchored } from "./Anchored";

/**
 * 下拉框。写法和原生 <select> 一样（子元素用 <option> / <optgroup>，onChange 读 e.target.value），
 * 但弹出的菜单由我们自己画：原生菜单由系统绘制，Windows 上是白底，跟暗色界面不搭。
 *
 * 键盘：方向键 / Home / End / PageUp / PageDown 移动，回车或空格选中，Esc 关闭，输入首字跳转。
 */
type Opt = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  group?: string;
};

function textOf(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement(n))
    return textOf((n.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: ReactNode, group?: string) => {
    Children.forEach(nodes, node => {
      if (!isValidElement(node)) return;
      const p = node.props as {
        children?: ReactNode;
        value?: string | number | readonly string[];
        disabled?: boolean;
        label?: string;
      };
      if (node.type === Fragment) walk(p.children, group);
      else if (node.type === "optgroup") walk(p.children, p.label);
      else if (node.type === "option") {
        const text = textOf(p.children).trim();
        out.push({
          value: p.value === undefined ? text : String(p.value),
          label: p.children,
          text,
          disabled: !!p.disabled,
          group,
        });
      }
    });
  };
  walk(children);
  return out;
}

/** 估算文字宽度：中文按 13px，其余按 7.5px，用来定菜单宽度 */
function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 13 : 7.5;
  return w;
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapClassName?: string;
  /** 很窄的下拉（如镶嵌孔）可以不画箭头 */
  chevron?: boolean;
  "data-autofocus"?: boolean | string;
};

export function SelectBox({
  className,
  wrapClassName,
  chevron = true,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  title,
  name,
  style,
  ...rest
}: Props) {
  const opts = collect(children);
  const [inner, setInner] = useState(() =>
    defaultValue !== undefined ? String(defaultValue) : (opts[0]?.value ?? "")
  );
  const cur = value !== undefined && value !== null ? String(value) : inner;
  const selIdx = opts.findIndex(o => o.value === cur);
  const sel = selIdx >= 0 ? opts[selIdx] : undefined;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [width, setWidth] = useState(160);
  const [labelText, setLabelText] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const typed = useRef({ s: "", t: 0 });
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-o${i}`;

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < opts.length; i += dir)
      if (!opts[i].disabled) return i;
    return from;
  };
  const firstIdx = () => step(-1, 1);
  const lastIdx = () => step(opts.length, -1);

  const show = () => {
    if (disabled || !opts.length) return;
    const bw = btn.current?.offsetWidth ?? 0;
    const longest = Math.max(0, ...opts.map(o => textWidth(o.text)));
    setWidth(Math.min(360, Math.max(bw, Math.ceil(longest) + 52)));
    if (!rest["aria-label"] && id)
      setLabelText(
        document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ??
          ""
      );
    setActive(selIdx >= 0 && !opts[selIdx].disabled ? selIdx : firstIdx());
    setOpen(true);
  };
  const hide = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  // Esc 和点外面由 Anchored 处理（Esc 时它会把焦点还给按钮）
  const onClose = useCallback(() => setOpen(false), []);

  const commit = (i: number) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    if (o.value !== cur && onChange) {
      const target = { value: o.value, name: name ?? "" } as HTMLSelectElement;
      onChange({
        target,
        currentTarget: target,
      } as ChangeEvent<HTMLSelectElement>);
    }
    hide(true);
  };

  /** 输入首字跳到下一个以它开头的选项；连续输入（600ms 内）按整串匹配 */
  const typeahead = (key: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.s = now - t.t > 600 ? key : t.s + key;
    t.t = now;
    const q = t.s.toLowerCase();
    const n = opts.length;
    const start = t.s.length > 1 ? 0 : 1;
    for (let k = start; k < n + start; k++) {
      const i = (((from + k) % n) + n) % n;
      if (!opts[i].disabled && opts[i].text.toLowerCase().startsWith(q))
        return i;
    }
    return -1;
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    } else if (
      e.key.length === 1 &&
      e.key !== " " &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      // 和原生下拉一样：不打开菜单，直接换到首字匹配的选项
      const i = typeahead(e.key, selIdx);
      if (i >= 0) commit(i);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const jump = (dir: 1 | -1) =>
      setActive(a => {
        let i = a;
        for (let k = 0; k < 8; k++) i = step(i, dir);
        return i;
      });
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(a => step(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(a => step(a, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(firstIdx());
        break;
      case "End":
        e.preventDefault();
        setActive(lastIdx());
        break;
      case "PageDown":
        e.preventDefault();
        jump(1);
        break;
      case "PageUp":
        e.preventDefault();
        jump(-1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Tab":
        e.preventDefault();
        hide(true);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const i = typeahead(e.key, active);
          if (i >= 0) setActive(i);
        }
    }
  };

  // 菜单出现时把焦点放进列表，并让当前选项停在中间
  const listRef = useCallback((el: HTMLUListElement | null) => {
    list.current = el;
    if (!el) return;
    el.focus({ preventScroll: true });
    const a = el.querySelector<HTMLElement>('[data-active="true"]');
    if (a)
      el.scrollTop = a.offsetTop - el.clientHeight / 2 + a.offsetHeight / 2;
  }, []);

  // 键盘移动时让高亮项保持可见（只滚菜单本身，不带动外面的页面）
  useEffect(() => {
    const el = list.current;
    if (!open || !el || active < 0) return;
    const a = el.querySelector<HTMLElement>(`[id="${optId(active)}"]`);
    if (!a) return;
    if (a.offsetTop < el.scrollTop) el.scrollTop = a.offsetTop - 4;
    else if (a.offsetTop + a.offsetHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = a.offsetTop + a.offsetHeight - el.clientHeight + 4;
    // optId 只依赖 uid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // 按分组切段；没有分组的选项放在同一段
  const sections: { group?: string; items: number[] }[] = [];
  opts.forEach((o, i) => {
    const last = sections[sections.length - 1];
    if (last && last.group === o.group) last.items.push(i);
    else sections.push({ group: o.group, items: [i] });
  });

  const renderOpt = (i: number) => {
    const o = opts[i];
    const selected = o.value === cur;
    return (
      <li
        key={`${i}:${o.value}`}
        id={optId(i)}
        role="option"
        aria-selected={selected}
        aria-disabled={o.disabled || undefined}
        data-active={i === active || undefined}
        data-value={o.value}
        onMouseDown={e => e.preventDefault()}
        onPointerMove={() => {
          if (i !== active && !o.disabled) setActive(i);
        }}
        onClick={() => commit(i)}
        className={cn(
          "flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-paper-2",
          i === active && "bg-paper/[0.07] text-paper",
          selected && "text-paper",
          o.disabled && "cursor-default opacity-40"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {selected && (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-cinnabar-text"
            aria-hidden="true"
          />
        )}
      </li>
    );
  };

  return (
    <span className={cn("relative inline-flex", wrapClassName)}>
      <button
        ref={btn}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        data-value={cur}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest["aria-label"]}
        aria-labelledby={rest["aria-labelledby"]}
        aria-describedby={rest["aria-describedby"]}
        aria-invalid={rest["aria-invalid"]}
        data-autofocus={rest["data-autofocus"]}
        title={title}
        disabled={disabled}
        style={style}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={onTriggerKey}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center text-left disabled:cursor-default",
          chevron && "pr-8",
          className
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {sel ? sel.label : "\u00a0"}
        </span>
      </button>
      {chevron && (
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-3 transition-transform duration-150",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      )}
      <Anchored
        anchor={btn}
        open={open}
        onClose={onClose}
        width={width}
        maxHeight={320}
        label=""
        role="presentation"
        className="rounded-lg"
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={rest["aria-label"] ?? (labelText || undefined)}
          aria-activedescendant={active >= 0 ? optId(active) : undefined}
          onKeyDown={onListKey}
          className="scroll-thin relative min-h-0 flex-1 overflow-y-auto p-1 outline-none"
        >
          {sections.map((sec, k) =>
            sec.group ? (
              <li key={`g${k}`} role="presentation">
                <div
                  id={`${uid}-g${k}`}
                  className="px-2.5 pb-1 pt-2 text-[11.5px] text-paper-3"
                >
                  {sec.group}
                </div>
                <ul role="group" aria-labelledby={`${uid}-g${k}`}>
                  {sec.items.map(renderOpt)}
                </ul>
              </li>
            ) : (
              <Fragment key={`g${k}`}>{sec.items.map(renderOpt)}</Fragment>
            )
          )}
        </ul>
      </Anchored>
    </span>
  );
}
