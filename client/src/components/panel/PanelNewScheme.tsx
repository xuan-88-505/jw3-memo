import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/common/ui";
import { IconPickerButton } from "@/components/common/IconPicker";
import { XinfaMenu } from "@/components/manager/SchoolPicker";
import { TalentPicker } from "@/components/manager/TalentPicker";
import {
  TalentScanButton,
  TalentScanNotice,
  useTalentScan,
} from "@/components/manager/TalentScan";
import { inputCls } from "@/components/manager/shared";
import { XINFA_LIST, defaultTalents } from "@/data/seed";
import type { Scheme } from "@/data/types";
import { pasteHint } from "@/lib/format";
import { MACRO_LIMIT, cleanMacro } from "@/lib/macro";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProto } from "@/state/store";
import { PanelForm } from "./PanelForm";

/**
 * 面板里原地新建，不打开管理窗口。
 * 宏页签：填一个宏（图标、名称、说明、内容）。给了 target（宏列表最后的「新建宏」）时
 * 作为一段加到这个方案的最新版本后面，存成新版本；否则给心法新建一个 PVE 方案，存成 v1。
 * 奇穴页签：选奇穴，新建一个 PVE 方案，存成 v1。
 * 新建方案（choose）时顶部只有一个心法按钮，默认是面板正在看的心法，不改就直接填。
 * 点开先选门派、再选心法，任何门派和流派都能选；同一个心法已经有方案也能再建一个。
 * 奇穴可以粘贴截图（Ctrl+V / ⌘V）自动选上；标题右边的「识别截图」读剪贴板里的图片。
 * 面板不打开选文件：选文件窗口会抢走焦点，面板一失焦就收起。
 * 保存后面板回到列表。Esc 或「取消」回到原来的样子。「取消 / 保存」固定在面板底部。
 */
