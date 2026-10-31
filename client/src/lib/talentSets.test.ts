import { describe, expect, it } from "vitest";
import { layersOf } from "@/data/seed";
import type { SchemeVersion } from "@/data/types";
import { diffVersions, hasGameChange } from "@/lib/diff";
import { hashJson, toServer } from "@/lib/team/mapping";
import {
  copyTalentFields,
  mapTalentSets,
  sameTalentSets,
  talentFieldsFrom,
  talentSetLabel,
  talentSetsOf,
} from "@/lib/talentSets";

const XINFA = "紫霞功";
const layers = layersOf(XINFA);

/** 每层选第 k 个选项；七至九重共用，依次错开不重复 */
function pick(k = 0): number[] {
  return layers.map((L, i) => {
    const opts = (i >= 6 ? layers[6] : L).options;
    return opts[(i >= 6 ? k + (i - 6) : k) % opts.length].pos;
  });
}

function ver(v: number, extra: Partial<SchemeVersion> = {}): SchemeVersion {
  return {
    version: v,
    macros: [],
    talents: pick(0),
    note: "",
    authorId: "me",
    at: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

describe("多套奇穴：读写字段", () => {
  it("有奇穴数据可以测", () => {
    expect(layers.length).toBe(9);
  });

  it("旧数据只有 talents：读出来就是一套，没有名字", () => {
    const sets = talentSetsOf(ver(1));
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ id: "main", name: "" });
  });

  it("只剩一套时不写多余字段；铺到旧版本上会把删掉的几套清掉", () => {
    const last = ver(2, {
      talentsName: "单体",
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    const fields = talentFieldsFrom([
      { id: "main", name: "  ", talents: pick(2) },
    ]);
    expect(fields.talentsName).toBeUndefined();
    expect(fields.moreTalents).toBeUndefined();
    const next = { ...last, ...fields };
    expect(talentSetsOf(next)).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(next))).not.toHaveProperty("moreTalents");
  });

  it("复制出来的数组和原来的不是同一个", () => {
    const last = ver(1, {
      moreTalents: [{ id: "a", name: "", talents: pick(1) }],
    });
    const copy = copyTalentFields(last);
    copy.talents[0] = -1;
    copy.moreTalents![0].talents[0] = -1;
    expect(last.talents[0]).not.toBe(-1);
    expect(last.moreTalents![0].talents[0]).not.toBe(-1);
  });

  it("mapTalentSets 只改奇穴，其他字段不动", () => {
    const d = { schemeId: "x", macros: [], talents: pick(0) };
    const next = mapTalentSets(d, list => [
      ...list,
      { id: "b", name: "AOE", talents: pick(1) },
    ]);
    expect(next.schemeId).toBe("x");
    expect(next.moreTalents).toEqual([
      { id: "b", name: "AOE", talents: pick(1) },
    ]);
  });

  it("sameTalentSets：套数、名字、选择不同都算改了", () => {
    const a = ver(1, {
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    expect(sameTalentSets(a, ver(1, { ...copyTalentFields(a) }))).toBe(true);
    expect(sameTalentSets(a, ver(1))).toBe(false);
    expect(
      sameTalentSets(
        a,
        ver(1, { moreTalents: [{ id: "a", name: "群攻", talents: pick(1) }] })
      )
    ).toBe(false);
    expect(
      sameTalentSets(
        a,
        ver(1, { moreTalents: [{ id: "a", name: "AOE", talents: pick(2) }] })
      )
    ).toBe(false);
    // 名字前后空格不算改动
    expect(
      sameTalentSets(
        a,
        ver(1, { moreTalents: [{ id: "a", name: " AOE ", talents: pick(1) }] })
      )
    ).toBe(true);
  });

  it("没起名的套按顺序叫第几套", () => {
    expect(talentSetLabel({ name: "" }, 1)).toBe("第二套");
    expect(talentSetLabel({ name: "AOE" }, 1)).toBe("AOE");
  });

  it("推到服务器时几套奇穴和套名都带上", () => {
    const scheme = {
      id: "紫霞功-PVE",
      xinfa: XINFA,
      mode: "PVE",
      versions: [
        ver(1, {
          talentsName: "单体",
          moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
        }),
      ],
    };
    const out = toServer("scheme", scheme, "m_1") as typeof scheme;
    expect(out.versions[0].authorId).toBe("m_1");
    expect(out.versions[0].talentsName).toBe("单体");
    expect(out.versions[0].moreTalents).toEqual(scheme.versions[0].moreTalents);
  });

  it("同步哈希：值是 undefined 的字段和没有这个字段一样", () => {
    const v = ver(1);
    expect(hashJson({ ...v, ...copyTalentFields(v) })).toBe(hashJson(v));
  });
});

describe("多套奇穴：版本比较", () => {
  it("只有一套时和以前一样：不写套名，没有整套变化", () => {
    const next = ver(2, {
      talents: [...pick(0).slice(0, 2), pick(1)[2], ...pick(0).slice(3)],
    });
    const d = diffVersions(ver(1), next, layers);
    expect(d.talents).toHaveLength(1);
    expect(d.talents[0].layer).toBe(3);
    expect(d.talents[0].set).toBeUndefined();
    expect(d.talentSets).toEqual([]);
    expect(d.total).toBe(1);
  });

  it("加了一套：整套算新增，带 9 层的选择；第一套没变不列", () => {
    const next = ver(2, {
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    const d = diffVersions(ver(1), next, layers);
    expect(d.talents).toEqual([]);
    expect(d.talentSets).toHaveLength(1);
    expect(d.talentSets[0]).toMatchObject({
      setId: "a",
      kind: "added",
      name: "AOE",
    });
    expect(d.talentSets[0].picks).toHaveLength(9);
    expect(d.total).toBe(1);
  });

  it("改第二套的一层：标出是哪一套", () => {
    const t = pick(1);
    const changed = [...t];
    changed[0] = pick(2)[0];
    const a = ver(1, { moreTalents: [{ id: "a", name: "AOE", talents: t }] });
    const b = ver(2, {
      moreTalents: [{ id: "a", name: "AOE", talents: changed }],
    });
    const d = diffVersions(a, b, layers);
    expect(d.talentSets).toEqual([]);
    expect(d.talents).toHaveLength(1);
    expect(d.talents[0]).toMatchObject({ layer: 1, set: "AOE", setId: "a" });
  });

  it("改名：记下原来的名字；没起名的显示第几套", () => {
    const a = ver(1, {
      moreTalents: [{ id: "a", name: "", talents: pick(1) }],
    });
    const b = ver(2, {
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    const d = diffVersions(a, b, layers);
    expect(d.talentSets).toEqual([
      { setId: "a", kind: "renamed", name: "AOE", oldName: "第二套" },
    ]);
  });

  it("删掉中间一套没起名的：只记删除，后面那套顺序变了不算改名", () => {
    const a = ver(1, {
      moreTalents: [
        { id: "a", name: "", talents: pick(1) },
        { id: "b", name: "", talents: pick(2) },
      ],
    });
    const b = ver(2, {
      moreTalents: [{ id: "b", name: "", talents: pick(2) }],
    });
    const d = diffVersions(a, b, layers);
    expect(d.talents).toEqual([]);
    expect(d.talentSets).toEqual([
      { setId: "a", kind: "removed", name: "第二套" },
    ]);
  });

  it("第一个版本：第一套逐层列出（标套名），其余几套整套新增", () => {
    const v = ver(1, {
      talentsName: "单体",
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    const d = diffVersions(undefined, v, layers);
    expect(d.talents).toHaveLength(9);
    expect(d.talents.every(t => t.set === "单体" && t.setId === "main")).toBe(
      true
    );
    expect(d.talentSets.map(c => c.kind)).toEqual(["added"]);
  });

  it("只改套名或备注：游戏里不用动；加套、改层要动", () => {
    const a = ver(1, {
      moreTalents: [{ id: "a", name: "", talents: pick(1) }],
    });
    const renamed = ver(2, {
      talentsName: "单体",
      note: "改名",
      moreTalents: [{ id: "a", name: "AOE", talents: pick(1) }],
    });
    expect(hasGameChange(diffVersions(a, renamed, layers))).toBe(false);
    expect(
      hasGameChange(diffVersions(a, ver(2, { ...a, note: "x" }), layers))
    ).toBe(false);
    const added = ver(2, {
      moreTalents: [
        { id: "a", name: "", talents: pick(1) },
        { id: "b", name: "", talents: pick(2) },
      ],
    });
    expect(hasGameChange(diffVersions(a, added, layers))).toBe(true);
    const relayer = ver(2, {
      talentsName: "单体",
      moreTalents: [{ id: "a", name: "", talents: pick(2) }],
    });
    expect(hasGameChange(diffVersions(a, relayer, layers))).toBe(true);
  });
});
