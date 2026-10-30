import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { schoolLabel } from "@/data/seed";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { HUANGJI_MOODS, type HuangjiMood } from "@/components/brand/Huangji";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import type { Character, CharacterAvatar } from "@/data/types";
import { AVATAR_MAX_MB, AVATAR_TYPES, fileToAvatar } from "@/lib/image";
import { isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

const DEFAULT_AVATAR: CharacterAvatar = { kind: "preset", mood: "大笑" };

export function sameAvatar(a?: CharacterAvatar, b?: CharacterAvatar) {
  const x = a ?? DEFAULT_AVATAR;
  const y = b ?? DEFAULT_AVATAR;
  if (x.kind !== y.kind) return false;
  return x.kind === "preset"
    ? x.mood === (y as typeof x).mood
    : x.src === (y as typeof x).src;
}

/**
 * 可上传的大头像：悬停或键盘聚焦时出现编辑图标，点击直接选图，也能把图片拖到头像上。
 * 角色换头像和个人资料共用；round 为成员的圆形头像，否则按角色头像的圆角。
 */
export function EditableAvatar({
  size,
  round = false,
  children,
  onUpload,
  onBusyChange,
  onError,
}: {
  size: number;
  round?: boolean;
  children: ReactNode;
  onUpload: (src: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const radius = round ? 9999 : Math.max(6, Math.round(size * 0.24));

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    onError("");
    setBusy(true);
    try {
      onUpload(await fileToAvatar(file));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={tx("上传图片作为头像")}
        title={tx(
          "上传图片作为头像（PNG、JPG、WebP，最大 {0} MB）",
          AVATAR_MAX_MB
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className="group/avatar relative shrink-0"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {children}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 grid place-items-center bg-black/55 text-paper opacity-0 transition-opacity duration-150 group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100",
            (busy || dragOver) && "opacity-100",
            dragOver && "ring-2 ring-inset ring-cinnabar-text/80"
          )}
          style={{ borderRadius: radius }}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Pencil className="h-[18px] w-[18px]" />
          )}
        </span>
      </button>
      {/* 放在按钮外面：点击文件框的事件不会再冒泡回按钮 */}
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** 上传头像失败的提示 */
export function AvatarError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 flex items-center gap-1.5 text-[12.5px] text-cinnabar-text"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * 头像选择：18 个黄鸡表情。上传自己的图片在上面的大头像上点。
 * renderAvatar 决定头像的形状（角色方形、成员圆形）。
 */
export function AvatarChoices({
  value,
  onChange,
  renderAvatar,
}: {
  value: CharacterAvatar;
  onChange: (a: CharacterAvatar) => void;
  renderAvatar: (
    a: CharacterAvatar,
    size: number,
    animated: boolean
  ) => ReactNode;
}) {
  const [hovered, setHovered] = useState<HuangjiMood | null>(null);
  return (
    <>
      <p className="mb-2 mt-5 text-[12px] text-paper-3">{tx("黄鸡表情")}</p>
      <div
        className="grid grid-cols-6 gap-1.5"
        onMouseLeave={() => setHovered(null)}
      >
        {HUANGJI_MOODS.map(m => {
          const selected = value.kind === "preset" && value.mood === m.key;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={selected}
              aria-label={tx(m.key)}
              onMouseEnter={() => setHovered(m.key)}
              onFocus={() => setHovered(m.key)}
              onClick={() => onChange({ kind: "preset", mood: m.key })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-2 text-[12px] ring-1 ring-inset transition-colors",
                selected
                  ? "bg-cinnabar/[0.08] text-paper ring-2 ring-cinnabar-text/70"
                  : "text-paper-2 ring-paper/10 hover:bg-paper/[0.04] hover:text-paper"
              )}
            >
              {renderAvatar(
                { kind: "preset", mood: m.key },
                36,
                selected || hovered === m.key
              )}
              {tx(m.key)}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 角色换头像 */
export function AvatarPicker({
  character,
  onClose,
}: {
  character: Character | null;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const online = isOnline(state);
  const [choice, setChoice] = useState<CharacterAvatar>(DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 每次打开时回到角色当前的头像
  useEffect(() => {
    if (!character) return;
    setChoice(character.avatar ?? DEFAULT_AVATAR);
    setBusy(false);
    setError("");
  }, [character]);

  if (!character) return null;

  const changed = !sameAvatar(choice, character.avatar);
  const save = () => {
    actions.setCharacterAvatar(character.id, choice);
    actions.toast(
      "manager",
      "success",
      tx("已更换「{0}」的头像", character.name)
    );
    onClose();
  };

  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("更换头像")}
      width={460}
      bodyMaxHeight={520}
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
            onClick={save}
            disabled={!changed || busy || !online}
          >
            {tx("保存")}
          </Btn>
        </>
      }
    >
      <div className="pb-1">
        <div className="flex items-center gap-3.5">
          <EditableAvatar
            size={64}
            onUpload={src => setChoice({ kind: "upload", src })}
            onBusyChange={setBusy}
            onError={setError}
          >
            <CharAvatar
              character={{ ...character, avatar: choice }}
              size={64}
              animated
            />
          </EditableAvatar>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-paper">
              {character.name}
            </p>
            <p className="text-[12.5px] text-paper-3">
              {character.server} · {schoolLabel(character)}
            </p>
          </div>
        </div>
        <AvatarError message={error} />
        <AvatarChoices
          value={choice}
          onChange={a => {
            setChoice(a);
            setError("");
          }}
          renderAvatar={(a, size, animated) => (
            <CharAvatar
              character={{ school: character.school, avatar: a }}
              size={size}
              animated={animated}
            />
          )}
        />
      </div>
    </InlineModal>
  );
}
