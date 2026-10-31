import { describe, expect, it } from "vitest";
import type { EntityRecord } from "@shared/teamApi";
import type { Character, Scheme } from "@/data/types";
import type { RaidLog } from "@/data/records";
import type { SharedLink } from "@/data/links";
import { SITE_ORIGIN } from "@/lib/desktop";
import type { Account } from "./account";
import {
  collectEntities,
  fromServer,
  hashJson,
  toServer,
  type Collections,
} from "./mapping";
import { mergePersisted } from "./merge";
import {
  applyOps,
  applyPushResults,
  filterPending,
  localizeImages,
  mergePending,
  planConflict,
  planPull,
  planPush,
  prepareJoin,
  prepareLeave,
} from "./sync";

const MY = "m_me";
const OTHER = "m_other";
const T = "2026-10-31T06:00:00.000Z";

const scheme = (id: string, versions: [number, string][]): Scheme => {
  const [xinfa, mode] = id.split("-");
  return {
    id,
    xinfa,
    mode: mode as Scheme["mode"],
    versions: versions.map(([version, authorId]) => ({
      version,
      macros: [],
      talents: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      note: `v${version}`,
      authorId,
      at: `${T}#${version}`,
    })),
  };
};
const character = (id: string, ownerId: string) =>
  ({ id, ownerId, name: id, xinfa: "紫霞功", synced: {} }) as unknown as Character;
const raid = (id: string, by: string) =>
  ({ id, by, at: T, images: [] }) as unknown as RaidLog;
const link = (id: string, by: string, visibility: "team" | "private" = "team") =>
  ({ id, url: "https://x.cn", title: id, by, at: T, visibility }) as SharedLink;

const empty = (): Collections => ({
  schemes: [],
  characters: [],
  raidLogs: [],
  blacklist: [],
  links: [],
  loadouts: {},
  notes: {},
});
const acc = (p: Partial<Account> = {}) => ({
  shadow: {},
  rejected: {},
  ...p,
});
const record = (
  kind: EntityRecord["kind"],
  id: string,
  data: unknown,
  p: Partial<EntityRecord> = {}
): EntityRecord => ({
  kind,
  id,
  version: 1,
  ownerId: OTHER,
  visibility: "team",
  deleted: false,
  data,
  updatedBy: OTHER,
  updatedAt: T,
  seq: 1,
  ...p,
});
const hashOf = (c: Collections, key: string) => collectEntities(c).get(key)!.hash;

describe("本机 me 和服务器成员 id 互换", () => {
  it("只换已知字段", () => {
    const s = scheme("紫霞功-PVE", [[1, "me"], [2, OTHER]]);
    const server = toServer("scheme", s, MY) as Scheme;
    expect(server.versions.map(v => v.authorId)).toEqual([MY, OTHER]);
    expect(fromServer("scheme", server, MY)).toEqual(s);
    const c = toServer("character", character("c1", "me"), MY) as Character;
    expect(c.ownerId).toBe(MY);
    expect((toServer("raidLog", raid("r1", "me"), MY) as RaidLog).by).toBe(MY);
  });
  it("别人的角色补上 synced", () => {
    const c = fromServer("character", { id: "c2", ownerId: OTHER }, MY) as Character;
    expect(c.synced).toEqual({});
  });
});

