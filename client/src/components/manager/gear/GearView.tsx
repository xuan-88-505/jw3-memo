import { ExternalLink, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { Btn } from "@/components/common/ui";
import { findScheme, latest, myCharacters, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { EmptyState, SectionHeader } from "../shared";
import { Dashboard, fmt } from "./Dashboard";
import { ImportCard } from "./ImportCard";
import { TryOn } from "./TryOn";

type Tab = "board" | "try";

function dateLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 配装与木桩：配装属于角色，只有本人能看到 */
export function GearView() {
  const { state, actions } = useProto();
  const mine = myCharacters(state);
  const char = mine.find(c => c.id === state.activeCharId) ?? mine[0];
  const [tab, setTab] = useState<Tab>("board");
  const [reimport, setReimport] = useState(false);
  const [computing, setComputing] = useState(false);
  const [tryInit, setTryInit] = useState<{
    slotKey: string;
    candId?: string;
    n: number;
  } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // 换角色时回到看板，收起导入框
  useEffect(() => {
    setReimport(false);
    setTryInit(null);
    setTab("board");
  }, [char?.id]);

  if (!char) {
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
        <SectionHeader title="配装" />
        <EmptyState
          icon={<UserPlus className="h-5 w-5" />}
          title="还没有角色"
          description="先添加角色，再给它导入魔盒配装"
          action={
            <Btn
              variant="primary"
              onClick={() =>
                actions.openManager("characters", undefined, "add-character")
              }
            >
              添加角色
            </Btn>
          }
        />
      </div>
    );
  }

  const lo = state.loadouts[char.id];
  const mismatch = !!lo && lo.xinfa !== char.xinfa;
  const showImport = !lo || reimport || mismatch || computing;
  const v = latest(findScheme(state, char.xinfa, "PVE"));
  const talentSource = v ? `${char.xinfa} PVE v${v.version}` : null;
  const offline = state.dataState === "offline";

  const doImport = (sourceId: string | null) => {
    setComputing(true);
    const charId = char.id;
    timer.current = window.setTimeout(() => {
      const r = actions.importLoadout(charId, sourceId);
      setComputing(false);
      setReimport(false);
      setTab("board");
      actions.toast(
        "manager",
        "success",
        r === "same" ? "已重新导入，配装没有变化" : "导入完成"
      );
    }, 1200);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pt-7">
        <SectionHeader
          title="配装"
          right={
            lo && !showImport ? (
              <>
                <Btn
                  variant="ghost"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  onClick={() =>
                    actions.toast(
                      "manager",
                      "info",
                      "正式版会在这里打开魔盒配装器"
                    )
                  }
                >
                  在魔盒里改
                </Btn>
                <Btn
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  disabled={offline}
                  title={offline ? "离线时不能导入" : undefined}
                  onClick={() => setReimport(true)}
                >
                  重新导入
                </Btn>
              </>
            ) : null
          }
        />

        <div
          role="tablist"
          aria-label="角色"
          className="flex flex-wrap gap-1.5"
        >
          {mine.map(c => {
            const active = c.id === char.id;
            const has =
              !!state.loadouts[c.id] && state.loadouts[c.id].xinfa === c.xinfa;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => actions.selectCharacter(c.id)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] ring-1 ring-inset transition-colors",
                  active
                    ? "bg-paper/[0.08] text-paper ring-paper/12"
                    : "text-paper-2 ring-transparent hover:bg-paper/[0.04] hover:text-paper"
                )}
              >
                <CharAvatar character={c} size={20} />
                {c.name}
                {!has && (
                  <span className="text-[11px] text-paper-3">未导入</span>
                )}
              </button>
            );
          })}
        </div>

        {lo && !showImport && (
          <div className="mt-4 flex items-end justify-between gap-4 border-b border-paper/[0.07]">
            <div role="tablist" aria-label="配装视图" className="flex gap-5">
              {(
                [
                  ["board", "看板"],
                  ["try", "试穿"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => {
                    setTab(k);
                    setTryInit(null);
                  }}
                  className={cn(
                    "relative h-9 text-[13.5px] transition-colors",
                    tab === k
                      ? "font-medium text-paper"
                      : "text-paper-3 hover:text-paper-2"
                  )}
                >
                  {label}
                  {tab === k && (
                    <span
                      className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-cinnabar"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="truncate pb-2.5 text-[12px] text-paper-3">
              {lo.target}
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              奇穴用 {talentSource ?? "配装里自带的"}
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              {dateLabel(lo.importedAt)} 导入
              {lo.sample && (
                <span className="ml-2 rounded bg-paper/[0.07] px-1.5 py-px text-[11px] text-paper-2">
                  示例数据
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {showImport ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
          <ImportCard
            key={char.id}
            charName={char.name}
            xinfa={char.xinfa}
            talentSource={talentSource}
            offline={offline}
            computing={computing}
            notice={
              mismatch
                ? `心法改成了${char.xinfa}，现在这份是${lo!.xinfa}的配装（秒伤 ${fmt(lo!.dps)}）。导入一份${char.xinfa}的配装。`
                : undefined
            }
            onCancel={lo && !mismatch ? () => setReimport(false) : undefined}
            onImport={doImport}
          />
        </div>
      ) : tab === "board" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
          <Dashboard
            loadout={lo!}
            onTry={(slotKey, candId) => {
              setTryInit({ slotKey, candId, n: Date.now() });
              setTab("try");
            }}
            onOpenChangelog={() => {
              actions.setChangelogFilter(char.xinfa);
              actions.setSection("changelog");
            }}
          />
          <p className="mt-3 text-[11.5px] text-paper-3">
            木桩理想环境下的期望值，适合比较同一心法的不同配装
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-8 pb-6 pt-4">
          <TryOn
            key={`${char.id}-${tryInit?.n ?? 0}`}
            loadout={lo!}
            initial={tryInit}
            onApply={(slotKey, candId) => {
              const dps = actions.applyCandidate(char.id, slotKey, candId);
              actions.toast(
                "manager",
                "success",
                `已应用到配装，秒伤 ${fmt(dps)}`
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
