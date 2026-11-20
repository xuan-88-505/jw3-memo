import { describe, expect, it } from "vitest";
import {
  convertEnchant,
  convertEquip,
  convertSet,
  decritPct,
  DECRIT_KEY,
  enchantFits,
  enchantSeries,
  holeValue,
  normAttr,
  pickEnchants,
  pickPvp,
  PVP_DATA_VERSION,
  pvpDefense,
  schoolOf,
  TOUGH_KEY,
  toughPct,
  type BoxEnchant,
  type PvpEnchant,
  type PvpEquip,
  type PvpFile,
} from "./pvpEquip";

describe("normAttr", () => {
  it("内功分系属性统一成原版的内功属性，其他不动", () => {
    expect(normAttr("atSolarCriticalStrike")).toBe("atMagicCriticalStrike");
    expect(normAttr("atLunarOvercomeBase")).toBe("atMagicOvercome");
    expect(normAttr("atNeutralAttackPowerBase")).toBe("atMagicAttackPowerBase");
    expect(normAttr("atPoisonCriticalDamagePowerBase")).toBe(
      "atMagicCriticalDamagePowerBase"
    );
    expect(normAttr("atVitalityBase")).toBe("atVitalityBase");
    expect(normAttr(DECRIT_KEY)).toBe(DECRIT_KEY);
  });
  it("全攻击、全破防换成原版的叫法", () => {
    expect(normAttr("atAllTypeAttackPowerBase")).toBe("allAttackPowerBase");
    expect(normAttr("atAllTypeOvercomeBase")).toBe("atAllOvercome");
    expect(normAttr("atMagicOvercomeBase")).toBe("atMagicOvercome");
    expect(normAttr("atSolarAndLunarAttackPowerBase")).toBe("atMagicAttackPowerBase");
  });
});

describe("convertEquip / convertSet", () => {
  const rec = {
    ID: 113880,
    Name: "独镇乾坤·默山衣",
    Level: 1320,
    SubType: 2,
    BelongSchool: "衍天",
    MagicKind: "内功",
    GetType: "威望",
    MaxStrengthLevel: 6,
    _IconID: 28566,
    SetID: 7069,
    _Magic1Type: { attr: ["atVitalityBase", "698"] },
    _Magic2Type: { attr: ["atSpunkBase", 323] },
    _Magic3Type: { attr: ["atSolarCriticalStrike", 438] },
    _Magic4Type: { attr: [DECRIT_KEY, 461] },
    _Magic5Type: { attr: ["atSkillEventHandler", 1] },
    _DiamondAttributeID1: ["atVitalityBase", 456],
    _DiamondAttributeID2: ["atLunarCriticalStrike", 304],
    _SetData: {
      "2_1": { attr: ["atAllTypeCriticalStrike", 102] },
      "4_1": { attr: ["atSkillEventHandler", 9] },
    },
  };

  it("换成原版装备格式：属性合并分系、孔带基数、丢掉技能效果", () => {
    const dropped = new Set<string>();
    const r = convertEquip(rec, dropped)!;
    expect(r.part).toBe("衣服");
    expect(r.equip).toMatchObject({
      id: 113880,
      装备名称: "独镇乾坤·默山衣",
      所属门派: "衍天",
      装备主属性: "元气",
      装备品级: 1320,
      pvp: true,
      功法: "内功",
      来源: "威望",
      套装: 7069,
      图标ID: 28566,
      最大精炼等级: 6,
    });
    expect(r.equip.装备增益).toEqual([
      { 属性: "atVitalityBase", 值: 698 },
      { 属性: "atSpunkBase", 值: 323 },
      { 属性: "atMagicCriticalStrike", 值: 438 },
      { 属性: DECRIT_KEY, 值: 461 },
    ]);
    expect(r.equip.镶嵌孔数组).toEqual([
      { 镶嵌类型: "atVitalityBase", 镶嵌基数: 456 },
      { 镶嵌类型: "atMagicCriticalStrike", 镶嵌基数: 304 },
    ]);
    expect([...dropped]).toEqual(["atSkillEventHandler"]);
    expect(r.equip.武器伤害_最小值).toBeUndefined();
  });

  it("武器伤害：最小值是 Base，最大值是 Base + Rand", () => {
    const w = convertEquip({
      ID: 1,
      Name: "某武器",
      Level: 1355,
      SubType: 0,
      Base1Type: "atMeleeWeaponDamageBase",
      Base1Min: 2000,
      Base2Type: "atMeleeWeaponDamageRand",
      Base2Min: 1300,
    })!;
    expect(w.part).toBe("武器");
    expect(w.equip.武器伤害_最小值).toBe(2000);
    expect(w.equip.武器伤害_最大值).toBe(3300);
    expect(w.equip.所属门派).toBe("通用");
  });

  it("不是装备部位的返回 null", () => {
    expect(convertEquip({ ID: 2, Name: "x", Level: 1, SubType: 99 })).toBeNull();
  });

  it("套装只留属性加成", () => {
    expect(convertSet(rec)).toEqual({
      效果: [{ 件数: 2, 增益: [{ 属性: "atAllTypeCriticalStrike", 值: 102 }] }],
    });
    expect(convertSet({ ...rec, SetID: null })).toBeNull();
  });
});

