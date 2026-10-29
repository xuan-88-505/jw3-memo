import { useState } from "react";
import { cn } from "@/lib/utils";

const QUALITY = {
  purple: "bg-[#7A64B8]/20 text-[#C9B8F2] ring-[#7A64B8]/40",
  orange: "bg-[#C98A3E]/20 text-[#F0C48A] ring-[#C98A3E]/45",
} as const;

/** 品质描边，盖在图标上面 */
const QUALITY_EDGE = {
  purple: "ring-[#9A84E0]/75",
  orange: "ring-[#E0A04A]/85",
} as const;

/** 品质对应的名称颜色 */
export const QUALITY_TEXT = {
  purple: "text-[#C9B8F2]",
  orange: "text-[#F0C48A]",
} as const;

/** 装备图标：有图标编号时显示游戏图标，加载失败或没有编号时显示部位的一个字 */
export function ItemTile({
  text,
  iconId,
  quality,
  size = 30,
}: {
  text: string;
  iconId?: number;
  quality: keyof typeof QUALITY;
  size?: number;
}) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const showImg = iconId != null && failedId !== iconId;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-md font-serif ring-1 ring-inset",
        QUALITY[quality]
      )}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {showImg ? (
        <>
          <img
            src={`https://icon.jx3box.com/icon/${iconId}.png`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            draggable={false}
            onError={() => setFailedId(iconId)}
            className="h-full w-full object-cover"
          />
          <span
            className={cn(
              "pointer-events-none absolute inset-0 rounded-md ring-[1.5px] ring-inset",
              QUALITY_EDGE[quality]
            )}
          />
        </>
      ) : (
        text
      )}
    </span>
  );
}
