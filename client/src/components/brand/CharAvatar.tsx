import { schoolColor, schoolLabel } from "@/data/seed";
import type { Character } from "@/data/types";
import { cn } from "@/lib/utils";
import { Huangji, chickSize } from "./Huangji";

/**
 * 角色头像：默认是黄鸡表情，底色取门派颜色，方便一眼分出门派；
 * 上传了图片就显示图片。
 */
export function CharAvatar({
  character,
  size = 28,
  animated = false,
  className,
}: {
  character: Pick<Character, "school" | "avatar"> &
    Partial<Pick<Character, "name" | "only" | "liupai">>;
  size?: number;
  /** 播放黄鸡动图；默认静态 */
  animated?: boolean;
  className?: string;
}) {
  const color = schoolColor(character.school);
  const av = character.avatar ?? { kind: "preset", mood: "大笑" };
  const radius = Math.max(6, Math.round(size * 0.24));
  const label = schoolLabel({
    school: character.school,
    only: character.only ?? null,
    liupai: character.liupai ?? [],
  });
  const title = character.name ? `${character.name} · ${label}` : label;

  if (av.kind === "upload") {
    return (
      <span
        className={cn(
          "relative inline-block shrink-0 overflow-hidden bg-paper/[0.06]",
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
      <Huangji mood={av.mood} size={chickSize(size)} animated={animated} />
    </span>
  );
}
