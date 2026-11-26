import { describe, expect, it } from "vitest";
import { imeHandlers } from "../hooks/useImeNormalize";

// 用假事件模拟输入法：组字中输入框里是带空格的拼音，选字后变成汉字
type Ev = any;
const input = (value: string, isComposing = false): Ev => ({
  target: { value },
  currentTarget: { value },
  nativeEvent: { isComposing },
});

function setup(normalize?: (v: string) => string, max?: number) {
  const composing = { current: false };
  const seen: string[] = [];
  const h = imeHandlers(composing, v => seen.push(v), normalize, max);
  return { h, seen, composing };
}
const noSpace = (v: string) => v.replace(/\s/g, "");

describe("imeHandlers", () => {
  it("组字中原样放进去，不去空格（否则输入法会被打断，拼音叠在一起）", () => {
    const { h, seen } = setup(noSpace, 8);
    h.onCompositionStart();
    h.onChange(input("wei m", true));
    h.onChange(input("wei ma", true));
    h.onChange(input("wei man x", true));
    expect(seen).toEqual(["wei m", "wei ma", "wei man x"]);
  });

  it("Chrome 顺序：最后一次 input 在前，compositionend 在后，最终是整理后的汉字", () => {
    const { h, seen, composing } = setup(noSpace, 8);
    h.onCompositionStart();
    h.onChange(input("wei man x", true));
    h.onChange(input("为 慢 性", true));
    h.onCompositionEnd(input("为 慢 性"));
    expect(composing.current).toBe(false);
    expect(seen.at(-1)).toBe("为慢性");
  });

  it("Safari 顺序：compositionend 在前，最后一次 input 在后，最终也是整理后的汉字", () => {
    const { h, seen } = setup(noSpace, 8);
    h.onCompositionStart();
    h.onChange(input("wei man x", true));
    h.onCompositionEnd(input("为 慢 性"));
    h.onChange(input("为 慢 性", false));
    expect(seen.slice(-2)).toEqual(["为慢性", "为慢性"]);
  });

  it("平时打字和粘贴：去空格，超长截到上限", () => {
    const { h, seen } = setup(noSpace, 8);
    h.onChange(input("梦 江 南"));
    h.onChange(input("一二三四五六七八九十"));
    expect(seen).toEqual(["梦江南", "一二三四五六七八"]);
  });

  it("选字结束时才按上限截断；组字中拼音再长也不截", () => {
    const { h, seen } = setup(noSpace, 4);
    h.onCompositionStart();
    h.onChange(input("meng jiang nan zhong", true));
    expect(seen.at(-1)).toBe("meng jiang nan zhong");
    h.onCompositionEnd(input("梦江南中心"));
    expect(seen.at(-1)).toBe("梦江南中");
  });

  it("不传整理函数也能用（只限长）", () => {
    const { h, seen } = setup(undefined, 3);
    h.onChange(input("a b c d"));
    expect(seen).toEqual(["a b"]);
  });
});