describe("拉取", () => {
  it("第一次整份拉取：服务器的为准，本机独有的留着", () => {
    const local = { ...empty(), characters: [character("c1", "me")], schemes: [scheme("紫霞功-PVE", [[1, "me"]])] };
    const remote = scheme("紫霞功-PVE", [[1, MY], [2, OTHER]]);
    const plan = planPull(
      local,
      acc(),
      [record("scheme", "紫霞功-PVE", remote, { version: 2 })],
      MY,
      true,
      new Set(["me", OTHER])
    );
    const next = { ...local, ...applyOps(local, plan.ops) };
    expect(next.schemes[0].versions).toHaveLength(2);
    expect(next.schemes[0].versions[0].authorId).toBe("me");
    expect(next.characters).toHaveLength(1);
    expect(plan.shadow["scheme:紫霞功-PVE"].v).toBe(2);
    expect(plan.shadow["scheme:紫霞功-PVE"].h).toBe(hashOf(next, "scheme:紫霞功-PVE"));
  });

  it("增量：本机没改过的用服务器的；改过的留本机", () => {
    const base = { ...empty(), raidLogs: [raid("r1", "me"), raid("r2", "me")] };
    const shadow = {
      "raidLog:r1": { v: 1, h: hashOf(base, "raidLog:r1"), m: 1 as const },
      "raidLog:r2": { v: 1, h: hashOf(base, "raidLog:r2"), m: 1 as const },
    };
    // 本机改了 r2
    const local = { ...base, raidLogs: [raid("r1", "me"), { ...raid("r2", "me"), note: "本机" } as RaidLog] };
    const plan = planPull(
      local,
      acc({ shadow }),
      [
        record("raidLog", "r1", { ...raid("r1", MY), note: "远端" }, { version: 2, ownerId: MY }),
        record("raidLog", "r2", { ...raid("r2", MY), note: "远端" }, { version: 2, ownerId: MY }),
      ],
      MY,
      false,
      new Set(["me"])
    );
    const next = { ...local, ...applyOps(local, plan.ops) };
    expect((next.raidLogs[0] as RaidLog & { note?: string }).note).toBe("远端");
    expect((next.raidLogs[1] as RaidLog & { note?: string }).note).toBe("本机");
    // r2 影子版本跟上，哈希不变 → 之后推送时按 v2 覆盖
    expect(plan.shadow["raidLog:r2"].v).toBe(2);
    expect(plan.shadow["raidLog:r2"].h).toBe(shadow["raidLog:r2"].h);
  });

  it("增量：两边都改的方案，影子不动（推送时判冲突）", () => {
    const base = { ...empty(), schemes: [scheme("紫霞功-PVE", [[1, "me"]])] };
    const shadow = { "scheme:紫霞功-PVE": { v: 1, h: hashOf(base, "scheme:紫霞功-PVE") } };
    const local = { ...empty(), schemes: [scheme("紫霞功-PVE", [[1, "me"], [2, "me"]])] };
    const plan = planPull(
      local,
      acc({ shadow }),
      [record("scheme", "紫霞功-PVE", scheme("紫霞功-PVE", [[1, MY], [2, OTHER]]), { version: 2 })],
      MY,
      false,
      new Set(["me", OTHER])
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.shadow).toEqual(shadow);
  });

  it("远端删除：没改过的跟着删", () => {
    const local = { ...empty(), links: [link("l1", OTHER)] };
    const shadow = { "link:l1": { v: 1, h: hashOf(local, "link:l1") } };
    const plan = planPull(
      local,
      acc({ shadow }),
      [record("link", "l1", undefined, { deleted: true, version: 2 })],
      MY,
      false,
      new Set(["me", OTHER])
    );
    expect(applyOps(local, plan.ops).links).toEqual([]);
    expect(plan.shadow["link:l1"]).toBeUndefined();
  });

  it("整份拉取时影子里有、服务器没返回的：本机没改过就删", () => {
    const local = { ...empty(), raidLogs: [raid("r1", OTHER)] };
    const shadow = { "raidLog:r1": { v: 3, h: hashOf(local, "raidLog:r1") } };
    const plan = planPull(local, acc({ shadow }), [], MY, true, new Set(["me", OTHER]));
    expect(applyOps(local, plan.ops).raidLogs).toEqual([]);
  });

  it("被移除的成员的角色从本机去掉", () => {
    const local = { ...empty(), characters: [character("c1", "me"), character("c2", "gone")] };
    const plan = planPull(local, acc(), [], MY, false, new Set(["me"]));
    expect(applyOps(local, plan.ops).characters?.map(c => c.id)).toEqual(["c1"]);
  });

  it("服务器的图片地址拼上网站地址", () => {
    const data = { ...raid("r1", MY), images: [{ src: "/manus-storage/a.webp", w: 1, h: 1 }] };
    const out = localizeImages("raidLog", data) as RaidLog;
    expect(out.images[0].src).toBe(`${SITE_ORIGIN}/manus-storage/a.webp`);
  });
});

