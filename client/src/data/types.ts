import type { HuangjiMood } from "@/components/brand/Huangji";
// 原型的数据类型。正式版的后台表结构会沿用这些字段。

export interface TalentOption {
  pos: number;
  name: string;
  icon: number;
  desc: string;
  isSkill: boolean;
}

export interface TalentLayer {
  /** 1–9 */
  layer: number;
  /** 第 7–9 层共用同一组选项，不能重复选择 */
  shared: boolean;
  options: TalentOption[];
}

export interface XinfaSample {
  layers: TalentLayer[];
  source: { title: string; author: string; id: number };
  talentSq: number[];
  macros: { name: string; icon: number; content: string }[];
}

export interface Jx3Sample {
  version: string;
  versionName: string;
  xinfa: Record<string, XinfaSample>;
}

export type Mode = "PVE" | "PVP";
export const MODES: Mode[] = ["PVE", "PVP"];

export type Role = "admin" | "editor" | "viewer";

export interface Member {
  id: string;
  name: string;
  role: Role;
  /** 头像底色 */
  color: string;
  /** 头像：默认是随机的黄鸡表情，也可以上传图片 */
  avatar?: CharacterAvatar;
  joinedAt: string;
}

export interface Macro {
  /** 同一个宏在不同版本里 id 不变，用来比较差异 */
  id: string;
  name: string;
  icon: number;
  content: string;
  /** 用户自己写的备注，显示在面板的宏名下面。只改备注不算技改 */
  note?: string;
}

/** 第二套起的一套奇穴。同一套在不同版本里 id 不变，用来比较差异 */
export interface TalentSet {
  id: string;
  /** 用户起的名字，比如「AOE」；空着时显示「第二套」 */
  name: string;
  /** 和 SchemeVersion.talents 一样：9 个数字 */
  talents: number[];
}

export interface SchemeVersion {
  version: number;
  macros: Macro[];
  /** 第一套奇穴：9 个数字，每层选中的 pos（从 1 开始）。配装计算用这一套 */
  talents: number[];
  /** 第一套的名字；没有时显示「第一套」 */
  talentsName?: string;
  /** 第二套起的奇穴。旧数据和只有一套时没有这个字段 */
  moreTalents?: TalentSet[];
  note: string;
  authorId: string;
  at: string;
}

export interface Scheme {
  /** `${xinfa}-${mode}` */
  id: string;
  xinfa: string;
  mode: Mode;
  /** 自定义标题；没有时显示「心法 · 模式」。改标题不产生新版本 */
  title?: string;
  /** 按版本号升序 */
  versions: SchemeVersion[];
}

/** 角色头像：默认用黄鸡表情，也可以上传图片（裁成正方形的 data URL） */
export type CharacterAvatar =
  | { kind: "preset"; mood: HuangjiMood }
  | { kind: "upload"; src: string };

export interface Character {
  id: string;
  name: string;
  server: string;
  /** 门派（职业），必选 */
  school: string;
  /** 只玩这一个心法；null 表示这个门派的心法都玩 */
  only: string | null;
  /** 学了的流派心法（如无相楼「幽罗引」），任何门派都能学 */
  liupai: string[];
  ownerId: string;
  /**
   * 每个心法、每个模式已同步到的版本号；没有表示从没同步过。
   * 改心法后旧心法的记录保留，改回去自动恢复
   */
  synced: Record<string, Partial<Record<Mode, number>>>;
  avatar?: CharacterAvatar;
}

export interface Team {
  name: string;
  inviteCode: string;
}

export type SyncStatus = "synced" | "pending" | "never" | "none";

export type Platform = "win" | "mac";
export type Scene = "desktop" | "game-window" | "game-full";
export type DataState = "normal" | "onboarding" | "offline" | "loading";
export type ManagerSection =
  | "schemes"
  | "characters"
  | "gear"
  | "records"
  | "team"
  | "settings";
