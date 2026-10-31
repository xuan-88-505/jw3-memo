import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { TalentSet } from "@/data/types";
import { TALENT_SET_NAME_MAX, talentSetLabel } from "@/lib/talentSets";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/**
 * 方案里的几套奇穴，横着一排切换。
 * - 点一套切过去；再点一下当前这套就改名（回车或点别处保存，Esc 取消）
 * - 悬停当前这套出现 ×；第一套是默认的（配装计算用它），不能删
 * - 和上一版不一样的套右上角有个小方块，和九重里「已修改」的标记一样
 */
export function TalentSetTabs({
  sets,
  active,
  baseline,
  editable,
  renaming,
  onSelect,
  onRename,
  onRemove,
  onRenameEnd,
}: {
  sets: TalentSet[];
  active: string;
  /** 上一版的几套；新方案没有，不标修改 */
  baseline?: TalentSet[];
  editable: boolean;
  /** 刚加的一套直接进入改名 */
  renaming: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onRenameEnd: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(renaming);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (renaming) setEditing(renaming);
  }, [renaming]);

  const changed = (s: TalentSet) => {
    if (!baseline) return false;
    const b = baseline.find(x => x.id === s.id);
    return (
      !b ||
      b.name.trim() !== s.name.trim() ||
      b.talents.join() !== s.talents.join()
    );
  };

  const finish = (id: string, name: string | null) => {
    if (name !== null) onRename(id, name.trim());
    setEditing(null);
    onRenameEnd();
    // 改完名焦点回到这一套
    requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = sets.length - 1;
    const to =
      e.key === "ArrowRight"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft"
          ? i === 0
            ? last
            : i - 1
          : null;
    if (to === null) return;
    e.preventDefault();
    onSelect(sets[to].id);
    tabRefs.current.get(sets[to].id)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={tx("奇穴套")}
      className="flex flex-wrap items-center gap-1.5"
    >
      {sets.map((s, i) => {
        const label = talentSetLabel(s, i);
        const isActive = s.id === active;
        if (editing === s.id && editable) {
          return (
            <input
              key={s.id}
              autoFocus
              defaultValue={s.name}
              placeholder={talentSetLabel({ name: "" }, i)}
              maxLength={TALENT_SET_NAME_MAX}
              aria-label={tx("奇穴套名字")}
              onFocus={e => e.currentTarget.select()}
              onBlur={e => finish(s.id, e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  // 值先改回原名：之后就算触发 blur，存的也是原名
                  e.currentTarget.value = s.name;
                  finish(s.id, null);
                }
              }}
              className="h-7 w-[8.5em] rounded-md bg-paper/[0.06] px-2.5 text-[12.5px] text-paper outline-none ring-1 ring-inset ring-cinnabar/70 placeholder:text-paper-3"
            />
          );
        }
        return (
          <span
            key={s.id}
            className={cn(
              "group relative inline-flex h-7 items-center rounded-md ring-1 ring-inset transition-colors",
              isActive
                ? "bg-paper/[0.08] ring-paper/[0.16]"
                : "ring-transparent hover:bg-paper/[0.04]"
            )}
          >
            <button
              ref={el => {
                if (el) tabRefs.current.set(s.id, el);
                else tabRefs.current.delete(s.id);
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              title={isActive && editable ? tx("点击改名") : undefined}
              onClick={() =>
                isActive && editable ? setEditing(s.id) : onSelect(s.id)
              }
              onKeyDown={e => onTabKey(e, i)}
              className={cn(
                "h-full whitespace-nowrap rounded-md px-2.5 text-[12.5px] transition-colors",
                isActive ? "text-paper" : "text-paper-2 hover:text-paper",
                isActive && editable && i > 0 && "pr-1"
              )}
            >
              {label}
              {changed(s) && <span className="sr-only">{tx("已修改")}</span>}
            </button>
            {isActive && editable && i > 0 && (
              <button
                type="button"
                aria-label={tx("删除「{0}」", label)}
                title={tx("删除「{0}」", label)}
                onClick={() => onRemove(s.id)}
                className="mr-1 grid h-5 w-5 place-items-center rounded text-paper-3 opacity-0 transition-opacity hover:bg-paper/10 hover:text-paper focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
            {changed(s) && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-[2px] bg-cinnabar"
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
