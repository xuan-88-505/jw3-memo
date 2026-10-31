import type { TalentSet } from "@/data/types";
import { layerLabel } from "@/lib/format";
import { tx } from "@/lib/i18n";

/**
 * 一个方案版本可以存多套奇穴（比如单体、AOE）。
 * 第一套仍放在原来的 `talents` 里，旧数据、配装计算和同步都不用改；
 * 第二套起放在 `moreTalents` 里。界面统一用 talentSetsOf 拿到一个列表。
 */
export interface TalentFields {
  talents: number[];
  talentsName?: string;
  moreTalents?: TalentSet[];
}

/** 第一套的 id。只在界面和比较时用，不写进数据 */
export const MAIN_SET_ID = "main";
/** 一个方案最多几套 */
export const MAX_TALENT_SETS = 6;
/** 名字最长几个字 */
export const TALENT_SET_NAME_MAX = 10;

export function talentSetsOf(v: TalentFields): TalentSet[] {
  return [
    { id: MAIN_SET_ID, name: v.talentsName ?? "", talents: v.talents },
    ...(v.moreTalents ?? []),
  ];
}

/**
 * 把列表写回版本或草稿的字段。返回的三个键都在：
 * 用 `{ ...last, ...talentFieldsFrom(sets) }` 时，删掉的几套不会从 last 里带回来。
 * 值是 undefined 的键写文件和算哈希时都会被忽略。
 */
export function talentFieldsFrom(sets: TalentSet[]): Required<
  Pick<TalentFields, "talents">
> & {
  talentsName: string | undefined;
  moreTalents: TalentSet[] | undefined;
} {
  const [first, ...rest] = sets;
  const name = first?.name.trim();
  return {
    talents: [...(first?.talents ?? [])],
    talentsName: name ? name : undefined,
    moreTalents: rest.length
      ? rest.map(s => ({
          id: s.id,
          name: s.name.trim(),
          talents: [...s.talents],
        }))
      : undefined,
  };
}

/** 复制一份（草稿从版本开始改时用，避免改到原来的数组） */
export function copyTalentFields(v: TalentFields) {
  return talentFieldsFrom(talentSetsOf(v));
}

/** 按列表改版本或草稿里的奇穴，其他字段不动 */
export function mapTalentSets<T extends TalentFields>(
  v: T,
  fn: (sets: TalentSet[]) => TalentSet[]
): T {
  return { ...v, ...talentFieldsFrom(fn(talentSetsOf(v))) };
}

/** 显示用的名字：没起名时按顺序叫「第一套」「第二套」 */
export function talentSetLabel(set: Pick<TalentSet, "name">, index: number) {
  return set.name.trim() || tx("第{0}套", layerLabel(index));
}

export function sameTalentSets(a: TalentFields, b: TalentFields) {
  const x = talentSetsOf(a);
  const y = talentSetsOf(b);
  return (
    x.length === y.length &&
    x.every(
      (s, i) =>
        s.id === y[i].id &&
        s.name.trim() === y[i].name.trim() &&
        s.talents.join() === y[i].talents.join()
    )
  );
}

export function newTalentSetId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
