import { describe, expect, it } from "vitest";
import { RateLimiter } from "./feedback";
import {
  IMAGE_MAX_BYTES,
  SCAN_SCHEMA,
  SCAN_SLOTS,
  checkImage,
  extractJson,
  sanitizeScan,
} from "./gearScan";

const jpeg = (n = 200) => {
  const buf = Buffer.alloc(n, 0x11);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
};

describe("checkImage", () => {
  it("收 JPEG、PNG、WebP 的 data URL", () => {
    expect(checkImage({ image: jpeg() }).ok).toBe(true);
    const png = Buffer.alloc(200, 0);
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png);
    expect(
      checkImage({ image: `data:image/png;base64,${png.toString("base64")}` })
        .ok
    ).toBe(true);
    const webp = Buffer.alloc(200, 0);
    webp.write("RIFF", 0, "latin1");
    webp.write("WEBP", 8, "latin1");
    expect(
      checkImage({ image: `data:image/webp;base64,${webp.toString("base64")}` })
        .ok
    ).toBe(true);
  });

  it("文件头和声明的格式对不上、不是图片、太小都拒绝", () => {
    const fake = Buffer.alloc(200, 0x41).toString("base64");
    expect(checkImage({ image: `data:image/jpeg;base64,${fake}` })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(checkImage({ image: "data:image/gif;base64,R0lGOD" }).ok).toBe(
      false
    );
    expect(checkImage({ image: jpeg(20) }).ok).toBe(false);
    expect(checkImage({}).ok).toBe(false);
    expect(checkImage(null).ok).toBe(false);
    expect(checkImage({ image: "https://example.com/a.jpg" }).ok).toBe(false);
  });

  it("超过大小上限返回 too_large", () => {
    expect(checkImage({ image: jpeg(IMAGE_MAX_BYTES + 10) })).toEqual({
      ok: false,
      error: "too_large",
    });
  });
});

describe("extractJson", () => {
  it("去掉代码块、取出正文里的 JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('识别结果如下：{"a":{"b":2}} 以上')).toEqual({
      a: { b: 2 },
    });
    expect(extractJson("没有 JSON")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("sanitizeScan", () => {
  it("丢掉部位不对、没有名字的项，数值超范围改成 null 或去掉", () => {
    const out = sanitizeScan({
      not_gear: false,
      xinfa: "紫霞功",
      score: "512287",
      stone: " 彩·灭气·激流·月华(陆) ",
      items: [
        {
          slot: "帽子",
          name: " 铮砥冠\n",
          refine: 6,
          gems: [8, 8, 12, -1],
          enchant: "峡金焠·头（急速）",
          attrs: ["会心", "", "无双"],
          ilvl: 965,
        },
        { slot: "披风", name: "不是部位", refine: 6, gems: [], attrs: [] },
        { slot: "戒指", name: "", refine: 6, gems: [], attrs: [] },
        { slot: "武器", name: "渊穆剑", refine: 99, gems: "8", attrs: null },
      ],
    });
    expect(out).toEqual({
      notGear: false,
      xinfa: "紫霞功",
      score: 512287,
      stone: "彩·灭气·激流·月华(陆)",
      items: [
        {
          slot: "帽子",
          name: "铮砥冠",
          refine: 6,
          gems: [8, 8],
          enchant: "峡金焠·头（急速）",
          attrs: ["会心", "无双"],
          ilvl: 965,
        },
        {
          slot: "武器",
          name: "渊穆剑",
          refine: null,
          gems: [],
          enchant: null,
          attrs: [],
          ilvl: null,
        },
      ],
    });
  });

  it("结构不对返回 null；有装备时不算 not_gear", () => {
    expect(sanitizeScan(null)).toBeNull();
    expect(sanitizeScan({ items: "x" })).toBeNull();
    expect(
      sanitizeScan({
        not_gear: true,
        items: [{ slot: "帽子", name: "铮砥冠", gems: [], attrs: [] }],
      })?.notGear
    ).toBe(false);
    expect(sanitizeScan({ not_gear: true, items: [] })?.notGear).toBe(true);
  });

  it("最多 16 件，名字最多 40 字", () => {
    const items = Array.from({ length: 30 }, () => ({
      slot: "戒指",
      name: "戒".repeat(80),
      gems: [],
      attrs: [],
    }));
    const out = sanitizeScan({ items })!;
    expect(out.items).toHaveLength(16);
    expect(Array.from(out.items[0].name)).toHaveLength(40);
  });
});

describe("SCAN_SCHEMA", () => {
  it("每个字段都 required（json_schema strict 要求）", () => {
    expect([...SCAN_SCHEMA.required].sort()).toEqual(
      Object.keys(SCAN_SCHEMA.properties).sort()
    );
    const item = SCAN_SCHEMA.properties.items.items;
    expect([...item.required].sort()).toEqual(
      Object.keys(item.properties).sort()
    );
    expect(item.properties.slot.enum).toEqual([...SCAN_SLOTS]);
  });
});

describe("RateLimiter 自定义窗口", () => {
  it("按传入的窗口限流", () => {
    const lim = new RateLimiter([{ ms: 60_000, max: 2 }]);
    expect(lim.take("ip", 0)).toBe(0);
    expect(lim.take("ip", 1000)).toBe(0);
    expect(lim.take("ip", 2000)).toBe(58);
    expect(lim.take("other", 2000)).toBe(0);
    expect(lim.take("ip", 60_001)).toBe(0);
  });
});
