import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { XinfaMark } from "@/components/brand/Marks";
import { Anchored } from "@/components/common/Anchored";
import { xinfasOf } from "@/data/seed";
import type { Character } from "@/data/types";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { charLoadouts, useProto } from "@/state/store";

const fmt = (n: number) => n.toLocaleString("en-US");

const itemCls =
  "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-paper-2 transition-colors hover:bg-paper/[0.07] hover:text-paper focus-visible:bg-paper/[0.07] focus-visible:text-paper focus-visible:outline-none";

/**
 * 我的角色表里的「装分」格。和左边的角色格一样两行：
 * 第一行是装分（取最近改过的那套配装），第二行是这套配装的名字和箭头，表示能点开。
 * 只关联一套：点了直接打开那套配装。关联了几套：点了弹菜单，选一套再打开。
 * 角色玩多个心法时，配装名前面加心法图标，分得清是哪个心法的配装。
 */
export function CharLoadoutCell({ char }: { char: Character }) {
  const { state, actions } = useProto();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const list = charLoadouts(state, char.id);
  const cur = list[0];
  const many = list.length > 1;
  const multiXinfa = xinfasOf(char).length > 1;

  // 菜单挂在窗口根节点上，Tab 走不进去：打开时把焦点放到第一项
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() =>
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    );
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!cur) return null;

  const show = (id: string) => {
    setOpen(false);
    actions.selectLoadout(id);
    actions.setSection("gear");
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };

  const menuLabel = tx("「{0}」的配装", char.name);
  const score = fmt(cur.panel.score);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => (many ? setOpen(v => !v) : show(cur.id))}
        aria-haspopup={many ? "menu" : undefined}
        aria-expanded={many ? open : undefined}
        aria-label={
          many
            ? tx(
                "装分 {0}，「{1}」有 {2} 套配装，选一套打开",
                score,
                char.name,
                list.length
              )
            : tx("装分 {0}，打开配装「{1}」", score, cur.name)
        }
        title={many ? undefined : `${cur.xinfa} · ${cur.name}`}
        className={cn(
          "group/lo -mx-1.5 flex min-w-0 max-w-full flex-col items-start rounded-md px-1.5 text-left transition-colors hover:bg-paper/[0.05]",
          open && "bg-paper/[0.05]"
        )}
      >
        {/* 两行的高度和角色名（h-7）、门派行（h-6）一样，左右两格对齐 */}
        <span className="h-7 text-[13px] leading-7 tabular-nums text-paper">
          {score}
        </span>
        <span
          className={cn(
            "flex h-6 min-w-0 max-w-full items-center gap-1 text-[12px] text-paper-3 transition-colors group-hover/lo:text-paper-2",
            open && "text-paper-2"
          )}
        >
          {multiXinfa && <XinfaMark xinfa={cur.xinfa} size={14} />}
          <span className="min-w-0 truncate">{cur.name}</span>
          {many && (
            <span className="shrink-0 whitespace-nowrap">
              · {tx("{0} 套", list.length)}
            </span>
          )}
          {many ? (
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
        </span>
      </button>
      {many && (
        <Anchored
          anchor={btn}
          open={open}
          onClose={() => setOpen(false)}
          width={240}
          maxHeight={360}
          label={menuLabel}
          role="presentation"
        >
          <div
            ref={menu}
            role="menu"
            aria-label={menuLabel}
            onKeyDown={onMenuKey}
            className="overflow-y-auto p-1"
          >
            {list.map(l => (
              <button
                key={l.id}
                type="button"
                role="menuitem"
                onClick={() => show(l.id)}
                className={itemCls}
              >
                <XinfaMark xinfa={l.xinfa} size={16} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="sr-only">{l.xinfa} · </span>
                  {l.name}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-paper-3">
                  {fmt(l.panel.score)}
                </span>
              </button>
            ))}
          </div>
        </Anchored>
      )}
    </>
  );
}