describe("推送", () => {
  it("新建、修改、删除和权限", () => {
    const old = { ...empty(), raidLogs: [raid("r9", "me")] };
    const local = {
      ...empty(),
      schemes: [scheme("紫霞功-PVE", [[1, "me"]])],
      characters: [character("c1", "me"), character("c2", OTHER)],
      links: [link("l1", "me", "private")],
    };
    const c2 = collectEntities({ ...empty(), characters: [character("c2", OTHER)] });
    const shadow = {
      "raidLog:r9": { v: 4, h: hashOf(old, "raidLog:r9"), m: 1 as const },
      // 别人的角色：影子和本机不一样也不推（没权限）
      "character:c2": { v: 1, h: c2.get("character:c2")!.hash + "x" },
    };
    const editor = planPush(local, acc({ shadow }), MY, "editor");
    const keys = editor.out.map(o => o.key).sort();
    expect(keys).toEqual(["character:c1", "link:l1", "raidLog:r9", "scheme:紫霞功-PVE"]);
    const del = editor.out.find(o => o.key === "raidLog:r9")!;
    expect(del.change).toEqual({ kind: "raidLog", id: "r9", baseVersion: 4, deleted: true });
    const ln = editor.out.find(o => o.key === "link:l1")!;
    expect(ln.change.visibility).toBe("private");
    expect((ln.change.data as SharedLink).by).toBe(MY);
    // 只读成员不能推方案
    const viewer = planPush(local, acc({ shadow }), MY, "viewer");
    expect(viewer.out.map(o => o.key)).not.toContain("scheme:紫霞功-PVE");
  });

  it("data URL 图片列出来要先上传；网站地址换回相对地址", () => {
    const local = {
      ...empty(),
      raidLogs: [
        {
          ...raid("r1", "me"),
          images: [
            { src: "data:image/webp;base64,AAAA", w: 1, h: 1 },
            { src: `${SITE_ORIGIN}/manus-storage/b.webp`, w: 1, h: 1 },
          ],
        } as RaidLog,
      ],
    };
    const [o] = planPush(local, acc(), MY, "editor").out;
    expect(o.uploads).toEqual(["data:image/webp;base64,AAAA"]);
    expect((o.change.data as RaidLog).images[1].src).toBe("/manus-storage/b.webp");
  });

  it("推送结果：成功更新影子，没权限的记下不再推，冲突单独返回", () => {
    const local = { ...empty(), raidLogs: [raid("r1", "me"), raid("r2", "me")], schemes: [scheme("紫霞功-PVE", [[1, "me"]])] };
    const plan = planPush(local, acc(), MY, "editor");
    const r = applyPushResults(acc(), plan.out, plan.out.map(o =>
      o.key === "raidLog:r1"
        ? { kind: o.kind, id: o.id, ok: true as const, version: 1, seq: 5 }
        : o.key === "raidLog:r2"
          ? { kind: o.kind, id: o.id, ok: false as const, error: "forbidden" as const, message: "没有权限" }
          : { kind: o.kind, id: o.id, ok: false as const, error: "conflict" as const, message: "冲突" }
    ));
    expect(r.okCount).toBe(1);
    expect(r.shadow["raidLog:r1"]).toEqual({ v: 1, h: hashOf(local, "raidLog:r1"), m: 1 });
    expect(r.errors.map(e => e.key)).toEqual(["raidLog:r2"]);
    expect(r.conflicts.map(c => c.key)).toEqual(["scheme:紫霞功-PVE"]);
    const again = planPush(local, { shadow: r.shadow, rejected: r.rejected }, MY, "editor");
    expect(again.out.map(o => o.key)).toEqual(["scheme:紫霞功-PVE"]);
  });
});

describe("方案冲突", () => {
  it("两边都存了新版本：服务器的写进本地，我的放进草稿", () => {
    const local = scheme("紫霞功-PVE", [[1, "me"], [2, "me"]]);
    const server = scheme("紫霞功-PVE", [[1, MY], [2, OTHER]]);
    server.versions[1].at = "other";
    const plan = planConflict(local, record("scheme", local.id, server, { version: 2 }), MY);
    expect(plan.type).toBe("conflict");
    if (plan.type !== "conflict") return;
    expect(plan.scheme.versions[1].authorId).toBe(OTHER);
    expect(plan.conflict.rival.version).toBe(2);
    expect(plan.conflict.base?.version).toBe(1);
    expect(plan.conflict.note).toBe("v2");
    expect(plan.draft.baseVersion).toBe(2);
  });
  it("本机没有多出来的版本：直接用服务器的", () => {
    const local = scheme("紫霞功-PVE", [[1, "me"]]);
    const server = scheme("紫霞功-PVE", [[1, MY], [2, OTHER]]);
    const plan = planConflict(local, record("scheme", local.id, server, { version: 2 }), MY);
    expect(plan.type).toBe("adopt");
  });
  it("服务器上已删除：按删除后的版本重新推", () => {
    const plan = planConflict(
      scheme("紫霞功-PVE", [[1, "me"]]),
      record("scheme", "紫霞功-PVE", undefined, { deleted: true, version: 3 }),
      MY
    );
    expect(plan).toEqual({ type: "recreate", shadow: { v: 3, h: "" } });
  });
});

