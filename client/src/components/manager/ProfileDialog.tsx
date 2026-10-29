import { useEffect, useState } from "react";
import { moodFor } from "@/components/brand/Huangji";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn } from "@/components/common/ui";
import type { CharacterAvatar } from "@/data/types";
import { ROLE_LABEL } from "@/lib/format";
import { isOnline, me, useProto } from "@/state/store";
import { AvatarChoices, sameAvatar } from "./AvatarPicker";
import { Field, inputCls } from "./shared";

const NAME_MAX = 12;

/** 个人资料：昵称 + 头像。保存后亲友团页、技改记录等所有显示你的地方一起更新 */
export function ProfileDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const self = me(state);
  const online = isOnline(state);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<CharacterAvatar>({
    kind: "preset",
    mood: "大笑",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 每次打开时回到当前资料
  useEffect(() => {
    if (!open || !self) return;
    setName(self.name);
    setAvatar(self.avatar ?? { kind: "preset", mood: moodFor(self.name) });
    setError("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !self) return null;

  const n = name.trim();
  const current = self.avatar ?? { kind: "preset", mood: moodFor(self.name) };
  const changed = n !== self.name || !sameAvatar(avatar, current);

  const validate = () => {
    if (!n) return "填一下昵称";
    if (n.length > NAME_MAX) return `昵称最多 ${NAME_MAX} 个字`;
    if (state.members.some(m => m.id !== self.id && m.name === n))
      return `亲友团里已经有人叫「${n}」了`;
    return "";
  };

  const save = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    actions.updateMe({ name: n, avatar });
    actions.toast("manager", "success", "已更新个人资料");
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title="个人资料"
      width={460}
      bodyMaxHeight={540}
      footer={
        <>
          {!online && (
            <span className="mr-auto text-[12px] text-gold">
              离线时不能保存
            </span>
          )}
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={save}
            disabled={!changed || busy || !online}
          >
            保存
          </Btn>
        </>
      }
    >
      <div className="pb-1">
        <div className="flex items-start gap-4">
          <Avatar
            member={{ ...self, name: n || self.name, avatar }}
            size={64}
            animated
          />
          <div className="min-w-0 flex-1">
            <Field label="昵称" htmlFor="me-name" error={error}>
              <input
                id="me-name"
                data-autofocus
                value={name}
                maxLength={20}
                spellCheck={false}
                onChange={e => {
                  setName(e.target.value);
                  setError("");
                }}
                onKeyDown={e => e.key === "Enter" && save()}
                aria-invalid={!!error}
                className={inputCls(!!error)}
              />
            </Field>
            <p className="mt-1.5 text-[12px] text-paper-3">
              {ROLE_LABEL[self.role]} · 亲友团成员都能看到
            </p>
          </div>
        </div>
        <AvatarChoices
          value={avatar}
          onChange={setAvatar}
          onBusyChange={setBusy}
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
