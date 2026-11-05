import { describe, expect, it } from "vitest";
import { TALENT_SCHEMA, sanitizeTalentScan } from "./talentScan";

describe("sanitizeTalentScan", () => {
  it("照抄名字，去掉空白和控制字符", () => {
    expect(
      sanitizeTalentScan({
        not_talent: false,
        xinfa: " 太玄经 ",
        names: ["亘天", " 灵 器 ", "鬼遁\u0000", "", 3, null],
      })
    ).toEqual({
      notTalent: false,
      xinfa: "太玄经",
      names: ["亘天", "灵器", "鬼遁"],
    });
  });

  it("最多 12 个名字，每个最多 8 个字", () => {
    const r = sanitizeTalentScan({
      not_talent: false,
      xinfa: null,
      names: [
        ...Array.from({ length: 20 }, (_, i) => `名${i}`),
        "一二三四五六七八九十",
      ],
    });
    expect(r?.names).toHaveLength(12);
    expect(
      sanitizeTalentScan({ names: ["一二三四五六七八九十"] })?.names[0]
    ).toBe("一二三四五六七八");
  });

  it("读出了名字就不算「没有奇穴」", () => {
    expect(
      sanitizeTalentScan({ not_talent: true, xinfa: null, names: ["亘天"] })
        ?.notTalent
    ).toBe(false);
    expect(
      sanitizeTalentScan({ not_talent: true, xinfa: null, names: [] })
    ).toEqual({ notTalent: true, xinfa: null, names: [] });
  });

  it("结构不对返回 null", () => {
    expect(sanitizeTalentScan(null)).toBeNull();
    expect(sanitizeTalentScan("亘天")).toBeNull();
    expect(sanitizeTalentScan({ names: "亘天" })).toBeNull();
  });

  it("输出结构里每个字段都是 required（json_schema strict）", () => {
    expect([...TALENT_SCHEMA.required].sort()).toEqual(
      Object.keys(TALENT_SCHEMA.properties).sort()
    );
  });
});
