import { describe, expect, it } from "vitest";
import { pickAfterRemove } from "./loadoutPick";

const L = (id: string, xinfa: string) => ({ id, xinfa });

describe("pickAfterRemove 删掉配装后选哪一套", () => {
  const list = [
    L("a1", "太玄经"),
    L("a2", "太玄经"),
    L("a3", "太玄经"),
    L("b1", "紫霞功"),
    L("c1", "易筋经"),
    L("c2", "易筋经"),
  ];

  it("同心法里有下一套，选下一套", () => {
    expect(pickAfterRemove(list, "a1")).toBe("a2");
    expect(pickAfterRemove(list, "a2")).toBe("a3");
    expect(pickAfterRemove(list, "c1")).toBe("c2");
  });

  it("删的是同心法最后一套，选上一套，不跳到别的心法", () => {
    expect(pickAfterRemove(list, "a3")).toBe("a2");
    expect(pickAfterRemove(list, "c2")).toBe("c1");
  });

  it("这个心法只剩这一套，去列表里挨着的：先后面", () => {
    expect(pickAfterRemove(list, "b1")).toBe("c1");
  });

  it("这个心法只剩这一套，又在列表最后，选前面那一套", () => {
    expect(pickAfterRemove([L("a1", "太玄经"), L("b1", "紫霞功")], "b1")).toBe(
      "a1"
    );
  });

  it("只有一套，删完没有可选的", () => {
    expect(pickAfterRemove([L("a1", "太玄经")], "a1")).toBeNull();
    expect(pickAfterRemove([], "a1")).toBeNull();
  });

  it("id 不在列表里，退回第一套", () => {
    expect(pickAfterRemove(list, "zzz")).toBe("a1");
  });
});
