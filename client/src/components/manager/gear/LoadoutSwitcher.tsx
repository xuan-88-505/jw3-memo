import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { XinfaMark } from "@/components/brand/Marks";
import { Anchored } from "@/components/common/Anchored";
import type { Loadout } from "@/data/gear";
import { cn } from "@/lib/utils";
import { useProto } from "@/state/store";
import { tx } from "@/lib/i18n";

const itemCls =
  "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-paper-2 transition-colors hover:bg-paper/[0.07] hover:text-paper focus-visible:bg-paper/[0.07] focus-visible:text-paper focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45";

/**
 * 左栏最上面的配装卡，照参考站的角色卡：心法图标、配装名、关联的角色。
 * 点开是菜单：按心法分组列出所有配装，最后一项新建。
 */
export function LoadoutSwitcher({
  list,
  current,
  pending,
  disabled,
  newDisabled,
  newTitle,
  onSelect,
  onNew,
}: {
  list: Loadout[];
  current: Loadout | null;
  /** 正在算的新配装：算完之前卡片显示它 */
  pending: { xinfa: string; name: string; charId: string | null } | null;
  disabled?: boolean;
  newDisabled?: boolean;
  newTitle?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const { state } = useProto();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const charOf = (id: string | null) =>
    id ? state.characters.find(c => c.id === id) : undefined;
  const shown = pending ?? current;
  if (!shown) return null;
  const c = charOf(shown.charId);

  // 列表已按心法排好，相邻同心法归成一组
  const groups: { xinfa: string; items: Loadout[] }[] = [];
  for (const l of list) {
    const last = groups[groups.length - 1];
    if (last && last.xinfa === l.xinfa) last.items.push(l);
    else groups.push({ xinfa: l.xinfa, items: [l] });
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tx("切换配装，当前：{0}", shown.name)}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg bg-paper/[0.04] px-3 py-2.5 text-left ring-1 ring-inset ring-paper/10 transition-colors",
          "hover:bg-paper/[0.06] hover:ring-paper/15 disabled:cursor-default disabled:hover:bg-paper/[0.04]",
          open && "bg-paper/[0.06] ring-paper/15"
        )}
      >
        <XinfaMark xinfa={shown.xinfa} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-paper">
            {shown.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-paper-3">
            {c ? `${c.name} · ${shown.xinfa}` : shown.xinfa}
          </span>
        </span>
        {pending ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-paper-3"
            aria-label={tx("正在计算")}
          />
        ) : (
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-paper-3"
            aria-hidden="true"
          />
        )}
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        width={232}
        maxHeight={420}
        label={tx("切换配装")}
      >
        <div role="menu" aria-label={tx("切换配装")} className="p-1">
          {groups.map((g, gi) => (
            <div
              key={g.xinfa}
              role="group"
              aria-label={g.xinfa}
              className={cn(gi > 0 && "mt-1")}
            >
              <div className="flex h-7 items-center gap-1.5 px-2.5 text-[11.5px] text-paper-3">
                <XinfaMark xinfa={g.xinfa} size={14} />
                {g.xinfa}
              </div>
              {g.items.map(l => {
                const on = l.id === current?.id && !pending;
                const lc = charOf(l.charId);
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      onSelect(l.id);
                      setOpen(false);
                    }}
                    className={cn(itemCls, on && "text-paper")}
                  >
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    {lc && (
                      <CharAvatar
                        character={lc}
                        size={16}
                        className="opacity-90"
                      />
                    )}
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-cinnabar-text",
                        !on && "invisible"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          ))}
          <div className="my-1 h-px bg-paper/[0.07]" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={newDisabled}
            title={newTitle}
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className={itemCls}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tx("新建配装")}
          </button>
        </div>
      </Anchored>
    </>
  );
}
