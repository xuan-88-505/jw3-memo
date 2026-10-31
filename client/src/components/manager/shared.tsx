import type { ReactNode } from "react";
import { PixelIcon, type PixelIconName } from "@/components/brand/PixelIcon";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Jx3Icon } from "@/components/brand/Marks";
import type { SchemeDiff, TalentChange, TalentSetChange } from "@/lib/diff";
import { layerLabel } from "@/lib/format";
import { MAIN_SET_ID } from "@/lib/talentSets";
import { cn } from "@/lib/utils";
import { tx, txn } from "@/lib/i18n";

/** 整套奇穴变化的说明：新增、删除、改名 */
export function talentSetChangeText(c: TalentSetChange) {
  return c.kind === "added"
    ? tx("新增")
    : c.kind === "removed"
      ? tx("删除")
      : tx("改名，原来叫「{0}」", c.oldName);
}

/**
 * 有多套奇穴时按套分组：先是有层变化的套（按方案里的顺序），
 * 再是整套新增的，最后是删掉的
 */
export function groupTalentChanges(diff: SchemeDiff) {
  const groups: {
    id: string;
    name: string;
    event?: TalentSetChange;
    rows: TalentChange[];
  }[] = [];
  for (const t of diff.talents) {
    // 只有一套时层变化不带套 id，都是第一套的
    const id = t.setId ?? MAIN_SET_ID;
    let g = groups.find(x => x.id === id);
    if (!g) groups.push((g = { id, name: t.set ?? "", rows: [] }));
    g.rows.push(t);
  }
  for (const c of diff.talentSets) {
    const g = groups.find(x => x.id === c.setId);
    if (g) {
      g.event = c;
      g.name ||= c.name;
    } else groups.push({ id: c.setId, name: c.name, event: c, rows: [] });
  }
  return groups;
}

function TalentRow({ t }: { t: TalentChange }) {
  return (
    <li className="flex items-center gap-2 text-[12.5px]">
      <span className="w-11 shrink-0 text-paper-3">
        {tx("第{0}重", layerLabel(t.layer - 1))}
      </span>
      {t.from && (
        <>
          <Jx3Icon id={t.from.icon} name={t.from.name} size={20} dim />
          <span className="text-paper-3 line-through">{t.from.name}</span>
          <span className="text-paper-3">→</span>
        </>
      )}
      <Jx3Icon id={t.to.icon} name={t.to.name} size={20} />
      <span className="font-medium text-paper">{t.to.name}</span>
    </li>
  );
}

