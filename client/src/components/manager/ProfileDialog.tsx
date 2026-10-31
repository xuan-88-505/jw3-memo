import { useEffect, useState } from "react";
import { moodFor } from "@/components/brand/Huangji";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn } from "@/components/common/ui";
import type { CharacterAvatar } from "@/data/types";
import { ROLE_LABEL } from "@/lib/format";
import { teamErrorText, useTeam } from "@/lib/team/TeamSync";
import { isOnline, me, useProto } from "@/state/store";
import {
  AvatarChoices,
  AvatarError,
  EditableAvatar,
  sameAvatar,
} from "./AvatarPicker";
import { Field, inputCls } from "./shared";
import { tx } from "@/lib/i18n";

const NAME_MAX = 12;

/** 个人资料：昵称 + 头像。保存后亲友团页、修改记录等所有显示你的地方一起更新 */
export function ProfileDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  // 桌面版在亲友团里：资料存到服务器，其他成员同步后看到
  const session = useTeam();
  const remote = !!session?.account && !!state.team;
  const self = me(state);
  const online = isOnline(state);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<CharacterAvatar>({
    kind: "preset",
    mood: "大笑",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  // 每次打开时回到当前资料
  useEffect(() => {
    if (!open || !self) return;
    setName(self.name);
    setAvatar(self.avatar ?? { kind: "preset", mood: moodFor(self.name) });
    setError("");
    setBusy(false);
    setSaving(false);
    setAvatarError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !self) return null;

  const n = name.trim();
  const current = self.avatar ?? { kind: "preset", mood: moodFor(self.name) };
  const changed = n !== self.name || !sameAvatar(avatar, current);

  const validate = () => {
    if (!n) return tx("填一下昵称");
    if (n.length > NAME_MAX) return tx("昵称最多 {0} 个字", NAME_MAX);
    if (
      state.members.some(
        m => m.id !== self.id && m.name.trim().toLowerCase() === n.toLowerCase()
      )
    )
      return tx("亲友团里已经有人叫「{0}」了", n);
    return "";
  };

  const save = async () => {
    if (saving) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    if (remote && session) {
      setSaving(true);
      try {
        await session.updateMe({
          ...(n !== self.name ? { name: n } : {}),
          ...(!sameAvatar(avatar, current) ? { avatar } : {}),
        });
      } catch (e) {
        setSaving(false);
        setError(teamErrorText(e));
        return;
      }
      setSaving(false);
      actions.toast("manager", "success", tx("已更新个人资料"));
      onClose();
      return;
    }
    actions.updateMe({ name: n, avatar });
    actions.toast("manager", "success", tx("已更新个人资料"));
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("个人资料")}
      width={460}
      bodyMaxHeight={540}
      footer={
        <>
          {!online && (
            <span className="mr-auto text-[12px] text-gold">
              {tx("离线时不能保存")}
            </span>
          )}
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={() => void save()}
            disabled={!changed || busy || saving || !online}
          >
            {saving ? tx("正在保存") : tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="pb-1">
        <div className="flex items-start gap-4">
          <EditableAvatar
            size={64}
            round
            onUpload={src => setAvatar({ kind: "upload", src })}
            onBusyChange={setBusy}
            onError={setAvatarError}
          >
            <Avatar
              member={{ ...self, name: n || self.name, avatar }}
              size={64}
              animated
            />
          </EditableAvatar>
          <div className="min-w-0 flex-1">
            <Field label={tx("昵称")} htmlFor="me-name" error={error}>
              <input
                id="me-name"
                data-autofocus
                value={name}
                maxLength={20}
                disabled={saving}
                spellCheck={false}
                onChange={e => {
                  setName(e.target.value);
                  setError("");
                }}
                onKeyDown={e => e.key === "Enter" && void save()}
                aria-invalid={!!error}
                className={inputCls(!!error)}
              />
            </Field>
            <p className="mt-1.5 text-[12px] text-paper-3">
              {state.team
                ? tx("{0} · 亲友团成员都能看到", ROLE_LABEL[self.role])
                : tx("只在本机显示")}
            </p>
          </div>
        </div>
        <AvatarError message={avatarError} />
        <AvatarChoices
          value={avatar}
          onChange={a => {
            setAvatar(a);
            setAvatarError("");
          }}
          renderAvatar={(a, size, animated) => (
            <Avatar
              member={{ ...self, avatar: a }}
              size={size}
              animated={animated}
            />
          )}
        />
      </div>
    </InlineModal>
  );
}
