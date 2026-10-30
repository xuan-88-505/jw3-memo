import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/common/ui";
import { findScheme, latest, loadoutList, useProto } from "@/state/store";
import {
  draftChanges,
  draftOf,
  type GearDraft,
  type Loadout,
  type LoadoutSource,
} from "@/data/gear";
import { InlineModal } from "@/components/common/overlay";
import { buffFactor } from "@/lib/buffs";
import { cn } from "@/lib/utils";
import { EmptyState, SectionHeader, inputCls } from "../shared";
import { BuffsView } from "./BuffsView";
import { NativeGearDialog } from "./native/NativeGearDialog";
import type { CalcInput } from "@/data/calcTypes";
import { fmt } from "./Dashboard";
import { GearEditorDialog } from "./GearEditorDialog";
import { GearOverview } from "./GearOverview";
import { ImportCard } from "./ImportCard";
import { LoadoutList } from "./LoadoutList";
import { EditLoadoutDialog, NewLoadoutDialog } from "./NewLoadoutDialog";
import type { GearConfig } from "@/data/enchants";
import { tx } from "@/lib/i18n";
import {
  calcSupported,
  isNewer,
  preloadEquipDb,
  readResult,
} from "@/lib/dpsCalc";
import { loadCatalog, useBundledCalc } from "@/lib/calcEngine";

type NewLoadoutInput = {
  xinfa: string;
  name: string;
  charId: string | null;
  source: LoadoutSource;
  sourceId: string | null;
  config?: GearConfig;
};

/**
 * 配装与木桩。左栏是配装列表（每套直接写装分），右边从上到下：
 * 面板（装分最大）、12 件装备、秒伤变化（默认收起）。换装备、附魔都在「配装器」里。
 * 配装按心法建，只有本人能看到；关联角色是可选的。
 */
