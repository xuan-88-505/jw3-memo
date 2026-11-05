import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  History,
  Info,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Anchored } from "@/components/common/Anchored";
import { XinfaMark } from "@/components/brand/Marks";
import { IconPickerButton } from "@/components/common/IconPicker";
import { InlineModal } from "@/components/common/overlay";
import {
  Avatar,
  Btn,
  btnClass,
  IconBtn,
  SectionLabel,
  Segmented,
} from "@/components/common/ui";
import { ME_ID, XINFA_LIST, layersOf, xinfasOf } from "@/data/seed";
import {
  MODES,
  type Macro,
  type Member,
  type Mode,
  type SchemeVersion,
} from "@/data/types";
import { diffVersions, hasGameChange } from "@/lib/diff";
import { pasteHint, relativeTime } from "@/lib/format";
import { jx3boxMacroUrl } from "@/lib/jx3box";
import { MACRO_LIMIT, cleanMacro, lintMacro } from "@/lib/macro";
import {
  activeSchemeId,
  canEdit,
  followedXinfa,
  isOnline,
  latest,
  listedSetIds,
  memberName,
  myCharacters,
  schemeById,
  trackedSets,
  useProto,
  type Draft,
  type ProtoState,
  isSolo,
} from "@/state/store";
import {
  customTitle,
  defaultSchemeTitle,
  schemeName,
  userSchemeName,
} from "@/lib/schemeSets";
import { cn } from "@/lib/utils";
import { DiffDetails, Field, diffSummary, inputCls } from "./shared";
import { XinfaPairSelect } from "./SchoolPicker";
import { TalentPicker } from "./TalentPicker";
import { TalentSetTabs } from "./TalentSetTabs";
import {
  MAX_TALENT_SETS,
  copyTalentFields,
  mapTalentSets,
  newTalentSetId,
  sameTalentSets,
  talentSetsOf,
  type TalentFields,
} from "@/lib/talentSets";
import {
  TalentScanButton,
  TalentScanNotice,
  useTalentScan,
} from "./TalentScan";
import { tx, txn, paren } from "@/lib/i18n";

export function SchemesView() {
  const { state } = useProto();
  const id = activeSchemeId(state);
  return (
    <div className="flex h-full min-h-0">
      <SchemeList />
      <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
        {id && <SchemeEditor key={id} schemeId={id} />}
      </div>
    </div>
  );
}

