import { ExternalLink, Pencil, Plus, RefreshCw, Shirt } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
import { buffFactor, buffLabel, estimateBuffs } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { EmptyState, SectionHeader, inputCls } from "../shared";
import { BuffsView } from "./BuffsView";
import { CompareView } from "./CompareView";
import { DpsSummary, GainsPanel, HistoryPanel, fmt } from "./Dashboard";
import { GearEditorDialog } from "./GearEditorDialog";
import { ImportCard } from "./ImportCard";
import { LoadoutSwitcher } from "./LoadoutSwitcher";
import { EditLoadoutDialog, NewLoadoutDialog } from "./NewLoadoutDialog";
import { PanelList } from "./PanelList";
import type { GearConfig } from "@/data/enchants";

type Tab = "history" | "gains" | "compare";

const TABS: [Tab, string][] = [
  ["history", "秒伤变化"],
  ["gains", "属性收益"],
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

const blockTitle = "text-[12.5px] font-medium text-paper-2";

function ConfigRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-3 py-1">
      <dt className="w-8 shrink-0 text-[12.5px] text-paper-3">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-[12.5px] text-paper-2">
        {children}
      </dd>
    </div>
  );
}

/**
 * 配装与木桩，结构照 dps.btcsg.top：
 * 左栏是配装卡、面板、「配装器」、战斗配置、「增益详情」；右边是木桩秒伤和页签。
 * 配装按心法建，只有本人能看到；关联角色是可选的。
 */
