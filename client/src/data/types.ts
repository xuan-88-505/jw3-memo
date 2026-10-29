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

export interface SchemeVersion {
  version: number;
  macros: Macro[];
  /** 9 个数字，每层选中的 pos（从 1 开始） */
  talents: number[];
  note: string;
  authorId: string;
  at: string;
}

export interface Scheme {
  /** `${xinfa}-${mode}` */
  id: string;
  xinfa: string;
  mode: Mode;
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
  xinfa: string;
  ownerId: string;
  /** 每个模式已同步到的版本号；没有表示从没同步过 */
  synced: Partial<Record<Mode, number>>;
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
  | "changelog"
  | "team"
  | "settings";