describe("convertEnchant", () => {
  it("部位、简写和颜色", () => {
    const base = {
      ID: 16502,
      Name: "峡金铸·腰（御劲）",
      Score: 105,
      DestItemSubType: 6,
      _quality: 4,
      Attribute1ID: TOUGH_KEY,
      Attribute1Value1: 72,
    };
    expect(convertEnchant(base)).toMatchObject({
      id: 16502,
      附魔支持部位: ["腰带"],
      附魔效果简写: "御劲+72",
      增益集合: [{ 属性: TOUGH_KEY, 值: 72 }],
      附魔装分: 105,
      附魔颜色: "紫",
      pvp: true,
    });
    expect(convertEnchant({ ...base, Score: 122 })?.附魔颜色).toBe("精");
    expect(convertEnchant({ ...base, Score: 52, _quality: 3 })?.附魔颜色).toBe("蓝");
    expect(convertEnchant({ ...base, DestItemSubType: 99 })).toBeNull();
  });
  it("全攻击、主属性、往季内攻、武伤都收，简写同原版", () => {
    const one = (Attribute1ID: string, Attribute1Value1: number, DestItemSubType = 5) =>
      convertEnchant({
        ID: 1,
        Name: "x",
        Score: 158,
        _quality: 4,
        DestItemSubType,
        Attribute1ID,
        Attribute1Value1,
      });
    expect(one("atAllTypeAttackPowerBase", 126)).toMatchObject({
      附魔效果简写: "攻击+126",
      增益集合: [{ 属性: "allAttackPowerBase", 值: 126 }],
    });
    expect(one("atSpunkBase", 126)?.附魔效果简写).toBe("元气+126");
    expect(one("atMagicAttackPowerBase", 39, 3)?.附魔效果简写).toBe("内攻+39");
    expect(one("atAllTypeOvercomeBase", 126, 1)?.附魔效果简写).toBe("破防+126");
    expect(one("atMeleeWeaponDamageBase", 13, 0)?.附魔效果简写).toBe("武伤+13");
    expect(one("atActiveThreatCoefficient", 13)).toBeNull();
  });
});

