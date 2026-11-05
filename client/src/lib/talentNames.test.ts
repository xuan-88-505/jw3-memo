import { describe, expect, it } from "vitest";
import { layersOf } from "@/data/seed";
import {
  MIN_NAMES,
  matchTalentNames,
  normTalent,
  picksByNames,
} from "./talentNames";

// 用户发来的截图：衍天宗·太玄经，一排 9 个
const TXJ = [
  "亘天",
  "灵器",
  "鬼遁",
  "顺祝",
  "世降",
  "镇星入舆",
  "御前星",
  "荧入白",
  "焚如",
];

// 按奇穴数据的层：截图里的排列顺序不一定是层的顺序，按名字找层
const TXJ_LAYERED = [
  "亘天",
  "灵器",
  "御前星",
  "顺祝",
  "鬼遁",
  "镇星入舆",
  "世降",
  "荧入白",
  "焚如",
];

/** 9 层选上的名字 */
const namesOf = (xinfa: string, picks: (number | null)[]) =>
  picks.map((p, i) =>
    p === null ? null : layersOf(xinfa)[i].options.find(o => o.pos === p)?.name
  );

describe("matchTalentNames", () => {
  it("紫霞功面板里贴太玄经的奇穴：认出是太玄经，9 层都对上", () => {
    const m = matchTalentNames(TXJ, { current: "紫霞功" });
    expect(m?.xinfa).toBe("太玄经");
    expect(m?.found).toBe(9);
    expect(namesOf("太玄经", m!.picks)).toEqual(TXJ_LAYERED);
  });

  it("截图上写着的心法名、当前心法只在一样多时才起作用", () => {
    expect(
      matchTalentNames(TXJ, { current: "紫霞功", hint: "紫霞功" })?.xinfa
    ).toBe("太玄经");
    expect(matchTalentNames(TXJ, { current: "太玄经" })?.xinfa).toBe("太玄经");
  });

  it("对上不到 3 个不算", () => {
    expect(MIN_NAMES).toBe(3);
    expect(
      matchTalentNames(["亘天", "灵器"], { current: "紫霞功" })
    ).toBeNull();
    expect(
      matchTalentNames(["不存在", "也没有"], { current: "紫霞功" })
    ).toBeNull();
    expect(matchTalentNames([], { current: "紫霞功" })).toBeNull();
  });

  it("只在给定的心法里找", () => {
    expect(
      matchTalentNames(TXJ, { current: "紫霞功", among: ["紫霞功", "花间游"] })
    ).toBeNull();
  });
});

describe("picksByNames", () => {
  it("第 7–9 层共用选项：按出现顺序依次填，不重复", () => {
    const r = picksByNames("太玄经", [...TXJ, "荧入白", "焚如"]);
    const tail = r.picks.slice(6);
    expect(new Set(tail).size).toBe(3);
    expect(namesOf("太玄经", r.picks).slice(6)).toEqual(TXJ_LAYERED.slice(6));
  });

  it("顺序乱了也按名字所在的层", () => {
    const r = picksByNames("太玄经", [...TXJ].reverse());
    expect(r.found).toBe(9);
    expect(namesOf("太玄经", r.picks).slice(0, 6)).toEqual(
      TXJ_LAYERED.slice(0, 6)
    );
    // 第 7–9 层按出现的顺序
    expect(namesOf("太玄经", r.picks).slice(6)).toEqual([
      "焚如",
      "荧入白",
      "世降",
    ]);
  });

  it("三个字以上容一个字认错；两个字的不容", () => {
    const r = picksByNames("太玄经", ["镇星入与", "御前心", "亘大"]);
    const names = namesOf("太玄经", r.picks);
    expect(names).toContain("镇星入舆");
    expect(names).toContain("御前星");
    expect(names).not.toContain("亘天");
  });

  it("全角、空白、标点不影响", () => {
    expect(normTalent(" 镇星·入舆 ")).toBe("镇星入舆");
    expect(picksByNames("太玄经", ["「亘天」", "灵 器", "鬼遁。"]).found).toBe(
      3
    );
  });
});