function SchemeList() {
  const { state, actions } = useProto();
  const editable = canEdit(state);
  const online = isOnline(state);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<{ xinfa: string; mode?: Mode }>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const activeId = activeSchemeId(state);
  // 从托盘「新建方案」进来：直接打开新建弹窗，心法和模式先填好
  useEffect(() => {
    const it = state.managerIntent;
    if (it && typeof it === "object" && "newScheme" in it) {
      setPrefill(it.newScheme);
      setCreating(true);
      actions.clearIntent();
    }
  }, [state.managerIntent, actions]);
  // 只列出有方案或正在新建方案的心法，按门派顺序；每个心法下一行一个方案
  const listed = XINFA_LIST.map(
    x => [x, listedSetIds(state, x)] as const
  ).filter(([, ids]) => ids.length > 0);
  // 和修改记录「全部」看到的一致：只数关注的心法
  const followed = followedXinfa(state);
  const versionCount = state.schemes
    .filter(s => followed.includes(s.xinfa))
    .reduce((n, s) => n + s.versions.length, 0);
  return (
    <div className="flex w-[236px] shrink-0 flex-col border-r border-paper/[0.07]">
      <nav
        aria-label={tx("方案列表")}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2.5 py-3"
      >
        {editable && (
          <Btn
            variant="secondary"
            size="md"
            className="mb-3 w-full"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreating(true)}
          >
            {tx("新建")}
          </Btn>
        )}
        {listed.length === 0 && (
          <p className="px-2 py-8 text-center text-[12.5px] text-paper-3">
            {tx("还没有方案")}
          </p>
        )}
        <ul className="space-y-3">
          {listed.map(([x, ids]) => (
            <li key={x} className="group/x">
              <div className="flex h-7 items-center gap-2 px-2">
                <XinfaMark xinfa={x} size={20} />
                <span className="text-[13.5px] font-semibold text-paper">
                  {x}
                </span>
                {editable && (
                  <IconBtn
                    label={tx("给{0}新建方案", x)}
                    onClick={() => {
                      setPrefill({ xinfa: x });
                      setCreating(true);
                    }}
                    className="ml-auto h-6 w-6 text-paper-3 opacity-0 focus-visible:opacity-100 group-hover/x:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </IconBtn>
                )}
              </div>
              <ul>
                {ids.map(id => (
                  <SchemeRow
                    key={id}
                    id={id}
                    active={activeId === id}
                    onDelete={
                      editable && online ? () => setDeleting(id) : undefined
                    }
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <NewSchemeDialog
          open={creating}
          initial={prefill}
          onClose={() => {
            setCreating(false);
            setPrefill(undefined);
          }}
        />
        <DeleteSchemeDialog id={deleting} onClose={() => setDeleting(null)} />
      </nav>
      {/* 二级页入口：所有方案的修改时间线 */}
      <div className="p-2">
        <button
          type="button"
          onClick={() => actions.openChangelog()}
          className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-paper-2 transition-colors hover:bg-paper/[0.05] hover:text-paper"
        >
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left">{tx("修改记录")}</span>
          {versionCount > 0 && (
            <span className="text-[11.5px] tabular-nums text-paper-3">
              {versionCount}
            </span>
          )}
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-paper-3"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}

/** 已保存的方案或还没保存的新方案：名字、心法、模式、宏 */
function schemeInfo(state: ProtoState, id: string | null | undefined) {
  if (!id) return null;
  const scheme = schemeById(state, id);
  const draft = state.drafts[id];
  const last = latest(scheme);
  const src = draft ?? last;
  if (!src) return null;
  const xinfa = scheme?.xinfa ?? draft!.xinfa;
  const mode = scheme?.mode ?? draft!.mode;
  const title = scheme?.title ?? draft?.title;
  return {
    scheme,
    draft,
    last,
    xinfa,
    mode,
    title,
    // 没起标题时用第一段宏的名字（草稿里正在改的也算）
    name: schemeName({ title, xinfa, mode }, src),
    named: !!userSchemeName({ title, xinfa, mode }, src),
    macros: src.macros,
  };
}

/**
 * 左栏一行一个方案：名字（PVP 的写上 PVP）、几段宏、有没保存的修改。
 * 不写谁、什么时候改的：创建人在右边标题下面，修改时间在修改记录里。
 * 悬停时段数的位置换成删除按钮。
 */
function SchemeRow({
  id,
  active,
  onDelete,
}: {
  id: string;
  active: boolean;
  /** 能删时才传：只读成员、离线时不传 */
  onDelete?: () => void;
}) {
  const { state, actions } = useProto();
  const info = schemeInfo(state, id);
  if (!info) return null;
  const { last, draft, mode, name } = info;
  // 没有用户填的名字时，名字里已经有「PVP」，不再加标签
  const pvpTag = mode === "PVP" && info.named;
  const count = txn("{0} 段", info.macros.length);
  // 圆点之外，读屏也要知道有没保存
  const unsaved = !last
    ? tx("新建中，未保存")
    : draft
      ? tx("有未保存的修改")
      : "";
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => actions.selectScheme(id)}
        aria-current={active ? "page" : undefined}
        aria-label={`${name}${pvpTag ? " · PVP" : ""} · ${count}${unsaved ? ` · ${unsaved}` : ""}`}
        className={cn(
          "flex w-full items-start gap-2 rounded-md py-1.5 pl-[36px] pr-2 text-left transition-colors",
          active
            ? "bg-paper/[0.08] text-paper"
            : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="min-w-0 text-[13px] font-medium leading-5 [overflow-wrap:anywhere]">
              {name}
            </span>
            {pvpTag && (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-px text-[10px] font-medium tracking-wide",
                  active
                    ? "bg-paper/[0.1] text-paper"
                    : "bg-paper/[0.05] text-paper-2"
                )}
              >
                PVP
              </span>
            )}
          </span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "text-[11.5px] tabular-nums text-paper-3 transition-opacity",
              onDelete &&
                "group-focus-within/row:opacity-0 group-hover/row:opacity-0"
            )}
          >
            {count}
          </span>
          {/* 圆点固定占位，各行的段数才能对齐 */}
          <span
            className={cn("h-1.5 w-1.5 rounded-full", draft && "bg-gold")}
            aria-hidden="true"
            title={draft ? tx("有未保存的修改") : undefined}
          />
        </span>
      </button>
      {onDelete && (
        <IconBtn
          label={tx("删除方案 {0}", name)}
          onClick={onDelete}
          className="absolute right-[18px] top-1 h-6 w-6 text-paper-3 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      )}
    </li>
  );
}

/** 删除方案前确认：版本和修改记录一起删，不能恢复 */
function DeleteSchemeDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const info = schemeInfo(state, id);
  if (!id || !info) return null;
  const versions = info.scheme?.versions.length ?? 0;
  const remove = () => {
    if (info.scheme) actions.deleteScheme(id);
    else actions.discardDraft(id);
    actions.toast("manager", "success", tx("已删除「{0}」", info.name));
    onClose();
  };
  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("删除「{0}」？", info.name)}
      width={400}
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="danger" size="md" onClick={remove}>
            {tx("删除")}
          </Btn>
        </>
      }
    >
      <p className="pb-1 text-[13px] leading-relaxed text-paper-2">
        {!versions
          ? tx("这个方案还没保存，删除后填的内容不会保留。")
          : isSolo(state)
            ? tx(
                "{0} 段宏和 {1} 个版本的修改记录会一起删除，不能恢复。",
                info.macros.length,
                versions
              )
            : tx(
                "{0} 段宏和 {1} 个版本的修改记录会一起删除，亲友团里的人也看不到了，不能恢复。",
                info.macros.length,
                versions
              )}
      </p>
    </InlineModal>
  );
}

/**
 * 新建方案（一套宏）：选心法、写名字、选模式。同一个心法可以有好几个方案。
 * 奇穴先照搬这个心法正在看的方案（没有就第一个），宏是空的。
 */
function NewSchemeDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  /** 预先填好的心法和模式（从心法行的「+」、托盘「新建方案」进来时） */
  initial?: { xinfa: string; mode?: Mode };
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const online = isOnline(state);
  const [xinfa, setXinfa] = useState(XINFA_LIST[0]);
  const [mode, setMode] = useState<Mode>("PVE");
  const [title, setTitle] = useState("");
  const selected = schemeInfo(state, activeSchemeId(state));
  // 默认：正在看的方案的心法；没有就你角色玩的第一个心法
  const pickDefault = () =>
    selected?.xinfa ??
    myCharacters(state).flatMap(xinfasOf)[0] ??
    XINFA_LIST[0];

  // 每次打开时重新选默认值
  useEffect(() => {
    if (!open) return;
    setXinfa(initial?.xinfa ?? pickDefault());
    setMode(initial?.mode ?? "PVE");
    setTitle("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const siblings = listedSetIds(state, xinfa)
    .map(id => schemeInfo(state, id))
    .filter(x => !!x);
  const source =
    selected && selected.xinfa === xinfa
      ? selected
      : siblings[0]
        ? siblings[0]
        : null;
  const sourceId = source && (source.scheme?.id ?? source.draft?.schemeId);
  const placeholder =
    defaultSchemeTitle(siblings, xinfa, mode) ?? `${xinfa} · ${mode}`;
  const create = () => {
    if (!online) return;
    actions.startNewScheme({
      xinfa,
      mode,
      title,
      talentsFrom: sourceId || undefined,
    });
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("新建方案")}
      width={420}
      footer={
        <>
          {!online && (
            <span className="mr-auto text-[12px] text-gold">
              {tx("离线时不能新建")}
            </span>
          )}
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" size="md" onClick={create} disabled={!online}>
            {tx("创建")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label={tx("心法")} htmlFor="new-scheme-xinfa">
          <XinfaPairSelect
            id="new-scheme-xinfa"
            autoFocus={!initial}
            value={xinfa}
            onChange={setXinfa}
          />
        </Field>
        <Field label={tx("名称")} htmlFor="new-scheme-title">
          <input
            id="new-scheme-title"
            data-autofocus={initial ? true : undefined}
            value={title}
            maxLength={24}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") create();
            }}
            placeholder={placeholder}
            className={cn(inputCls(false), "w-full")}
          />
        </Field>
        <div>
          <p className="mb-1.5 text-[12.5px] text-paper-2">{tx("模式")}</p>
          <Segmented<Mode>
            label={tx("模式")}
            value={mode}
            onChange={setMode}
            options={MODES.map(m => ({ value: m, label: m }))}
          />
        </div>
        <p className="text-[12px] leading-relaxed text-paper-3">
          {source
            ? tx("奇穴先照搬「{0}」，宏是空的", source.name)
            : tx("宏是空的，建好后点「新增」加一段")}
        </p>
      </div>
    </InlineModal>
  );
}

function sameContent(a: { macros: Macro[] } & TalentFields, b?: SchemeVersion) {
  if (!b) return false;
  if (!sameTalentSets(a, b)) return false;
  if (a.macros.length !== b.macros.length) return false;
  return a.macros.every((m, i) => {
    const o = b.macros[i];
    return (
      o &&
      o.id === m.id &&
      o.name === m.name &&
      o.icon === m.icon &&
      o.content === m.content &&
      (o.note ?? "") === (m.note ?? "")
    );
  });
}

/**
 * 方案标题：点一下直接改，回车或点别处保存，Esc 取消。
 * 清空后恢复默认：第一段宏的名字，没有宏时是「心法 · 模式」。改标题不产生新版本。
 */
function SchemeTitle({
  schemeId,
  title,
  fallback,
  editable,
}: {
  schemeId: string;
  title: string | undefined;
  fallback: string;
  editable: boolean;
}) {
  const { actions } = useProto();
  const shown = title || fallback;
  const [value, setValue] = useState(shown);
  const cancelRef = useRef(false);

  useEffect(() => setValue(title || fallback), [title, fallback]);

  if (!editable) {
    return (
      <h1 className="break-words text-[20px] font-semibold leading-tight">
        {shown}
      </h1>
    );
  }

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setValue(shown);
      return;
    }
    const t = value.trim();
    // 清空或改回默认，都算恢复默认标题
    const next = t === fallback ? "" : t;
    if (next === (title ?? "")) {
      setValue(shown);
      return;
    }
    actions.renameScheme(schemeId, next);
    setValue(next || fallback);
    actions.toast(
      "manager",
      "success",
      next ? tx("标题已改为「{0}」", next) : tx("已恢复默认标题")
    );
  };

  return (
    <h1 className="text-[20px] font-semibold leading-tight">
      {/* 隐藏的文字和输入框叠在同一格：宽度跟着文字走，放不下时两者一起折行、一起长高 */}
      <span className="-ml-1.5 inline-grid max-w-full align-middle">
        <span
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words px-1.5 py-1.5"
        >
          {(value || fallback) + " "}
        </span>
        <textarea
          rows={1}
          value={value}
          maxLength={24}
          spellCheck={false}
          aria-label={tx("方案标题")}
          title={tx("点击修改标题，清空后恢复默认")}
          placeholder={fallback}
          // 标题只有一行：粘贴进来的换行换成空格
          onChange={e => setValue(e.target.value.replace(/\s*\n\s*/g, " "))}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              cancelRef.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={commit}
          className={cn(
            "col-start-1 row-start-1 block h-full w-full min-w-0 resize-none overflow-hidden rounded-md bg-transparent px-1.5 py-1.5 text-paper outline-none transition-colors placeholder:text-paper-3",
            "hover:bg-paper/[0.05] focus:bg-paper/[0.04] focus:ring-1 focus:ring-inset focus:ring-cinnabar-text/50"
          )}
        />
      </span>
    </h1>
  );
}

