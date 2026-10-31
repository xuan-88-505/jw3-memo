import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  History,
  Info,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
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
import { diffVersions } from "@/lib/diff";
import { relativeTime } from "@/lib/format";
import { jx3boxMacroUrl } from "@/lib/jx3box";
import { MACRO_LIMIT, cleanMacro, lintMacro } from "@/lib/macro";
import {
  activeSchemeId,
  canEdit,
  findScheme,
  followedXinfa,
  isOnline,
  latest,
  memberName,
  myCharacters,
  useProto,
  type Draft,
  isSolo,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { DiffDetails, Field, diffSummary, inputCls } from "./shared";
import { XinfaPairSelect } from "./SchoolPicker";
import { TalentPicker } from "./TalentPicker";
import {
  TalentScanButton,
  TalentScanNotice,
  useTalentScan,
} from "./TalentScan";
import { tx, paren } from "@/lib/i18n";

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
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<{ xinfa: string; mode: Mode }>();
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
  // 只列出有方案或正在新建的心法，按门派顺序
  const listed = XINFA_LIST.filter(x =>
    MODES.some(
      m => latest(findScheme(state, x, m)) || state.drafts[`${x}-${m}`]
    )
  );
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
          {listed.map(x => {
            // 只列出已保存或正在新建的模式；没玩的模式不显示
            const modes = MODES.filter(
              m => latest(findScheme(state, x, m)) || state.drafts[`${x}-${m}`]
            );
            const missing = MODES.filter(m => !modes.includes(m));
            return (
              <li key={x} className="group/x">
                <div className="flex h-7 items-center gap-2 px-2">
                  <XinfaMark xinfa={x} size={20} />
                  <span className="text-[13.5px] font-semibold text-paper">
                    {x}
                  </span>
                  {editable && missing.length === 1 && (
                    <IconBtn
                      label={tx("给{0}添加 {1} 方案", x, missing[0])}
                      onClick={() => actions.startDraft(x, missing[0])}
                      className="ml-auto h-6 w-6 text-paper-3 opacity-0 focus-visible:opacity-100 group-hover/x:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                </div>
                <ul>
                  {modes.map(m => {
                    const id = `${x}-${m}`;
                    const scheme = findScheme(state, x, m);
                    const last = latest(scheme);
                    const draft = state.drafts[id];
                    const active = activeId === id;
                    // 自定义了标题就在行里显示，和右边标题一致；没改过就只靠上面的心法名
                    const title = scheme?.title ?? draft?.title;
                    // 列表不显示版本号，只写谁、什么时候改的
                    const meta = last
                      ? isSolo(state)
                        ? relativeTime(last.at)
                        : `${memberName(state, last.authorId)} · ${relativeTime(last.at)}`
                      : tx("新建中，未保存");
                    return (
                      <li key={m}>
                        <button
                          type="button"
                          onClick={() => actions.selectScheme(id)}
                          aria-current={active ? "page" : undefined}
                          aria-label={`${title ? `${title} · ` : ""}${x} ${m} · ${meta}${draft ? tx(" · 有未保存的修改") : ""}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md py-1.5 pl-[36px] pr-2 text-left text-[12.5px] transition-colors",
                            active
                              ? "bg-paper/[0.08] text-paper"
                              : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            {title && (
                              <span className="block text-[13px] font-medium leading-5 [overflow-wrap:anywhere]">
                                {title}
                              </span>
                            )}
                            <span
                              className={cn(
                                "block truncate text-[11.5px]",
                                active ? "text-paper-2" : "text-paper-3"
                              )}
                            >
                              {meta}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium tracking-wide",
                              active
                                ? "bg-paper/[0.1] text-paper"
                                : "bg-paper/[0.05] text-paper-2"
                            )}
                          >
                            {m}
                          </span>
                          {/* 圆点固定占位，各行的模式标签才能对齐 */}
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              draft && "bg-gold"
                            )}
                            aria-hidden="true"
                            title={draft ? tx("有未保存的修改") : undefined}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <NewSchemeDialog
          open={creating}
          initial={prefill}
          onClose={() => {
            setCreating(false);
            setPrefill(undefined);
          }}
        />
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

/**
 * 新建方案：选心法和模式。PVE、PVP 都有了的心法不能选；
 * 默认选你角色在用、还缺方案的心法。
 */
function NewSchemeDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  /** 预先填好的心法和模式（从托盘「新建方案」进来时） */
  initial?: { xinfa: string; mode: Mode };
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const online = isOnline(state);
  const has = (x: string, m: Mode) =>
    !!latest(findScheme(state, x, m)) || !!state.drafts[`${x}-${m}`];
  const firstMissing = (x: string) => MODES.find(m => !has(x, m)) ?? "PVE";
  const pickDefault = () => {
    const mine = Array.from(new Set(myCharacters(state).flatMap(xinfasOf)));
    return (
      mine.find(x => MODES.some(m => !has(x, m))) ??
      XINFA_LIST.find(x => MODES.some(m => !has(x, m))) ??
      XINFA_LIST[0]
    );
  };
  const [xinfa, setXinfa] = useState(XINFA_LIST[0]);
  const [mode, setMode] = useState<Mode>("PVE");

  // 每次打开时重新选默认值
  useEffect(() => {
    if (!open) return;
    if (initial && !has(initial.xinfa, initial.mode)) {
      setXinfa(initial.xinfa);
      setMode(initial.mode);
      return;
    }
    const x = pickDefault();
    setXinfa(x);
    setMode(firstMissing(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const full = MODES.every(m => has(xinfa, m));
  const create = () => {
    if (full || has(xinfa, mode)) return;
    actions.startDraft(xinfa, mode);
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
          <Btn
            variant="primary"
            size="md"
            onClick={create}
            disabled={full || has(xinfa, mode) || !online}
          >
            {tx("创建")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label={tx("心法")} htmlFor="new-scheme-xinfa">
          <XinfaPairSelect
            id="new-scheme-xinfa"
            autoFocus
            value={xinfa}
            onChange={x => {
              setXinfa(x);
              // 换心法后回到第一个可用的模式（通常是 PVE）
              setMode(firstMissing(x));
            }}
            disabledReason={x =>
              MODES.every(m => has(x, m)) ? tx("PVE、PVP 都有了") : false
            }
          />
        </Field>
        <div>
          <p className="mb-1.5 text-[12.5px] text-paper-2">{tx("模式")}</p>
          <Segmented<Mode>
            label={tx("模式")}
            value={mode}
            onChange={setMode}
            options={MODES.map(m => ({
              value: m,
              label: m,
              disabled: has(xinfa, m),
              title: has(xinfa, m)
                ? tx("{0}已经有 {1} 方案", xinfa, m)
                : undefined,
            }))}
          />
          {MODES.some(m => has(xinfa, m)) && (
            <p className="mt-1.5 text-[12px] text-paper-3">
              {tx(
                "{0}已有 {1} 方案",
                xinfa,
                MODES.filter(m => has(xinfa, m)).join("、")
              )}
            </p>
          )}
        </div>
      </div>
    </InlineModal>
  );
}

function sameContent(
  a: { macros: Macro[]; talents: number[] },
  b?: SchemeVersion
) {
  if (!b) return false;
  if (a.talents.join() !== b.talents.join()) return false;
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
 * 清空后恢复默认的「心法 · 模式」。改标题不产生新版本。
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
 * 方案标题行：图标 | 标题 | 作者信息 | 操作（加宏、加另一个模式、历史版本）。
 * 作者信息只在亲友团里显示创建人；自己用时没有这一栏。
 * 实测「标题排一行的宽度 + 作者信息 + 操作」：放得下就排成一行，作者信息靠右；
 * 放不下时作者信息换到第二行，并横跨到操作按钮下面。标题本身也能折行。
 * 这样任何语言、任何窗口宽度下标题都不会被截断。
 */
function SchemeHeader({
  mark,
  title,
  titleText,
  meta,
  actions,
}: {
  mark: ReactNode;
  title: ReactNode;
  /** 标题文字，只用来量它排成一行有多宽 */
  titleText: string;
  meta: ReactNode;
  actions: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState(false);
  // 作者信息可能出现或消失（比如新方案保存后），这时要重新量
  const hasMeta = meta != null;
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const fit = () => {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      // 作者信息用 w-max，两种排法下宽度一样，所以判断结果不会来回跳
      const need =
        (markRef.current?.offsetWidth ?? 0) +
        (probeRef.current?.offsetWidth ?? 0) +
        (metaRef.current?.offsetWidth ?? 0) +
        (actionsRef.current?.offsetWidth ?? 0) +
        gap * (metaRef.current ? 3 : 2);
      setStack(row.clientWidth + 0.5 < need);
    };
    fit();
    const ro = new ResizeObserver(fit);
    for (const el of [
      row,
      probeRef.current,
      metaRef.current,
      actionsRef.current,
    ])
      if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [hasMeta]);
  return (
    <div
      ref={rowRef}
      className="relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3.5 gap-y-1"
    >
      {/* 量标题排成一行的宽度；左右内边距和可编辑标题一致 */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre px-1.5 text-[20px] font-semibold leading-tight"
      >
        {titleText}
      </span>
      <div
        ref={markRef}
        className={cn("col-start-1 row-start-1", stack && "row-span-2")}
      >
        {mark}
      </div>
      <div
        className={cn(
          "row-start-1 min-w-0",
          stack ? "col-start-2 col-end-4" : "col-start-2"
        )}
      >
        {title}
      </div>
      {hasMeta && (
        <p
          ref={metaRef}
          className={cn(
            "flex w-max max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-paper-3",
            stack
              ? "col-start-2 col-end-5 row-start-2 justify-self-start"
              : "col-start-3 row-start-1 justify-self-end"
          )}
        >
          {meta}
        </p>
      )}
      <div
        ref={actionsRef}
        className="col-start-4 row-start-1 flex items-center gap-1.5"
      >
        {actions}
      </div>
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
  const [xinfa, mode] = schemeId.split("-") as [string, Mode];
  const scheme = findScheme(state, xinfa, mode);
  const last = latest(scheme);
  const draft = state.drafts[schemeId];
  const editable = canEdit(state);
  const online = isOnline(state);
  const [saving, setSaving] = useState(false);

  /** 只有自己一个人时，不显示创建人 */
  const solo = isSolo(state);
  const creatorId = scheme?.versions[0]?.authorId;
  const creator = state.members.find(m => m.id === creatorId);
  const other: Mode = mode === "PVE" ? "PVP" : "PVE";
  const otherExists =
    !!latest(findScheme(state, xinfa, other)) ||
    !!state.drafts[`${xinfa}-${other}`];
  const hasContent = !!last || !!draft;
  // 截图识别奇穴：认出的层直接改进草稿
  const scan = useTalentScan({
    xinfa,
    resetKey: schemeId,
    talents: draft?.talents ?? last?.talents ?? [],
    enabled: editable && hasContent,
    onApply: talents => actions.editDraft(schemeId, d => ({ ...d, talents })),
  });

  if (!hasContent) {
    // 这个心法一个方案都没有时，两个模式都可以新建；否则只建当前这个
    const choices: Mode[] = otherExists ? [mode] : MODES;
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <XinfaMark xinfa={xinfa} size={48} className="opacity-60" />
        <p className="mt-4 text-[17px] font-semibold">
          {otherExists
            ? tx("{0}还没有 {1} 方案", xinfa, mode)
            : tx("{0}还没有方案", xinfa)}
        </p>
        {!editable && (
          <p className="mt-1.5 text-[13px] text-paper-3">
            {tx("只读成员不能新建")}
          </p>
        )}
        {editable && (
          <div className="mt-5 flex gap-2">
            {choices.map((m, i) => (
              <Btn
                key={m}
                variant={i === 0 ? "primary" : "secondary"}
                size="md"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => actions.startDraft(xinfa, m)}
              >
                {choices.length > 1 ? tx("新建 {0}", m) : tx("新建")}
              </Btn>
            ))}
          </div>
        )}
      </div>
    );
  }

  const view = draft ?? { macros: last!.macros, talents: last!.talents };
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
  const addMacro = () =>
    edit(d => ({
      ...d,
      macros: [
        ...d.macros,
        {
          id: `${schemeId}-n${Date.now()}`,
          name: tx("新宏 {0}", d.macros.length + 1),
          icon: 13,
          content: "/cast ",
          note: "",
        },
      ],
    }));
  const removeMacro = (id: string) =>
    edit(d => ({ ...d, macros: d.macros.filter(m => m.id !== id) }));

  const baseMacros = new Map((last?.macros ?? []).map(m => [m.id, m]));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-7 pb-6 pt-6">
        <SchemeHeader
          mark={<XinfaMark xinfa={xinfa} size={40} />}
          titleText={(scheme?.title ?? draft?.title) || `${xinfa} · ${mode}`}
          title={
            <SchemeTitle
              schemeId={schemeId}
              title={scheme?.title ?? draft?.title}
              fallback={`${xinfa} · ${mode}`}
              editable={editable && online}
            />
          }
          meta={
            !last ? (
              tx("新方案，还没保存")
            ) : !solo ? (
              <CreatedBy
                member={creator}
                name={creator?.name ?? memberName(state, creatorId ?? "")}
              />
            ) : null
          }
          actions={
            <>
              {editable && (
                <Btn
                  variant="secondary"
                  size="sm"
                  aria-label={tx("添加宏")}
                  title={tx("添加宏")}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={addMacro}
                >
                  {tx("宏")}
                </Btn>
              )}
              {last && editable && !otherExists && (
                <Btn
                  variant="secondary"
                  size="sm"
                  aria-label={tx("添加 {0} 方案", other)}
                  title={tx("添加 {0} 方案", other)}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => actions.startDraft(xinfa, other)}
                >
                  {other}
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
              {last && (
                <Btn
                  variant="secondary"
                  size="sm"
                  aria-label={tx("历史版本")}
                  title={tx("历史版本")}
                  className="w-7 px-0"
                  icon={<History className="h-3.5 w-3.5" />}
                  onClick={() => actions.openChangelog(xinfa)}
                />
              )}
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
          <SectionLabel>{tx("宏 · {0}", view.macros.length)}</SectionLabel>
          <div className="mt-1 divide-y divide-paper/[0.07]">
            {view.macros.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-paper-3">
                {tx("还没有宏")}
              </p>
            )}
            {view.macros.map(m => (
              <MacroEditor
                key={m.id}
                xinfa={xinfa}
                macro={m}
                base={baseMacros.get(m.id)}
                hasBase={!!last}
                editable={editable}
                onChange={p => setMacro(m.id, p)}
                onRemove={() => removeMacro(m.id)}
              />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SectionLabel
            right={
              editable && (
                <TalentScanButton
                  busy={scan.busy}
                  platform={state.platform}
                  onClick={() => void scan.pick()}
                />
              )
            }
          >
            {tx("奇穴 · 9 层")}
          </SectionLabel>
          {scan.fileInput}
          <div className="mt-3">
            {(scan.busy || scan.notice) && (
              <TalentScanNotice
                busy={scan.busy}
                notice={scan.notice}
                onUndo={scan.undo}
                onChoose={scan.choose}
                onClose={scan.dismiss}
              />
            )}
            <TalentPicker
              xinfa={xinfa}
              value={view.talents}
              baseline={last?.talents}
              disabled={!editable}
              onChange={talents => edit(d => ({ ...d, talents }))}
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
              actions.discardDraft(schemeId);
              // 放弃的是新建方案：回到这个心法已有的另一个模式
              if (!last && latest(findScheme(state, xinfa, other)))
                actions.selectScheme(`${xinfa}-${other}`);
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

function MacroEditor({
  xinfa,
  macro,
  base,
  hasBase,
  editable,
  onChange,
  onRemove,
}: {
  xinfa: string;
  macro: Macro;
  base?: Macro;
  hasBase: boolean;
  editable: boolean;
  onChange: (p: Partial<Macro>) => void;
  onRemove: () => void;
}) {
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
    <div className="py-3.5">
      <div className="flex items-center gap-2.5">
        <IconPickerButton
          xinfa={xinfa}
          value={macro.icon}
          name={macro.name || tx("宏")}
          onChange={icon => onChange({ icon })}
          size={30}
          disabled={!editable}
        />
        <input
          value={macro.name}
          readOnly={!editable}
          onChange={e => onChange({ name: e.target.value })}
          maxLength={20}
          aria-label={tx("宏名称")}
          placeholder={tx("宏名称")}
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[14px] font-medium text-paper placeholder:text-paper-3 hover:bg-paper/[0.04] focus:bg-paper/[0.04] focus:outline-none focus:ring-1 focus:ring-paper/20 read-only:hover:bg-transparent"
        />
        {modified && (
          <span className="text-[11.5px] text-gold">
            {base ? tx("已修改") : tx("新增")}
          </span>
        )}
        {editable && (
          <IconBtn label={tx("删除宏 {0}", macro.name)} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        )}
      </div>
      <div className="pl-[40px] pt-1">
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
          talents: draft.talents,
          note: "",
          authorId: ME_ID,
          at: "",
        },
        layersOf(draft.xinfa)
      ),
    [last, draft]
  );
  const affected = state.characters.filter(c =>
    xinfasOf(c).includes(draft.xinfa)
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
  const [xinfa, mode] = schemeId.split("-") as [string, Mode];
  // 联网冲突时本地已经是服务器的最新版，要和我改之前的那一版比
  const last = pc?.base ?? latest(findScheme(state, xinfa, mode));
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
            { ...last, macros: draft.macros, talents: draft.talents },
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
