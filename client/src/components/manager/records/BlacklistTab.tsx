import { AlertTriangle, Check, ShieldAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn } from "@/components/common/ui";
import {
  BLACK_TAGS,
  blackEntriesFor,
  roleByUid,
  type BlackEntry,
  type GameRole,
} from "@/data/records";
import { cn } from "@/lib/utils";
import { canEdit, isOnline, memberName, useProto, isSolo } from "@/state/store";
import { EmptyState, Field } from "../shared";
import { fmtDay, RoleLookup, RoleName } from "./RoleLookup";

export type BlackEditing = { id: string | "new"; preset?: GameRole } | null;

function TagChips({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span
          key={t}
          className="rounded px-1.5 py-px text-[11.5px] text-cinnabar-text ring-1 ring-inset ring-cinnabar/30"
        >
          {t}
        </span>
      ))}
    </span>
  );
}

export function BlacklistTab({
  editing,
  onEdit,
}: {
  editing: BlackEditing;
  onEdit: (e: BlackEditing) => void;
}) {
  const { state } = useProto();
  const [check, setCheck] = useState<GameRole | null>(null);
  const writable = canEdit(state) && isOnline(state);
  const lockReason = !canEdit(state)
    ? "只读成员不能修改"
    : !isOnline(state)
      ? "离线时不能修改"
      : undefined;
  const hits = check ? blackEntriesFor(state.blacklist, check) : [];
  const rows = [...state.blacklist].sort((a, b) => b.at.localeCompare(a.at));
  const entry =
    editing && editing.id !== "new"
      ? state.blacklist.find(b => b.id === editing.id)
      : undefined;

  return (
    <div className="space-y-4">
      <section aria-label="查人">
        <div className="max-w-[640px]">
          <RoleLookup
            id="bl-check"
            value={check}
            onChange={setCheck}
            blacklist={state.blacklist}
            online={isOnline(state)}
            showBlackWarning={false}
          />
        </div>
        {check && hits.length > 0 && (
          <ul className="mt-3 max-w-[640px] space-y-2">
            {hits.map(h => (
              <li
                key={h.id}
                className="flex items-start gap-2.5 rounded-lg bg-cinnabar/[0.08] px-3 py-2.5 ring-1 ring-inset ring-cinnabar/25"
              >
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-cinnabar-text"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 text-[12.5px]">
                  <TagChips tags={h.tags} />
                  {h.reason && <p className="mt-1.5 text-paper">{h.reason}</p>}
                  <p className="mt-1 text-paper-3">
                    {!isSolo(state) && `${memberName(state, h.by)} · `}
                    {fmtDay(h.at)}
                    {h.nameAtRecord !== check.name &&
                      ` · 记录时叫「${h.nameAtRecord}」`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {check && hits.length === 0 && (
          <div className="mt-3 flex items-center gap-3">
            <p className="flex items-center gap-1.5 text-[12.5px] text-jade">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              名单里没有这个人
            </p>
            <Btn
              size="xs"
              variant="ghost"
              disabled={!writable}
              title={lockReason}
              onClick={() => onEdit({ id: "new", preset: check })}
            >
              加入避雷
            </Btn>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="避雷名单是空的"
        />
      ) : (
        <div className="-mx-3">
          <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[168px]" />
              <col className="w-[96px]" />
              <col className="w-[136px]" />
              <col />
              <col className="w-[132px]" />
            </colgroup>
            <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
              <tr>
                <th className="px-3 py-2.5 font-normal">角色</th>
                <th className="px-3 py-2.5 font-normal">服务器</th>
                <th className="px-3 py-2.5 font-normal">原因</th>
                <th className="px-3 py-2.5 font-normal">说明</th>
                <th className="px-3 py-2.5 font-normal">记录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.07]">
              {rows.map(b => {
                const by = state.members.find(m => m.id === b.by);
                const role = roleByUid(b.uid);
                return (
                  <tr
                    key={b.id}
                    onClick={writable ? () => onEdit({ id: b.id }) : undefined}
                    className={cn(
                      writable && "cursor-pointer hover:bg-paper/[0.025]"
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        disabled={!writable}
                        onClick={e => {
                          e.stopPropagation();
                          onEdit({ id: b.id });
                        }}
                        className="w-full min-w-0 text-left disabled:cursor-default"
                        aria-label={`修改「${role?.name ?? b.nameAtRecord}」的避雷记录`}
                      >
                        <RoleName
                          uid={b.uid}
                          fallbackName={b.nameAtRecord}
                          server={b.server}
                          stacked
                        />
                      </button>
                    </td>
                    <td className="truncate px-3 py-2.5 text-paper-2">
                      {b.server}
                    </td>
                    <td className="px-3 py-2.5">
                      <TagChips tags={b.tags} />
                    </td>
                    <td
                      className="truncate px-3 py-2.5 text-paper-2"
                      title={b.reason || undefined}
                    >
                      {b.reason || <span className="text-paper-3">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        {by && !isSolo(state) && (
                          <Avatar member={by} size={20} />
                        )}
                        <span className="min-w-0">
                          {!isSolo(state) && (
                            <span className="block truncate text-paper-2">
                              {memberName(state, b.by)}
                            </span>
                          )}
                          <span className="block text-[11.5px] text-paper-3">
                            {fmtDay(b.at)}
                          </span>
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BlackDialog
        key={editing ? `${editing.id}-${editing.preset?.uid ?? ""}` : "closed"}
        open={editing !== null}
        entry={entry}
        preset={editing?.preset}
        onClose={() => onEdit(null)}
        onSwitchTo={id => onEdit({ id })}
      />
    </div>
  );
}

function BlackDialog({
  open,
  entry,
  preset,
  onClose,
  onSwitchTo,
}: {
  open: boolean;
  entry?: BlackEntry;
  preset?: GameRole;
  onClose: () => void;
  onSwitchTo: (id: string) => void;
}) {
  const { state, actions } = useProto();
  const [role, setRole] = useState<GameRole | null>(
    roleByUid(entry?.uid) ?? preset ?? null
  );
  const [nameOnly, setNameOnly] = useState<{
    name: string;
    server: string;
  } | null>(
    entry && !entry.uid
      ? { name: entry.nameAtRecord, server: entry.server }
      : null
  );
  const [notFound, setNotFound] = useState<{
    name: string;
    server: string;
  } | null>(null);
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const others = state.blacklist.filter(b => b.id !== entry?.id);
  const dup = role
    ? blackEntriesFor(others, role)
    : nameOnly
      ? others.filter(
          b =>
            !b.uid &&
            b.server === nameOnly.server &&
            b.nameAtRecord === nameOnly.name
        )
      : [];
  const errors = {
    target: !role && !nameOnly ? "先查到这个角色" : "",
    tags: tags.length === 0 ? "至少选一个原因" : "",
  };
  const blocked = dup.length > 0;

  const save = () => {
    setTried(true);
    if (errors.target || errors.tags || blocked) return;
    const target = role
      ? {
          uid: role.uid,
          nameAtRecord:
            entry && entry.uid === role.uid ? entry.nameAtRecord : role.name,
          server: role.server,
        }
      : { uid: null, nameAtRecord: nameOnly!.name, server: nameOnly!.server };
    actions.saveBlack({ ...target, tags, reason: reason.trim() }, entry?.id);
    onClose();
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={entry ? "修改避雷" : "加入避雷"}
      width={500}
      bodyMaxHeight={520}
      footer={
        <div className="flex w-full items-center gap-2">
          {entry &&
            (confirmDelete ? (
              <Btn
                variant="danger"
                size="md"
                onClick={() => {
                  actions.deleteBlack(entry.id);
                  onClose();
                }}
              >
                确定移出
              </Btn>
            ) : (
              <Btn
                variant="quiet"
                size="md"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmDelete(true)}
              >
                移出名单
              </Btn>
            ))}
          <span className="flex-1" />
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" size="md" disabled={blocked} onClick={save}>
            保存
          </Btn>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="角色"
          htmlFor="bl-role"
          error={tried && errors.target ? errors.target : undefined}
        >
          {nameOnly ? (
            <div>
              <div className="flex items-center gap-3 rounded-lg bg-paper/[0.04] px-3 py-2.5 ring-1 ring-inset ring-paper/10">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] bg-paper/[0.06] text-[13px] text-paper-3 ring-1 ring-inset ring-paper/10">
                  ?
                </span>
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                  {nameOnly.name}
                  <span className="ml-1.5 font-normal text-paper-3">
                    · {nameOnly.server}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setNameOnly(null)}
                  className="grid h-6 w-6 place-items-center rounded text-paper-3 transition-colors hover:bg-paper/[0.06] hover:text-paper"
                  aria-label="换一个角色"
                  title="换一个角色"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-gold">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                没匹配到游戏角色，对方改名后就对不上了
              </p>
            </div>
          ) : (
            <div>
              <RoleLookup
                id="bl-role"
                value={role}
                onChange={r => {
                  setRole(r);
                  setNotFound(null);
                }}
                blacklist={state.blacklist}
                online={isOnline(state)}
                showBlackWarning={false}
                invalid={tried && !!errors.target}
                onNotFound={(name, server) => setNotFound({ name, server })}
              />
              {!role && notFound && (
                <Btn
                  size="xs"
                  variant="ghost"
                  className="mt-1.5"
                  onClick={() => setNameOnly(notFound)}
                >
                  仍按「{notFound.name}」记下
                </Btn>
              )}
            </div>
          )}
        </Field>
        {blocked && (
          <p
            role="alert"
            className="-mt-1 flex items-center gap-2 text-[12px] text-cinnabar-text"
          >
            这个角色已经在名单里了
            <button
              type="button"
              onClick={() => onSwitchTo(dup[0].id)}
              className="underline underline-offset-2 hover:text-paper"
            >
              去改那一条
            </button>
          </p>
        )}

        <div>
          <p
            id="bl-tags-label"
            className="text-[12.5px] font-medium text-paper"
          >
            原因
          </p>
          <div
            role="group"
            aria-labelledby="bl-tags-label"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {BLACK_TAGS.map(t => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags(on ? tags.filter(x => x !== t) : [...tags, t])
                  }
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12.5px] ring-1 ring-inset transition-colors",
                    on
                      ? "bg-cinnabar/[0.22] text-paper ring-cinnabar/70"
                      : "text-paper-2 ring-paper/12 hover:bg-paper/[0.04] hover:text-paper"
                  )}
                >
                  {on && <Check className="h-3 w-3" aria-hidden="true" />}
                  {t}
                </button>
              );
            })}
          </div>
          {tried && errors.tags && (
            <p role="alert" className="mt-1.5 text-[12px] text-cinnabar-text">
              {errors.tags}
            </p>
          )}
        </div>

        <Field label="说明" htmlFor="bl-reason">
          <textarea
            id="bl-reason"
            value={reason}
            maxLength={200}
            rows={3}
            onChange={e => setReason(e.target.value)}
            className="w-full resize-none rounded-md bg-paper/[0.04] px-3 py-2 text-[13px] leading-relaxed text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] placeholder:text-paper-3/70 focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60"
          />
          <p className="mt-1 text-right text-[11.5px] tabular-nums text-paper-3">
            {reason.length}/200
          </p>
        </Field>
      </div>
    </InlineModal>
  );
}
