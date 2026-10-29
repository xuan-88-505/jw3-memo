import { useCallback, useState } from "react";
import type { Attr } from "@/data/gear";
import {
  TYPE_TAG,
  itemTags,
  type EquipDef,
  type TypeGroup,
} from "@/data/equip";

/** 配装器的装备筛选：所有部位共用，记在本地 */
export interface GearFilter {
  /** 最低品级，0 是不限 */
  minIlvl: number;
  /** 带其中任一词条；空是不限 */
  attrs: Attr[];
  /** 不看的类型 */
  hide: TypeGroup[];
}

export const NO_FILTER: GearFilter = { minIlvl: 0, attrs: [], hide: [] };

/** 品级档位：装备库主要集中在 30xxx、35xxx、41xxx 三档 */
export const ILVL_STEPS: [number, string][] = [
  [0, "全部"],
  [30000, "30000+"],
  [35000, "35000+"],
  [41000, "41000+"],
];

/** 词条筛选的选项 */
export const FILTER_ATTRS: Attr[] = [
  "会心",
  "会心效果",
  "破防",
  "无双",
  "破招",
  "加速",
];

export function passes(def: EquipDef, f: GearFilter) {
  if (def.ilvl < f.minIlvl) return false;
  const tag = TYPE_TAG[def.type];
  if (tag && f.hide.includes(tag as TypeGroup)) return false;
  if (f.attrs.length) {
    const tags = itemTags(def);
    if (!tags.some(t => f.attrs.includes(t))) return false;
  }
  return true;
}

/** 生效的筛选条件数 */
export function filterCount(f: GearFilter) {
  return (f.minIlvl ? 1 : 0) + (f.attrs.length ? 1 : 0) + f.hide.length;
}

const KEY = "tongdiao.gearFilter.v1";

function read(): GearFilter {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return NO_FILTER;
    const v = JSON.parse(raw) as Partial<GearFilter>;
    return {
      minIlvl: typeof v.minIlvl === "number" ? v.minIlvl : 0,
      attrs: Array.isArray(v.attrs) ? v.attrs : [],
      hide: Array.isArray(v.hide) ? v.hide : [],
    };
  } catch {
    return NO_FILTER;
  }
}

export function useGearFilter(): [GearFilter, (f: GearFilter) => void] {
  const [f, setF] = useState<GearFilter>(read);
  const set = useCallback((next: GearFilter) => {
    setF(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 本地存储不可用时只在本次生效 */
    }
  }, []);
  return [f, set];
}