describe("pickEnchants", () => {
  const rec = (
    ID: number,
    Name: string,
    sub: number,
    attr: string,
    value: number,
    Score: number,
    quality = 4
  ): BoxEnchant => ({
    ID,
    Name,
    Score,
    DestItemSubType: sub,
    _quality: quality,
    _latest_enhance: true,
    Attribute1ID: attr,
    Attribute1Value1: value,
  });
  const records = [
    rec(16248, "风语·头·铸（外攻）", 3, "atPhysicsAttackPowerBase", 39, 57),
    rec(16249, "风语·头·铸（内攻）", 3, "atMagicAttackPowerBase", 39, 57),
    rec(16252, "风语·头·铸（急速）", 3, "atHasteBase", 39, 57),
    rec(16260, "风语·腰·铸（御劲）", 6, TOUGH_KEY, 39, 57),
    rec(16272, "风语·头·甲（内攻）", 3, "atMagicAttackPowerBase", 19, 28, 3),
    rec(16352, "远风·衣·化劲", 2, DECRIT_KEY, 16, 23, 3),
    rec(16516, "峡金焠·头（攻击）", 3, "atAllTypeAttackPowerBase", 90, 122),
    rec(16517, "峡金焠·头（治疗）", 3, "atTherapyPowerBase", 90, 122),
    rec(16518, "峡金焠·头（加速）", 3, "atHasteBase", 90, 122),
    rec(16520, "峡金焠·腰（御劲）", 6, TOUGH_KEY, 90, 122),
    rec(16580, "河洛纹·衣（化劲）", 2, DECRIT_KEY, 36, 52, 3),
    rec(16591, "撑天·衣·化劲", 2, DECRIT_KEY, 29, 42, 3),
    rec(16598, "撑天·衣·无双", 2, "atStrainBase", 22, 42, 3),
    rec(16599, "撑天·衣·减仇", 2, "atActiveThreatCoefficient", 4, 42, 3),
    rec(16641, "铸世·息烽·戒指（元气）", 5, "atSpunkBase", 126, 158),
    rec(16653, "铸世·归正·腰坠（化劲）", 7, DECRIT_KEY, 126, 158),
    rec(16658, "铸世·归正·戒指（攻击）", 5, "atAllTypeAttackPowerBase", 126, 158),
    rec(16661, "铸世·归正·暗器（元气）", 1, "atSpunkBase", 126, 158),
    { ...rec(16700, "旧客户端的", 2, DECRIT_KEY, 90, 158), _latest_enhance: false },
  ];

  it("系列：名字去掉最后一段", () => {
    expect(enchantSeries("铸世·归正·戒指（攻击）")).toBe("铸世·归正");
    expect(enchantSeries("峡金铸·腰（御劲）")).toBe("峡金铸");
    expect(enchantSeries("某附魔")).toBe("某附魔");
  });

  it("当季的化劲御劲 + PVP 专用系列（归正）整个收，往季只补当季没有的部位属性", () => {
    const r = pickEnchants(records);
    expect(r.map(e => e.id)).toEqual([
      16248, 16249, 16520, 16580, 16591, 16653, 16658, 16661,
    ]);
    expect(r.filter(e => e.legacy).map(e => e.id)).toEqual([16248, 16249]);
    expect(r.find(e => e.id === 16658)).toMatchObject({
      附魔效果简写: "攻击+126",
      附魔支持部位: ["戒指"],
      附魔颜色: "精",
      pvp: true,
    });
    expect(r.find(e => e.id === 16658)?.legacy).toBeUndefined();
    expect(r.find(e => e.id === 16249)).toMatchObject({
      附魔效果简写: "内攻+39",
      legacy: true,
    });
  });

  it("同一部位属性的往季附魔取装分最高的，一样高取 id 大的", () => {
    const r = pickEnchants([
      ...records,
      rec(16396, "暗影·白虹·戒指（内攻）", 5, "atMagicAttackPowerBase", 68, 85),
      rec(16413, "暗影·荆岫·戒指（内攻）", 5, "atMagicAttackPowerBase", 68, 85),
      rec(16430, "阆风仙玉·戒指（内伤）", 5, "atMagicAttackPowerBase", 49, 66),
    ]);
    expect(
      r.filter(e => e.附魔支持部位[0] === "戒指" && e.legacy).map(e => e.id)
    ).toEqual([16413]);
  });
});

describe("enchantFits", () => {
  const en = (属性: string): PvpEnchant => ({
    id: 1,
    附魔名称: "x",
    附魔效果简写: "x",
    附魔支持部位: ["戒指"],
    增益集合: [{ 属性, 值: 1 }],
    附魔装分: 158,
    附魔类型: "精",
    附魔颜色: "精",
    pvp: true,
  });
  it("同原版：主属性只要本心法的，武伤只给力道身法，外功属性只给外功，内功属性只给非外功", () => {
    const magic = { school: "衍天", gongfa: "内功", main: "元气" };
    const phys = { school: "霸刀", gongfa: "外功", main: "力道" };
    expect(enchantFits(en("atSpunkBase"), magic)).toBe(true);
    expect(enchantFits(en("atSpiritBase"), magic)).toBe(false);
    expect(enchantFits(en("atMagicAttackPowerBase"), magic)).toBe(true);
    expect(enchantFits(en("atPhysicsAttackPowerBase"), magic)).toBe(false);
    expect(enchantFits(en("atMeleeWeaponDamageBase"), magic)).toBe(false);
    expect(enchantFits(en("allAttackPowerBase"), magic)).toBe(true);
    expect(enchantFits(en(DECRIT_KEY), magic)).toBe(true);
    expect(enchantFits(en("atPhysicsOvercomeBase"), phys)).toBe(true);
    expect(enchantFits(en("atMagicOvercome"), phys)).toBe(false);
    expect(enchantFits(en("atMeleeWeaponDamageBase"), phys)).toBe(true);
    expect(enchantFits(en("atStrengthBase"), phys)).toBe(true);
  });
});

const pe = (
  id: number,
  school: string,
  功法: string,
  more: Partial<PvpEquip> = {}
): PvpEquip => ({
  id,
  装备名称: `装备${id}`,
  所属门派: school,
  装备主属性: "元气",
  装备品级: 1320,
  装备类型: "普通",
  装备增益: [],
  镶嵌孔数组: [],
  最大精炼等级: 6,
  pvp: true,
  功法,
  ...more,
});

const file = (school: string, equips: PvpFile["equips"], more: Partial<PvpFile> = {}): PvpFile => ({
  v: PVP_DATA_VERSION,
  school,
  updatedAt: "2026-11-20",
  levels: [1320],
  equips,
  sets: {},
  ...more,
});

