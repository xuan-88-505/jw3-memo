import { describe, expect, it } from "vitest";
import {
  convertEnchant,
  convertEquip,
  convertSet,
  decritPct,
  DECRIT_KEY,
  holeValue,
  normAttr,
  pickPvp,
  PVP_DATA_VERSION,
  pvpDefense,
  schoolOf,
  TOUGH_KEY,
  toughPct,
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