export function GearView() {
  const { state, actions } = useProto();
  const list = loadoutList(state);
  const lo = list.find(l => l.id === state.activeLoadoutId) ?? list[0] ?? null;
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // 计算器支持的心法：备忘录自己的界面 + 内置原版计算核心（当季装备库）；其余用旧配装器
  const [nativeOpen, setNativeOpen] = useState(false);
  // 内置计算器在不在：桌面版都在；网页版的部署里没有，这时所有心法都用旧配装器
  const bundled = useBundledCalc();
  /** 用备忘录自己的配装器（原版在后台算）。还没查完时先当作在，桌面版一定在 */
  const nativeFor = (xinfa: string) =>
    calcSupported(xinfa) && bundled !== false;
  // 当季配装器的草稿：按配装存，关掉不丢。base 是建草稿时配装里存的输入，配装在外面变了就作废
  const [nativeDrafts, setNativeDrafts] = useState<
    Record<string, { base: CalcInput | undefined; input: CalcInput }>
  >({});
  const [nativeSaveAs, setNativeSaveAs] = useState<Loadout | null>(null);
  const [buffsOpen, setBuffsOpen] = useState(false);
  const [reimport, setReimport] = useState(false);
  // 正在算的新配装：算完之前也显示在列表里
  const [pending, setPending] = useState<NewLoadoutInput | null>(null);
  const [reimporting, setReimporting] = useState(false);
  // 配装器草稿：按配装存，关掉配装器不丢。base 是建草稿时的配装，配装在外面改了装备就作废
  const [drafts, setDrafts] = useState<
    Record<string, { base: Loadout; d: GearDraft }>
  >({});
  // 从装备列表点进配装器时，定位并闪一下这个部位
  const [flash, setFlash] = useState<{ slotKey: string; n: number } | null>(
    null
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const timer = useRef<number | null>(null);
  // 手动新建的配装：切过去以后直接打开配装器
  const openEditorFor = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // 换配装时收起导入框和弹窗；手动新建的打开配装器
  useEffect(() => {
    setReimport(false);
    setFlash(null);
    const want = !!lo && openEditorFor.current === lo.id;
    const calc = !!lo && nativeFor(lo.xinfa);
    setEditorOpen(want && !calc);
    setNativeOpen(want && calc);
    openEditorFor.current = null;
    setBuffsOpen(false);
  }, [lo?.id]);

  // 计算器写回的结果没来得及合进配装（比如算完直接关了软件）：进配装页时补上
  useEffect(() => {
    if (!lo || !calcSupported(lo.xinfa)) return;
    const r = readResult(lo.id);
    if (!r || !isNewer(lo, r)) return;
    const id = lo.id;
    void preloadEquipDb(lo.xinfa).then(() => actions.applyCalcResult(id, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const nativeEntry = lo ? nativeDrafts[lo.id] : undefined;
  const nativeInput =
    nativeEntry && lo && nativeEntry.base === lo.calc?.input
      ? nativeEntry.input
      : null;
  const setNativeInput = (input: CalcInput | null) => {
    if (!lo) return;
    const id = lo.id;
    const base = lo.calc?.input;
    setNativeDrafts(m => {
      const next = { ...m };
      if (input) next[id] = { base, input };
      else delete next[id];
      return next;
    });
  };
  const clearDraft = (id: string) =>
    setDrafts(m => {
      const next = { ...m };
      delete next[id];
      return next;
    });

  const startCreate = (p: NewLoadoutInput) => {
    const native = nativeFor(p.xinfa);
    // 手动配：不用算，直接建好并打开配装器
    if (p.source === "manual") {
      const id = actions.createLoadout(p);
      // 当季装备库加载过就马上换成当季；没加载过由 ManagerApp 里的 useSeasonSync 换
      if (native) actions.syncLoadoutSeason(id);
      // 切到新配装时 effect 读这个 id，打开配装器
      openEditorFor.current = id;
      actions.toast("manager", "success", tx("已新建「{0}」", p.name));
      return;
    }
    setPending(p);
    // 导入的：等当季装备库加载好再建，建好马上换成当季，外面不会先闪一下上赛季的数值
    const ready = native ? loadCatalog(p.xinfa).catch(() => null) : null;
    timer.current = window.setTimeout(() => {
      void Promise.resolve(ready).then(() => {
        const id = actions.createLoadout(p);
        if (native) actions.syncLoadoutSeason(id);
        setPending(null);
        actions.toast("manager", "success", tx("已新建「{0}」", p.name));
      });
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
      actions.toast("manager", "success", tx("已重新导入，配装没有变化"));
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
      <div className="scroll-thin flex h-full flex-col overflow-y-auto px-8 pb-10 pt-7">
        <SectionHeader title={tx("配装")} />
        <EmptyState
          icon="sword"
          title={tx("还没有配装")}
          description={tx("导入茗伊装备码、魔盒链接，或者手动配")}
          action={
            <Btn
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              disabled={offline}
              title={offline ? tx("离线时不能导入") : undefined}
              onClick={openNew}
            >
              {tx("新建配装")}
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

  return (
    <div className="flex h-full">
      <LoadoutList
        list={list}
        currentId={lo?.id ?? null}
        pending={pending}
        disabled={computing}
        newDisabled={offline || computing}
        newTitle={offline ? tx("离线时不能导入") : undefined}
        onSelect={id => actions.selectLoadout(id)}
        onNew={openNew}
      />

      {/* 右侧：面板、装备、秒伤变化；导入时换成导入框 */}
      <div className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-10 pt-5">
        {showImport ? (
          <ImportCard
            key={lo?.id ?? "new"}
            title={tx("重新导入「{0}」", lo?.name ?? pending?.name)}
            charName={linked?.name}
            xinfa={xinfa}
            talentSource={talentSource}
            offline={offline}
            computing={computing}
            onCancel={() => setReimport(false)}
            onImport={startReimport}
          />
        ) : (
          <GearOverview
            lo={lo!}
            charName={linked?.name}
            dirty={nativeFor(lo!.xinfa) ? !!nativeInput : dirty}
            offline={offline}
            onEdit={() => setEditOpen(true)}
            onReimport={() => setReimport(true)}
            onOpenEditor={slotKey => {
              setFlash(slotKey ? { slotKey, n: Date.now() } : null);
              if (nativeFor(lo!.xinfa)) setNativeOpen(true);
              else setEditorOpen(true);
            }}
            onOpenBuffs={() => setBuffsOpen(true)}
            onOpenChangelog={() => actions.openChangelog(lo!.xinfa)}
          />
        )}
      </div>

      {newDialog}
      {lo && nativeFor(lo.xinfa) && (
        <NativeGearDialog
          key={lo.id}
          open={nativeOpen}
          onClose={() => setNativeOpen(false)}
          lo={lo}
          input={nativeInput}
          onInput={setNativeInput}
          flash={flash}
          onSave={(next, changes) => {
            actions.saveEngineGear(lo.id, next, changes);
            setNativeInput(null);
            setNativeOpen(false);
            actions.toast(
              "manager",
              "success",
              tx("已保存，秒伤 {0}", fmt(next.dps))
            );
          }}
          onSaveAs={next => setNativeSaveAs(next)}
        />
      )}
      {lo && nativeSaveAs && (
        <SaveAsDialog
          open
          defaultName={tx("{0} 改", lo.name)}
          onClose={() => setNativeSaveAs(null)}
          onSave={name => {
            const from = lo.id;
            actions.saveEngineGearAs(from, nativeSaveAs, name);
            setNativeDrafts(m => {
              const next = { ...m };
              delete next[from];
              return next;
            });
            setNativeSaveAs(null);
            setNativeOpen(false);
            actions.toast(
              "manager",
              "success",
              tx("已另存为「{0}」，「{1}」没有改", name, lo.name)
            );
          }}
        />
      )}
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
              tx("已保存，秒伤 {0}", fmt(Math.round(dps * buffFactor(lo))))
            );
          }}
          onSaveAs={() => setSaveAsOpen(true)}
        />
      )}
      {lo && draft && (
        <SaveAsDialog
          open={saveAsOpen}
          defaultName={tx("{0} 改", lo.name)}
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
              tx("已另存为「{0}」，「{1}」没有改", name, lo.name)
            );
          }}
        />
      )}
      {/* 只给以前加过增益的配装用：秒伤后面的增益名可以点开改 */}
      {lo && (
        <InlineModal
          open={buffsOpen}
          onClose={() => setBuffsOpen(false)}
          title={tx("增益详情")}
          width={880}
          bodyMaxHeight={640}
          footer={
            <Btn
              variant="primary"
              size="md"
              onClick={() => setBuffsOpen(false)}
            >
              {tx("完成")}
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
      title={tx("另存为新配装")}
      width={380}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" disabled={!v} onClick={() => onSave(v)}>
            {tx("另存")}
          </Btn>
        </>
      }
    >
      <label
        className="block text-[12.5px] text-paper-3"
        htmlFor="save-as-name"
      >
        {tx("名称")}
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