describe("pickPvp / schoolOf", () => {
  it("本门派、功法对得上的门派装，加上主属性对得上的通用装", () => {
    const common = file(
      "通用",
      {
        戒指: [pe(1, "通用", "元气"), pe(2, "通用", "根骨", { 装备主属性: "根骨" })],
      },
      {
        enchants: [
          {
            id: 9,
            附魔名称: "a",
            附魔效果简写: "化劲+90",
            附魔支持部位: ["衣服"],
            增益集合: [],
            附魔装分: 122,
            附魔类型: "精",
            附魔颜色: "精",
            pvp: true,
          },
        ],
      }
    );
    const school = file(
      "衍天",
      {
        衣服: [
          pe(3, "衍天", "内功", { 套装: 7 }),
          pe(4, "衍天", "外功"),
          pe(5, "万花", "内功"),
        ],
      },
      { sets: { "7": { 效果: [] }, "8": { 效果: [] } } }
    );
    const old = { ...file("衍天", { 衣服: [pe(6, "衍天", "内功")] }), v: 999 };
    const r = pickPvp([common, school, old, null], {
      school: "衍天",
      gongfa: "内功",
      main: "元气",
    });
    expect(r.equips.戒指.map(e => e.id)).toEqual([1]);
    expect(r.equips.衣服.map(e => e.id)).toEqual([3]);
    expect(Object.keys(r.sets)).toEqual(["7"]);
    expect(r.enchants.map(e => e.id)).toEqual([9]);
  });

  it("门派取装备库里门派装最多的", () => {
    expect(
      schoolOf({
        a: [{ 所属门派: "衍天" }, { 所属门派: "通用" }],
        b: [{ 所属门派: "衍天" }, { 所属门派: "万花" }],
      })
    ).toBe("衍天");
    expect(schoolOf({})).toBe("");
  });
});

describe("holeValue", () => {
  it("普通孔 304 和原版孔表一样", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(l => holeValue(304, l))).toEqual([
      2, 5, 8, 11, 14, 17, 26, 38,
    ]);
  });
  it("体质孔 456 的 8 级是 57；0 级、没有基数是 0", () => {
    expect(holeValue(456, 8)).toBe(57);
    expect(holeValue(304, 0)).toBe(0);
    expect(holeValue(0, 8)).toBe(0);
    expect(holeValue(304, 12)).toBe(38);
  });
});

describe("pvpDefense / 百分比", () => {
  it("装备、精炼、孔、附魔、套装都算进化劲御劲，其他套装属性交给原版", () => {
    const coef = { 0: 0, 6: 0.1 };
    const r = pvpDefense(
      [
        {
          def: {
            装备增益: [
              { 属性: DECRIT_KEY, 值: 461 },
              { 属性: "atSpunkBase", 值: 323 },
            ],
            镶嵌孔数组: [{ 镶嵌类型: DECRIT_KEY, 镶嵌基数: 304 }],
            套装: 7041,
          },
          refine: 6,
          gems: [8],
          enchant: { 增益集合: [{ 属性: DECRIT_KEY, 值: 90 }] },
        },
        {
          def: { 装备增益: [{ 属性: TOUGH_KEY, 值: 100 }], 套装: 7041 },
          refine: 0,
          gems: [],
          enchant: null,
        },
      ],
      {
        "7041": {
          效果: [
            { 件数: 2, 增益: [{ 属性: "atMagicOvercome", 值: 102 }] },
            { 件数: 4, 增益: [{ 属性: DECRIT_KEY, 值: 50 }] },
          ],
        },
      },
      coef
    );
    // 461 精 6 → 507，8 级孔 38，附魔 90
    expect(r.decrit).toBe(507 + 38 + 90);
    expect(r.tough).toBe(100);
    expect(r.setGains).toEqual([{ 属性: "atMagicOvercome", 值: 102 }]);
  });

  it("化劲 n/(n+系数) + 基础 102/1024、最多 85%，御劲 n/系数", () => {
    // 用户推栏截图：化劲 4404 → 56.07%，御劲 246 → 1.29%
    expect(decritPct(4404, 5148)).toBeCloseTo(56.07, 2);
    expect(toughPct(246, 19025.82)).toBeCloseTo(1.29, 2);
    expect(decritPct(5148, 5148)).toBeCloseTo(50 + 9.9609375);
    expect(decritPct(1e9, 5148)).toBe(85);
    expect(toughPct(19025.82, 19025.82)).toBeCloseTo(100);
    expect(decritPct(0, 5148)).toBe(0);
    expect(toughPct(100, 0)).toBe(0);
  });
});
