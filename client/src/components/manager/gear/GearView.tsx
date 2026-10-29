import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shirt,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { XinfaMark } from "@/components/brand/Marks";
import { Btn, IconBtn } from "@/components/common/ui";
import { findScheme, latest, loadoutList, useProto } from "@/state/store";
import {
  SOURCE_LABEL,
  draftChanges,
  draftOf,
  equipSlot,
  primaryAttr,
  type GearDraft,
  type Loadout,
  type LoadoutSource,
} from "@/data/gear";
import { getEquipDb, partOf } from "@/data/equip";
import { InlineModal } from "@/components/common/overlay";
import { buffFactor, buffLabel } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { EmptyState, SectionHeader, inputCls } from "../shared";
import { BuffsView } from "./BuffsView";
import { CompareView } from "./CompareView";
import { Dashboard, fmt } from "./Dashboard";
import { ImportCard } from "./ImportCard";
import { EditLoadoutDialog, NewLoadoutDialog } from "./NewLoadoutDialog";
import type { GearConfig } from "@/data/enchants";
import { GearEditor } from "./GearEditor";

type Tab = "board" | "editor" | "buffs" | "compare";

const TABS: [Tab, string][] = [
  ["board", "看板"],
  ["editor", "配装器"],
  ["buffs", "增益"],
  ["compare", "对比"],
];

type NewLoadoutInput = {
  xinfa: string;
  name: string;
  charId: string | null;
  source: LoadoutSource;
  sourceId: string | null;
  config?: GearConfig;
};

function dateLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 配装与木桩：配装按心法建，只有本人能看到；关联角色是可选的 */
export function GearView() {
  const { state, actions } = useProto();
  const list = loadoutList(state);
  const lo = list.find(l => l.id === state.activeLoadoutId) ?? list[0] ?? null;
  const [tab, setTab] = useState<Tab>("board");
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reimport, setReimport] = useState(false);
  // 正在算的新配装：算完之前也要显示在标签里
  const [pending, setPending] = useState<NewLoadoutInput | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const [compareB, setCompareB] = useState<string | null>(null);
  // 配装器草稿：按配装存，切页签不丢。base 是建草稿时的配装，配装在外面改了装备就作废
  const [drafts, setDrafts] = useState<
    Record<string, { base: Loadout; d: GearDraft }>
  >({});
  const [flash, setFlash] = useState<{ slotKey: string; n: number } | null>(
    null
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const timer = useRef<number | null>(null);
  // 在对比页里交换 A/B、新建配装时，留在对比页
  const keepTab = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // 换配装时回到看板，收起导入框
  useEffect(() => {
    setReimport(false);
    setFlash(null);
    if (keepTab.current) keepTab.current = false;
    else setTab("board");
  }, [lo?.id]);

  const offline = state.dataState === "offline";
  const computing = !!pending || reimporting;

  const entry = lo ? drafts[lo.id] : undefined;
  const draft: GearDraft | null = lo
    ? entry &&
      entry.base.slots === lo.slots &&
      entry.base.big === lo.big &&
      entry.base.stone === lo.stone
      ? entry.d
      : draftOf(lo)
    : null;
  const dirty = !!lo && !!draft && draftChanges(lo, draft).length > 0;
  const setDraft = (d: GearDraft) => {
    if (!lo) return;
    const base = lo;
    setDrafts(m => ({ ...m, [base.id]: { base, d } }));
  };
  const clearDraft = (id: string) =>
    setDrafts(m => {
      const next = { ...m };
      delete next[id];
      return next;
    });

  const startCreate = (p: NewLoadoutInput) => {
    const prevId = lo?.id ?? null;
    const stay = tab === "compare";
    setPending(p);
    timer.current = window.setTimeout(() => {
      keepTab.current = stay;
      actions.createLoadout(p);
      // 从对比页新建：新配装是 A，原来那套是 B
      if (stay && prevId) setCompareB(prevId);
      setPending(null);
      actions.toast("manager", "success", `已新建「${p.name}」`);
    }, 1200);
  };

  const startReimport = (source: LoadoutSource, sourceId: string | null) => {
    if (!lo) return;
    const id = lo.id;
    setReimporting(true);
    timer.current = window.setTimeout(() => {
      actions.reimportLoadout(id, source, sourceId);
      setReimporting(false);
      setReimport(false);
      setTab("board");
      actions.toast("manager", "success", "已重新导入，配装没有变化");
    }, 1200);
  };

  const openNew = () => setNewOpen(true);
  const newDialog = (
    <NewLoadoutDialog
      open={newOpen}
      defaultXinfa={lo?.xinfa}
      onClose={() => setNewOpen(false)}
      onStart={startCreate}
    />
  );

  if (!lo && !pending) {
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
              onClick={openNew}
            >
              新建配装
            </Btn>
          }
        />
        {newDialog}
      </div>
    );
  }

  const showImport = !lo || reimport || computing;
  const xinfa = pending?.xinfa ?? lo!.xinfa;
  const v = latest(findScheme(state, xinfa, "PVE"));
  const talentSource = v ? `${xinfa} PVE v${v.version}` : null;
  const charOf = (id: string | null) =>
    id ? state.characters.find(c => c.id === id) : undefined;
  const linked = lo ? charOf(lo.charId) : undefined;

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
                <IconBtn
                  label="编辑配装"
                  onClick={() => setEditOpen(true)}
                  className="h-8 w-8"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            ) : null
          }
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="tablist"
            aria-label="配装"
            className="flex flex-wrap items-center gap-1.5"
          >
            {list.map((l, i) => {
              const active = !pending && l.id === lo?.id;
              const c = charOf(l.charId);
              // 不同心法之间加一条细线分组
              const newGroup = i > 0 && list[i - 1].xinfa !== l.xinfa;
              return (
                <Fragment key={l.id}>
                  {newGroup && (
                    <span
                      className="mx-1 h-4 w-px bg-paper/10"
                      aria-hidden="true"
                    />
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={computing}
                    title={`${l.xinfa} · ${l.name}${c ? ` · 关联 ${c.name}` : ""}`}
                    onClick={() => actions.selectLoadout(l.id)}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] ring-1 ring-inset transition-colors disabled:cursor-default",
                      active
                        ? "bg-paper/[0.08] text-paper ring-paper/12"
                        : "text-paper-2 ring-transparent hover:bg-paper/[0.04] hover:text-paper"
                    )}
                  >
                    <XinfaMark xinfa={l.xinfa} size={18} />
                    {l.name}
                    {c && (
                      <CharAvatar
                        character={c}
                        size={16}
                        className="-mr-0.5 opacity-90"
                      />
                    )}
                  </button>
                </Fragment>
              );
            })}
            {pending && (
              <span
                role="tab"
                aria-selected
                className="flex h-8 items-center gap-2 rounded-lg bg-paper/[0.08] px-2.5 text-[13px] text-paper ring-1 ring-inset ring-paper/12"
              >
                <XinfaMark xinfa={pending.xinfa} size={18} />
                {pending.name}
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-paper-3"
                  aria-label="正在计算"
                />
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openNew}
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
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => {
                    setTab(k);
                    setFlash(null);
                  }}
                  className={cn(
                    "relative h-9 text-[13.5px] transition-colors",
                    tab === k
                      ? "font-medium text-paper"
                      : "text-paper-3 hover:text-paper-2"
                  )}
                >
                  {label}
                  {k === "editor" && dirty && (
                    <span
                      className="ml-1 inline-block h-1.5 w-1.5 -translate-y-1.5 rounded-full bg-cinnabar"
                      aria-label="有未保存的改动"
                    />
                  )}
                  {tab === k && (
                    <span
                      className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-cinnabar"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            {tab !== "compare" && (
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
            )}
          </div>
        )}
      </div>

      {showImport ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
          <ImportCard
            key={lo?.id ?? "new"}
            title={`重新导入「${lo?.name ?? pending?.name}」`}
            charName={linked?.name}
            xinfa={xinfa}
            talentSource={talentSource}
            offline={offline}
            computing={computing}
            onCancel={() => setReimport(false)}
            onImport={startReimport}
          />
        </div>
      ) : tab === "board" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
          <Dashboard
            loadout={lo!}
            onTry={(slotKey, itemId) => {
              const def = getEquipDb(primaryAttr(lo!.xinfa))?.[
                partOf(slotKey)
              ]?.find(d => d.id === itemId);
              if (def && draft)
                setDraft({
                  ...draft,
                  slots: draft.slots.map(s =>
                    s.key === slotKey ? equipSlot(s, def) : s
                  ),
                });
              setFlash({ slotKey, n: Date.now() });
              setTab("editor");
            }}
            onOpenChangelog={() => actions.openChangelog(lo!.xinfa)}
            onOpenBuffs={() => setTab("buffs")}
          />
          <p className="mt-3 text-[11.5px] text-paper-3">
            木桩理想环境下的期望值，适合比较同一心法的不同配装
            <button
              type="button"
              onClick={() => setTab("compare")}
              className="ml-2 text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
            >
              对比
            </button>
          </p>
        </div>
      ) : tab === "buffs" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
          <BuffsView
            loadout={lo!}
            onChange={sel => actions.setLoadoutBuffs(lo!.id, sel)}
            onNotice={text => actions.toast("manager", "info", text)}
          />
        </div>
      ) : tab === "compare" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
          <CompareView
            a={lo!}
            bId={compareB}
            onPickB={setCompareB}
            onSwap={bId => {
              keepTab.current = true;
              setCompareB(lo!.id);
              actions.selectLoadout(bId);
            }}
            onOpen={id => actions.selectLoadout(id)}
            onCreate={openNew}
          />
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8">
          <GearEditor
            key={lo!.id}
            lo={lo!}
            draft={draft!}
            onDraft={setDraft}
            flash={flash}
            onSave={() => {
              const dps = actions.saveGearDraft(lo!.id, draft!);
              clearDraft(lo!.id);
              actions.toast(
                "manager",
                "success",
                `已保存，秒伤 ${fmt(Math.round(dps * buffFactor(lo!)))}`
              );
            }}
            onSaveAs={() => setSaveAsOpen(true)}
          />
        </div>
      )}
      {newDialog}
      {lo && draft && (
        <SaveAsDialog
          open={saveAsOpen}
          defaultName={`${lo.name} 改`}
          onClose={() => setSaveAsOpen(false)}
          onSave={name => {
            const from = lo.id;
            keepTab.current = true;
            actions.saveGearDraftAs(from, draft, name);
            clearDraft(from);
            setSaveAsOpen(false);
            actions.toast(
              "manager",
              "success",
              `已另存为「${name}」，「${lo.name}」没有改`
            );
          }}
        />
      )}
      {lo && (
        <EditLoadoutDialog
          loadout={lo}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

/** 另存为新配装：只填名称；同心法，不关联角色 */
function SaveAsDialog({
  open,
  defaultName,
  onClose,
  onSave,
}: {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);
  const v = name.trim();
  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="另存为新配装"
      width={380}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" disabled={!v} onClick={() => onSave(v)}>
            另存
          </Btn>
        </>
      }
    >
      <label
        className="block text-[12.5px] text-paper-3"
        htmlFor="save-as-name"
      >
        名称
      </label>
      <input
        id="save-as-name"
        data-autofocus
        value={name}
        maxLength={12}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && v) onSave(v);
        }}
        className={cn(inputCls(), "mt-1.5")}
      />
    </InlineModal>
  );
}
