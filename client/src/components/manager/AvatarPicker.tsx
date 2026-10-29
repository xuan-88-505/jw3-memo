import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2 } from "lucide-react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { HUANGJI_MOODS, type HuangjiMood } from "@/components/brand/Huangji";
import { InlineModal } from "@/components/common/overlay";
import { Btn } from "@/components/common/ui";
import type { Character, CharacterAvatar } from "@/data/types";
import { AVATAR_MAX_MB, AVATAR_TYPES, fileToAvatar } from "@/lib/image";
import { isOnline, useProto } from "@/state/store";
import { cn } from "@/lib/utils";

const DEFAULT_AVATAR: CharacterAvatar = { kind: "preset", mood: "大笑" };

function sameAvatar(a?: CharacterAvatar, b?: CharacterAvatar) {
  const x = a ?? DEFAULT_AVATAR;
  const y = b ?? DEFAULT_AVATAR;
  if (x.kind !== y.kind) return false;
  return x.kind === "preset"
    ? x.mood === (y as typeof x).mood
    : x.src === (y as typeof x).src;
}

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
  const [upload, setUpload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState<HuangjiMood | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次打开时回到角色当前的头像
  useEffect(() => {
    if (!character) return;
    const av = character.avatar ?? DEFAULT_AVATAR;
    setChoice(av);
    setUpload(av.kind === "upload" ? av.src : null);
    setError("");
    setBusy(false);
    setDragOver(false);
  }, [character]);

  if (!character) return null;

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const src = await fileToAvatar(file);
      setUpload(src);
      setChoice({ kind: "upload", src });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changed = !sameAvatar(choice, character.avatar);

  const save = () => {
    actions.setCharacterAvatar(character.id, choice);
    actions.toast("manager", "success", `已更换「${character.name}」的头像`);
    onClose();
  };

  const tile =
    "flex flex-col items-center gap-1 rounded-lg py-2 text-[12px] transition-colors ring-1 ring-inset";
  const tileState = (selected: boolean) =>
    selected
      ? "bg-cinnabar/[0.08] text-paper ring-2 ring-cinnabar-text/70"
      : "text-paper-2 ring-paper/8 hover:bg-paper/[0.04] hover:text-paper";

  return (
    <InlineModal
      open
      onClose={onClose}
      title="更换头像"
      width={460}
      bodyMaxHeight={520}
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
        <div className="flex items-center gap-3.5">
          <CharAvatar
            character={{ ...character, avatar: choice }}
            size={64}
            animated
          />
          <div className="min-w-0">
            <p className="truncate font-serif text-[16px] font-semibold text-paper">
              {character.name}
            </p>
            <p className="text-[12.5px] text-paper-3">
              {character.server} · {character.xinfa}
            </p>
          </div>
        </div>

        <p className="mb-2 mt-5 text-[12px] text-paper-3">黄鸡表情</p>
        <div
          className="grid grid-cols-6 gap-1.5"
          onMouseLeave={() => setHovered(null)}
        >
          {HUANGJI_MOODS.map(m => {
            const selected = choice.kind === "preset" && choice.mood === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={selected}
                aria-label={m.key}
                onMouseEnter={() => setHovered(m.key)}
                onFocus={() => setHovered(m.key)}
                onClick={() => {
                  setChoice({ kind: "preset", mood: m.key });
                  setError("");
                }}
                className={cn(tile, tileState(selected))}
              >
                <CharAvatar
                  character={{
                    xinfa: character.xinfa,
                    avatar: { kind: "preset", mood: m.key },
                  }}
                  size={36}
                  animated={selected || hovered === m.key}
                />
                {m.key}
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-5 text-[12px] text-paper-3">自己的图片</p>
        <div className="flex gap-2">
          {upload && (
            <button
              type="button"
              aria-pressed={choice.kind === "upload"}
              onClick={() => setChoice({ kind: "upload", src: upload })}
              className={cn(
                tile,
                "w-[92px] shrink-0",
                tileState(choice.kind === "upload")
              )}
            >
              <CharAvatar
                character={{
                  xinfa: character.xinfa,
                  avatar: { kind: "upload", src: upload },
                }}
                size={36}
              />
              我的图片
            </button>
          )}
          <button
            type="button"
            disabled={busy}
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
            className={cn(
              "flex min-h-[78px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 text-center transition-colors",
              dragOver
                ? "border-cinnabar-text/70 bg-cinnabar/[0.06] text-paper"
                : "border-paper/20 text-paper-2 hover:border-paper/40 hover:text-paper"
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px]">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
              )}
              {busy ? "正在处理…" : upload ? "换一张" : "上传或拖进来"}
            </span>
            <span className="text-[11.5px] text-paper-3">
              PNG、JPG、WebP，最大 {AVATAR_MAX_MB} MB，自动裁成正方形
            </span>
          </button>
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
        </div>
        {error && (
          <p
            role="alert"
            className="mt-2 flex items-center gap-1.5 text-[12.5px] text-cinnabar-text"
          >
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        )}
      </div>
    </InlineModal>
  );
}
