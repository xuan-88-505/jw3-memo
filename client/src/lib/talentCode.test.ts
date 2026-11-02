import { describe, expect, it } from "vitest";
import { layersOf } from "@/data/seed";
import { TALENTS } from "@/data/talents";
import {
  BUNDLED_TALENT_VERSION,
  type RawTalentData,
  namesFromRaw,
  parseTalentText,
  picksFromSq,
  resolveTalentImport,
} from "./talentCode";

// 用户截图：铁牢律 号令三军 战心 列甲 崩决 疾雨 劲风 | 定军 力撼河山 振甲
const TLL = [3, 4, 2, 3, 4, 2, 4, 5, 11];
const TLL_NAMES = "号令三军,战心,列甲,崩决,疾雨,劲风,定军,力撼河山,振甲";
const ctx = (
  xinfa: string,
  extra: Partial<Parameters<typeof resolveTalentImport>[1]> = {}
) => ({
  xinfa,
  allXinfa: Object.keys(TALENTS),
  layersOf,
  minFound: 3,
  ...extra,
});

describe("parseTalentText", () => {
  it("认出魔盒的奇穴编码", () => {
    const imp = parseTalentText(
      '{"version":"v20261029","xf":"铁牢律","sq":"3,4,2,4,4,3,4,5,11","client":"std"}'
    );
    expect(imp).toEqual({
      kind: "code",
      xf: "铁牢律",
      version: "v20261029",
      sq: ["3", "4", "2", "4", "4", "3", "4", "5", "11"],
      client: "std",
    });
  });
  it("编码前后有空格、引号也能认", () => {
    const imp = parseTalentText(` "{\\"x\\":1}" `);
    expect(imp).toBeNull();
    expect(
      parseTalentText(
        `  {"version":"${BUNDLED_TALENT_VERSION}","xf":"铁牢律","sq":"3,4,2,3,4,2,4,5,11"}\n`
      )?.kind
    ).toBe("code");
  });
  it("认出 9 个数字的序列；别的数字不认", () => {
    expect(parseTalentText("3,4,2,3,4,2,4,5,11")).toEqual({
      kind: "sq",
      sq: TLL.map(String),
    });
    expect(parseTalentText("3，4，2，3，4，2，4，5，11")?.kind).toBe("sq");
    expect(parseTalentText("1,2,3")).toBeNull();
    expect(parseTalentText("1,2,4,1,2,3,1,2,3,4,4,4")).toBeNull();
    expect(parseTalentText("12345")).toBeNull();
  });
  it("认出奇穴文字", () => {
    expect(parseTalentText(TLL_NAMES)).toEqual({
      kind: "names",
      names: TLL_NAMES.split(","),
    });
    expect(parseTalentText("号令三军 战心 列甲")?.kind).toBe("names");
  });
  it("宏、普通文字、空内容不认", () => {
    expect(parseTalentText("/cast 破势")).toBeNull();
    expect(parseTalentText("hello world foo")).toBeNull();
    expect(parseTalentText("")).toBeNull();
    expect(parseTalentText("{not json}")).toBeNull();
    expect(parseTalentText('{"xf":"铁牢律"}')).toBeNull();
  });
  it("怀旧服编码带 client=origin", () => {
    const imp = parseTalentText(
      '{"version":"v20210719","xf":"冰心诀","sq":"0000,0000","client":"origin"}'
    );
    expect(imp?.kind === "code" && imp.client).toBe("origin");
  });
});

