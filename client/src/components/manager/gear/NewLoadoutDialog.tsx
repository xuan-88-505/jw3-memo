import { Download, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import type { Loadout, LoadoutSource } from "@/data/gear";
import { XINFA_LIST } from "@/data/seed";
import { findScheme, latest, myCharacters, useProto } from "@/state/store";
import { Field, SelectBox, XinfaOptions, inputCls } from "../shared";
import { ImportField, OfflineHint, useImportInput } from "./ImportCard";

const NAME_MAX = 12;

/** 没填名字时的默认名：配装 1、配装 2……同一心法里不重复 */
export function autoLoadoutName(all: Loadout[], xinfa: string) {
  const names = new Set(all.filter(l => l.xinfa === xinfa).map(l => l.name));
  let n = names.size + 1;
  while (names.has(`配装 ${n}`)) n++;
  return `配装 ${n}`;
}

function loadoutNameError(
  all: Loadout[],
  xinfa: string,
  name: string,
  selfId?: string
) {
  if (name.length > NAME_MAX) return `名字最多 ${NAME_MAX} 个字`;
  if (
    name &&
    all.some(l => l.xinfa === xinfa && l.name === name && l.id !== selfId)
  )
    return `${xinfa}里已经有「${name}」了`;
  return "";
}

/** 关联角色的下拉：只列这个心法的我的角色；没有就不显示 */
function CharLinkSelect({
  xinfa,
  value,
  onChange,
}: {
  xinfa: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { state } = useProto();
  const id = useId();
  const chars = myCharacters(state).filter(c => c.xinfa === xinfa);
  if (chars.length === 0) return null;
  return (
    <Field label="关联角色（可选）" htmlFor={id}>
      <SelectBox
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        wrapClassName="w-full"
        className={inputCls()}
      >
        <option value="">不关联</option>
        {chars.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.server}
          </option>
        ))}
      </SelectBox>
    </Field>
  );
}

/**
 * 新建配装：按心法建，大多数人只是想看某个心法不同配装的属性。
 * 关联角色放在最后，默认不关联。取消时什么都不会创建。
 */
export function NewLoadoutDialog({
  open,
  defaultXinfa,
  onClose,
  onStart,
}: {
  open: boolean;
  /** 打开时默认选中的心法，一般是正在看的那套配装的心法 */
  defaultXinfa?: string;
  onClose: () => void;
  /** 关闭弹窗后开始计算 */
  onStart: (p: {
    xinfa: string;
    name: string;
    charId: string | null;
    source: LoadoutSource;
    sourceId: string | null;
  }) => void;
}) {
  const { state } = useProto();
  const all = Object.values(state.loadouts);
  const mine = myCharacters(state);
  const offline = state.dataState === "offline";
  const input = useImportInput();
  const xinfaId = useId();
  const nameId = useId();

  const fallbackXinfa = defaultXinfa ?? mine[0]?.xinfa ?? XINFA_LIST[0];
  const [xinfa, setXinfa] = useState(fallbackXinfa);
  const [name, setName] = useState("");
  const [charId, setCharId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setXinfa(fallbackXinfa);
    setName("");
    setCharId("");
    setError("");
    input.setText("");
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const linked = mine.find(c => c.id === charId);
  const v = latest(findScheme(state, xinfa, "PVE"));
  const talentSource = v ? `${xinfa} PVE v${v.version}` : null;
  const placeholder = autoLoadoutName(all, xinfa);

  const submit = () => {
    const r = input.submit();
    const n = name.trim();
    const err = loadoutNameError(all, xinfa, n);
    setError(err);
    if (err || !r || offline) return;
    onClose();
    onStart({
      xinfa,
      name: n || placeholder,
      charId: linked ? linked.id : null,
      source: r.source,
      sourceId: r.sourceId,
    });
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
        <div className="grid grid-cols-[168px_1fr] gap-3">
          <Field label="心法" htmlFor={xinfaId}>
            <SelectBox
              id={xinfaId}
              value={xinfa}
              onChange={e => {
                setXinfa(e.target.value);
                setCharId("");
                setError("");
              }}
              wrapClassName="w-full"
              className={inputCls()}
            >
              <XinfaOptions />
            </SelectBox>
          </Field>
          <Field label="名称" htmlFor={nameId} error={error}>
            <input
              id={nameId}
              value={name}
              maxLength={NAME_MAX + 4}
              onChange={e => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={e => {
                if (e.key === "Enter") submit();
              }}
              placeholder={placeholder}
              aria-invalid={!!error}
              className={inputCls(!!error)}
            />
          </Field>
        </div>

        <ImportField
          input={input}
          label="配装"
          labelClassName="text-[12.5px] font-medium text-paper"
          charName={linked?.name}
          xinfa={xinfa}
          talentSource={talentSource}
          onSubmitKey={submit}
        />

        <CharLinkSelect xinfa={xinfa} value={charId} onChange={setCharId} />
      </div>
    </InlineModal>
  );
}

/** 编辑配装：改名、改关联角色、删除 */
export function EditLoadoutDialog({
  loadout,
  open,
  onClose,
}: {
  loadout: Loadout;
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const all = Object.values(state.loadouts);
  const nameId = useId();
  const [name, setName] = useState(loadout.name);
  const [charId, setCharId] = useState(loadout.charId ?? "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(loadout.name);
    setCharId(loadout.charId ?? "");
    setError("");
    setConfirmDelete(false);
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    const n = name.trim();
    const err = n
      ? loadoutNameError(all, loadout.xinfa, n, loadout.id)
      : "名字不能为空";
    setError(err);
    if (err) return;
    actions.updateLoadout(loadout.id, { name: n, charId: charId || null });
    onClose();
    actions.toast("manager", "success", "已保存");
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    actions.removeLoadout(loadout.id);
    onClose();
    actions.toast("manager", "success", `已删除「${loadout.name}」`);
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="编辑配装"
      width={440}
      footer={
        <>
          <Btn
            variant={confirmDelete ? "danger" : "ghost"}
            size="md"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={remove}
            className="mr-auto"
          >
            {confirmDelete ? "确认删除" : "删除"}
          </Btn>
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" size="md" onClick={save}>
            保存
          </Btn>
        </>
      }
    >
      <div className="space-y-5 pb-1">
        <Field label="名称" htmlFor={nameId} error={error}>
          <input
            id={nameId}
            value={name}
            data-autofocus
            maxLength={NAME_MAX + 4}
            onChange={e => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={e => {
              if (e.key === "Enter") save();
            }}
            aria-invalid={!!error}
            className={inputCls(!!error)}
          />
        </Field>
        <CharLinkSelect
          xinfa={loadout.xinfa}
          value={charId}
          onChange={setCharId}
        />
      </div>
    </InlineModal>
  );
}
