import { useEffect, useId, useRef, useState } from "react";
import { InlineModal } from "@/components/common/overlay";
import { Btn, Segmented } from "@/components/common/ui";
import { IconPickerButton } from "@/components/common/IconPicker";
import { MODES, type Mode } from "@/data/types";
import { MACRO_LIMIT, cleanMacro } from "@/lib/macro";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SelectBox } from "@/components/common/Select";
import { schemeName } from "@/lib/schemeSets";
import {
  currentSetId,
  isOnline,
  latest,
  schemeById,
  setsOf,
  useProto,
} from "@/state/store";
import { inputCls } from "./shared";

/** 下拉里「新方案」这一项的值 */
const NEW = "";

/**
 * 从「我的角色」某一行原地新建宏，不离开当前页。
 * 宏是方案（一套宏）里的一段：选一个已有方案就加到它最新版本后面、存成新版本；
 * 选「新方案」就新建一个方案，只有这段宏。角色玩多个心法时可以切换。
 */
export function NewMacroDialog({
  xinfas,
  charId,
  onClose,
}: {
  /** 这个角色玩的心法；空数组表示弹窗关着 */
  xinfas: string[];
  /** 这个角色：默认加到它现在用的方案 */
  charId?: string;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const open = xinfas.length > 0;
  const online = isOnline(state);
  const nameId = useId();
  const [xinfa, setXinfa] = useState("");
  const [target, setTarget] = useState(NEW);
  const [mode, setMode] = useState<Mode>("PVE");
  const [icon, setIcon] = useState(13);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [content, setContent] = useState("/cast ");
  const [blocked, setBlocked] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // 默认加到角色在这个心法下现在用的方案；这个心法还没有方案时新建
  const defaultTarget = (x: string) => {
    const char = state.characters.find(c => c.id === charId);
    return (
      (char && currentSetId(state, char, x)) ?? setsOf(state, x)[0]?.id ?? NEW
    );
  };

  // 每次打开时重置
  useEffect(() => {
    if (!open) return;
    const x = xinfas[0];
    setXinfa(x);
    setTarget(defaultTarget(x));
    setMode("PVE");
    setIcon(13);
    setName("");
    setNote("");
    setContent("/cast ");
    setBlocked(false);
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !xinfa) return null;

  const sets = setsOf(state, xinfa);
  const scheme = schemeById(state, target);
  const last = latest(scheme);
  const cleaned = cleanMacro(content);
  const over = cleaned.length > MACRO_LIMIT;
  const canSave = online && !!name.trim() && cleaned.length > 0 && !over;

  const save = () => {
    if (!canSave) return;
    const { result } = actions.addMacro(scheme?.id ?? null, xinfa, mode, {
      id: `${xinfa}-n${Date.now()}`,
      name: name.trim(),
      icon,
      content: content.trim(),
      note: note.trim(),
    });
    if (result === "draft") {
      setBlocked(true);
      return;
    }
    actions.toast("manager", "success", tx("已保存宏"));
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("新建宏")}
      width={480}
      bodyMaxHeight={520}
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
          <Btn variant="primary" size="md" onClick={save} disabled={!canSave}>
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {xinfas.length > 1 && (
              <Segmented<string>
                label={tx("心法")}
                size="sm"
                value={xinfa}
                onChange={x => {
                  setXinfa(x);
                  setTarget(defaultTarget(x));
                  setBlocked(false);
                }}
                options={xinfas.map(x => ({ value: x, label: x }))}
              />
            )}
            {/* 加到哪个方案：这个心法已有的方案，或新建一个 */}
            {sets.length > 0 && (
              <SelectBox
                aria-label={tx("加到")}
                value={target}
                onChange={e => {
                  setTarget(e.target.value);
                  setBlocked(false);
                }}
                wrapClassName="min-w-0 max-w-[260px]"
              >
                {sets.map(s => (
                  <option key={s.id} value={s.id}>
                    {schemeName(s)}
                  </option>
                ))}
                <option value={NEW}>{tx("新方案")}</option>
              </SelectBox>
            )}
            {!scheme && (
              <Segmented<Mode>
                label={tx("模式")}
                size="sm"
                value={mode}
                onChange={setMode}
                options={MODES.map(m => ({ value: m, label: m }))}
              />
            )}
          </div>
          {/* 说清楚宏会存到哪里：已有的方案里，还是新建一个方案 */}
          <p className="mt-2 text-[12px] leading-relaxed text-paper-3">
            {scheme && last
              ? tx(
                  "作为第 {0} 段加到「{1}」，存为 v{2}",
                  last.macros.length + 1,
                  schemeName(scheme),
                  last.version + 1
                )
              : tx("保存时新建一个方案，只有这一段宏")}
          </p>
        </div>

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
              id={nameId}
              data-autofocus
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
            rows={7}
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

        {blocked && (
          <div
            role="alert"
            className="rounded-lg bg-amber/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-paper-2 ring-1 ring-inset ring-amber/25"
          >
            {tx(
              "「{0}」有没保存的修改，先在方案库里保存或放弃",
              scheme ? schemeName(scheme) : xinfa
            )}
            <button
              type="button"
              onClick={() => {
                actions.goTo("schemes");
                if (scheme) actions.selectScheme(scheme.id);
                onClose();
              }}
              className="ml-1 text-paper underline underline-offset-2 hover:text-cinnabar-text"
            >
              {tx("去处理")}
            </button>
          </div>
        )}
      </div>
    </InlineModal>
  );
}