describe("加入和退出", () => {
  const local = {
    ...empty(),
    schemes: [scheme("紫霞功-PVE", [[1, "me"]]), scheme("花间游-PVP", [[1, "me"]])],
    characters: [character("c1", "me")],
    raidLogs: [raid("r1", "me")],
    links: [link("l1", "me"), link("l2", OTHER)],
  };

  it("加入：方案和记录先放一边，自己的角色和链接留着", () => {
    const j = prepareJoin(local);
    expect(j.collections.schemes).toEqual([]);
    expect(j.collections.characters).toHaveLength(1);
    expect(j.collections.links?.map(l => l.id)).toEqual(["l1"]);
    expect(j.pending.schemes).toHaveLength(2);
    // 亲友团里已经有紫霞功 PVE
    const team = { ...empty(), schemes: [scheme("紫霞功-PVE", [[3, OTHER]])] };
    const f = filterPending(j.pending, team);
    expect(f.skipped.map(s => s.id)).toEqual(["紫霞功-PVE"]);
    expect(f.pending.schemes.map(s => s.id)).toEqual(["花间游-PVP"]);
    const merged = mergePending(team, f.pending);
    expect(merged.schemes?.map(s => s.id)).toEqual(["紫霞功-PVE", "花间游-PVP"]);
    expect(merged.raidLogs).toHaveLength(1);
  });

  it("退出：去掉别人的，留下自己的，没并入的放回来", () => {
    const inTeam = {
      ...local,
      characters: [character("c1", "me"), character("c2", OTHER)],
      raidLogs: [raid("r2", OTHER)],
    };
    const out = prepareLeave(inTeam, { schemes: [], raidLogs: [raid("r1", "me")], blacklist: [] });
    expect(out.characters?.map(c => c.id)).toEqual(["c1"]);
    expect(out.raidLogs?.map(r => r.id)).toEqual(["r1"]);
    expect(out.links?.map(l => l.id)).toEqual(["l1"]);
    expect(out.schemes).toHaveLength(2);
  });
});

describe("两个窗口的数据合并", () => {
  it("只保留本窗口改过的条目", () => {
    const base = { schemes: [{ id: "a", v: 1 }, { id: "b", v: 1 }], notes: { c1: { text: "x" } }, pinned: false };
    const mine = { schemes: [{ id: "a", v: 2 }, { id: "b", v: 1 }], notes: { c1: { text: "x" } }, pinned: true };
    const theirs = { schemes: [{ id: "a", v: 1 }, { id: "b", v: 3 }, { id: "c", v: 1 }], notes: { c1: { text: "y" } }, pinned: false };
    const out = mergePersisted(base, mine, theirs, new Set(["notes"]));
    expect(out.schemes).toEqual([{ id: "a", v: 2 }, { id: "b", v: 3 }, { id: "c", v: 1 }]);
    expect(out.notes).toEqual({ c1: { text: "y" } });
    expect(out.pinned).toBe(true);
  });
  it("哈希和键的顺序无关", () => {
    expect(hashJson({ a: 1, b: [1, 2] })).toBe(hashJson({ b: [1, 2], a: 1 }));
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
  });
});

describe("创建人以服务器记录为准", () => {
  it("内容里把创建人填成我，但服务器记录的拥有者是别人：不当成我的", () => {
    const c = fromServer("character", { id: "c9", ownerId: MY }, MY, OTHER) as Character;
    expect(c.ownerId).toBe(OTHER);
    const log = fromServer("raidLog", { id: "r9", by: MY }, MY, OTHER) as RaidLog;
    expect(log.by).toBe(OTHER);
  });
  it("服务器记录的拥有者是我：换成本地的 me", () => {
    const link = fromServer("link", { id: "l9", by: OTHER }, MY, MY) as SharedLink;
    expect(link.by).toBe("me");
  });
});
