import { XINFA_META } from "./seed";

/**
 * 装备的游戏图标编号，图片地址 https://icon.jx3box.com/icon/{编号}.png（同奇穴、宏）。
 *
 * 2026-10-29 用魔盒物品接口 node.jx3box.com/item 查到，详见 research-notes.md：
 * - 防具：130 级 PVE 套装「玄阙」，每个门派一款；没有专属款的门派用通用款。
 * - 武器：130 级「幽墟荡秽」，每个门派一款。
 * - 饰品、暗器：通用款。
 *
 * 原型里的装备是示例数据，没有真实装备 ID，所以按门派和部位挑图标。
 * 正式版从茗伊装备码或魔盒配装里读到装备 ID 后，直接查这件装备自己的 IconID。
 */

type ArmorKey = "hat" | "coat" | "belt" | "wrist" | "pants" | "shoes";

/** 玄阙（130 级 PVE），门派专属款 */
const XUANQUE: Record<string, Record<ArmorKey, number>> = {
  纯阳: {
    coat: 27304,
    wrist: 27305,
    hat: 27306,
    pants: 27307,
    shoes: 27308,
    belt: 27309,
  },
  七秀: {
    coat: 27346,
    wrist: 27347,
    hat: 27348,
    pants: 27349,
    shoes: 27350,
    belt: 27351,
  },
  万花: {
    coat: 27370,
    wrist: 27371,
    hat: 27372,
    pants: 27373,
    shoes: 27374,
    belt: 27375,
  },
  万灵: {
    coat: 27376,
    wrist: 27377,
    hat: 27378,
    pants: 27379,
    shoes: 27380,
    belt: 27381,
  },
};

/** 幽墟荡秽（130 级），通用款防具 */
const YOUXU: Record<ArmorKey, number> = {
  wrist: 10417,
  coat: 10418,
  pants: 10419,
  belt: 10420,
  shoes: 10421,
  hat: 10422,
};

/** 陶然意 / 坠微，另一套通用款，给候选装备用 */
const TAORAN: Record<ArmorKey, number> = {
  wrist: 25252,
  hat: 25253,
  pants: 25254,
  shoes: 25255,
  coat: 13285,
  belt: 13284,
};

/** 幽墟荡秽各门派武器 */
const WEAPON: Record<string, number> = {
  纯阳: 10375,
  七秀: 10384,
  万花: 10383,
  万灵: 19665,
  天策: 10382,
  少林: 10376,
  藏剑: 10380,
  五毒: 10385,
  唐门: 10387,
  明教: 10386,
  丐帮: 10378,
  苍云: 10388,
  长歌: 10377,
  霸刀: 10379,
  蓬莱: 11185,
  凌雪: 12369,
  衍天: 14441,
  药宗: 15880,
  刀宗: 17824,
  段氏: 23047,
  无相: 25549,
};

const NECK = [2834, 2838, 1199, 1200, 4248, 2836];
const PENDANT = [2842, 2840, 2844, 2843, 2841];
const RING = [1237, 1231, 1227, 1229, 1233, 1235];
const HIDDEN = [801, 802];

function isArmor(key: string): key is ArmorKey {
  return key in YOUXU;
}

function schoolOf(xinfa: string) {
  return XINFA_META[xinfa]?.school ?? "";
}

/**
 * 某个部位的图标编号。
 * variant 0 是身上穿的那件；1、2、3… 是候选装备，同一部位换不同款式。
 */
export function gearIconId(
  xinfa: string,
  slotKey: string,
  variant = 0
): number | undefined {
  const school = schoolOf(xinfa);
  if (isArmor(slotKey)) {
    const own = XUANQUE[school];
    const families = own ? [own, YOUXU, TAORAN] : [YOUXU, TAORAN];
    if (variant === 0) return families[0][slotKey];
    // 候选装备不和身上那件同款
    return families[1 + ((variant - 1) % (families.length - 1))][slotKey];
  }
  if (slotKey === "weapon") return WEAPON[school];
  const pool =
    slotKey === "neck"
      ? NECK
      : slotKey === "pendant"
        ? PENDANT
        : slotKey.startsWith("ring")
          ? RING
          : slotKey === "hidden"
            ? HIDDEN
            : null;
  if (!pool) return undefined;
  // 两枚戒指默认不同款
  const base = slotKey === "ring2" ? 1 : 0;
  return pool[(base + variant) % pool.length];
}

const SOURCE_VARIANT: Record<string, number> = {
  秘境掉落: 1,
  商店兑换: 2,
  上赛季: 3,
  试炼之地: 4,
};

/** 候选装备的图标：按来源换款式；"已装备"用身上那件 */
export function candidateIconId(
  xinfa: string,
  slotKey: string,
  source: string,
  current?: boolean
) {
  if (current) return gearIconId(xinfa, slotKey, 0);
  const kind = source.split(" · ")[0];
  return gearIconId(xinfa, slotKey, SOURCE_VARIANT[kind] ?? 1);
}
