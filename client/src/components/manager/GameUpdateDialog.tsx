import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Jx3Icon } from "@/components/brand/Marks";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import { MacroCard } from "@/components/panel/PanelContent";
import { layersOf } from "@/data/seed";
import type { Character, Mode } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { LAYER_LABEL } from "@/lib/format";
import { inboxItems, isOnline, useProto } from "@/state/store";

/**
 * 「去改」弹窗：方案更新后，列出游戏里要跟着改的奇穴和宏。
 * 软件不读游戏，在游戏里改完后由自己点「我改好了」。
 */
export function GameUpdateDialog({
  char,
  xinfa,
  mode,
  onClose,
}: {
  char: Character | null;
  xinfa: string;
  mode: Mode;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const online = isOnline(state);
  const item = char
    ? inboxItems(state).find(i => i.key === `${char.id}-${xinfa}-${mode}`)
    : undefined;
  const base = item?.base;
  const last = item?.last;
  const diff = useMemo(
    () => (last ? diffVersions(base, last, layersOf(xinfa)) : null),
    [base, last, xinfa]
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const done = () => {
    if (!char) return;
    const r = actions.markSynced(char.id, mode, xinfa);
    if (r)
      actions.toast(
        "manager",
        "success",
        `「${r.name}」${xinfa} ${mode} 已是最新 v${r.version}`
      );
    onClose();
  };

  const open = !!char && !!last && !!diff;
  const macros = diff?.macros ?? [];
  const kept = macros.filter(m => m.kind !== "removed");
  const removed = macros.filter(m => m.kind === "removed");

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      width={520}
      bodyMaxHeight={460}
      title={char ? `${char.name} · ${xinfa} ${mode}` : ""}
      description={
        last &&
        (base
          ? `方案从 v${base.version} 更新到 v${last.version}。在游戏里照着改，改完点「我改好了」。`
          : `第一次用这套方案（v${last.version}）。在游戏里照着设置，设置完点「我改好了」。`)
      }
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            稍后
          </Btn>
          <Btn
            variant="primary"
            size="md"
            icon={<Check className="h-4 w-4" />}
            disabled={!online}
            title={online ? undefined : "离线时不能操作"}
            onClick={done}
          >
            我改好了
          </Btn>
        </>
      }
    >
      {diff && (
        <div className="space-y-5">
          {diff.talents.length > 0 && (
            <section aria-labelledby="gu-talents">
              <h3
                id="gu-talents"
                className="mb-2 text-[12px] font-medium text-paper-3"
              >
                奇穴 · 改 {diff.talents.length} 处
              </h3>
              <ul className="space-y-1.5">
                {diff.talents.map(t => (
                  <li
                    key={t.layer}
                    className="flex items-center gap-3 rounded-md bg-ink px-2.5 py-2 ring-1 ring-inset ring-paper/[0.06]"
                  >
                    <span className="w-10 shrink-0 font-serif text-[12px] text-paper-3">
                      第{LAYER_LABEL[t.layer - 1]}重
                    </span>
                    {t.from && (
                      <>
                        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-paper-3">
                          <Jx3Icon
                            id={t.from.icon}
                            name={t.from.name}
                            size={22}
                            dim
                          />
                          <span className="truncate line-through">
                            {t.from.name}
                          </span>
                        </span>
                        <span className="text-paper-3" aria-label="改为">
                          →
                        </span>
                      </>
                    )}
                    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-paper">
                      <Jx3Icon id={t.to.icon} name={t.to.name} size={22} />
                      <span className="truncate">{t.to.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {macros.length > 0 && (
            <section aria-labelledby="gu-macros">
              <h3
                id="gu-macros"
                className="mb-2 text-[12px] font-medium text-paper-3"
              >
                宏 · 改 {macros.length} 个
              </h3>
              <ul className="-mx-2 space-y-1">
                {kept.map(m => {
                  const macro = last?.macros.find(x => x.id === m.macroId);
                  if (!macro) return null;
                  const prev = base
                    ? (base.macros.find(x => x.id === m.macroId) ?? null)
                    : null;
                  return (
                    <MacroCard
                      key={m.macroId}
                      macro={macro}
                      prev={prev}
                      open={openId === m.macroId}
                      onToggle={() =>
                        setOpenId(id => (id === m.macroId ? null : m.macroId))
                      }
                    />
                  );
                })}
              </ul>
              {removed.map(m => (
                <p
                  key={m.macroId}
                  className="mt-1.5 text-[12.5px] text-paper-3"
                >
                  <span className="text-paper-2 line-through">{m.name}</span>{" "}
                  已从方案删掉，游戏里也可以删掉
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </InlineModal>
  );
}
