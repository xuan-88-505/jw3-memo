import { Check, Download, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import type { LoadoutSource } from "@/data/gear";
import { SERVERS, XINFA_LIST } from "@/data/seed";
import { findScheme, latest, myCharacters, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { nameError } from "../CharactersView";
import { SelectBox, XinfaOptions, inputCls } from "../shared";
import { ImportField, OfflineHint, useImportInput } from "./ImportCard";

const NEW = "__new__";

/**
 * 新建配装：给还没有配装的角色导入，或者新加一个角色再导入。
 * 角色和配装一起提交；取消时什么都不会创建。
 */
export function NewLoadoutDialog({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  /** 关闭弹窗后开始计算 */
  onStart: (
    charId: string,
    source: LoadoutSource,
    sourceId: string | null,
    isNew: boolean
  ) => void;
}) {
  const { state, actions } = useProto();
  const mine = myCharacters(state);
  const free = mine.filter(c => !state.loadouts[c.id]);
  const offline = state.dataState === "offline";
  const input = useImportInput();

  const [pick, setPick] = useState<string>(NEW);
  const [name, setName] = useState("");
  const [server, setServer] = useState(SERVERS[0]);
  const [xinfa, setXinfa] = useState(XINFA_LIST[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPick(free[0]?.id ?? NEW);
    setName("");
    setError("");
    input.setText("");
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const picked = free.find(c => c.id === pick);
  const isNew = !picked;
  const charName = picked?.name ?? (name.trim() || "新角色");
  const charXinfa = picked?.xinfa ?? xinfa;
  const v = latest(findScheme(state, charXinfa, "PVE"));
  const talentSource = v ? `${charXinfa} PVE v${v.version}` : null;

  const submit = () => {
    const r = input.submit();
    const n = name.trim();
    const err = isNew ? nameError(mine, n, server) : "";
    setError(err);
    if (err || !r || offline) return;
    let id: string;
    if (picked) {
      id = picked.id;
      actions.selectCharacter(id);
    } else {
      id = actions.addCharacter({ name: n, server, xinfa });
    }
    onClose();
    onStart(id, r.source, r.sourceId, isNew);
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="新建配装"
      width={520}
      bodyMaxHeight={500}
      footer={
        <>
          {offline && <OfflineHint />}
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn
            variant="primary"
            size="md"
            icon={<Download className="h-4 w-4" />}
            disabled={offline || !input.canSubmit}
            onClick={submit}
          >
            导入并计算
          </Btn>
        </>
      }
    >
      <div className="space-y-5 pb-1">
        <div>
          <p id="new-lo-role" className="text-[12.5px] font-medium text-paper">
            角色
          </p>
          <div
            role="radiogroup"
            aria-labelledby="new-lo-role"
            className="mt-2 space-y-1.5"
          >
            {free.map(c => (
              <RoleOption
                key={c.id}
                checked={pick === c.id}
                onSelect={() => setPick(c.id)}
              >
                <CharAvatar character={c} size={22} />
                <span className="text-[13px] text-paper">{c.name}</span>
                <span className="text-[12px] text-paper-3">
                  {c.server} · {c.xinfa}
                </span>
              </RoleOption>
            ))}
            <RoleOption checked={isNew} onSelect={() => setPick(NEW)}>
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-paper/[0.06] text-paper-2">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-[13px] text-paper">新角色</span>
            </RoleOption>
          </div>

          {isNew && (
            <div className="mt-2.5">
              <div className="grid grid-cols-[1fr_120px_140px] gap-2">
                <input
                  aria-label="角色名"
                  value={name}
                  maxLength={20}
                  autoFocus={free.length > 0}
                  data-autofocus={free.length === 0 || undefined}
                  onChange={e => {
                    setName(e.target.value);
                    setError("");
                  }}
                  placeholder="游戏里的角色名"
                  aria-invalid={!!error}
                  className={inputCls(!!error)}
                />
                <SelectBox
                  aria-label="服务器"
                  value={server}
                  onChange={e => {
                    setServer(e.target.value);
                    setError("");
                  }}
                  wrapClassName="w-full"
                  className={inputCls()}
                >
                  {SERVERS.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </SelectBox>
                <SelectBox
                  aria-label="心法"
                  value={xinfa}
                  onChange={e => setXinfa(e.target.value)}
                  wrapClassName="w-full"
                  className={inputCls()}
                >
                  <XinfaOptions />
                </SelectBox>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-1.5 text-[12px] text-cinnabar-text"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <ImportField
          input={input}
          label="配装"
          labelClassName="text-[12.5px] font-medium text-paper"
          charName={charName}
          xinfa={charXinfa}
          talentSource={talentSource}
          onSubmitKey={submit}
        />
      </div>
    </InlineModal>
  );
}

function RoleOption({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left ring-1 ring-inset transition-colors",
        checked
          ? "bg-paper/[0.06] ring-cinnabar-text/50"
          : "ring-paper/10 hover:bg-paper/[0.03]"
      )}
    >
      {children}
      <span
        className={cn(
          "ml-auto grid h-4 w-4 place-items-center rounded-full ring-1 ring-inset",
          checked ? "bg-cinnabar ring-cinnabar" : "ring-paper/25"
        )}
        aria-hidden="true"
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
    </button>
  );
}
