import { ChevronRight, Download, Shirt, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import type { GearConfig } from "@/data/enchants";
import {
  configOf,
  makeLoadout,
  type Loadout,
  type LoadoutSource,
} from "@/data/gear";
import { cn } from "@/lib/utils";
import { XINFA_LIST, xinfasOf } from "@/data/seed";
import { findScheme, latest, myCharacters, useProto } from "@/state/store";
import { Field, SelectBox, inputCls } from "../shared";
import { XinfaPairSelect } from "../SchoolPicker";
import { EnchantEditor } from "./EnchantEditor";
import { ImportField, OfflineHint, useImportInput } from "./ImportCard";
import { tx } from "@/lib/i18n";
import { calcSupported } from "@/lib/dpsCalc";
import { useBundledCalc } from "@/lib/calcEngine";

const sameConfig = (a: GearConfig, b: GearConfig) =>
  JSON.stringify(a) === JSON.stringify(b);

const NAME_MAX = 12;

/** 没填名字时的默认名：配装 1、配装 2……同一心法里不重复 */
export function autoLoadoutName(all: Loadout[], xinfa: string) {
  const names = new Set(all.filter(l => l.xinfa === xinfa).map(l => l.name));
  let n = names.size + 1;
  while (names.has(tx("配装 {0}", n))) n++;
  return tx("配装 {0}", n);
}

function loadoutNameError(
  all: Loadout[],
  xinfa: string,
  name: string,
  selfId?: string
) {
  if (name.length > NAME_MAX) return tx("名字最多 {0} 个字", NAME_MAX);
  if (
    name &&
    all.some(l => l.xinfa === xinfa && l.name === name && l.id !== selfId)
  )
    return tx("{0}里已经有「{1}」了", xinfa, name);
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
  const chars = myCharacters(state).filter(c => xinfasOf(c).includes(xinfa));
  if (chars.length === 0) return null;
  return (
    <Field label={tx("关联角色（可选）")} htmlFor={id}>
      <SelectBox
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        wrapClassName="w-full"
        className={inputCls()}
      >
        <option value="">{tx("不关联")}</option>
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
 * 导入是选填的：不填就手动配，先放一套当前品级的推荐装备，再到配装器里逐件换。
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
    /** 用户改过附魔才有；没改就用导入的 */
    config?: GearConfig;
  }) => void;
}) {
  const { state } = useProto();
  const all = Object.values(state.loadouts);
  const mine = myCharacters(state);
  const offline = state.dataState === "offline";
  const input = useImportInput();
  const xinfaId = useId();
  const nameId = useId();

  const fallbackXinfa =
    defaultXinfa ?? (mine[0] && xinfasOf(mine[0])[0]) ?? XINFA_LIST[0];
  const [xinfa, setXinfa] = useState(fallbackXinfa);
  const [name, setName] = useState("");
  const [charId, setCharId] = useState("");
  const [error, setError] = useState("");
  const [enchantOpen, setEnchantOpen] = useState(false);
  // 这个心法导入后的样子，用来显示默认附魔、估算秒伤
  const draft = useMemo(
    () =>
      makeLoadout({
        id: "draft",
        xinfa,
        name: "",
        charId: null,
        source: "json",
        sourceId: null,
      }),
    [xinfa]
  );
  const [config, setConfig] = useState<GearConfig>(() => configOf(draft));
  const customized = !sameConfig(config, configOf(draft));
  // 配装器能用的心法：附魔和五彩石在配装器里按当季选，这里的是上赛季的表，不显示
  const bundled = useBundledCalc();
  const native = calcSupported(xinfa) && bundled !== false;

  useEffect(() => {
    if (!open) return;
    setXinfa(fallbackXinfa);
    setName("");
    setCharId("");
    setError("");
    setEnchantOpen(false);
    setConfig(configOf(draft));
    input.setText("");
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const linked = mine.find(c => c.id === charId);
  const v = latest(findScheme(state, xinfa, "PVE"));
  const talentSource = v ? `${xinfa} PVE v${v.version}` : null;
  const placeholder = autoLoadoutName(all, xinfa);
  // 导入框是空的：手动配
  const manual = !input.text.trim();

  const submit = () => {
    const r = manual ? null : input.submit();
    const n = name.trim();
    const err = loadoutNameError(all, xinfa, n);
    setError(err);
    if (err || offline || (!manual && !r)) return;
    onClose();
    onStart({
      xinfa,
      name: n || placeholder,
      charId: linked ? linked.id : null,
      source: r ? r.source : "manual",
      sourceId: r ? r.sourceId : null,
      config: customized && !native ? config : undefined,
    });
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={tx("新建配装")}
      width={520}
      bodyMaxHeight={500}
      footer={
        <>
          {offline && <OfflineHint />}
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            icon={
              manual ? (
                <Shirt className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )
            }
            disabled={offline || (!manual && !input.canSubmit)}
            onClick={submit}
          >
            {manual ? tx("手动配装") : tx("导入并计算")}
          </Btn>
        </>
      }
    >
      <div className="space-y-5 pb-1">
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,4fr)] gap-3">
          <Field label={tx("心法")} htmlFor={xinfaId}>
            <XinfaPairSelect
              id={xinfaId}
              value={xinfa}
              onChange={x => {
                setXinfa(x);
                setCharId("");
                setError("");
                // 换心法后附魔选项不同，回到默认
                setConfig(
                  configOf(
                    makeLoadout({
                      id: "draft",
                      xinfa: x,
                      name: "",
                      charId: null,
                      source: "json",
                      sourceId: null,
                    })
                  )
                );
              }}
            />
          </Field>
          <Field label={tx("名称")} htmlFor={nameId} error={error}>
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
          label={tx("导入（可选）")}
          labelClassName="text-[12.5px] font-medium text-paper"
          charName={linked?.name}
          xinfa={xinfa}
          talentSource={talentSource}
          onSubmitKey={submit}
        />

        {!native && (
          <section>
            <button
              type="button"
              onClick={() => setEnchantOpen(v => !v)}
              aria-expanded={enchantOpen}
              className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium text-paper"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-paper-3 transition-transform",
                  enchantOpen && "rotate-90"
                )}
                aria-hidden="true"
              />
              {tx("附魔与五彩石")}
              <span className="ml-auto text-[12px] font-normal text-paper-3">
                {customized
                  ? tx("已调整")
                  : manual
                    ? tx("默认")
                    : tx("跟随导入")}
              </span>
            </button>
            {enchantOpen && (
              <div className="mt-3">
                <EnchantEditor
                  base={draft}
                  value={config}
                  onChange={setConfig}
                />
              </div>
            )}
          </section>
        )}

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
  const [config, setConfig] = useState<GearConfig>(() => configOf(loadout));
  // 配装器能用的心法：附魔和五彩石在配装器里按当季选，这里不显示上赛季的表
  const bundled = useBundledCalc();
  const native = calcSupported(loadout.xinfa) && bundled !== false;

  useEffect(() => {
    if (!open) return;
    setName(loadout.name);
    setCharId(loadout.charId ?? "");
    setError("");
    setConfirmDelete(false);
    setConfig(configOf(loadout));
    // 只在打开时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    const n = name.trim();
    const err = n
      ? loadoutNameError(all, loadout.xinfa, n, loadout.id)
      : tx("名字不能为空");
    setError(err);
    if (err) return;
    actions.updateLoadout(loadout.id, { name: n, charId: charId || null });
    if (!native && !sameConfig(config, configOf(loadout)))
      actions.configureLoadout(loadout.id, config);
    onClose();
    actions.toast("manager", "success", tx("已保存"));
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    actions.removeLoadout(loadout.id);
    onClose();
    actions.toast("manager", "success", tx("已删除「{0}」", loadout.name));
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={tx("编辑配装")}
      width={560}
      bodyMaxHeight={520}
      footer={
        <>
          <Btn
            variant={confirmDelete ? "danger" : "ghost"}
            size="md"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={remove}
            className="mr-auto"
          >
            {confirmDelete ? tx("确认删除") : tx("删除")}
          </Btn>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="primary" size="md" onClick={save}>
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="space-y-5 pb-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx("名称")} htmlFor={nameId} error={error}>
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
        {!native && (
          <div className="border-t border-paper/[0.07] pt-5">
            <EnchantEditor base={loadout} value={config} onChange={setConfig} />
          </div>
        )}
      </div>
    </InlineModal>
  );
}
