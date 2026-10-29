import { ExternalLink, Plus, RefreshCw, Shirt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { Btn } from "@/components/common/ui";
import { findScheme, latest, myCharacters, useProto } from "@/state/store";
import { SOURCE_LABEL, type LoadoutSource } from "@/data/gear";
import { buffFactor, buffLabel } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { EmptyState, SectionHeader } from "../shared";
import { BuffsView } from "./BuffsView";
import { Dashboard, fmt } from "./Dashboard";
import { ImportCard } from "./ImportCard";
import { NewLoadoutDialog } from "./NewLoadoutDialog";
import { TryOn } from "./TryOn";

type Tab = "board" | "try" | "buffs";

function dateLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 配装与木桩：配装属于角色，只有本人能看到 */
export function GearView() {
  const { state, actions } = useProto();
  const mine = myCharacters(state);
  // 正在导入的新配装：算完之前也要显示在页签里
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // 只显示已有配装的角色；没有配装的从「新建配装」里加
  const listed = mine.filter(c => !!state.loadouts[c.id] || c.id === pendingId);
  const char = listed.find(c => c.id === state.activeCharId) ?? listed[0];
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

  const offline = state.dataState === "offline";

  const doImport = (
    charId: string,
    source: LoadoutSource,
    sourceId: string | null,
    isNew = false
  ) => {
    setPendingId(charId);
    setComputing(true);
    timer.current = window.setTimeout(() => {
      const r = actions.importLoadout(charId, source, sourceId);
      setComputing(false);
      setPendingId(null);
      setReimport(false);
      setTab("board");
      actions.toast(
        "manager",
        "success",
        isNew
          ? "已添加角色，配装导入完成"
          : r === "same"
            ? "已重新导入，配装没有变化"
            : "导入完成"
      );
    }, 1200);
  };

  const newDialog = (
    <NewLoadoutDialog
      open={newOpen}
      onClose={() => setNewOpen(false)}
      onStart={doImport}
    />
  );

  if (!char) {
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
        <SectionHeader title="配装" />
        <EmptyState
          icon={<Shirt className="h-5 w-5" />}
          title="还没有配装"
          description="粘贴茗伊装备码或魔盒链接，算出木桩秒伤"
          action={
            <Btn
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              disabled={offline}
              title={offline ? "离线时不能导入" : undefined}
              onClick={() => setNewOpen(true)}
            >
              新建配装
            </Btn>
          }
        />
        {newDialog}
      </div>
    );
  }

  const lo = state.loadouts[char.id];
  const mismatch = !!lo && lo.xinfa !== char.xinfa;
  const showImport = !lo || reimport || mismatch || computing;
  const v = latest(findScheme(state, char.xinfa, "PVE"));
  const talentSource = v ? `${char.xinfa} PVE v${v.version}` : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pt-7">
        <SectionHeader
          title="配装"
          right={
            lo && !showImport ? (
              <>
                {lo.source === "jx3box" && lo.sourceId && (
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
                )}
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

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="tablist"
            aria-label="角色"
            className="flex flex-wrap gap-1.5"
          >
            {listed.map(c => {
              const active = c.id === char.id;
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
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            disabled={offline || computing}
            title={offline ? "离线时不能导入" : undefined}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-paper-3 transition-colors hover:bg-paper/[0.04] hover:text-paper disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            新建配装
          </button>
        </div>

        {lo && !showImport && (
          <div className="mt-4 flex items-end justify-between gap-4 border-b border-paper/[0.07]">
            <div role="tablist" aria-label="配装视图" className="flex gap-5">
              {(
                [
                  ["board", "看板"],
                  ["try", "试穿"],
                  ["buffs", "增益"],
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
              <button
                type="button"
                onClick={() => setTab("buffs")}
                className="underline-offset-2 hover:text-paper-2 hover:underline"
              >
                {buffLabel(lo.buffs)}
              </button>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              {dateLabel(lo.importedAt)} 从{SOURCE_LABEL[lo.source]}导入
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
            onImport={(source, sourceId) => doImport(char.id, source, sourceId)}
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
            onOpenBuffs={() => setTab("buffs")}
          />
          <p className="mt-3 text-[11.5px] text-paper-3">
            木桩理想环境下的期望值，适合比较同一心法的不同配装
          </p>
        </div>
      ) : tab === "buffs" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
          <BuffsView
            loadout={lo!}
            onChange={sel => actions.setLoadoutBuffs(char.id, sel)}
            onNotice={text => actions.toast("manager", "info", text)}
          />
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
                `已应用到配装，秒伤 ${fmt(Math.round(dps * buffFactor(lo!)))}`
              );
            }}
          />
        </div>
      )}
      {newDialog}
    </div>
  );
}