/** 按"旧 → 新"展示两个版本的差异 */
export function DiffDetails({
  diff,
  compact,
}: {
  diff: SchemeDiff;
  compact?: boolean;
}) {
  if (diff.total === 0) {
    return <p className="text-[12.5px] text-paper-3">{tx("内容没有变化。")}</p>;
  }
  const multi = diff.talentSets.length > 0 || diff.talents.some(t => t.setId);
  return (
    <div className="space-y-3">
      {diff.talents.length > 0 && !multi && (
        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.1em] text-paper-3">
            {tx("奇穴")}
          </p>
          <ul className="space-y-1">
            {diff.talents.map(t => (
              <TalentRow key={t.layer} t={t} />
            ))}
          </ul>
        </div>
      )}
      {multi && (
        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.1em] text-paper-3">
            {tx("奇穴")}
          </p>
          <div className="space-y-2.5">
            {groupTalentChanges(diff).map(g => (
              <div key={g.id}>
                {(g.name || g.event) && (
                  <p className="mb-1 text-[12.5px]">
                    <span
                      className={cn(
                        "font-medium",
                        g.event?.kind === "removed"
                          ? "text-paper-3 line-through"
                          : "text-paper"
                      )}
                    >
                      {g.name}
                    </span>
                    {g.event && (
                      <span className="ml-2 text-paper-3">
                        {talentSetChangeText(g.event)}
                      </span>
                    )}
                  </p>
                )}
                {g.event?.picks && g.event.picks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {g.event.picks.map((o, i) => (
                      <span
                        key={i}
                        title={tx("第{0}重 · {1}", layerLabel(i), o.name)}
                      >
                        <Jx3Icon id={o.icon} name={o.name} size={22} />
                      </span>
                    ))}
                  </div>
                )}
                {g.rows.length > 0 && (
                  <ul className="space-y-1">
                    {g.rows.map(t => (
                      <TalentRow key={t.layer} t={t} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {diff.macros.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.1em] text-paper-3">
            {tx("宏")}
          </p>
          <div className="space-y-2">
            {diff.macros.map(m => (
              <div key={m.macroId}>
                <p className="mb-1 text-[12.5px]">
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
                  <span className="ml-2 text-paper-3">
                    {m.kind === "added" && tx("新增")}
                    {m.kind === "removed" && tx("删除")}
                    {m.kind === "icon" && tx("换了图标")}
                    {m.kind === "renamed" &&
                      tx("改名，原来叫「{0}」", m.oldName)}
                    {m.kind === "changed" &&
                      (m.oldName !== m.name
                        ? tx("内容有改动，原来叫「{0}」", m.oldName)
                        : tx("内容有改动"))}
                    {m.kind !== "icon" &&
                      m.iconFrom !== undefined &&
                      tx("，换了图标")}
                  </span>
                </p>
                {m.ops.length > 0 && (m.kind === "changed" || !compact) && (
                  <pre className="scroll-thin overflow-x-auto rounded-md bg-paper/[0.04] py-1 font-mono text-[11.5px] leading-[1.7] ring-1 ring-inset ring-paper/10">
                    {m.ops
                      .filter(o => !compact || o.type !== "same")
                      .map((o, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex pr-3",
                            o.type === "add" && "bg-jade/[0.10]",
                            o.type === "del" && "bg-cinnabar/[0.08]"
                          )}
                        >
                          <span
                            className={cn(
                              "w-6 shrink-0 select-none text-center",
                              o.type === "add"
                                ? "text-jade"
                                : o.type === "del"
                                  ? "text-cinnabar-text"
                                  : "text-paper-3/50"
                            )}
                            aria-label={
                              o.type === "add"
                                ? tx("新")
                                : o.type === "del"
                                  ? tx("旧")
                                  : undefined
                            }
                          >
                            {o.type === "add"
                              ? "+"
                              : o.type === "del"
                                ? "−"
                                : " "}
                          </span>
                          <span
                            className={cn(
                              "whitespace-pre",
                              o.type === "del"
                                ? "text-paper-3 line-through decoration-paper-3/50"
                                : "text-paper",
                              o.type === "same" && "text-paper-2"
                            )}
                          >
                            {o.text || " "}
                          </span>
                        </div>
                      ))}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function diffSummary(diff: SchemeDiff): string {
  const parts: string[] = [];
  const talentCount = diff.talents.length + diff.talentSets.length;
  if (talentCount) parts.push(txn("奇穴 {0} 处", talentCount));
  if (diff.macros.length) parts.push(tx("宏 {0} 个", diff.macros.length));
  return parts.join(" · ") || tx("无变化");
}

export function SectionHeader({
  title,
  description,
  right,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  /** 二级页：标题左边一个 ‹，点了回上一级；上一级的名字只放在提示里 */
  back?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
      {/* 标题块至少 32 高（和最高的右侧按钮一样）：有没有右侧按钮，标题位置都不变，切页签不跳 */}
      <div className="flex min-h-8 min-w-0 flex-col justify-end">
        <div className="flex items-center gap-0.5">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={tx("返回{0}", back.label)}
              title={tx("返回{0}", back.label)}
              className="-my-1 -ml-2.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-paper-2 transition-colors hover:bg-paper/[0.06] hover:text-paper"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-paper">
            {title}
          </h1>
        </div>
        {description && (
          <p className="mt-1.5 text-[13px] text-paper-3">{description}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-paper">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {(error || hint) && (
        <p
          role={error ? "alert" : undefined}
          className={cn(
            "mt-1.5 text-[12px]",
            error ? "text-cinnabar-text" : "text-paper-3"
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const inputCls = (error?: boolean) =>
  cn(
    "h-8 w-full rounded-md bg-paper/[0.04] px-3 text-[13px] text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2 disabled:opacity-50",
    error
      ? "ring-cinnabar/70 focus:ring-cinnabar"
      : "ring-paper/10 hover:ring-paper/[0.18] focus:ring-cinnabar-text/60"
  );

/**
 * 空状态：像素图标 + 标题 + 说明 + 操作，在父元素剩下的空间里上下左右居中。
 * 父元素要是纵向 flex 才能撑满；底部留白比顶部多一点，看起来才居中。
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: PixelIconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state flex min-h-[240px] flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 text-center">
      <PixelIcon name={icon} className="pixel-hop" />
      <p className="mt-4 text-[14px] font-medium text-paper">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[340px] text-[12.5px] leading-relaxed text-paper-3">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * 统一的下拉框：去掉系统自带箭头，换成和图标一致的箭头，右边留出间距。
 * 点开仍是系统菜单，键盘和读屏照常可用。
 */
/** 下拉框：菜单自绘为暗色（原生菜单在 Windows 上是白底），写法和原生 <select> 一样 */
export { SelectBox } from "@/components/common/Select";
