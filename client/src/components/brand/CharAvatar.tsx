import { XINFA_META } from "@/data/seed";
import type { Character } from "@/data/types";
import { cn } from "@/lib/utils";
import { Huangji } from "./Huangji";

/**
 * 角色头像：默认是黄鸡表情，底色取心法颜色，方便一眼分出心法；
 * 上传了图片就显示图片。
 */
export function CharAvatar({
  character,
  size = 28,
  className,
}: {
  character: Pick<Character, "xinfa" | "avatar"> & { name?: string };
  size?: number;
  className?: string;
}) {
  const color = XINFA_META[character.xinfa]?.color ?? "#968F82";
  const av = character.avatar ?? { kind: "preset", mood: "laugh" };
  const radius = Math.max(6, Math.round(size * 0.24));
  const title = character.name
    ? `${character.name} · ${character.xinfa}`
    : character.xinfa;

  if (av.kind === "upload") {
    return (
      <span
        className={cn(
          "relative inline-block shrink-0 overflow-hidden bg-ink-4",
          className
        )}
        style={{ width: size, height: size, borderRadius: radius }}
        title={title}
      >
        <img
          src={av.src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
        <span
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-paper/15"
          style={{ borderRadius: radius }}
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `${color}2e`,
        boxShadow: `inset 0 0 0 1px ${color}66`,
      }}
      title={title}
    >
      <Huangji mood={av.mood} size={Math.round(size * 0.84)} />
    </span>
  );
}