/**
 * 方案标题行：图标 | 标题和下面一行弱的说明 | 操作（新增宏、魔盒）。
 * 说明行写心法和模式（起了名字时）、创建人（亲友团里）；没有内容时不占位置。
 * 标题和说明都能折行，操作按钮不缩，所以任何语言、任何窗口宽度下都不会被截断。
 */
function SchemeHeader({
  mark,
  title,
  meta,
  actions,
}: {
  mark: ReactNode;
  title: ReactNode;
  /** 说明行的几项，用「·」隔开 */
  meta: ReactNode[];
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="shrink-0">{mark}</div>
      <div className="min-w-0 flex-1">
        {title}
        {meta.length > 0 && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-paper-3">
            {meta.map((item, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <span className="whitespace-nowrap">{item}</span>
              </Fragment>
            ))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}
/** 「{0} 创建」：按当前语言的语序把头像和名字放进 {0}，比如英文是 Created by 八八 */
function CreatedBy({
  member,
  name,
}: {
  member: Member | undefined;
  name: string;
}) {
  const [before = "", after = ""] = tx("{0} 创建").split("{0}");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {before.trim() && <span>{before.trim()}</span>}
      {member && <Avatar member={member} size={16} />}
      <span className="text-paper-2">{name}</span>
      {after.trim() && <span>{after.trim()}</span>}
    </span>
  );
}
function SchemeEditor({ schemeId }: { schemeId: string }) {
  const { state, actions } = useProto();
  const scheme = schemeById(state, schemeId);
  const last = latest(scheme);
  const draft = state.drafts[schemeId];
  const xinfa = scheme?.xinfa ?? draft?.xinfa ?? "";
  const mode: Mode = scheme?.mode ?? draft?.mode ?? "PVE";
  const editable = canEdit(state);
  const online = isOnline(state);
  const [saving, setSaving] = useState(false);
  // 新宏加在最后，宏多时在屏幕外：加完滚过去、选中名字，看得到加在哪
  const [revealId, setRevealId] = useState<string | null>(null);

  /** 只有自己一个人时，不显示创建人 */
  const solo = isSolo(state);
  const creatorId = scheme?.versions[0]?.authorId;
  const creator = state.members.find(m => m.id === creatorId);
  const hasContent = !!last || !!draft;
  // 多套奇穴：当前在看哪一套；刚加的一套直接改名
  const [activeSet, setActiveSet] = useState<string>("main");
  const [renamingSet, setRenamingSet] = useState<string | null>(null);
  const src = draft ?? last;
  const rawTitle = scheme?.title ?? draft?.title;
  const sets = src ? talentSetsOf(src) : [];
  // 放弃修改后刚加的那套没了：回到第一套
  const curSet = sets.find(x => x.id === activeSet) ?? sets[0];
  const curSetId = curSet?.id ?? "main";
  const editSet = (id: string, fn: (t: number[]) => number[]) =>
    actions.editDraft(schemeId, d =>
      mapTalentSets(d, list =>
        list.map(x => (x.id === id ? { ...x, talents: fn(x.talents) } : x))
      )
    );
  // 截图识别奇穴：认出的层直接改进草稿里当前这一套
  const scan = useTalentScan({
    xinfa,
    resetKey: `${schemeId}:${curSetId}`,
    talents: curSet?.talents ?? [],
    enabled: editable && hasContent,
    onApply: talents => editSet(curSetId, () => talents),
    pasteKey: pasteHint(state.platform),
    // 截图是别的心法：给它新建方案（和「新建」一样先是草稿）、带上认出的奇穴，打开它接着写宏
    onCreateFor: (x, talents) => {
      if (!isOnline(state)) {
        actions.toast("manager", "error", tx("离线时不能新建"));
        return;
      }
      const id = actions.startNewScheme({ xinfa: x, mode: "PVE" });
      actions.editDraft(id, d =>
        mapTalentSets(d, list =>
          list.map((t, i) => (i === 0 ? { ...t, talents } : t))
        )
      );
      actions.toast(
        "manager",
        "success",
        tx("新建了{0}的方案，奇穴已选上，写好宏后保存", x)
      );
    },
  });

  // 左栏只列出有内容的方案，删掉后这里也不会再显示它
  if (!hasContent) return null;

  const view = draft ?? last!;
  const baseSets = last ? talentSetsOf(last) : undefined;
  const addSet = () => {
    const id = newTalentSetId();
    // 从当前这一套复制：几套之间通常只差几层
    actions.editDraft(schemeId, d =>
      mapTalentSets(d, list => [
        ...list,
        { id, name: "", talents: [...(curSet?.talents ?? d.talents)] },
      ])
    );
    setActiveSet(id);
    setRenamingSet(id);
  };
  const renameSet = (id: string, name: string) => {
    if ((sets.find(x => x.id === id)?.name ?? "") === name) return;
    actions.editDraft(schemeId, d =>
      mapTalentSets(d, list =>
        list.map(x => (x.id === id ? { ...x, name } : x))
      )
    );
  };
  const removeSet = (id: string) => {
    const i = sets.findIndex(x => x.id === id);
    if (i <= 0) return;
    actions.editDraft(schemeId, d =>
      mapTalentSets(d, list => list.filter(x => x.id !== id))
    );
    setActiveSet(sets[i - 1].id);
  };
  const dirty = !!draft && !sameContent(draft, last);
  const errors = view.macros.flatMap(m =>
    lintMacro(m.content)
      .filter(l => l.level === "error")
      .map(l => `${m.name || tx("未命名宏")}：${l.text}`)
  );
  const nameMissing = view.macros.some(m => !m.name.trim());
  // 可以只存奇穴，不要求有宏
  const blockReason = !online
    ? tx("离线时不能保存")
    : nameMissing
      ? tx("有宏没写名字")
      : errors.length
        ? errors[0]
        : "";

  const edit = (fn: (d: Draft) => Draft) => actions.editDraft(schemeId, fn);
  const setMacro = (id: string, patch: Partial<Macro>) =>
    edit(d => ({
      ...d,
      macros: d.macros.map(m => (m.id === id ? { ...m, ...patch } : m)),
    }));
  const addMacro = () => {
    const id = `${xinfa}-n${Date.now()}`;
    edit(d => ({
      ...d,
      macros: [
        ...d.macros,
        {
          id,
          name: tx("新宏 {0}", d.macros.length + 1),
          icon: 13,
          content: "/cast ",
          note: "",
        },
      ],
    }));
    setRevealId(id);
  };
  const removeMacro = (id: string) =>
    edit(d => ({ ...d, macros: d.macros.filter(m => m.id !== id) }));
  // 一段宏可以移到同心法的另一个方案，或移出去单独成一个新方案
  const moveTargets = listedSetIds(state, xinfa)
    .filter(id => id !== schemeId)
    .map(id => ({ id, name: schemeInfo(state, id)?.name ?? id }));
  const moveMacro = (macroId: string, toId: string | null) => {
    const target = actions.moveMacro(schemeId, macroId, toId);
    if (!target) return;
    const name = toId
      ? (moveTargets.find(t => t.id === toId)?.name ?? "")
      : tx("新方案");
    actions.toast(
      "manager",
      "info",
      tx("已移到「{0}」，两个方案都保存后才生效", name)
    );
  };

  const baseMacros = new Map((last?.macros ?? []).map(m => [m.id, m]));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-7 pb-6 pt-6">
        <SchemeHeader
          mark={<XinfaMark xinfa={xinfa} size={40} />}
          title={
            <SchemeTitle
              schemeId={schemeId}
              title={customTitle({ title: rawTitle, xinfa, mode })}
              fallback={schemeName(
                {
                  xinfa,
                  mode,
                  title: customTitle({ title: rawTitle, xinfa, mode })
                    ? undefined
                    : rawTitle,
                },
                src
              )}
              editable={editable && online}
            />
          }
          meta={[
            // 标题是用户填的名字时写心法和模式；否则标题本身就是这两个
            ...(userSchemeName({ title: rawTitle, xinfa, mode }, src)
              ? [`${xinfa} · ${mode}`]
              : []),
            ...(!last
              ? [tx("新方案，还没保存")]
              : !solo
                ? [
                    <CreatedBy
                      key="by"
                      member={creator}
                      name={creator?.name ?? memberName(state, creatorId ?? "")}
                    />,
                  ]
                : []),
          ]}
          actions={
            <>
              {/* 新方案从左栏心法行的「+」或「新建」建；修改记录从左栏底部进 */}
              {editable && (
                <Btn
                  variant="secondary"
                  size="sm"
                  aria-label={tx("新增宏")}
                  title={tx("新增宏")}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={addMacro}
                >
                  {tx("新增")}
                </Btn>
              )}
              <a
                href={jx3boxMacroUrl(xinfa)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tx("去魔盒看{0}的宏和奇穴", xinfa)}
                title={tx("去魔盒看{0}的宏和奇穴", xinfa)}
                className={cn(btnClass("secondary", "sm"), "gap-1")}
              >
                {tx("魔盒")}
                <ArrowUpRight
                  className="h-3.5 w-3.5 text-paper-3"
                  aria-hidden="true"
                />
              </a>
            </>
          }
        />

        {!editable && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-paper/[0.04] px-3 py-2 text-[12.5px] text-paper-2 ring-1 ring-inset ring-paper/10">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tx("只读成员不能修改")}
          </div>
        )}

        <div className="mt-7">
          <SectionLabel>{txn("宏 · {0} 段", view.macros.length)}</SectionLabel>
          <div className="mt-1 divide-y divide-paper/[0.07]">
            {view.macros.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-paper-3">
                {tx("还没有宏")}
              </p>
            )}
            {view.macros.map((m, i) => (
              <MacroEditor
                key={m.id}
                xinfa={xinfa}
                index={view.macros.length > 1 ? i + 1 : undefined}
                moveTargets={editable && online ? moveTargets : undefined}
                onMove={to => moveMacro(m.id, to)}
                macro={m}
                base={baseMacros.get(m.id)}
                hasBase={!!last}
                editable={editable}
                onChange={p => setMacro(m.id, p)}
                onRemove={() => removeMacro(m.id)}
                reveal={m.id === revealId}
                onRevealed={() => setRevealId(null)}
              />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SectionLabel
            right={
              editable && (
                <div className="flex items-center gap-1.5">
                  {sets.length < MAX_TALENT_SETS && (
                    <Btn
                      variant="secondary"
                      size="xs"
                      aria-label={tx("再加一套奇穴")}
                      title={tx("再加一套奇穴")}
                      icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={addSet}
                    >
                      {tx("一套")}
                    </Btn>
                  )}
                  <TalentScanButton
                    busy={scan.busy}
                    platform={state.platform}
                    onClick={() => void scan.pick()}
                  />
                </div>
              )
            }
          >
            {sets.length > 1
              ? tx("奇穴 · {0} 套", sets.length)
              : tx("奇穴 · 9 层")}
          </SectionLabel>
          {scan.fileInput}
          {/* 只剩一套但起了名字（面板会写这个名字）：也显示，才能改名 */}
          {(sets.length > 1 || !!sets[0]?.name.trim()) && (
            <div className="mt-3">
              <TalentSetTabs
                sets={sets}
                active={curSetId}
                baseline={baseSets}
                editable={editable}
                renaming={renamingSet}
                onSelect={setActiveSet}
                onRename={renameSet}
                onRemove={removeSet}
                onRenameEnd={() => setRenamingSet(null)}
              />
            </div>
          )}
          <div className="mt-3">
            {(scan.busy || scan.notice) && (
              <TalentScanNotice
                busy={scan.busy}
                notice={scan.notice}
                onUndo={scan.undo}
                onChoose={scan.choose}
                onCreate={scan.createFor}
                onClose={scan.dismiss}
              />
            )}
            <TalentPicker
              xinfa={xinfa}
              value={curSet?.talents ?? view.talents}
              // 新加的一套上一版没有，不逐层标修改（套名旁边已经标了）
              baseline={
                baseSets
                  ? baseSets.find(x => x.id === curSetId)?.talents
                  : undefined
              }
              disabled={!editable}
              onChange={talents => editSet(curSetId, () => talents)}
            />
          </div>
        </div>
      </div>

      {draft && (dirty || !last) && (
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-paper/[0.07] bg-ink-2/95 px-7 py-3 backdrop-blur">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gold"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-paper">
              {last ? tx("未保存的修改") : tx("新方案，未保存")}
            </p>
            {blockReason && (
              <p className="truncate text-[12px] text-cinnabar-text">
                {blockReason}
              </p>
            )}
          </div>
          <Btn
            variant="ghost"
            size="md"
            onClick={() => {
              // 放弃的是新建方案：左栏会自动选中别的方案
              actions.discardDraft(schemeId);
            }}
          >
            {last ? tx("放弃修改") : tx("放弃新建")}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            disabled={!!blockReason}
            onClick={() => setSaving(true)}
          >
            {tx("保存为 v{0}", (last?.version ?? 0) + 1)}
          </Btn>
        </div>
      )}

      {draft && (
        <SaveDialog
          open={saving}
          onClose={() => setSaving(false)}
          schemeId={schemeId}
          draft={draft}
          last={last}
        />
      )}
      <ConflictDialog schemeId={schemeId} />
    </div>
  );
}

/** 宏行上的「移到」：同心法的其他方案，最后一项是「新方案」 */
function MoveMacroButton({
  name,
  targets,
  onMove,
}: {
  name: string;
  targets: { id: string; name: string }[];
  onMove: (toId: string | null) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = tx("把 {0} 移到别的方案", name);
  const item = (key: string, text: string, to: string | null) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onMove(to);
      }}
      className="flex min-h-8 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-paper-2 [overflow-wrap:anywhere] hover:bg-paper/[0.06] hover:text-paper focus-visible:bg-paper/[0.06] focus-visible:outline-none"
    >
      {text}
    </button>
  );
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-paper-2 transition-colors hover:bg-paper/[0.08] hover:text-paper",
          open && "bg-paper/[0.08] text-paper"
        )}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <Anchored
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        width={220}
        label={tx("移到")}
      >
        <div role="menu" aria-label={tx("移到")} className="p-1">
          <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] text-paper-3">
            {tx("移到")}
          </p>
          {targets.map(t => item(t.id, t.name, t.id))}
          {targets.length > 0 && (
            <div className="my-1 h-px bg-paper/[0.07]" role="separator" />
          )}
          {item("new", tx("新方案"), null)}
        </div>
      </Anchored>
    </>
  );
}

