import { useMemo, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { Jx3Icon } from "@/components/brand/Marks";
import { Btn } from "@/components/common/ui";
import { layersOf } from "@/data/seed";
import type { Macro, SchemeVersion, TalentSet } from "@/data/types";
import { changedLines, type SchemeDiff } from "@/lib/diff";
import { layerLabel, copyText } from "@/lib/format";
import { MACRO_LIMIT, cleanMacro, isCommentLine } from "@/lib/macro";
import { talentSetLabel } from "@/lib/talentSets";
import { talentSetChangeText } from "@/components/manager/shared";
import { useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";
import { talentText } from "@/lib/jx3box";

// ---------- 变化列表（通知里用） ----------

export function ChangeList({ diff }: { diff: SchemeDiff }) {
  return (
    <ul className="animate-fade space-y-1 text-[12px]">
      {diff.talentSets.map(c => (
        <li key={`s${c.setId}`} className="flex items-baseline gap-2">
          <span className="w-11 shrink-0 text-paper-3">{tx("奇穴")}</span>
          <span className="min-w-0">
            <span
              className={cn(
                "font-medium",
                c.kind === "removed"
                  ? "text-paper-3 line-through"
                  : "text-paper"
              )}
            >
              {c.name}
            </span>
            <span className="ml-1.5 text-paper-3">
              {talentSetChangeText(c)}
            </span>
          </span>
        </li>
      ))}
      {diff.talents.map(t => (
        <li
          key={`t${t.setId ?? ""}${t.layer}`}
          className="flex items-baseline gap-2"
        >
          <span className="w-11 shrink-0 text-paper-3">
            {tx("第{0}重", layerLabel(t.layer - 1))}
          </span>
          <span className="min-w-0">
            {t.set && <span className="mr-1.5 text-paper-2">{t.set}</span>}
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
        const main =
          m.kind === "added"
            ? tx("新增")
            : m.kind === "removed"
              ? tx("删除")
              : m.kind === "icon"
                ? tx("换了图标")
                : m.kind === "renamed"
                  ? tx("原名 {0}", m.oldName)
                  : tx("改了 {0} 行", Math.ceil(changed / 2));
        const label =
          m.kind !== "icon" && m.iconFrom !== undefined
            ? `${main} · ${tx("换了图标")}`
            : main;
        return (
          <li key={m.macroId} className="flex items-baseline gap-2">
            <span className="w-11 shrink-0 text-paper-3">{tx("宏")}</span>
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
  onAdd,
}: {
  macros: Macro[];
  base?: SchemeVersion;
  /** 多心法分段时：紧贴心法小标题；没有宏只占一行 */
  compact?: boolean;
  /** 有就在列表最后加一行「新建宏」；只读成员不传 */
  onAdd?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseMap = useMemo(
    () => new Map((base?.macros ?? []).map(m => [m.id, m])),
    [base]
  );
  if (!macros.length && (!onAdd || !compact)) {
    return (
      <div
        className={cn(
          "flex flex-col px-4 text-[12.5px] text-paper-3",
          compact ? "pb-3 pt-1" : "items-center gap-3 py-10 text-center"
        )}
      >
        <p>{tx("没有宏")}</p>
        {onAdd && (
          <Btn
            variant="secondary"
            size="sm"
            onClick={onAdd}
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {tx("新建宏")}
          </Btn>
        )}
      </div>
    );
  }
  return (
    <ul className={cn("space-y-1 px-2", compact ? "pb-2" : "py-2")}>
      {macros.map(m => (
        <MacroCard
          key={m.id}
          macro={m}
          prev={base ? (baseMap.get(m.id) ?? null) : undefined}
          open={openId === m.id}
          onToggle={() => setOpenId(id => (id === m.id ? null : m.id))}
        />
      ))}
      {onAdd && <AddMacroRow onClick={onAdd} />}
    </ul>
  );
}

/**
 * 宏列表最后一行：虚线方框占住宏图标的位置，文字和宏名对齐，看起来像空着的一格。
 * 平时弱，悬停时和宏一样变亮。
 */
function AddMacroRow({ onClick }: { onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex min-h-[44px] w-full items-center gap-2.5 rounded-lg py-1 pl-2 pr-2 text-left text-[13px] text-paper-3 transition-colors hover:bg-paper/[0.035] hover:text-paper focus-visible:bg-paper/[0.035] focus-visible:text-paper"
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-dashed border-paper/15 transition-colors group-hover:border-paper/30"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
        {tx("新建宏")}
      </button>
    </li>
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
      actions.toast("panel", "error", tx("复制失败，展开后手动选中复制"));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    // 按钮本身会变成"已复制"；只有去掉了内容时才额外提示
    const removed = cleaned.comments + cleaned.blanks;
    if (removed)
      actions.toast(
        "panel",
        "info",
        tx("已复制，去掉了 {0} 行注释和空行", removed)
      );
  };

  return (
    <li
      data-macro-id={macro.id}
      className={cn(
        "rounded-lg transition-colors",
        open ? "bg-paper/[0.04]" : "hover:bg-paper/[0.035]"
      )}
    >
      <div className="flex items-center gap-2 py-1 pl-1 pr-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={tx(
            "{0}宏 {1}",
            open ? tx("收起") : tx("展开"),
            macro.name
          )}
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
                {tx("超出 {0} 字，游戏里放不下", MACRO_LIMIT)}
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
          aria-label={tx("复制宏 {0}", macro.name)}
          title={copied ? tx("已复制") : tx("复制")}
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

/**
 * 一套一行：九重的图标横着排，几套上下排着一眼看完。
 * 面板宽时图标下面写名字；窄时只有图标，悬停看名字，点一下看说明。
 */
export function TalentList({
  xinfa,
  sets,
  compact,
}: {
  xinfa: string;
  sets: TalentSet[];
  /** 多心法分段时：紧贴心法小标题 */
  compact?: boolean;
}) {
  const layers = layersOf(xinfa);
  const [open, setOpen] = useState<{ set: string; layer: number } | null>(null);
  // 只有一套、也没起名字时不写套名
  const named = sets.length > 1 || sets.some(s => s.name.trim());
  return (
    <div
      className={cn(
        "@container space-y-3.5 px-3",
        compact ? "pb-3 pt-0.5" : "py-3"
      )}
    >
      {sets.map((s, si) => {
        const label = talentSetLabel(s, si);
        const picks = s.talents.map((pos, i) =>
          layers[i]?.options.find(x => x.pos === pos)
        );
        const sel = open?.set === s.id ? open.layer : null;
        const detail = sel !== null ? picks[sel] : undefined;
        return (
          <section key={s.id} aria-label={named ? label : tx("奇穴")}>
            {named && (
              <p className="mb-1.5 px-0.5 text-[12px] font-medium text-paper-2">
                {label}
              </p>
            )}
            <div className="grid grid-cols-9 gap-[3px] @[340px]:gap-1">
              {picks.map((o, i) =>
                o ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setOpen(sel === i ? null : { set: s.id, layer: i })
                    }
                    aria-expanded={sel === i}
                    aria-label={tx("第{0}重 · {1}", layerLabel(i), o.name)}
                    title={tx("第{0}重 · {1}", layerLabel(i), o.name)}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-1 rounded-[8px] p-[2px] transition-colors",
                      sel === i ? "bg-paper/[0.07]" : "hover:bg-paper/[0.045]"
                    )}
                  >
                    <Jx3Icon
                      id={o.icon}
                      name={o.name}
                      size={32}
                      fluid
                      className={cn(
                        "max-w-[44px]",
                        sel === i && "ring-2 ring-cinnabar/80"
                      )}
                    />
                    {/* 面板拉宽后一格放得下四个字：写名字，放不下就换行，不截断 */}
                    <span
                      aria-hidden="true"
                      className="hidden w-full break-all text-center text-[11px] leading-tight text-paper-2 @[540px]:block"
                    >
                      {o.name}
                    </span>
                  </button>
                ) : (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="m-[2px] aspect-square rounded-[6px] bg-paper/[0.05]"
                  />
                )
              )}
            </div>
            {detail && sel !== null && (
              <div className="mt-1.5 animate-fade rounded-lg bg-paper/[0.04] px-2.5 py-2">
                <p className="text-[12.5px] text-paper">
                  <span className="mr-1.5 text-paper-3">
                    {tx("第{0}重", layerLabel(sel))}
                  </span>
                  {detail.name}
                  {detail.isSkill && (
                    <span className="ml-1.5 text-[11px] text-paper-3">
                      {tx("招式")}
                    </span>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-paper-2">
                  {talentText(detail.desc)}
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
