/**
 * 内置原版计算器的输入：配装页存这份原样数据，打开配装器时照它恢复，改完交给引擎重算。
 * 装备 id、小附魔 id、五彩石名称都是原版计算器装备库里的值（当季库），和旧赛季的 equip.ts 不通用。
 */
export type CalcBigKey = "hat" | "coat" | "belt" | "wrist" | "shoes";

export interface CalcSlotInput {
  id: number;
  refine: number;
  /** 每个孔的宝石等级，0–8 */
  gems: number[];
  /** 小附魔 id；null 是没附魔 */
  enchant: number | null;
}

export interface CalcTeamInput {
  name: string;
  on: boolean;
  /** 覆盖率，百分数；不填用增益自己的默认值 */
  cover?: number;
  stacks?: number;
}

export interface CalcBattle {
  loop: string;
  target: string;
  /** 增益总开关，关了只算木桩裸面板 */
  buffOn: boolean;
  formation: string;
  foods: string[];
  team: CalcTeamInput[];
  latency: number;
}

export interface CalcInput {
  /** 键是计算器的部位索引 _1 … _12 */
  slots: Record<string, CalcSlotInput | null>;
  stone: string | null;
  big: Record<CalcBigKey, number>;
  battle: CalcBattle;
}