function MacroEditor({
  xinfa,
  index,
  moveTargets,
  onMove,
  macro,
  base,
  hasBase,
  editable,
  onChange,
  onRemove,
  reveal = false,
  onRevealed,
}: {
  xinfa: string;
  /** 第几段；方案里只有一段时不传，不显示编号 */
  index?: number;
  /** 能移到的方案（同心法）；不能改时不传 */
  moveTargets?: { id: string; name: string }[];
  /** 移到另一个方案；null 表示移出去单独成一个新方案 */
  onMove: (toId: string | null) => void;
  macro: Macro;
  base?: Macro;
  hasBase: boolean;
  editable: boolean;
  onChange: (p: Partial<Macro>) => void;
  onRemove: () => void;
  /** 刚点「新增」加的宏：滚到它、选中名字、底色闪一下 */
  reveal?: boolean;
  onRevealed?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!reveal) return;
    onRevealed?.();
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // 放在中间：底部有「未保存的修改」栏，贴底会被挡住
    rootRef.current?.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    nameRef.current?.focus({ preventScroll: true });
    nameRef.current?.select();
    if (!reduce) setFlash(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);
  useEffect(() => {
    const el = flashRef.current;
    if (!flash || !el) return;
    const a = el.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
      { duration: 1600, easing: "ease-out", fill: "forwards" }
    );
    a.onfinish = () => setFlash(false);
    return () => a.cancel();
  }, [flash]);
  const cleaned = cleanMacro(macro.content);
  const lints = lintMacro(macro.content);
  const rows = Math.max(
    3,
    macro.content.split("\n").length + (editable ? 1 : 0)
  );
  const modified =
    hasBase &&
    (!base ||
      base.content !== macro.content ||
      base.name !== macro.name ||
      base.icon !== macro.icon ||
      (base.note ?? "") !== (macro.note ?? ""));
  const over = cleaned.length > MACRO_LIMIT;

  return (
    <div ref={rootRef} data-macro-id={macro.id} className="relative py-3.5">
      {flash && (
        <span
          ref={flashRef}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-3 inset-y-1.5 rounded-lg bg-gold/[0.07] ring-1 ring-inset ring-gold/25"
        />
      )}
      <div className="flex items-center gap-2.5">
        {index !== undefined && (
          <span
            className="-ml-1 w-4 shrink-0 text-center text-[12px] font-medium tabular-nums text-paper-3"
            aria-label={tx("第 {0} 段", index)}
          >
            {index}
          </span>
        )}
        <IconPickerButton
          xinfa={xinfa}
          value={macro.icon}
          name={macro.name || tx("宏")}
          onChange={icon => onChange({ icon })}
          size={30}
          disabled={!editable}
        />
        {/* 名字框按内容宽，「未保存」圆点紧跟在名字后面（和左栏、底栏的圆点同一个意思） */}
        <span className="flex min-w-0 items-center">
          {/* 隐藏的同字号文字决定宽度，输入框铺满它；名字太长时整块收窄，输入框自己滚动 */}
          <span className="relative min-w-0">
            <span
              aria-hidden="true"
              className="invisible block h-8 overflow-hidden whitespace-pre px-1.5 text-[14px] font-medium leading-8"
            >
              {macro.name || tx("宏名称")}
            </span>
            <input
              ref={nameRef}
              value={macro.name}
              readOnly={!editable}
              onChange={e => onChange({ name: e.target.value })}
              maxLength={20}
              size={1}
              aria-label={tx("宏名称")}
              placeholder={tx("宏名称")}
              className="absolute inset-0 h-8 w-full min-w-0 rounded-md bg-transparent px-1.5 text-[14px] font-medium text-paper placeholder:text-paper-3 hover:bg-paper/[0.04] focus:bg-paper/[0.04] focus:outline-none focus:ring-1 focus:ring-paper/20 read-only:hover:bg-transparent"
            />
          </span>
          {modified && (
            <span
              role="img"
              aria-label={base ? tx("有未保存的修改") : tx("新加的，未保存")}
              title={base ? tx("有未保存的修改") : tx("新加的，未保存")}
              className="-ml-1 grid h-6 w-4 shrink-0 place-items-center"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
          )}
        </span>
        <span className="flex-1" />
        {moveTargets && (
          <MoveMacroButton
            name={macro.name}
            targets={moveTargets}
            onMove={onMove}
          />
        )}
        {editable && (
          <IconBtn label={tx("删除宏 {0}", macro.name)} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        )}
      </div>
      <div
        className={cn("pt-1", index !== undefined ? "pl-[56px]" : "pl-[40px]")}
      >
        <input
          value={macro.note ?? ""}
          readOnly={!editable}
          onChange={e => onChange({ note: e.target.value })}
          maxLength={30}
          aria-label={tx("{0} 的备注", macro.name)}
          placeholder={editable ? tx("备注（显示在面板里，可不填）") : ""}
          className="mb-2 h-7 w-full rounded-md bg-transparent px-1.5 text-[12.5px] text-paper-2 placeholder:text-paper-3/70 hover:bg-paper/[0.04] focus:bg-paper/[0.04] focus:outline-none focus:ring-1 focus:ring-paper/20 read-only:hover:bg-transparent"
        />
        <textarea
          value={macro.content}
          readOnly={!editable}
          onChange={e => onChange({ content: e.target.value })}
          rows={rows}
          spellCheck={false}
          aria-label={tx("{0} 的宏内容", macro.name)}
          className="scroll-thin block w-full resize-y rounded-md bg-paper/[0.04] px-3 py-2 font-mono text-[12.5px] leading-[1.7] text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/50"
        />
        {/* 输入框下面一行：左边是提示，右边是字数（弱化，超出时变红） */}
        <div className="mt-1.5 flex items-start gap-3">
          <ul className="min-w-0 flex-1 space-y-1">
            {lints.map((l, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-1.5 text-[12px]",
                  l.level === "error"
                    ? "text-cinnabar-text"
                    : l.level === "warn"
                      ? "text-gold"
                      : "text-paper-3"
                )}
              >
                {l.level === "info" ? (
                  <Info
                    className="mt-px h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="mt-px h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {l.text}
              </li>
            ))}
          </ul>
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] leading-[18px] tabular-nums",
              over ? "font-semibold text-cinnabar-text" : "text-paper-3/60"
            )}
            title={tx("去掉注释和空行后的字符数（含换行）")}
          >
            {cleaned.length}/{MACRO_LIMIT}
          </span>
        </div>
      </div>
    </div>
  );
}

