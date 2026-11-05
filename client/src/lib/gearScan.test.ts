import { describe, expect, it } from "vitest";
import type { CalcCatalog, CalcEquip } from "./calcEngine";
import {
  bestEnchant,
  bestStone,
  matchScan,
  normName,
  similarity,
  type ScanItem,
  type ScanResult,
} from "./gearScan";

const PARTS: Record<string, string> = {
  _1: "帽子",
  _2: "衣服",
  _3: "腰带",
  _4: "护腕",
  _5: "下装",
  _6: "鞋子",
  _7: "项链",
  _8: "腰坠",
  _9: "戒指",
  _10: "戒指",
  _11: "暗器",
  _12: "武器",
};

const eq = (
  id: number,
  name: string,
  attrs: string[],
  holes = 2,
  more: Partial<CalcEquip> = {}
): CalcEquip => ({
  id,
  装备名称: name,
  所属门派: "通用",
  装备主属性: "根骨",
  装备品级: 31000,
  装备类型: "副本",
  装备增益: attrs.map(a => ({ 属性: a, 值: 100 })),
  镶嵌孔数组: Array.from({ length: holes }, () => ({ 镶嵌类型: "atX" })),
  最大精炼等级: 6,
  ...more,
});

function catalog(): CalcCatalog {
  const equips: Record<string, CalcEquip[]> = {
    帽子: [
      eq(1, "铮砥冠", ["atCriticalStrike", "atOvercome"]),
      eq(2, "铮砥冠", ["atStrain", "atOvercome"]),
      eq(3, "凌云冠", ["atHaste"]),
    ],
    衣服: [eq(10, "铮砥衣", ["atOvercome"])],
    腰带: [eq(11, "铮砥带", ["atOvercome"])],
    护腕: [eq(12, "铮砥腕", ["atOvercome"])],
    下装: [eq(13, "铮砥裤", ["atOvercome"])],
    鞋子: [eq(14, "铮砥靴", ["atOvercome"])],
    项链: [eq(15, "铮砥链", ["atOvercome"], 1)],
    腰坠: [eq(16, "铮砥坠", ["atOvercome"], 1)],
    戒指: [
      eq(20, "铮砥戒", ["atOvercome"], 0),
      eq(21, "青冥戒", ["atStrain"], 0),
    ],
    暗器: [eq(17, "铮砥囊", ["atOvercome"], 1)],
    武器: [
      eq(30, "渊穆剑", ["atOvercome"], 3, {
        最大精炼等级: 8,
        装备类型: "橙武",
      }),
    ],
  };
  const defSlot = (id: number, holes: number) => ({
    id,
    refine: 6,
    gems: Array.from({ length: holes }, () => 6),
    enchant: null,
  });
  return {
    v: 1,
    xf: "zxg",
    name: "紫霞功",
    gongfa: "内功",
    main: "根骨",
    slotPart: PARTS,
    equips,
    attrNames: {
      atCriticalStrike: "会心",
      atOvercome: "破防",
      atStrain: "无双",
      atHaste: "加速",
    },
    enchants: [
      {
        id: 501,
        附魔名称: "峡金铸·头（急速）",
        附魔效果简写: "加速+72",
        附魔支持部位: ["帽子"],
        附魔装分: 100,
      },
      {
        id: 502,
        附魔名称: "峡金铸·头（会心）",
        附魔效果简写: "会心+72",
        附魔支持部位: ["帽子"],
        附魔装分: 100,
      },
      {
        id: 503,
        附魔名称: "蜀锦绣·头（急速）",
        附魔效果简写: "加速+60",
        附魔支持部位: ["帽子"],
        附魔装分: 80,
      },
    ],
    stones: {
      "5": [
        {
          五彩石名称: "彩·灭气·激流·月华(伍)",
          五彩石等级: 5,
          装备增益: [{ 增益类型: "atX", 增益名称: "破防", 增益数值: 80 }],
        },
      ],
      "6": [
        {
          五彩石名称: "彩·灭气·激流·月华(陆)",
          五彩石等级: 6,
          装备增益: [{ 增益类型: "atX", 增益名称: "破防", 增益数值: 100 }],
        },
        {
          五彩石名称: "彩·无双·痛击·斩铁(陆)",
          五彩石等级: 6,
          装备增益: [{ 增益类型: "atX", 增益名称: "无双", 增益数值: 100 }],
        },
      ],
    },
    team: [],
    formations: [],
    foods: [],
    loops: [],
    targets: [],
    defaults: {
      slots: {
        _1: defSlot(3, 2),
        _2: defSlot(10, 2),
        _3: defSlot(11, 2),
        _4: defSlot(12, 2),
        _5: defSlot(13, 2),
        _6: defSlot(14, 2),
        _7: defSlot(15, 1),
        _8: defSlot(16, 1),
        _9: defSlot(20, 0),
        _10: defSlot(21, 0),
        _11: defSlot(17, 1),
        _12: defSlot(30, 3),
      },
      stone: "彩·无双·痛击·斩铁(陆)",
      big: { hat: 0, coat: 0, belt: 0, wrist: 0, shoes: 0 },
      battle: {
        loop: "",
        target: "",
        buffOn: true,
        formation: "",
        foods: [],
        team: [],
        latency: 0,
      },
    },
    defaultTalents: [],
  };
}

const item = (slot: string, name: string, more: Partial<ScanItem> = {}) => ({
  slot,
  name,
  refine: 6,
  gems: [8, 8],
  enchant: null,
  attrs: [],
  ilvl: null,
  ...more,
});

const scan = (items: ScanItem[], stone: string | null = null): ScanResult => ({
  notGear: false,
  xinfa: "紫霞功",
  score: null,
  stone,
  items,
});

