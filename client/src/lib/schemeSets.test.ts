import { describe, expect, it } from "vitest";
import type { Character, Scheme } from "@/data/types";
import {
  activeSetFromMode,
  cleanActiveSet,
  compareSchemes,
  customTitle,
  defaultSchemeTitle,
  newSchemeId,
  normalizeSynced,
  schemeName,
  userSchemeName,
} from "./schemeSets";
import {
  currentSetId,
  inboxItems,
  listedSetIds,
  parseData,
  setsOf,
  statusOf,
  trackedSets,
  type ProtoState,
} from "@/state/store";

const v = (version: number, at: string) => ({
  version,
  macros: [],
  talents: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  note: "",
  authorId: "me",
  at,
});
const scheme = (
  id: string,
  xinfa: string,
  mode: "PVE" | "PVP",
  versions: ReturnType<typeof v>[],
  title?: string
): Scheme => ({ id, xinfa, mode, versions, ...(title ? { title } : {}) });

describe("旧数据转换", () => {
  it("同步记录：心法 → 模式 转成 方案 id", () => {
    expect(
      normalizeSynced({ 紫霞功: { PVE: 3, PVP: 1 }, 花间游: { PVE: 2 } })
    ).toEqual({ "紫霞功-PVE": 3, "紫霞功-PVP": 1, "花间游-PVE": 2 });
  });
  it("同步记录：新格式原样保留，坏值丢掉", () => {
    expect(
      normalizeSynced({ "紫霞功-x1": 4, 坏: "3", 也坏: { PVE: "x" } })
    ).toEqual({ "紫霞功-x1": 4 });
    expect(normalizeSynced(null)).toEqual({});
    expect(normalizeSynced([1, 2])).toEqual({});
  });
  it("面板的 PVE/PVP 选择转成每个心法在看的方案，只转存在的方案", () => {
    const out = activeSetFromMode(
      { c1: "PVP", c2: "PVE", c3: "坏" },
      [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      id => (id === "c1" ? ["紫霞功", "太虚剑意"] : ["花间游"]),
      new Set(["紫霞功-PVP", "花间游-PVE"])
    );
    expect(out).toEqual({
      c1: { 紫霞功: "紫霞功-PVP" },
      c2: { 花间游: "花间游-PVE" },
    });
  });
  it("activeSet 只保留形状正确的值", () => {
    expect(
      cleanActiveSet({ c1: { 紫霞功: "a", 花间游: 3 }, c2: "x", c3: [] })
    ).toEqual({ c1: { 紫霞功: "a" } });
  });
  it("parseData 读旧文件：同步记录和面板模式都转过来", () => {
    const old = {
      schemes: [
        scheme("紫霞功-PVE", "紫霞功", "PVE", [v(1, "2026-01-01")]),
        scheme("紫霞功-PVP", "紫霞功", "PVP", [v(1, "2026-01-02")]),
      ],
      characters: [
        {
          id: "c1",
          name: "八八",
          school: "纯阳",
          only: "紫霞功",
          liupai: [],
          ownerId: "me",
          server: "唯满侠",
          synced: { 紫霞功: { PVE: 1 } },
        },
      ],
      activeMode: { c1: "PVP" },
    };
    const out = parseData(JSON.stringify({ app: "tongdiao", data: old }));
    expect(out).not.toBeNull();
    expect(out!.characters![0].synced).toEqual({ "紫霞功-PVE": 1 });
    expect(out!.activeSet).toEqual({ c1: { 紫霞功: "紫霞功-PVP" } });
  });
});

describe("方案顺序、名字和 id", () => {
  it("先建的在前，时间一样按 id", () => {
    const a = scheme("b", "紫霞功", "PVE", [v(1, "2026-01-02")]);
    const b = scheme("a", "紫霞功", "PVE", [v(1, "2026-01-01")]);
    const c = scheme("c", "紫霞功", "PVE", [v(1, "2026-01-01")]);
    expect([a, c, b].sort(compareSchemes).map(s => s.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("没起名字时叫「心法 · 模式」；重名时加编号", () => {
    expect(schemeName({ xinfa: "紫霞功", mode: "PVE" })).toBe("紫霞功 · PVE");
    expect(schemeName({ xinfa: "紫霞功", mode: "PVE", title: "二段" })).toBe(
      "二段"
    );
    expect(defaultSchemeTitle([], "紫霞功", "PVE")).toBeUndefined();
    const list = [
      { xinfa: "紫霞功", mode: "PVE" as const },
      { xinfa: "紫霞功", mode: "PVE" as const, title: "紫霞功 · PVE 2" },
    ];
    expect(defaultSchemeTitle(list, "紫霞功", "PVE")).toBe("紫霞功 · PVE 3");
    expect(defaultSchemeTitle(list, "紫霞功", "PVP")).toBeUndefined();
  });
  it("自动起的标题不算用户起的名字，换成第一段宏的名字", () => {
    const base = { xinfa: "紫霞功", mode: "PVE" as const };
    expect(customTitle({ ...base, title: "紫霞功 · PVE" })).toBeUndefined();
    expect(customTitle({ ...base, title: "紫霞功 · PVE 2" })).toBeUndefined();
    expect(customTitle({ ...base, title: "紫霞功 · PVE 二段" })).toBe(
      "紫霞功 · PVE 二段"
    );
    expect(customTitle({ ...base, title: "  " })).toBeUndefined();
    const content = {
      macros: [{ name: " " }, { name: "11" }],
      talentsName: "AOE",
    };
    // 截图里的情况：自动标题「紫霞功 · PVE 2」+ 宏「11」→ 显示「11」
    expect(schemeName({ ...base, title: "紫霞功 · PVE 2" }, content)).toBe(
      "11"
    );
    expect(schemeName({ ...base, title: "二段" }, content)).toBe("二段");
    // 只有奇穴：用奇穴套的名字；什么都没填：用自动标题
    expect(userSchemeName(base, { macros: [], talentsName: "AOE" })).toBe(
      "AOE"
    );
    expect(
      userSchemeName(base, {
        macros: [],
        moreTalents: [{ name: "" }, { name: "单体" }],
      })
    ).toBe("单体");
    expect(
      schemeName({ ...base, title: "紫霞功 · PVE 2" }, { macros: [] })
    ).toBe("紫霞功 · PVE 2");
    // 不传内容时用方案最新的版本
    const s = scheme("s", "紫霞功", "PVE", [v(1, "2026-01-01")]);
    const named = {
      ...s,
      versions: [
        {
          ...s.versions[0],
          macros: [{ id: "m", name: "旧宏", icon: 1, content: "" }],
        },
        {
          ...s.versions[0],
          version: 2,
          macros: [{ id: "m", name: "新宏", icon: 1, content: "" }],
        },
      ],
    };
    expect(schemeName(named)).toBe("新宏");
  });
  it("新方案 id 以心法开头，不重复", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => newSchemeId("紫霞功"))
    );
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith("紫霞功-")).toBe(true);
  });
});

describe("一个心法多个方案", () => {
  const char: Character = {
    id: "c1",
    name: "八八",
    school: "纯阳",
    only: "紫霞功",
    liupai: [],
    ownerId: "me",
    server: "唯满侠",
    synced: { "紫霞功-PVE": 1 },
  } as Character;
  const base = {
    schemes: [
      scheme("紫霞功-PVE", "紫霞功", "PVE", [
        v(1, "2026-01-01"),
        v(2, "2026-01-05"),
      ]),
      scheme("紫霞功-x2", "紫霞功", "PVE", [v(1, "2026-01-03")], "三段"),
      scheme("紫霞功-x3", "紫霞功", "PVP", [v(1, "2026-01-04")]),
    ],
    characters: [char],
    members: [{ id: "me", name: "八八", role: "admin", color: "#fff" }],
    drafts: {},
    activeSet: {},
    activeXinfa: {},
    followedXinfa: ["紫霞功"],
    team: null,
  } as unknown as ProtoState;

  it("列出顺序：先建的在前；新建中未保存的排最后", () => {
    expect(setsOf(base, "紫霞功").map(s => s.id)).toEqual([
      "紫霞功-PVE",
      "紫霞功-x2",
      "紫霞功-x3",
    ]);
    const withDraft = {
      ...base,
      drafts: {
        "紫霞功-new": {
          schemeId: "紫霞功-new",
          xinfa: "紫霞功",
          mode: "PVE",
          baseVersion: 0,
          macros: [],
          talents: [],
        },
      },
    } as unknown as ProtoState;
    expect(listedSetIds(withDraft, "紫霞功").at(-1)).toBe("紫霞功-new");
  });

  it("角色在用的方案：切过的优先，否则同步过的，否则第一个", () => {
    expect(currentSetId(base, char, "紫霞功")).toBe("紫霞功-PVE");
    const picked = {
      ...base,
      activeSet: { c1: { 紫霞功: "紫霞功-x3" } },
    } as ProtoState;
    expect(currentSetId(picked, char, "紫霞功")).toBe("紫霞功-x3");
    // 切到的方案被删了：回到同步过的
    const gone = {
      ...base,
      activeSet: { c1: { 紫霞功: "已删除" } },
    } as ProtoState;
    expect(currentSetId(gone, char, "紫霞功")).toBe("紫霞功-PVE");
  });

  it("待同步只算同步过的和在用的方案，没用过的不冒通知", () => {
    expect(trackedSets(base, char, "紫霞功").map(s => s.id)).toEqual([
      "紫霞功-PVE",
    ]);
    expect(statusOf(base, char, "紫霞功-PVE")).toBe("pending");
    expect(statusOf(base, char, "紫霞功-x2")).toBe("never");
    const items = inboxItems(base);
    expect(items.map(i => i.scheme.id)).toEqual(["紫霞功-PVE"]);
  });
});