function SaveDialog({
  open,
  onClose,
  schemeId,
  draft,
  last,
}: {
  open: boolean;
  onClose: () => void;
  schemeId: string;
  draft: Draft;
  last?: SchemeVersion;
}) {
  const { state, actions } = useProto();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const diff = useMemo(
    () =>
      diffVersions(
        last,
        {
          version: 0,
          macros: draft.macros,
          ...copyTalentFields(draft),
          note: "",
          authorId: ME_ID,
          at: "",
        },
        layersOf(draft.xinfa)
      ),
    [last, draft]
  );
  // 只改备注或奇穴套名字时游戏里不用动，不列角色
  const affected =
    last && !hasGameChange(diff)
      ? []
      : state.characters.filter(
          c =>
            xinfasOf(c).includes(draft.xinfa) &&
            trackedSets(state, c, draft.xinfa).some(x => x.id === schemeId)
        );
  const nextV = (last?.version ?? 0) + 1;

  const submit = () => {
    const n = note.trim();
    if (!n) {
      setError(tx("写一句改了什么，方便亲友看懂"));
      return;
    }
    const r = actions.saveDraft(schemeId, n);
    onClose();
    setNote("");
    if (r === "saved") {
      actions.toast(
        "manager",
        "success",
        tx(
          "已保存 v{0}。{1}",
          nextV,
          affected.length
            ? tx("{0} 个角色要在游戏里跟着改。", affected.length)
            : ""
        )
      );
    }
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      width={480}
      title={tx("保存为 v{0}", nextV)}
      description={
        last
          ? tx("基于 v{0}：{1}", last.version, diffSummary(diff))
          : tx("这是这个方案的第一个版本。")
      }
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" size="md" onClick={submit}>
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div>
          <label
            htmlFor="save-note"
            className="text-[12.5px] font-medium text-paper"
          >
            {tx("更新说明")}
          </label>
          <textarea
            id="save-note"
            data-autofocus
            rows={2}
            maxLength={60}
            value={note}
            onChange={e => {
              setNote(e.target.value);
              setError("");
            }}
            placeholder={tx("比如：技改后第七重换正气")}
            aria-invalid={!!error}
            className={cn(
              inputCls(!!error),
              "mt-1.5 h-auto resize-none py-2 leading-relaxed"
            )}
          />
          <p
            className={cn(
              "mt-1 text-[12px]",
              error ? "text-cinnabar-text" : "text-paper-3"
            )}
          >
            {error || tx("亲友会在通知里看到 · {0}/60", note.length)}
          </p>
        </div>

        {affected.length > 0 && (
          <div className="rounded-lg bg-cinnabar/[0.07] px-3 py-2.5 text-[12.5px] ring-1 ring-inset ring-cinnabar/20">
            <p className="text-paper">
              {tx("保存后，这 {0} 个角色要在游戏里更新：", affected.length)}
            </p>
            <p className="mt-1 text-paper-2">
              {affected
                .map(
                  c =>
                    `${c.name}${paren(c.ownerId === ME_ID ? tx("你") : memberName(state, c.ownerId))}`
                )
                .join("、")}
            </p>
          </div>
        )}

        {last && diff.total > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDiff(s => !s)}
              aria-expanded={showDiff}
              className="inline-flex items-center gap-1 text-[12.5px] text-paper-2 hover:text-paper"
            >
              {tx("查看改动（旧 → 新）")}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showDiff && "rotate-180"
                )}
              />
            </button>
            {showDiff && (
              <div className="mt-2">
                <DiffDetails diff={diff} compact />
              </div>
            )}
          </div>
        )}
      </div>
    </InlineModal>
  );
}

