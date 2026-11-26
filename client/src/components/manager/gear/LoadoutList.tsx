import { Loader2, Plus, Trash2 } from "lucide-react";
import { Btn, IconBtn } from "@/components/common/ui";
import { XinfaMark } from "@/components/brand/Marks";
import { useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";
import type { Loadout } from "@/data/gear";
import { fmt } from "./Dashboard";

type Pending = { xinfa: string; name: string; charId: string | null };

/**
 * 配装页左栏：和方案库左栏一样，心法是小标题，下面每行一套配装，右边直接写装分。
 * 正在算的新配装排在它的心法组最后，算完换成真的那一行。
 */
export function LoadoutList({
  list,
  currentId,
  pending,
  disabled,
  newDisabled,
  newTitle,
  onSelect,
  onNew,
  onDelete,
}: {
  list: Loadout[];
  currentId: string | null;
  pending: Pending | null;
  /** 正在算的时候不能切 */
  disabled: boolean;
  newDisabled: boolean;
  newTitle?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** 点行里的删除图标：只负责通知，确认和真删在外面做 */
  onDelete: (l: Loadout) => void;
}) {
  const { state } = useProto();
  const charName = (id: string | null) =>
    id ? state.characters.find(c => c.id === id)?.name : undefined;

  // 列表已按心法排好，相邻同心法归成一组
  const groups: { xinfa: string; items: Loadout[] }[] = [];
  for (const l of list) {
    const last = groups[groups.length - 1];
    if (last && last.xinfa === l.xinfa) last.items.push(l);
    else groups.push({ xinfa: l.xinfa, items: [l] });
  }
  if (pending && !groups.some(g => g.xinfa === pending.xinfa))
    groups.push({ xinfa: pending.xinfa, items: [] });

  return (
    <div className="flex w-[236px] shrink-0 flex-col border-r border-paper/[0.07]">
      <nav
        aria-label={tx("配装列表")}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2.5 py-3"
      >
        <Btn
          variant="secondary"
          size="md"
          className="mb-3 w-full"
          icon={<Plus className="h-4 w-4" />}
          disabled={newDisabled}
          title={newTitle}
          onClick={onNew}
        >
          {tx("新建")}
        </Btn>
        <ul className="space-y-3">
          {groups.map(g => (
            <li key={g.xinfa}>
              <div className="flex h-7 items-center gap-2 px-2">
                <XinfaMark xinfa={g.xinfa} size={20} />
                <span className="text-[13.5px] font-semibold text-paper">
                  {g.xinfa}
                </span>
              </div>
              <ul>
                {g.items.map(l => {
                  const active = l.id === currentId && !pending;
                  const who = charName(l.charId);
                  return (
                    <li
                      key={l.id}
                      className={cn(
                        "group/row relative rounded-md transition-colors",
                        active
                          ? "bg-paper/[0.08] text-paper"
                          : disabled
                            ? "text-paper-2"
                            : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelect(l.id)}
                        aria-current={active ? "page" : undefined}
                        aria-label={tx(
                          "{0}，装分 {1}",
                          who ? `${l.name} · ${who}` : l.name,
                          fmt(l.panel.score)
                        )}
                        className="flex w-full items-center gap-2 rounded-md py-1.5 pl-[36px] pr-2 text-left disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium leading-5 [overflow-wrap:anywhere]">
                            {l.name}
                          </span>
                          {who && (
                            <span
                              className={cn(
                                "block text-[11.5px] [overflow-wrap:anywhere]",
                                active ? "text-paper-2" : "text-paper-3"
                              )}
                            >
                              {who}
                            </span>
                          )}
                        </span>
                        {/* 装分一直占着位置，图标换上来时整行不会跳；装分直接让开（不淡出），不会和淡入的图标叠在一起 */}
                        <span
                          className={cn(
                            "shrink-0 text-[12px] tabular-nums",
                            active ? "text-paper" : "text-paper-2",
                            !disabled &&
                              "group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0"
                          )}
                        >
                          {fmt(l.panel.score)}
                        </span>
                      </button>
                      {/* 和整行按钮并排，不嵌在里面；悬停或键盘聚焦这一行时才出现 */}
                      {!disabled && (
                        <IconBtn
                          label={tx("删除「{0}」", l.name)}
                          onClick={() => onDelete(l)}
                          className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-paper-3 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                    </li>
                  );
                })}
                {pending && pending.xinfa === g.xinfa && (
                  <li>
                    <div
                      aria-current="page"
                      className="flex w-full items-center gap-2 rounded-md bg-paper/[0.08] py-1.5 pl-[36px] pr-2 text-paper"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-5 [overflow-wrap:anywhere]">
                          {pending.name}
                        </span>
                        <span className="block text-[11.5px] text-paper-2">
                          {tx("正在计算")}
                        </span>
                      </span>
                      <Loader2
                        className="h-3.5 w-3.5 shrink-0 animate-spin text-paper-2"
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
