import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { InlineModal } from "@/components/common/overlay";
import { Btn, IconBtn, Segmented, StatusPill } from "@/components/common/ui";
import { SERVERS, XINFA_LIST } from "@/data/seed";
import type { Character, Mode } from "@/data/types";
import {
  charPending,
  findScheme,
  isOnline,
  isPending,
  latest,
  modesOf,
  myCharacters,
  statusOf,
  useProto,
} from "@/state/store";
import { AvatarPicker } from "./AvatarPicker";
import { EmptyState, Field, SectionHeader, inputCls } from "./shared";

export function CharactersView() {
  const { state, actions } = useProto();
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Character | null>(null);
  const [avatarFor, setAvatarFor] = useState<string | null>(null);
  const online = isOnline(state);

  useEffect(() => {
    if (state.managerIntent === "add-character") {
      setAdding(true);
      actions.clearIntent();
    }
  }, [state.managerIntent, actions]);

  const mine = myCharacters(state);
  const rows =
    filter === "pending" ? mine.filter(c => charPending(state, c)) : mine;
  const pending = mine.filter(c => charPending(state, c)).length;

  return (
    <div>
      <SectionHeader
        title="我的角色"
        right={
          mine.length > 0 && (
            <>
              <Segmented
                label="筛选"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `全部 ${mine.length}` },
                  { value: "pending", label: `待同步 ${pending}` },
                ]}
              />
              <Btn
                variant="primary"
                size="sm"
                onClick={() => setAdding(true)}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                添加角色
              </Btn>
            </>
          )
        }
      />

      {mine.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-5 w-5" />}
          title="还没有角色"
          action={
            <Btn
              variant="primary"
              size="md"
              onClick={() => setAdding(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              添加第一个角色
            </Btn>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-jade" />}
          title="全部已同步"
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-paper/8">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-ink-3 text-[12px] text-paper-3">
              <tr>
                <th className="px-4 py-2.5 font-normal">角色</th>
                <th className="px-4 py-2.5 font-normal">服务器</th>
                <th className="px-4 py-2.5 font-normal">同步状态</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.06]">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-paper/[0.02]">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setAvatarFor(c.id)}
                        aria-label={`更换「${c.name}」的头像`}
                        title="更换头像"
                        className="group relative shrink-0 rounded-[8px]"
                      >
                        <CharAvatar character={c} size={34} />
                        <span
                          className="absolute inset-0 grid place-items-center rounded-[8px] bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          aria-hidden="true"
                        >
                          <Pencil className="h-3.5 w-3.5 text-white" />
                        </span>
                      </button>
                      <span>
                        <span className="block font-medium text-paper">
                          {c.name}
                        </span>
                        <span className="block text-[12px] text-paper-3">
                          {c.xinfa}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-paper-2">{c.server}</td>
                  <td className="px-4 py-2.5">
                    <SyncCell char={c} online={online} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <IconBtn
                      label={`删除角色 ${c.name}`}
                      onClick={() => setRemoving(c)}
                      disabled={!online}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCharacterDialog open={adding} onClose={() => setAdding(false)} />

      <AvatarPicker
        character={mine.find(c => c.id === avatarFor) ?? null}
        onClose={() => setAvatarFor(null)}
      />

      <InlineModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`删除「${removing?.name}」？`}
        description="只删除角色和它的同步记录，方案不受影响。"
        footer={
          <>
            <Btn variant="ghost" size="md" onClick={() => setRemoving(null)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => {
                if (removing) {
                  actions.removeCharacter(removing.id);
                  actions.toast(
                    "manager",
                    "success",
                    `已删除「${removing.name}」`
                  );
                }
                setRemoving(null);
              }}
            >
              删除
            </Btn>
          </>
        }
      />
    </div>
  );
}

/** 只列出这个心法已有的模式；一个方案都没有时显示"无方案" */
function SyncCell({ char, online }: { char: Character; online: boolean }) {
  const { state } = useProto();
  const modes = modesOf(state, char.xinfa);
  if (modes.length === 0) return <StatusPill status="none" />;
  return (
    <div className="flex flex-col gap-1.5">
      {modes.map(m => (
        <ModeCell key={m} char={char} mode={m} online={online} />
      ))}
    </div>
  );
}

function ModeCell({
  char,
  mode,
  online,
}: {
  char: Character;
  mode: Mode;
  online: boolean;
}) {
  const { state, actions } = useProto();
  const st = statusOf(state, char, mode);
  const last = latest(findScheme(state, char.xinfa, mode));
  const synced = char.synced[mode];
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[12px] font-medium text-paper-3">
        {mode}
      </span>
      <StatusPill status={st} version={st === "synced" ? synced : undefined} />
      {isPending(st) && last && (
        <>
          <span className="text-[12px] text-paper-3">
            {synced ? `v${synced} → v${last.version}` : `最新 v${last.version}`}
          </span>
          <Btn
            variant="ghost"
            size="xs"
            disabled={!online}
            title={online ? "在游戏里改好后点这里" : "离线时不能标记"}
            onClick={() => {
              const r = actions.markSynced(char.id, mode);
              if (r)
                actions.toast(
                  "manager",
                  "success",
                  `「${r.name}」${mode} 已同步到 v${r.version}`
                );
            }}
          >
            标记
          </Btn>
        </>
      )}
    </div>
  );
}

function AddCharacterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const [name, setName] = useState("");
  const [server, setServer] = useState(SERVERS[0]);
  const [xinfa, setXinfa] = useState(XINFA_LIST[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    const n = name.trim();
    if (!n) return setError("填一下角色名");
    if (n.length > 12) return setError("角色名最多 12 个字");
    if (myCharacters(state).some(c => c.name === n && c.server === server)) {
      return setError(`${server} 已经有叫「${n}」的角色了`);
    }
    actions.addCharacter({ name: n, server, xinfa });
    const hasScheme = !!findScheme(state, xinfa, "PVE");
    actions.toast(
      "manager",
      "success",
      hasScheme
        ? `已添加「${n}」。去面板里看它要用的宏和奇穴。`
        : `已添加「${n}」，${xinfa}还没有方案`
    );
    onClose();
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="添加角色"
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={submit}
            disabled={!isOnline(state)}
          >
            添加
          </Btn>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label="角色名" htmlFor="char-name" error={error}>
          <input
            id="char-name"
            data-autofocus
            value={name}
            maxLength={20}
            onChange={e => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="游戏里的角色名"
            aria-invalid={!!error}
            className={inputCls(!!error)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="服务器" htmlFor="char-server">
            <select
              id="char-server"
              value={server}
              onChange={e => setServer(e.target.value)}
              className={inputCls()}
            >
              {SERVERS.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="心法" htmlFor="char-xinfa" hint="原型只有 4 个心法">
            <select
              id="char-xinfa"
              value={xinfa}
              onChange={e => setXinfa(e.target.value)}
              className={inputCls()}
            >
              {XINFA_LIST.map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </InlineModal>
  );
}