export function PanelNewScheme({
  kind,
  xinfa: initialXinfa,
  choose,
  shown,
  target,
  context,
  onDone,
  onCancel,
  onOpenManager,
}: {
  kind: "macro" | "talent";
  /** 存到哪个心法；choose 时是默认选中的心法 */
  xinfa: string;
  /** 新建方案：顶部显示一个心法按钮，可以改成任何门派的心法 */
  choose?: boolean;
  /** 面板里这个角色显示的心法；存到别的心法时提示去方案库看 */
  shown?: string[];
  /** 加到哪个方案；没有时新建 */
  target?: Scheme;
  /** 标题旁边弱显示存到哪里：心法有好几个方案、或角色玩好几个心法时用 */
  context?: string;
  /** 带上新宏的 id（列表可以滚到它）和存到的方案 */
  onDone: (macroId?: string, schemeId?: string, xinfa?: string) => void;
  onCancel: () => void;
  /** 管理窗口里有这个方案没保存的草稿时，去那里处理 */
  onOpenManager: (schemeId: string) => void;
}) {
  const { state, actions } = useProto();
  const [xinfa, setXinfa] = useState(initialXinfa);
  const [icon, setIcon] = useState(13);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [content, setContent] = useState("/cast ");
  const [talents, setTalents] = useState(defaultTalents);
  const [blocked, setBlocked] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind === "macro") nameRef.current?.focus();
    else first.current?.querySelector<HTMLElement>("[role=tab]")?.focus();
  }, [kind]);
  // 截图识别：认出的层直接改进表单，换心法时提示清掉
  const scan = useTalentScan({
    xinfa,
    resetKey: xinfa,
    talents,
    enabled: kind === "talent",
    onApply: setTalents,
    filePicker: false,
    pasteKey: pasteHint(state.platform),
    // 魔盒奇穴是别的心法：新建方案时直接切过去
    xinfas: choose ? XINFA_LIST : undefined,
    onSwitchXinfa: x => {
      setXinfa(x);
      setBlocked(false);
    },
  });

  const cleaned = cleanMacro(content);
  const over = cleaned.length > MACRO_LIMIT;
  const empty = cleaned.length === 0;
  const canSave = kind === "talent" || (!!name.trim() && !empty && !over);
  // 存到的心法不在这个角色的面板里：保存后面板看不到，告诉用户在方案库
  const savedText = (text: string) =>
    shown && !shown.includes(xinfa)
      ? tx("{0}的方案已保存到方案库", xinfa)
      : text;
  const save = () => {
    if (!canSave) return;
    if (kind === "macro") {
      const macroId = `${xinfa}-n${Date.now()}`;
      const r = actions.addMacro(
        target?.xinfa === xinfa ? target.id : null,
        xinfa,
        target?.mode ?? "PVE",
        {
          id: macroId,
          name: name.trim(),
          icon,
          content: content.trim(),
          note: note.trim(),
        }
      );
      if (r.result === "draft") {
        setBlocked(true);
        return;
      }
      actions.toast("panel", "success", savedText(tx("已保存宏")));
      onDone(macroId, r.schemeId, xinfa);
      return;
    }
    const schemeId = actions.createScheme(xinfa, "PVE", { talents });
    actions.toast("panel", "success", savedText(tx("已保存奇穴")));
    onDone(undefined, schemeId, xinfa);
  };

  return (
    <PanelForm
      titleId="panel-new-title"
      onCancel={onCancel}
      notice={
        blocked && (
          <div
            role="alert"
            className="rounded-lg bg-amber/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-paper-2 ring-1 ring-inset ring-amber/25"
          >
            {tx("管理窗口里有{0}没保存的修改，先在那里保存或放弃", xinfa)}
            <button
              type="button"
              onClick={() => onOpenManager(target?.id ?? "")}
              className="ml-1 text-paper underline underline-offset-2 hover:text-cinnabar-text"
            >
              {tx("去处理")}
            </button>
          </div>
        )
      }
      actions={
        <>
          <Btn variant="ghost" size="md" onClick={onCancel}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={!canSave}>
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2">
        <h2
          id="panel-new-title"
          // 20px 行高上下各留 2px，和右边 24px 高的按钮居中对齐
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 py-[2px] text-[14px] font-medium leading-5 text-paper"
        >
          {kind === "macro" ? tx("新建宏") : tx("新建奇穴")}
          {context && (
            <span className="min-w-0 text-[12px] font-normal text-paper-3 [overflow-wrap:anywhere]">
              {context}
            </span>
          )}
        </h2>
        {kind === "talent" && (
          <div className="shrink-0">
            <TalentScanButton
              busy={scan.busy}
              platform={state.platform}
              onClick={() => void scan.pick()}
            />
          </div>
        )}
      </div>

      {choose && (
        <div className="mb-4">
          <XinfaMenu
            value={xinfa}
            onChange={x => {
              setXinfa(x);
              setBlocked(false);
            }}
          />
        </div>
      )}

      {kind === "macro" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <IconPickerButton
              xinfa={xinfa}
              value={icon}
              name={name || tx("宏")}
              onChange={setIcon}
              size={40}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <input
                ref={nameRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") save();
                }}
                aria-label={tx("宏名称")}
                placeholder={tx("宏名称")}
                maxLength={24}
                className={cn(inputCls(false), "w-full")}
              />
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                aria-label={tx("说明")}
                placeholder={tx("说明（选填）")}
                maxLength={40}
                className={cn(inputCls(false), "w-full")}
              />
            </div>
          </div>
          <div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              aria-label={tx("宏内容")}
              aria-invalid={over}
              spellCheck={false}
              rows={6}
              className={cn(
                inputCls(over),
                "h-auto w-full resize-none py-2 font-mono text-[12.5px] leading-[1.7]"
              )}
            />
            <p
              className={cn(
                "mt-1 text-right text-[11.5px] tabular-nums",
                over ? "text-cinnabar-text" : "text-paper-3/80"
              )}
            >
              {cleaned.length}/{MACRO_LIMIT}
            </p>
          </div>
        </div>
      ) : (
        <div ref={first}>
          {(scan.busy || scan.notice) && (
            <TalentScanNotice
              busy={scan.busy}
              notice={scan.notice}
              onUndo={scan.undo}
              onClose={scan.dismiss}
            />
          )}
          <TalentPicker
            xinfa={xinfa}
            value={talents}
            onChange={setTalents}
            compact
          />
        </div>
      )}
    </PanelForm>
  );
}