function ConflictDialog({ schemeId }: { schemeId: string }) {
  const { state, actions } = useProto();
  const pc = state.pendingConflict;
  const [show, setShow] = useState<"theirs" | "mine" | null>("theirs");
  const open = !!pc && pc.schemeId === schemeId;
  const draft = state.drafts[schemeId];
  const xinfa = schemeById(state, schemeId)?.xinfa ?? draft?.xinfa ?? "";
  // 联网冲突时本地已经是服务器的最新版，要和我改之前的那一版比
  const last = pc?.base ?? latest(schemeById(state, schemeId));
  const layers = layersOf(xinfa);

  const theirs = useMemo(
    () => (pc && last ? diffVersions(last, pc.rival, layers) : null),
    [pc, last, layers]
  );
  const mine = useMemo(
    () =>
      draft && last
        ? diffVersions(
            last,
            { ...last, macros: draft.macros, ...copyTalentFields(draft) },
            layers
          )
        : null,
    [draft, last, layers]
  );
  if (!open || !pc || !last) return null;
  const rivalName = memberName(state, pc.rival.authorId);
  // 新版本是自己在别处存的：面板里新建了宏，或另一台电脑上改了
  const self = pc.rival.authorId === ME_ID;

  return (
    <InlineModal
      open
      onClose={() => undefined}
      dismissible={false}
      tone="warning"
      width={520}
      title={
        self
          ? tx("这个方案在别处也保存了")
          : tx("{0} 刚刚也保存了这个方案", rivalName)
      }
      description={
        self
          ? tx(
              "你是基于 v{0} 改的。面板或另一台电脑上{1}保存了 v{2}：“{3}”。两份改动不一样，要选一个。",
              last.version,
              relativeTime(pc.rival.at),
              pc.rival.version,
              pc.rival.note
            )
          : tx(
              "你是基于 v{0} 改的。{1} 在 {2}保存了 v{3}：“{4}”。两份改动不一样，要选一个。",
              last.version,
              rivalName,
              relativeTime(pc.rival.at),
              pc.rival.version,
              pc.rival.note
            )
      }
      footer={
        <>
          <Btn
            variant="ghost"
            size="md"
            onClick={() => {
              actions.resolveConflict("theirs");
              actions.toast(
                "manager",
                "info",
                self
                  ? tx("已放弃这次修改，现在是 v{0}。", pc.rival.version)
                  : tx(
                      "已放弃你的修改，现在是 {0} 的 v{1}。",
                      rivalName,
                      pc.rival.version
                    )
              );
            }}
          >
            {tx("放弃我的修改")}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={() => {
              actions.resolveConflict("mine");
              actions.toast(
                "manager",
                "success",
                self
                  ? tx(
                      "已保存 v{0}。v{1} 留在修改记录里。",
                      pc.rival.version + 1,
                      pc.rival.version
                    )
                  : tx(
                      "已保存 v{0}。{1} 的 v{2} 留在修改记录里。",
                      pc.rival.version + 1,
                      rivalName,
                      pc.rival.version
                    )
              );
            }}
          >
            {tx("以我的为准，另存为 v{0}", pc.rival.version + 1)}
          </Btn>
        </>
      }
    >
      <div className="space-y-2 pb-1">
        {(
          [
            [
              "theirs",
              self
                ? tx(
                    "别处的改动（v{0} → v{1}）",
                    last.version,
                    pc.rival.version
                  )
                : tx(
                    "{0} 的改动（v{1} → v{2}）",
                    rivalName,
                    last.version,
                    pc.rival.version
                  ),
              theirs,
            ],
            ["mine", tx("你的改动（基于 v{0}）", last.version), mine],
          ] as const
        ).map(([key, label, d]) => (
          <div
            key={key}
            className="rounded-lg bg-paper/[0.04] px-3 py-2 ring-1 ring-inset ring-paper/10"
          >
            <button
              type="button"
              onClick={() => setShow(s => (s === key ? null : key))}
              aria-expanded={show === key}
              className="flex w-full items-center justify-between text-left text-[12.5px] font-medium text-paper"
            >
              {label}
              <span className="flex items-center gap-1 text-[12px] font-normal text-paper-3">
                {d ? diffSummary(d) : ""}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    show === key && "rotate-180"
                  )}
                />
              </span>
            </button>
            {show === key && d && (
              <div className="mt-2.5 animate-fade">
                <DiffDetails diff={d} compact />
              </div>
            )}
          </div>
        ))}
        <p className="pt-1 text-[12px] text-paper-3">
          {tx("两份都会留在修改记录里")}
        </p>
      </div>
    </InlineModal>
  );
}
