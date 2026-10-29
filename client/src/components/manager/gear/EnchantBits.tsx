import { Gem } from "lucide-react";
import { useState } from "react";
import {
  BIG_ICON,
  BIG_LEVEL_LABEL,
  BIG_SLOTS,
  enchantDef,
  stoneDef,
  type BigLevel,
} from "@/data/enchants";
import { primaryAttr, type GearSlot, type Loadout } from "@/data/gear";
import { cn } from "@/lib/utils";

type LoadoutBits = Pick<Loadout, "xinfa" | "big" | "stone">;

/** 部位上的小附魔、大附魔、五彩石（只有主武器有五彩石） */
export function slotExtras(lo: LoadoutBits, slot: GearSlot) {
  const main = primaryAttr(lo.xinfa);
  const enchant = slot.enchant
    ? (enchantDef(main, slot.enchant)?.label ?? null)
    : null;
  const bigDef = BIG_SLOTS.find(b => b.key === slot.key);
  const big = bigDef
    ? { label: bigDef.label, level: lo.big[bigDef.key] as BigLevel }
    : null;
  const stone = slot.key === "weapon" ? stoneDef(main, lo.stone) : null;
  return { enchant, big, stone, hasStone: slot.key === "weapon" };
}

/** 两套配装的同一个部位，附魔有没有不一样 */
export function extrasDiffer(
  a: LoadoutBits,
  sa: GearSlot,
  b: LoadoutBits,
  sb: GearSlot
) {
  const x = slotExtras(a, sa);
  const y = slotExtras(b, sb);
  return (
    x.enchant !== y.enchant ||
    x.big?.level !== y.big?.level ||
    x.stone?.name !== y.stone?.name
  );
}

/** 大附魔图标：游戏图标，同魔盒配装器（英雄紫、普通绿） */
export function BigIcon({
  level,
  label,
  size = 16,
}: {
  level: 1 | 2;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const text = `大附魔 ${BIG_LEVEL_LABEL[level]}·${label}`;
  if (failed)
    return (
      <span
        title={text}
        aria-label={text}
        role="img"
        className={cn(
          "grid shrink-0 place-items-center rounded-[3px] text-[9px] font-semibold",
          level === 2
            ? "bg-[#7A64B8]/30 text-[#C9B8F2]"
            : "bg-jade/20 text-jade"
        )}
        style={{ width: size, height: size }}
      >
        {level === 2 ? "英" : "普"}
      </span>
    );
  return (
    <img
      src={`https://icon.jx3box.com/icon/${BIG_ICON[level]}.png`}
      width={size}
      height={size}
      alt={text}
      title={text}
      draggable={false}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[3px]"
    />
  );
}

/** 一行小字：小附魔 · 五彩石。没附魔时提示出来 */
export function ExtrasLine({
  lo,
  slot,
  className,
}: {
  lo: LoadoutBits;
  slot: GearSlot;
  className?: string;
}) {
  const x = slotExtras(lo, slot);
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[11px] text-paper-3",
        className
      )}
    >
      <span
        className={cn("truncate", !x.enchant && "text-cinnabar-text/80")}
        title={x.enchant ? `小附魔 ${x.enchant}` : undefined}
      >
        {x.enchant ?? "未附魔"}
      </span>
      {x.hasStone && (
        <span
          className={cn(
            "flex min-w-0 items-center gap-1",
            !x.stone && "text-cinnabar-text/80"
          )}
          title={x.stone ? `五彩石 ${x.stone.name}` : undefined}
        >
          <Gem className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{x.stone?.label ?? "未镶五彩石"}</span>
        </span>
      )}
    </span>
  );
}
