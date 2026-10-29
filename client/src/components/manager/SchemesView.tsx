import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  History,
  Info,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Jx3Icon, XinfaMark } from "@/components/brand/Marks";
import { InlineModal } from "@/components/common/overlay";
import {
  Avatar,
  Btn,
  IconBtn,
  SectionLabel,
  Segmented,
} from "@/components/common/ui";
import { ME_ID, XINFA_LIST, layersOf, xinfasOf } from "@/data/seed";
import { MODES, type Macro, type Mode, type SchemeVersion } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { absoluteTime, relativeTime } from "@/lib/format";
import { MACRO_LIMIT, cleanMacro, lintMacro } from "@/lib/macro";
import {
  activeSchemeId,
  canEdit,
  findScheme,
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
  return (
    <nav
      aria-label="方案列表"
      className="scroll-thin w-[236px] shrink-0 overflow-y-auto border-r border-paper/[0.07] px-2.5 py-3"
    >
      <div className="flex h-8 items-center justify-between pb-1 pl-2">
        <p className="text-[11.5px] tracking-[0.12em] text-paper-3">
          方案库 · 旗舰 暗影千机
        </p>
        {editable && listed.length > 0 && (
          <Btn
            variant="ghost"
            size="xs"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreating(true)}
          >
            新建
          </Btn>
        )}
      </div>
      {listed.length === 0 && (
        <div className="px-2 py-8 text-center">
          <p className="text-[12.5px] text-paper-3">还没有方案</p>
          {editable && (
            <Btn
              variant="primary"
              size="sm"
              className="mt-3"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreating(true)}
            >
              新建方案
            </Btn>
          )}
        </div>
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
              <div className="flex h-8 items-center gap-2 px-2">
                <XinfaMark xinfa={x} size={20} />
                <span className="font-serif text-[13.5px] font-semibold text-paper">
                  {x}
                </span>
                {editable && missing.length === 1 && (
                  <IconBtn
                    label={`给${x}添加 ${missing[0]} 方案`}
                    onClick={() => actions.startDraft(x, missing[0])}
                    className="ml-auto h-6 w-6 text-paper-3 opacity-0 focus-visible:opacity-100 group-hover/x:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </IconBtn>
                )}
              </div>
              <ul className="mt-0.5">
                {modes.map(m => {
                  const id = `${x}-${m}`;
                  const last = latest(findScheme(state, x, m));
                  const draft = state.drafts[id];
                  const active = activeId === id;
                  const meta = last
                    ? isSolo(state)
                      ? `v${last.version} · ${relativeTime(last.at)}`
                      : `v${last.version} · ${memberName(state, last.authorId)} · ${relativeTime(last.at)}`
                    : "新建中，未保存";
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        onClick={() => actions.selectScheme(id)}
                        aria-current={active ? "page" : undefined}
                        aria-label={`${x} ${m} · ${meta}${draft ? " · 有未保存的修改" : ""}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md py-1.5 pl-[36px] pr-2 text-left text-[12.5px] transition-colors",
                          active
                            ? "bg-paper/[0.08] text-paper"
                            : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
                        )}
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[11.5px]",
                            active ? "text-paper-2" : "text-paper-3"
                          )}
                        >
                          {meta}
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
                          title={draft ? "有未保存的修改" : undefined}
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
      title="新建方案"
      width={420}
      footer={
        <>
          {!online && (
            <span className="mr-auto text-[12px] text-gold">
              离线时不能新建
            </span>
          )}
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={create}
            disabled={full || has(xinfa, mode) || !online}
          >
            创建
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label="心法" htmlFor="new-scheme-xinfa">
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
              MODES.every(m => has(x, m)) ? "PVE、PVP 都有了" : false
            }
          />
        </Field>
        <div>
          <p className="mb-1.5 text-[12.5px] text-paper-2">模式</p>
          <Segmented<Mode>
            label="模式"
            value={mode}
            onChange={setMode}
            options={MODES.map(m => ({
              value: m,
              label: m,
              disabled: has(xinfa, m),
              title: has(xinfa, m) ? `${xinfa}已经有 ${m} 方案` : undefined,
            }))}
          />
          {MODES.some(m => has(xinfa, m)) && (
            <p className="mt-1.5 text-[12px] text-paper-3">
              {xinfa}已有 {MODES.filter(m => has(xinfa, m)).join("、")} 方案
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
      o.content === m.content &&
      (o.note ?? "") === (m.note ?? "")
    );
  });
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

  if (!last && !draft) {
    // 这个心法一个方案都没有时，两个模式都可以新建；否则只建当前这个
    const choices: Mode[] = otherExists ? [mode] : MODES;
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <XinfaMark xinfa={xinfa} size={48} className="opacity-60" />
        <p className="mt-4 font-serif text-[17px] font-semibold">
          {otherExists ? `${xinfa}还没有 ${mode} 方案` : `${xinfa}还没有方案`}
        </p>
        {!editable && (
          <p className="mt-1.5 text-[13px] text-paper-3">只读成员不能新建</p>
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
                新建 {m} 方案
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
      .map(l => `${m.name || "未命名宏"}：${l.text}`)
  );
  const nameMissing = view.macros.some(m => !m.name.trim());
  const blockReason = !online
    ? "离线时不能保存"
    : view.macros.length === 0
      ? "至少要有一个宏"
      : nameMissing
        ? "有宏没写名字"
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
          name: `新宏 ${d.macros.length + 1}`,
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
        <div className="flex items-start gap-3.5">
          <XinfaMark xinfa={xinfa} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[20px] font-semibold leading-tight">
              {xinfa} · {mode}
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-paper-3">
              {last ? (
                <>
                  {!solo && (
                    <>
                      {creator && <Avatar member={creator} size={16} />}
                      <span className="text-paper-2">
                        {creator?.name ?? memberName(state, creatorId ?? "")}
                      </span>
                      <span>创建</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span title={absoluteTime(last.at)}>
                    {relativeTime(last.at)}更新
                  </span>
                </>
              ) : (
                "新方案，还没保存"
              )}
            </p>
          </div>
          {last && editable && !otherExists && (
            <Btn
              variant="ghost"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => actions.startDraft(xinfa, other)}
            >
              添加 {other} 方案
            </Btn>
          )}
          {last && (
            <Btn
              variant="ghost"
              size="sm"
              icon={<History className="h-3.5 w-3.5" />}
              onClick={() => {
                actions.setChangelogFilter(xinfa);
                actions.setSection("changelog");
              }}
            >
              历史版本
            </Btn>
          )}
        </div>

        {!editable && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-paper/[0.04] px-3 py-2 text-[12.5px] text-paper-2 ring-1 ring-inset ring-paper/10">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            只读成员不能修改
          </div>
        )}

        <div className="mt-7">
          <SectionLabel
            right={
              editable && (
                <Btn
                  variant="ghost"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={addMacro}
                >
                  添加宏
                </Btn>
              )
            }
          >
            宏 · {view.macros.length}
          </SectionLabel>
          <div className="mt-1 divide-y divide-paper/[0.07]">
            {view.macros.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-paper-3">
                还没有宏
              </p>
            )}
            {view.macros.map(m => (
              <MacroEditor
                key={m.id}
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
          <SectionLabel>奇穴 · 9 层</SectionLabel>
          <div className="mt-3">
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
              {last ? "未保存的修改" : "新方案，未保存"}
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
            {last ? "放弃修改" : "放弃新建"}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            disabled={!!blockReason}
            onClick={() => setSaving(true)}
          >
            保存为 v{(last?.version ?? 0) + 1}
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
  macro,
  base,
  hasBase,
  editable,
  onChange,
  onRemove,
}: {
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
      (base.note ?? "") !== (macro.note ?? ""));
  const over = cleaned.length > MACRO_LIMIT;

  return (
    <div className="py-3.5">
      <div className="flex items-center gap-2.5">
        <Jx3Icon id={macro.icon} name={macro.name || "宏"} size={30} />
        <input
          value={macro.name}
          readOnly={!editable}
          onChange={e => onChange({ name: e.target.value })}
          maxLength={20}
          aria-label="宏名称"
          placeholder="宏名称"
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[14px] font-medium text-paper placeholder:text-paper-3 hover:bg-paper/[0.04] focus:bg-paper/[0.04] focus:outline-none focus:ring-1 focus:ring-paper/20 read-only:hover:bg-transparent"
        />
        {modified && (
          <span className="text-[11.5px] text-gold">
            {base ? "已修改" : "新增"}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-[12px] tabular-nums",
            over ? "font-semibold text-cinnabar-text" : "text-paper-3"
          )}
          title="去掉注释和空行后的字符数（含换行）"
        >
          {cleaned.length}/{MACRO_LIMIT}
        </span>
        {editable && (
          <IconBtn label={`删除宏 ${macro.name}`} onClick={onRemove}>
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
          aria-label={`${macro.name} 的备注`}
          placeholder={editable ? "备注（显示在面板里，可不填）" : ""}
          className="mb-2 h-7 w-full rounded-md bg-transparent px-1.5 text-[12.5px] text-paper-2 placeholder:text-paper-3/70 hover:bg-paper/[0.04] focus:bg-paper/[0.04] focus:outline-none focus:ring-1 focus:ring-paper/20 read-only:hover:bg-transparent"
        />
        <textarea
          value={macro.content}
          readOnly={!editable}
          onChange={e => onChange({ content: e.target.value })}
          rows={rows}
          spellCheck={false}
          aria-label={`${macro.name} 的宏内容`}
          className="scroll-thin block w-full resize-y rounded-md bg-paper/[0.04] px-3 py-2 font-mono text-[12.5px] leading-[1.7] text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/50"
        />
        {lints.length > 0 && (
          <ul className="mt-2 space-y-1">
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
        )}
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
      setError("写一句改了什么，方便亲友看懂");
      return;
    }
    const r = actions.saveDraft(schemeId, n);
    onClose();
    setNote("");
    if (r === "saved") {
      actions.toast(
        "manager",
        "success",
        `已保存 v${nextV}。${affected.length ? `${affected.length} 个角色要在游戏里跟着改。` : ""}`
      );
    }
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      width={480}
      title={`保存为 v${nextV}`}
      description={
        last
          ? `基于 v${last.version}：${diffSummary(diff)}`
          : "这是这个方案的第一个版本。"
      }
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" size="md" onClick={submit}>
            保存
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
            更新说明
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
            placeholder="比如：技改后第七重换正气"
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
            {error || `亲友会在通知里看到 · ${note.length}/60`}
          </p>
        </div>

        {affected.length > 0 && (
          <div className="rounded-lg bg-cinnabar/[0.07] px-3 py-2.5 text-[12.5px] ring-1 ring-inset ring-cinnabar/20">
            <p className="text-paper">
              保存后，这 {affected.length} 个角色要在游戏里更新：
            </p>
            <p className="mt-1 text-paper-2">
              {affected
                .map(
                  c =>
                    `${c.name}（${c.ownerId === ME_ID ? "你" : memberName(state, c.ownerId)}）`
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
              查看改动（旧 → 新）
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
  const last = latest(findScheme(state, xinfa, mode));
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

  return (
    <InlineModal
      open
      onClose={() => undefined}
      dismissible={false}
      tone="warning"
      width={520}
      title={`${rivalName} 刚刚也保存了这个方案`}
      description={`你是基于 v${last.version} 改的。${rivalName} 在 ${relativeTime(pc.rival.at)}保存了 v${pc.rival.version}：“${pc.rival.note}”。两份改动不一样，要选一个。`}
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
                `已放弃你的修改，现在是 ${rivalName} 的 v${pc.rival.version}。`
              );
            }}
          >
            放弃我的修改
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={() => {
              actions.resolveConflict("mine");
              actions.toast(
                "manager",
                "success",
                `已保存 v${pc.rival.version + 1}。${rivalName} 的 v${pc.rival.version} 留在技改记录里。`
              );
            }}
          >
            以我的为准，另存为 v{pc.rival.version + 1}
          </Btn>
        </>
      }
    >
      <div className="space-y-2 pb-1">
        {(
          [
            [
              "theirs",
              `${rivalName} 的改动（v${last.version} → v${pc.rival.version}）`,
              theirs,
            ],
            ["mine", `你的改动（基于 v${last.version}）`, mine],
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
        <p className="pt-1 text-[12px] text-paper-3">两份都会留在技改记录里</p>
      </div>
    </InlineModal>
  );
}
