import { describe, expect, it } from "vitest";
import {
  RateLimiter,
  beijingTime,
  notificationFor,
  parseFeedback,
} from "./feedback";

const base = {
  kind: "bug",
  content: "  面板拖不动  ",
  contact: " QQ 12345 ",
  appVersion: "1.0.3",
  platform: "win",
  lang: "zh",
};

describe("parseFeedback", () => {
  it("接受合法内容并去掉首尾空白", () => {
    const r = parseFeedback(base);
    expect(r).toEqual({
      ok: true,
      value: { ...base, content: "面板拖不动", contact: "QQ 12345" },
    });
  });

  it("联系方式可以不填，空白当作没填", () => {
    expect(parseFeedback({ ...base, contact: undefined })).toMatchObject({
      ok: true,
      value: { contact: null },
    });
    expect(parseFeedback({ ...base, contact: "   " })).toMatchObject({
      ok: true,
      value: { contact: null },
    });
  });

  it("拒绝空内容、超长内容和错误的字段", () => {
    expect(parseFeedback({ ...base, content: "   " })).toEqual({
      ok: false,
      field: "content",
    });
    expect(parseFeedback({ ...base, content: "字".repeat(1001) })).toEqual({
      ok: false,
      field: "content",
    });
    expect(parseFeedback({ ...base, content: "字".repeat(1000) }).ok).toBe(
      true
    );
    expect(parseFeedback({ ...base, contact: "x".repeat(61) })).toEqual({
      ok: false,
      field: "contact",
    });
    expect(parseFeedback({ ...base, kind: "praise" })).toEqual({
      ok: false,
      field: "kind",
    });
    expect(parseFeedback({ ...base, platform: "linux" })).toEqual({
      ok: false,
      field: "platform",
    });
    expect(parseFeedback({ ...base, lang: "fr" })).toEqual({
      ok: false,
      field: "lang",
    });
    expect(parseFeedback({ ...base, appVersion: "<script>" })).toEqual({
      ok: false,
      field: "appVersion",
    });
    expect(parseFeedback(null)).toEqual({ ok: false, field: "body" });
    expect(parseFeedback([base])).toEqual({ ok: false, field: "body" });
  });

  it("emoji 按 1 个字算", () => {
    expect(parseFeedback({ ...base, content: "😀".repeat(1000) }).ok).toBe(
      true
    );
  });

  it("去掉控制字符，保留换行", () => {
    expect(
      parseFeedback({ ...base, content: "第一行\r\n第二\u0007行" })
    ).toMatchObject({ ok: true, value: { content: "第一行\n第二行" } });
  });

  it("诱饵字段被填时当作垃圾内容", () => {
    expect(parseFeedback({ ...base, website: "http://spam" })).toEqual({
      ok: true,
      spam: true,
    });
  });
});

describe("RateLimiter", () => {
  it("10 分钟内第 6 条要等，等够了能再发", () => {
    const l = new RateLimiter();
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) expect(l.take("a", t0 + i * 1000)).toBe(0);
    const wait = l.take("a", t0 + 5000);
    // 第 1 条在 t0，现在是 t0+5s，要等 600-5 秒
    expect(wait).toBe(595);
    // 别的 IP 不受影响
    expect(l.take("b", t0 + 5000)).toBe(0);
    // 最早那条过期后可以再发
    expect(l.take("a", t0 + 10 * 60 * 1000)).toBe(0);
  });

  it("24 小时最多 20 条", () => {
    const l = new RateLimiter();
    const t0 = 1_000_000_000_000;
    // 每 11 分钟发一条，不触发 10 分钟的限制
    for (let i = 0; i < 20; i++) {
      expect(l.take("a", t0 + i * 11 * 60 * 1000)).toBe(0);
    }
    expect(l.take("a", t0 + 20 * 11 * 60 * 1000)).toBeGreaterThan(0);
  });
});

describe("notificationFor", () => {
  it("标题写类型，内容带联系方式、版本和北京时间", () => {
    const at = new Date("2026-10-30T17:05:00Z");
    const n = notificationFor(
      12,
      {
        kind: "idea",
        content: "加个暗色主题",
        contact: null,
        appVersion: "1.0.3",
        platform: "mac",
        lang: "en",
      },
      at
    );
    expect(n.title).toBe("备忘录反馈 · 建议");
    expect(n.content).toContain("#12  建议");
    expect(n.content).toContain("加个暗色主题");
    expect(n.content).toContain("联系方式：未留");
    expect(n.content).toContain("版本：1.0.3 · Mac · 英语");
    expect(n.content).toContain("时间：2026-10-31 01:05（北京时间）");
    expect(beijingTime(at)).toBe("2026-10-31 01:05");
  });
});