export function GearView() {
  const { state, actions } = useProto();
  const list = loadoutList(state);
  const lo = list.find(l => l.id === state.activeLoadoutId) ?? list[0] ?? null;
  const [tab, setTab] = useState<Tab>("history");
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [buffsOpen, setBuffsOpen] = useState(false);
  const [reimport, setReimport] = useState(false);
  // 正在算的新配装：算完之前也显示在配装卡上
  const [pending, setPending] = useState<NewLoadoutInput | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const [compareB, setCompareB] = useState<string | null>(null);
  // 配装器草稿：按配装存，关掉配装器不丢。base 是建草稿时的配装，配装在外面改了装备就作废
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
  // 手动新建的配装：切过去以后直接打开配装器
  const openEditorFor = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // 换配装时回到秒伤变化，收起导入框和弹窗；手动新建的打开配装器
  useEffect(() => {
    setReimport(false);
    setFlash(null);
    setEditorOpen(!!lo && openEditorFor.current === lo.id);
    openEditorFor.current = null;
    setBuffsOpen(false);
    if (keepTab.current) keepTab.current = false;
    else setTab("history");
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
    // 手动配：不用算，直接建好并打开配装器
    if (p.source === "manual") {
      keepTab.current = stay;
      // 切到新配装时 effect 读这个 id，打开配装器
      openEditorFor.current = actions.createLoadout(p);
      if (stay && prevId) setCompareB(prevId);
      actions.toast("manager", "success", `已新建「${p.name}」`);
      return;
    }
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
      setTab("history");
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
          description="导入茗伊装备码、魔盒链接，或者手动配"
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
  const linked = lo
    ? state.characters.find(c => c.id === lo.charId)
    : undefined;
  const buffed = !!lo && estimateBuffs(lo, lo.buffs).pct > 0.00005;

  const onTry = (slotKey: string, itemId: number) => {
    if (!lo || !draft) return;
    const def = getEquipDb(primaryAttr(lo.xinfa))?.[partOf(slotKey)]?.find(
      d => d.id === itemId
    );
    if (def)
      setDraft({
        ...draft,
        slots: draft.slots.map(s =>
          s.key === slotKey ? equipSlot(s, def) : s
        ),
      });
    setFlash({ slotKey, n: Date.now() });
    setEditorOpen(true);
  };

  return (
    <div className="flex h-full">
      {/* 左栏：配装卡、面板、配装器、战斗配置 */}
      <aside
        aria-label="配装"
        className="scroll-thin w-[264px] shrink-0 overflow-y-auto border-r border-paper/[0.07] px-4 pb-6 pt-5"
      >
        <LoadoutSwitcher
          list={list}
          current={lo}
          pending={pending}
          disabled={computing}
          newDisabled={offline}
          newTitle={offline ? "离线时不能导入" : undefined}
          onSelect={id => actions.selectLoadout(id)}
          onNew={openNew}
        />
        {lo && !pending && (
          <>
            <PanelList
              className="mt-5"
              xinfa={lo.xinfa}
              panel={lo.panel}
              hasteValue={lo.haste.value}
              note={buffed ? "不含增益" : undefined}
            />
            <Btn
              variant="primary"
              size="md"
              className="mt-4 w-full"
              disabled={showImport}
              onClick={() => setEditorOpen(true)}
            >
              配装器
            </Btn>
            {dirty && (
              <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11.5px] text-paper-3">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-cinnabar"
                  aria-hidden="true"
                />
                有没保存的改动
              </p>
            )}

            <section aria-label="战斗配置" className="mt-6">
              <h3 className={blockTitle}>战斗配置</h3>
              <dl className="mt-1">
                <ConfigRow label="目标">{lo.target}</ConfigRow>
                <ConfigRow label="奇穴">
                  {talentSource ?? "配装里自带的"}
                </ConfigRow>
                <ConfigRow label="增益">
                  <span className={cn(buffed && "text-jade")}>
                    {buffLabel(lo.buffs)}
                  </span>
                </ConfigRow>
              </dl>
              <Btn
                size="md"
                className="mt-2.5 w-full"
                disabled={showImport}
                onClick={() => setBuffsOpen(true)}
              >
                增益详情
              </Btn>
            </section>
          </>
        )}
      </aside>

      {/* 右侧：木桩秒伤和页签；导入时换成导入框 */}
      <div className="scroll-thin min-w-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
        {showImport ? (
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
        ) : (
          <>
            <DpsSummary
              lo={lo!}
              onOpenBuffs={() => setBuffsOpen(true)}
              actions={
                <>
                  {lo!.source === "jx3box" && lo!.sourceId && (
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
                  {lo!.source !== "manual" && (
                    <Btn
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      disabled={offline}
                      title={offline ? "离线时不能导入" : undefined}
                      onClick={() => setReimport(true)}
                    >
                      重新导入
                    </Btn>
                  )}
                  <IconBtn
                    label="编辑配装"
                    onClick={() => setEditOpen(true)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                </>
              }
              meta={
                <>
                  {dateLabel(lo!.importedAt)}{" "}
                  {lo!.source === "manual"
                    ? "手动新建"
                    : `从${SOURCE_LABEL[lo!.source]}导入`}
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  估算值，以游戏内为准
                  {lo!.sample && (
                    <span className="ml-2 rounded bg-paper/[0.07] px-1.5 py-px text-[11px] text-paper-2">
                      示例数据
                    </span>
                  )}
                </>
              }
            />

            <div
              role="tablist"
              aria-label="配装视图"
              className="mt-6 flex gap-5 border-b border-paper/[0.07]"
            >
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
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

            <div className="pt-5">
              {tab === "history" ? (
                <HistoryPanel
                  lo={lo!}
                  onOpenChangelog={() => actions.openChangelog(lo!.xinfa)}
                />
              ) : tab === "gains" ? (
                <GainsPanel lo={lo!} onTry={onTry} />
              ) : (
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
              )}
            </div>
          </>
        )}
      </div>

      {newDialog}
      {lo && draft && (
        <GearEditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          lo={lo}
          draft={draft}
          onDraft={setDraft}
          flash={flash}
          onSave={() => {
            const dps = actions.saveGearDraft(lo.id, draft);
            clearDraft(lo.id);
            setEditorOpen(false);
            actions.toast(
              "manager",
              "success",
              `已保存，秒伤 ${fmt(Math.round(dps * buffFactor(lo)))}`
            );
          }}
          onSaveAs={() => setSaveAsOpen(true)}
        />
      )}
      {lo && draft && (
        <SaveAsDialog
          open={saveAsOpen}
          defaultName={`${lo.name} 改`}
          onClose={() => setSaveAsOpen(false)}
          onSave={name => {
            const from = lo.id;
            actions.saveGearDraftAs(from, draft, name);
            clearDraft(from);
            setSaveAsOpen(false);
            setEditorOpen(false);
            actions.toast(
              "manager",
              "success",
              `已另存为「${name}」，「${lo.name}」没有改`
            );
          }}
        />
      )}
      {lo && (
        <InlineModal
          open={buffsOpen}
          onClose={() => setBuffsOpen(false)}
          title="增益详情"
          width={880}
          bodyMaxHeight={640}
          footer={
            <Btn
              variant="primary"
              size="md"
              onClick={() => setBuffsOpen(false)}
            >
              完成
            </Btn>
          }
        >
          <BuffsView
            loadout={lo}
            onChange={sel => actions.setLoadoutBuffs(lo.id, sel)}
            onNotice={text => actions.toast("manager", "info", text)}
          />
        </InlineModal>
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
