import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Jx3Icon } from "@/components/brand/Marks";
import { Btn } from "@/components/common/ui";
import { layersOf } from "@/data/seed";
import type {
  Character,
  Macro,
  Mode,
  Scheme,
  SchemeVersion,
} from "@/data/types";
import { changedLines, diffVersions, type SchemeDiff } from "@/lib/diff";
import {
  LAYER_LABEL,
  absoluteTime,
  copyText,
  pasteHint,
  relativeTime,
} from "@/lib/format";
import { MACRO_LIMIT, cleanMacro, isCommentLine } from "@/lib/macro";
import { isOnline, memberName, statusOf, useProto } from "@/state/store";
import { cn } from "@/lib/utils";

// ---------- 同步提示条 ----------

export function SyncBanner({
  char,
  mode,
  scheme,
  last,
  diff,
}: {
  char: Character;
  mode: Mode;
  scheme: Scheme;
  last: SchemeVersion;
  diff: SchemeDiff;
}) {
  const { state, actions } = useProto();
  const [open, setOpen] = useState(false);
  const status = statusOf(state, char, mode);
  const synced = char.synced[mode];
  const online = isOnline(state);

  useEffect(() => setOpen(false), [char.id, mode]);

  const onMark = () => {
    const r = actions.markSynced(char.id, mode);
    if (r)
      actions.toast("panel", "success", `「${r.name}」已同步到 v${r.version}`);
  };

  if (status === "synced") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-[12px]">
        <Check
          className="h-3.5 w-3.5 text-jade"
          strokeWidth={2.4}
          aria-hidden="true"
        />
        <span className="text-jade">已同步到 v{synced}</span>
        <span className="text-paper-3" title={absoluteTime(last.at)}>
          · 最新版本，{relativeTime(last.at)}由{" "}
          {memberName(state, last.authorId)} 更新
        </span>
      </div>
    );
  }

  const behind = synced ? last.version - synced : last.version;
  return (
    <div className="mx-3 mt-1 rounded-lg border-l-2 border-cinnabar bg-cinnabar/[0.08] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-paper">
            {status === "never"
              ? "这个角色还没同步过"
              : `有 ${diff.total} 处变化要在游戏里改`}
          </p>
          <p
            className="mt-0.5 text-[12px] text-paper-2"
            title={absoluteTime(last.at)}
          >
            {synced ? `v${synced} → v${last.version}` : `最新 v${last.version}`}
            {synced && behind > 1 ? `（中间有 ${behind} 次更新）` : ""} ·{" "}
            {memberName(state, last.authorId)} · {relativeTime(last.at)}
          </p>
        </div>
        <Btn
          variant="primary"
          size="xs"
          onClick={onMark}
          disabled={!online}
          title={online ? "在游戏里改好后点这里" : "离线时不能标记，联网后再试"}
        >
          标记已同步
        </Btn>
      </div>
      {last.note && (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-paper-2">
          “{last.note}”
        </p>
      )}
      {diff.total > 0 && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-cinnabar-text hover:underline"
        >
          {open ? "收起变化" : "查看变化"}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>
      )}
      {open && (
        <ul className="mt-2 animate-fade space-y-1.5 border-t border-paper/10 pt-2 text-[12px]">
          {diff.talents.map(t => (
            <li key={`t${t.layer}`} className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 font-serif text-paper-3">
                第{LAYER_LABEL[t.layer - 1]}重
              </span>
              <span className="min-w-0">
                {t.from ? (
                  <span className="text-paper-3 line-through">
                    {t.from.name}
                  </span>
                ) : null}
                {t.from ? <span className="mx-1 text-paper-3">→</span> : null}
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
                  ? "已删除"
                  : m.kind === "renamed"
                    ? `改名（原：${m.oldName}）`
                    : `改了 ${Math.ceil(changed / 2)} 行`;
            return (
              <li key={m.macroId} className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-paper-3">宏</span>
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
          <li className="pt-0.5 text-[11.5px] text-paper-3">
            变化的行和奇穴在下面也标出来了。
          </li>
        </ul>
      )}
    </div>
  );
}

// ---------- 宏 ----------

export function MacroList({
  macros,
  base,
}: {
  macros: Macro[];
  base?: SchemeVersion;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseMap = useMemo(
    () => new Map((base?.macros ?? []).map(m => [m.id, m])),
    [base]
  );
  if (!macros.length) {
    return (
      <p className="px-4 py-8 text-center text-[12.5px] text-paper-3">
        这个方案还没有宏。
      </p>
    );
  }
  return (
    <ul className="space-y-1.5 px-3 py-2">
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

function MacroCard({
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
  const { state, actions } = useProto();
  const [copied, setCopied] = useState(false);
  const cleaned = useMemo(() => cleanMacro(macro.content), [macro.content]);
  const lines = cleaned.text ? cleaned.text.split("\n").length : 0;
  const isNew = prev === null;
  const changed = useMemo(
    () =>
      prev ? changedLines(prev.content, macro.content) : new Set<number>(),
    [prev, macro.content]
  );
  const updated = isNew || changed.size > 0;
  const over = cleaned.length > MACRO_LIMIT;

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(cleaned.text);
    if (!ok) {
      actions.toast("panel", "error", "复制失败。展开宏，手动选中文本复制。");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    const removed: string[] = [];
    if (cleaned.comments) removed.push(`${cleaned.comments} 行注释`);
    if (cleaned.blanks) removed.push(`${cleaned.blanks} 行空行`);
    actions.toast(
      "panel",
      "success",
      `已复制「${macro.name}」${removed.length ? `，去掉了 ${removed.join("、")}` : ""}。去游戏宏界面按 ${pasteHint(
        state.platform
      )}。`
    );
  };

  return (
    <li
      className={cn(
        "rounded-lg ring-1 ring-inset transition-colors",
        open
          ? "bg-ink-3 ring-paper/12"
          : "ring-transparent hover:bg-paper/[0.035]"
      )}
    >
      <div className="flex items-center gap-2 py-1 pl-1 pr-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "收起" : "展开"}宏 ${macro.name}`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left"
        >
          <span className="relative shrink-0">
            <Jx3Icon id={macro.icon} name={macro.name} size={34} />
            {updated && (
              <span
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-[2.5px] bg-cinnabar ring-2 ring-ink-2"
                aria-hidden="true"
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-paper">
              {macro.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-paper-3">
              <span>{lines} 行</span>
              <span aria-hidden="true">·</span>
              <span className={cn(over && "font-medium text-cinnabar-text")}>
                {cleaned.length}/{MACRO_LIMIT} 字
              </span>
              {updated && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-cinnabar-text">
                    {isNew ? "新增" : "已更新"}
                  </span>
                </>
              )}
            </p>
          </div>
        </button>
        <Btn
          variant="secondary"
          size="sm"
          onClick={onCopy}
          aria-label={`复制宏 ${macro.name}`}
          className={cn("w-[68px]", copied && "text-jade")}
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
        >
          {copied ? "已复制" : "复制"}
        </Btn>
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
      <pre className="rounded-md bg-ink py-1.5 font-mono text-[11.5px] leading-[1.7] ring-1 ring-inset ring-paper/8">
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
                  comment ? "italic text-paper-3" : "text-paper"
                )}
              >
                {line || " "}
              </span>
              {comment && (
                <span className="ml-2 shrink-0 select-none text-[10.5px] text-gold/80">
                  复制时去掉
                </span>
              )}
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
  base,
}: {
  xinfa: string;
  talents: number[];
  base?: SchemeVersion;
}) {
  const layers = layersOf(xinfa);
  const [openLayer, setOpenLayer] = useState<number | null>(null);
  const picks = talents.map((pos, i) =>
    layers[i]?.options.find(o => o.pos === pos)
  );

  return (
    <div className="px-3 py-2">
      {/* 一排 9 个图标，方便对着游戏里的奇穴面板看 */}
      <div className="mb-2 grid grid-cols-9 gap-1 rounded-lg bg-ink px-2 py-2 ring-1 ring-inset ring-paper/8">
        {picks.map((o, i) => {
          const changed = base && base.talents[i] !== talents[i];
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "rounded-[7px] p-px",
                  changed ? "ring-2 ring-cinnabar" : ""
                )}
              >
                {o ? (
                  <Jx3Icon id={o.icon} name={o.name} size={28} />
                ) : (
                  <span className="block h-7 w-7" />
                )}
              </span>
              <span
                className={cn(
                  "font-serif text-[10.5px]",
                  changed ? "text-cinnabar-text" : "text-paper-3"
                )}
              >
                {LAYER_LABEL[i]}
              </span>
            </div>
          );
        })}
      </div>

      <ul>
        {picks.map((o, i) => {
          if (!o) return null;
          const prevPos = base?.talents[i];
          const prev =
            prevPos !== undefined && prevPos !== talents[i]
              ? layers[i].options.find(x => x.pos === prevPos)
              : undefined;
          const open = openLayer === i;
          return (
            <li key={i}>
              {i === 6 && (
                <p className="px-2 pb-1 pt-2.5 text-[11px] text-paper-3">
                  第七至九重从同一组 12 个里选 3 个
                </p>
              )}
              <button
                type="button"
                onClick={() => setOpenLayer(open ? null : i)}
                aria-expanded={open}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  open ? "bg-ink-3" : "hover:bg-paper/[0.035]"
                )}
              >
                <span
                  className={cn(
                    "w-4 shrink-0 text-center font-serif text-[12px]",
                    prev ? "text-cinnabar-text" : "text-paper-3"
                  )}
                >
                  {LAYER_LABEL[i]}
                </span>
                <Jx3Icon id={o.icon} name={o.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-paper">
                    {o.name}
                    {o.isSkill && (
                      <span className="ml-1.5 text-[11px] text-gold">招式</span>
                    )}
                  </span>
                  {prev && (
                    <span className="block text-[11.5px] text-cinnabar-text">
                      原来是 <span className="line-through">{prev.name}</span>
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-paper-3 transition-transform",
                    open && "rotate-180"
                  )}
                  aria-hidden="true"
                />
              </button>
              {open && (
                <p className="animate-fade px-2 pb-2 pl-[54px] pt-1 text-[12px] leading-relaxed text-paper-2">
                  {o.desc}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { diffVersions };
