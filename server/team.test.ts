import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, normalizeInviteCode, normalizeLoginCode } from "@shared/teamApi";
import {
  canWriteEntity,
  entityVisibility,
  generateInviteCode,
  generateLoginCode,
  parseEntityChange,
  parseMemberPatch,
  pickClientIp,
  sniffImageType,
  TeamRateLimiter,
  visibleEntity,
} from "./team";

const at = new Date("2026-10-31T06:00:00.000Z");
const owner = {
  kind: "character" as const,
  entityId: "紫霞功-PVE",
  ownerId: "owner",
  visibility: "team" as const,
  version: 1,
  data: '{"synced":true,"name":"紫霞"}',
  deleted: false,
  seq: 2,
  updatedBy: "owner",
  updatedAt: at,
};

describe("团队邀请码与登录码", () => {
  it("规范化输入，并生成约定格式的随机码", () => {
    expect(normalizeInviteCode(" td 2345 6789 ")).toBe("TD-2345-6789");
    expect(normalizeInviteCode("TD-ABCD-EFGH")).toBe("TD-ABCD-EFGH");
    expect(normalizeLoginCode("ab cd-ef gh")).toBe("ABCDEFGH");
    const invite = generateInviteCode();
    const login = generateLoginCode();
    expect(invite).toMatch(/^TD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(login).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    for (const char of invite.replace(/TD|-/g, "") + login.replace("-", "")) {
      expect(CODE_ALPHABET).toContain(char);
    }
  });
});

describe("团队条目权限", () => {
  it("按角色、拥有者和删除操作执行权限矩阵", () => {
    expect(canWriteEntity({ kind: "scheme", role: "viewer", actorId: "other", existing: owner, deleted: false })).toBe(false);
    expect(canWriteEntity({ kind: "scheme", role: "editor", actorId: "other", existing: owner, deleted: true })).toBe(true);
    expect(canWriteEntity({ kind: "character", role: "viewer", actorId: "owner", existing: owner, deleted: true })).toBe(true);
    expect(canWriteEntity({ kind: "character", role: "admin", actorId: "other", existing: owner, deleted: false })).toBe(false);
    expect(canWriteEntity({ kind: "raidLog", role: "editor", actorId: "other", existing: owner, deleted: false })).toBe(true);
    expect(canWriteEntity({ kind: "raidLog", role: "editor", actorId: "other", existing: owner, deleted: true })).toBe(false);
    expect(canWriteEntity({ kind: "raidLog", role: "admin", actorId: "other", existing: owner, deleted: true })).toBe(true);
    expect(canWriteEntity({ kind: "link", role: "viewer", actorId: "other", existing: null, deleted: false })).toBe(true);
    expect(canWriteEntity({ kind: "link", role: "viewer", actorId: "other", existing: owner, deleted: false })).toBe(false);
    expect(canWriteEntity({ kind: "loadout", role: "viewer", actorId: "owner", existing: owner, deleted: false })).toBe(true);
    expect(canWriteEntity({ kind: "note", role: "editor", actorId: "other", existing: owner, deleted: false })).toBe(false);
  });

  it("固定条目可见范围，链接默认团队可见", () => {
    expect(entityVisibility("loadout", "team")).toBe("private");
    expect(entityVisibility("note", "team")).toBe("private");
    expect(entityVisibility("link")).toBe("team");
    expect(entityVisibility("link", "private")).toBe("private");
    expect(entityVisibility("scheme", "private")).toBe("team");
  });
});

describe("团队请求校验", () => {
  it("接受中文条目 ID，拒绝控制字符、过大条目和错误类型", () => {
    expect(parseEntityChange({ kind: "scheme", id: "紫霞功-PVE", baseVersion: 0, data: { skills: [] } })).toMatchObject({ ok: true });
    expect(parseEntityChange({ kind: "scheme", id: "a\n", baseVersion: 0, data: {} })).toMatchObject({ ok: false, error: "invalid" });
    expect(parseEntityChange({ kind: "unknown", id: "x", baseVersion: 0, data: {} })).toMatchObject({ ok: false, error: "invalid" });
    expect(parseEntityChange({ kind: "scheme", id: "x", baseVersion: 0, data: "x".repeat(512 * 1024) })).toMatchObject({ ok: false, error: "too_large" });
  });

  it("限制成员资料修改，并允许空头像", () => {
    expect(parseMemberPatch({ nickname: "  阿黄  ", avatar: null })).toEqual({ nickname: "阿黄", avatar: null });
    expect(parseMemberPatch({ role: "owner" })).toBeNull();
    expect(parseMemberPatch({ avatar: { kind: "upload", src: "x".repeat(300 * 1024 + 1) } })).toBeNull();
  });
});

describe("团队同步可见性", () => {
  it("不返回他人的私有条目，并剥离角色同步标记", () => {
    expect(visibleEntity({ ...owner, visibility: "private" }, "other")).toBeNull();
    expect(visibleEntity(owner, "owner")?.data).toEqual({ synced: true, name: "紫霞" });
    expect(visibleEntity(owner, "other")?.data).toEqual({ name: "紫霞" });
  });

  it("删除条目不返回数据", () => {
    const record = visibleEntity({ ...owner, deleted: true, data: "null" }, "owner");
    expect(record).toMatchObject({ deleted: true, id: "紫霞功-PVE" });
    expect(record).not.toHaveProperty("data");
  });
});

describe("服务端加固", () => {
  it("限流 IP：Cloudflare 头优先，否则取 X-Forwarded-For 最后一项", () => {
    expect(pickClientIp({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })).toBe("1.1.1.1");
    expect(pickClientIp({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }, "3.3.3.3")).toBe("2.2.2.2");
    expect(pickClientIp({}, "3.3.3.3")).toBe("3.3.3.3");
  });
  it("限流器键数有上限，超过后丢最久没用的", () => {
    const limiter = new TeamRateLimiter(100);
    for (let i = 0; i < 1000; i++) limiter.take(`k${i}`, 5, 60_000, 1000);
    expect(limiter.size).toBeLessThanOrEqual(100);
    // 仍然限得住同一个键
    for (let i = 0; i < 5; i++) expect(limiter.take("same", 5, 60_000, 2000)).toBe(0);
    expect(limiter.take("same", 5, 60_000, 2000)).toBeGreaterThan(0);
  });
  it("图片按文件头判断类型", () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("RIFF0000WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});
