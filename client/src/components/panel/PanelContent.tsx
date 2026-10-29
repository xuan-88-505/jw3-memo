import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Jx3Icon } from "@/components/brand/Marks";
import { Btn } from "@/components/common/ui";
import { layersOf } from "@/data/seed";
import type { Macro, SchemeVersion } from "@/data/types";
import { changedLines, type SchemeDiff } from "@/lib/diff";
import { LAYER_LABEL, copyText } from "@/lib/format";
import { MACRO_LIMIT, cleanMacro, isCommentLine } from "@/lib/macro";
import { useProto } from "@/state/store";
import { cn } from "@/lib/utils";

// ---------- 变化列表（通知里用） ----------

export function ChangeList({ diff }: { diff: SchemeDiff }) {
  return (
    <ul className="animate-fade space-y-1 text-[12px]">
      {diff.talents.map(t => (
        <li key={`t${t.layer}`} className="flex items-baseline gap-2">
          <span className="w-11 shrink-0 text-paper-3">
            第{LAYER_LABEL[t.layer - 1]}重
          </span>
          <span className="min-w-0">
            {t.from && (
              <>
                <span className="text-paper-3 line-through">{t.from.name}</span>
                <span className="mx-1 text-paper-3">→</span>
              </>
            )}
            <span className="font-medium text-paper">{t.to.name}</span>
          </span>
        </li>
      ))}
      {diff.macros.map(m => {
        const changed = m.ops.filter(o => o.type !== "same").length;
        const label =
          m.kind === "added"
            ? "新增"
            : m.kind === "removed"
              ? "删除"
              : m.kind === "renamed"
                ? `原名 ${m.oldName}`
                : `改了 ${Math.ceil(changed / 2)} 行`;
        return (
          <li key={m.macroId} className="flex items-baseline gap-2">
            <span className="w-11 shrink-0 text-paper-3">宏</span>
            <span className="min-w-0">
              <span
                className={cn(
                  "font-medium",
                  m.kind === "removed"
                    ? "text-paper-3 line-through"
                    : "text-paper"
                )}
              >
                {m.name}
              </span>
              <span className="ml-1.5 text-paper-3">{label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- 宏 ----------

export function MacroList({
  macros,
  base,
  compact,
}: {
  macros: Macro[];
  base?: SchemeVersion;
  /** 多心法分段时：没有宏只占一行 */
  compact?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseMap = useMemo(
    () => new Map((base?.macros ?? []).map(m => [m.id, m])),
    [base]
  );
  if (!macros.length) {
    return (
      <p
        className={cn(
          "px-4 text-[12.5px] text-paper-3",
          compact ? "pb-3 pt-1" : "py-10 text-center"
        )}
      >
        没有宏
      </p>
    );
  }
  return (
    <ul className="space-y-1 px-2 py-2">
      {macros.map(m => (
        <MacroCard
          key={m.id}
          macro={m}
          prev={base ? (baseMap.get(m.id) ?? null) : undefined}
          open={openId === m.id}
          onToggle={() => setOpenId(id => (id === m.id ? null : m.id))}
        />
      ))}
    </ul>
  );
}

export function MacroCard({
  macro,
  prev,
  open,
  onToggle,
}: {
  macro: Macro;
  /** undefined：不比较；null：上次同步时没有这个宏 */
  prev: Macro | null | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const { actions } = useProto();
  const [copied, setCopied] = useState(false);
  const cleaned = useMemo(() => cleanMacro(macro.content), [macro.content]);
  const isNew = prev === null;
  const changed = useMemo(
    () =>
      prev ? changedLines(prev.content, macro.content) : new Set<number>(),
    [prev, macro.content]
  );
  const over = cleaned.length > MACRO_LIMIT;
  const note = macro.note?.trim();

  const onCopy = async () => {
    const ok = await copyText(cleaned.text);
    if (!ok) {
      actions.toast("panel", "error", "复制失败，展开后手动选中复制");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    // 按钮本身会变成"已复制"；只有去掉了内容时才额外提示
    const removed = cleaned.comments + cleaned.blanks;
    if (removed)
      actions.toast("panel", "info", `已复制，去掉了 ${removed} 行注释和空行`);
  };

  return (
    <li
      className={cn(
        "rounded-lg transition-colors",
        open ? "bg-paper/[0.04]" : "hover:bg-paper/[0.035]"
      )}
    >
      <div className="flex items-center gap-2 py-1 pl-1 pr-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "收起" : "展开"}宏 ${macro.name}`}
          onClick={onToggle}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left"
        >
          <span className="relative shrink-0">
            <Jx3Icon id={macro.icon} name={macro.name} size={32} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-paper">
              {macro.name}
            </span>
            {over ? (
              <span className="mt-0.5 block text-[11.5px] font-medium text-cinnabar-text">
                超出 {MACRO_LIMIT} 字，游戏里放不下
              </span>
            ) : (
              note && (
                <span
                  className="mt-0.5 block truncate text-[11.5px] text-paper-3"
                  title={note}
                >
                  {note}
                </span>
              )
            )}
          </span>
        </button>
        <Btn
          variant="secondary"
          size="sm"
          onClick={onCopy}
          aria-label={`复制宏 ${macro.name}`}
          title={copied ? "已复制" : "复制"}
          className={cn("h-8 w-8 px-0", copied && "text-jade")}
          icon={
            copied ? (
              <Check
                className="h-3.5 w-3.5"
                strokeWidth={2.4}
                aria-hidden="true"
              />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )
          }
        />
      </div>
      {open && (
        <MacroCode content={macro.content} changed={changed} isNew={isNew} />
      )}
    </li>
  );
}

export function MacroCode({
  content,
  changed,
  isNew,
}: {
  content: string;
  changed: Set<number>;
  isNew?: boolean;
}) {
  const raw = content.split("\n");
  return (
    <div className="animate-fade px-2 pb-2">
      <pre className="rounded-md bg-paper/[0.04] py-1.5 font-mono text-[11.5px] leading-[1.7] ring-1 ring-inset ring-paper/10">
        {raw.map((line, i) => {
          const comment = isCommentLine(line);
          const blank = line.trim() === "";
          const hl = !comment && !blank && (isNew || changed.has(i));
          return (
            <div
              key={i}
              className={cn(
                "flex border-l-2 pr-3",
                hl ? "border-cinnabar bg-cinnabar/[0.10]" : "border-transparent"
              )}
            >
              <span className="w-7 shrink-0 select-none pr-2 text-right text-paper-3/70">
                {i + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 whitespace-pre-wrap break-all",
                  comment ? "italic text-paper-3/80" : "text-paper"
                )}
              >
                {line || " "}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// ---------- 奇穴 ----------

export function TalentList({
  xinfa,
  talents,
}: {
  xinfa: string;
  talents: number[];
}) {
  const layers = layersOf(xinfa);
  const [openLayer, setOpenLayer] = useState<number | null>(null);

  return (
    <ul className="px-2 py-2">
      {talents.map((pos, i) => {
        const o = layers[i]?.options.find(x => x.pos === pos);
        if (!o) return null;
        const open = openLayer === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpenLayer(open ? null : i)}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                open ? "bg-paper/[0.04]" : "hover:bg-paper/[0.035]"
              )}
            >
              <span className="w-4 shrink-0 text-center font-serif text-[12px] text-paper-3">
                {LAYER_LABEL[i]}
              </span>
              <Jx3Icon id={o.icon} name={o.name} size={28} />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] text-paper">
                  {o.name}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-paper-3/60 transition-transform",
                  open && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            {open && (
              <p className="animate-fade px-2 pb-2 pl-[62px] pt-0.5 text-[12px] leading-relaxed text-paper-2">
                {o.desc}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