describe("normName / similarity", () => {
  it("统一全角、间隔点和名字后面的精炼数字", () => {
    expect(normName("彩・灭气・激流・月华（陆）")).toBe(
      "彩·灭气·激流·月华(陆)"
    );
    expect(normName(" 铮砥冠(6) ")).toBe("铮砥冠");
  });
  it("一个字认错还算像", () => {
    expect(similarity("铮砥寇", "铮砥冠")).toBeGreaterThanOrEqual(0.65);
    expect(similarity("凌云冠", "铮砥冠")).toBeLessThan(0.65);
  });
});

describe("matchScan", () => {
  it("全身都对上：两个戒指各占一个位置，精炼和五行石照截图", () => {
    const m = matchScan(
      catalog(),
      scan([
        item("帽子", "铮砥冠", { attrs: ["会心", "破防"] }),
        item("衣服", "铮砥衣"),
        item("腰带", "铮砥带"),
        item("护腕", "铮砥腕"),
        item("下装", "铮砥裤"),
        item("鞋子", "铮砥靴"),
        item("项链", "铮砥链", { gems: [8] }),
        item("腰坠", "铮砥坠", { gems: [8] }),
        item("戒指", "铮砥戒", { gems: [] }),
        item("戒指", "青冥戒", { gems: [] }),
        item("暗器", "铮砥囊", { gems: [8] }),
        item("武器", "渊穆剑", { refine: 8, gems: [8, 8, 8] }),
      ])
    );
    expect(m.found).toBe(12);
    expect(m.replaced).toEqual([]);
    expect(m.missing).toEqual([]);
    expect(m.absent).toEqual([]);
    expect(m.input.slots._1).toEqual({
      id: 1,
      refine: 6,
      gems: [8, 8],
      enchant: null,
    });
    expect(m.input.slots._9?.id).toBe(20);
    expect(m.input.slots._10?.id).toBe(21);
    expect(m.input.slots._12).toMatchObject({ id: 30, refine: 8 });
    // 截图里精炼不一样（武器 8），不显示统一的精炼
    expect(m.refine).toBeNull();
    expect(m.stone).toBe("absent");
    expect(m.input.stone).toBe("彩·无双·痛击·斩铁(陆)");
  });

  it("同名装备按副属性区分；认错一个字也能对上", () => {
    const a = matchScan(
      catalog(),
      scan([item("帽子", "铮砥冠", { attrs: ["无双", "破防"] })])
    );
    expect(a.input.slots._1?.id).toBe(2);
    const b = matchScan(catalog(), scan([item("帽子", "铮砥寇")]));
    expect([1, 2]).toContain(b.input.slots._1?.id);
  });

  it("截图里没有、当季没有的部位用默认装备并列出来", () => {
    const m = matchScan(
      catalog(),
      scan([item("帽子", "铮砥冠"), item("衣服", "不存在的衣服")])
    );
    expect(m.found).toBe(1);
    expect(m.missing).toEqual(["衣服"]);
    expect(m.absent).toContain("武器");
    expect(m.absent).not.toContain("衣服");
    expect(m.replaced).toContain("coat");
    expect(m.replaced).not.toContain("hat");
    expect(m.input.slots._2?.id).toBe(10);
    expect(m.refine).toBe(6);
  });

  it("部位写错了：别的部位里有同名装备就挪过去", () => {
    const m = matchScan(
      catalog(),
      scan([item("帽子", "青冥戒", { gems: [] })])
    );
    expect(m.input.slots._9?.id).toBe(21);
    expect(m.replaced).toContain("hat");
  });

  it("没写等级的孔按截图里最高的等级", () => {
    const m = matchScan(
      catalog(),
      scan([
        item("帽子", "铮砥冠", { gems: [7] }),
        item("武器", "渊穆剑", { gems: [8, 0, 0] }),
      ])
    );
    expect(m.input.slots._1?.gems).toEqual([7, 8]);
    expect(m.input.slots._12?.gems).toEqual([8, 8, 8]);
  });
});

describe("bestEnchant / bestStone", () => {
  it("附魔：全名优先，只有属性词时取装分最高的", () => {
    const c = catalog();
    expect(bestEnchant(c, "_1", "蜀锦绣·头（急速）")).toBe(503);
    expect(bestEnchant(c, "_1", "急速")).toBe(501);
    expect(bestEnchant(c, "_1", "加速")).toBe(501);
    expect(bestEnchant(c, "_1", "会心")).toBe(502);
    expect(bestEnchant(c, "_1", null)).toBeNull();
    expect(bestEnchant(c, "_2", "急速")).toBeNull();
  });

  it("五彩石：全名、全角写法、没写等级取最高级", () => {
    const c = catalog();
    expect(bestStone(c, "彩·灭气·激流·月华(伍)")).toBe("彩·灭气·激流·月华(伍)");
    expect(bestStone(c, "彩・灭气・激流・月华（陆）")).toBe(
      "彩·灭气·激流·月华(陆)"
    );
    expect(bestStone(c, "彩·灭气·激流·月华")).toBe("彩·灭气·激流·月华(陆)");
    expect(bestStone(c, "彩·全能·不存在")).toBeNull();
  });

  it("五彩石当季没有：用默认的，并标出来", () => {
    const m = matchScan(
      catalog(),
      scan([item("帽子", "铮砥冠")], "彩·不存在·石头")
    );
    expect(m.stone).toBe("missing");
    expect(m.stoneReplaced).toBe(true);
    expect(m.input.stone).toBe("彩·无双·痛击·斩铁(陆)");
  });
});