describe("resolveTalentImport", () => {
  it("同版本编码：编号直接对上截图里的 9 个奇穴", async () => {
    const imp = parseTalentText(
      `{"version":"${BUNDLED_TALENT_VERSION}","xf":"铁牢律","sq":"${TLL.join(",")}","client":"std"}`
    )!;
    const r = await resolveTalentImport(imp, ctx("铁牢律"));
    expect(r).toEqual({ ok: true, xinfa: "铁牢律", picks: TLL, found: 9 });
    const L = layersOf("铁牢律");
    const names = TLL.map((p, i) => L[i].options.find(o => o.pos === p)!.name);
    expect(names.join(",")).toBe(TLL_NAMES);
  });
  it("序列：按当前心法对应", async () => {
    const r = await resolveTalentImport(
      parseTalentText(TLL.join(","))!,
      ctx("铁牢律")
    );
    expect(r).toEqual({ ok: true, xinfa: "铁牢律", picks: TLL, found: 9 });
  });
  it("文字：按名字对应，没选的层（第三重）保持原样", async () => {
    const r = await resolveTalentImport(
      parseTalentText(TLL_NAMES)!,
      ctx("铁牢律")
    );
    expect(r).toEqual({ ok: true, xinfa: "铁牢律", picks: TLL, found: 9 });
    const r2 = await resolveTalentImport(
      parseTalentText(TLL_NAMES.replace("列甲", "第三重"))!,
      ctx("铁牢律")
    );
    expect(r2.ok && r2.picks).toEqual([3, 4, null, 3, 4, 2, 4, 5, 11]);
  });
  it("别的版本的编码：下载那个版本的数据，按名字对应", async () => {
    // 假的旧版本：号令三军在第 1 层第 1 个，定军在共用池第 12 个
    const raw: RawTalentData = {
      铁牢律: {
        "1": { "1": { name: "号令三军" } },
        "2": { "4": { name: "战心" } },
        "3": { "2": { name: "列甲" } },
        "4": { "3": { name: "崩决" } },
        "5": { "4": { name: "疾雨" } },
        "6": { "2": { name: "劲风" } },
        "7": {
          "12": { name: "定军" },
          "5": { name: "力撼河山" },
          "11": { name: "振甲" },
        },
        "8": { _follow: "7" },
        "9": { _follow: "7" },
      },
    };
    expect(
      namesFromRaw(raw, "铁牢律", [
        "1",
        "4",
        "2",
        "3",
        "4",
        "2",
        "12",
        "5",
        "11",
      ]).join(",")
    ).toBe(TLL_NAMES);
    const asked: string[] = [];
    const imp = parseTalentText(
      '{"version":"v20251225","xf":"铁牢律","sq":"1,4,2,3,4,2,12,5,11","client":"std"}'
    )!;
    const r = await resolveTalentImport(
      imp,
      ctx("铁牢律", { fetchVersion: async v => (asked.push(v), raw) })
    );
    expect(asked).toEqual(["v20251225"]);
    expect(r).toEqual({ ok: true, xinfa: "铁牢律", picks: TLL, found: 9 });
  });
  it("别的版本下载失败：报版本", async () => {
    const imp = parseTalentText(
      '{"version":"v20251225","xf":"铁牢律","sq":"1,1,1,1,1,1,1,2,3"}'
    )!;
    const r = await resolveTalentImport(
      imp,
      ctx("铁牢律", {
        fetchVersion: async () => {
          throw new Error("offline");
        },
      })
    );
    expect(r).toEqual({ ok: false, reason: "version", version: "v20251225" });
  });
  it("编码是别的心法：不能切时报心法，能切时切过去", async () => {
    const imp = parseTalentText(
      `{"version":"${BUNDLED_TALENT_VERSION}","xf":"铁牢律","sq":"${TLL.join(",")}"}`
    )!;
    expect(await resolveTalentImport(imp, ctx("傲血战意"))).toEqual({
      ok: false,
      reason: "xinfa",
      xinfa: "铁牢律",
    });
    const r = await resolveTalentImport(
      imp,
      ctx("傲血战意", { xinfas: ["傲血战意", "铁牢律"] })
    );
    expect(r.ok && r.xinfa).toBe("铁牢律");
  });
  it("文字是别的心法：报出是哪个心法", async () => {
    expect(
      await resolveTalentImport(parseTalentText(TLL_NAMES)!, ctx("紫霞功"))
    ).toEqual({
      ok: false,
      reason: "xinfa",
      xinfa: "铁牢律",
    });
  });
  it("怀旧服编码不导入；对上太少算没认出", async () => {
    const origin = parseTalentText(
      '{"version":"v20210719","xf":"冰心诀","sq":"1,2","client":"origin"}'
    )!;
    expect(await resolveTalentImport(origin, ctx("冰心诀"))).toEqual({
      ok: false,
      reason: "origin",
    });
    expect(
      await resolveTalentImport(
        parseTalentText("你好 世界 测试")!,
        ctx("铁牢律")
      )
    ).toEqual({
      ok: false,
      reason: "nomatch",
    });
  });
  it("序列里 7–9 层重复、编号不存在的层算没认出", () => {
    const L = layersOf("铁牢律");
    expect(
      picksFromSq(L, ["3", "4", "2", "3", "4", "2", "4", "4", "11"])
    ).toEqual([3, 4, 2, 3, 4, 2, 4, null, 11]);
    expect(
      picksFromSq(L, ["9", "0", "2", "3", "4", "2", "4", "5", "13"])
    ).toEqual([null, null, 2, 3, 4, 2, 4, 5, null]);
  });
});
