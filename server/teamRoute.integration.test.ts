import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "events";
import type { Server } from "http";
import { and, eq, inArray } from "drizzle-orm";
import { deviceTokens, entities, loginCodes, members, teamFiles, teams } from "../drizzle/schema";
import { getDb } from "./db";
import { randomId, sha256 } from "./team";
import { registerTeamRoutes } from "./teamRoute";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdTeamIds: string[] = [];
let server: Server;
let baseUrl = "";
let adminToken = "";
let adminId = "";
let viewerToken = "";
let viewerId = "";
let originalInvite = "";

async function request(path: string, options: RequestInit & { token?: string } = {}) {
  const { token, headers, ...init } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

async function createTeam(name: string, nickname: string) {
  const result = await request("/api/team/create", {
    method: "POST",
    body: JSON.stringify({ teamName: name, nickname, platform: "win" }),
  });
  if (result.response.status === 201) createdTeamIds.push(result.body.team.id);
  return result;
}

describe.skipIf(!hasDatabase)("团队同步路由集成", () => {
  beforeAll(async () => {
    const app = express();
    registerTeamRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器未监听端口");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    const db = await getDb();
    if (!db || createdTeamIds.length === 0) return;
    const memberRows = await db.select({ id: members.id }).from(members).where(inArray(members.teamId, createdTeamIds));
    const memberIds = memberRows.map(row => row.id);
    await db.delete(teamFiles).where(inArray(teamFiles.teamId, createdTeamIds));
    await db.delete(entities).where(inArray(entities.teamId, createdTeamIds));
    if (memberIds.length > 0) {
      await db.delete(loginCodes).where(inArray(loginCodes.memberId, memberIds));
      await db.delete(deviceTokens).where(inArray(deviceTokens.memberId, memberIds));
    }
    await db.delete(members).where(inArray(members.teamId, createdTeamIds));
    await db.delete(teams).where(inArray(teams.id, createdTeamIds));
  });

  it("创建、加入、同步可见性和方案冲突按约定工作", async () => {
    const created = await createTeam("测试-团队同步", "管理员");
    expect(created.response.status).toBe(201);
    adminToken = created.body.token;
    adminId = created.body.memberId;
    originalInvite = created.body.team.inviteCode;
    expect(originalInvite).toMatch(/^TD-/);

    const joined = await request("/api/team/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode: originalInvite, nickname: "浏览者", platform: "mac" }),
    });
    expect(joined.response.status).toBe(201);
    viewerToken = joined.body.token;
    viewerId = joined.body.memberId;
    expect(joined.body.team.inviteCode).toBeNull();

    const pushed = await request("/api/team/push", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({
        changes: [
          { kind: "loadout", id: "我的配装", baseVersion: 0, visibility: "team", data: { secret: true } },
          { kind: "character", id: "紫霞", baseVersion: 0, data: { synced: true, name: "紫霞" } },
        ],
      }),
    });
    expect(pushed.response.status).toBe(200);
    expect(pushed.body.results.every((item: { ok: boolean }) => item.ok)).toBe(true);

    const synced = await request("/api/team/sync?since=0", { token: viewerToken });
    expect(synced.response.status).toBe(200);
    expect(synced.body.entities.find((item: { id: string }) => item.id === "我的配装")).toBeUndefined();
    expect(synced.body.entities.find((item: { id: string }) => item.id === "紫霞").data).toEqual({ name: "紫霞" });

    const denied = await request("/api/team/push", {
      method: "POST",
      token: viewerToken,
      body: JSON.stringify({ changes: [{ kind: "scheme", id: "团队方案", baseVersion: 0, data: {} }] }),
    });
    expect(denied.body.results[0]).toMatchObject({ ok: false, error: "forbidden" });

    const promoted = await request(`/api/team/members/${viewerId}`, {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ role: "editor" }),
    });
    expect(promoted.response.status).toBe(200);

    const createdScheme = await request("/api/team/push", {
      method: "POST",
      token: viewerToken,
      body: JSON.stringify({ changes: [{ kind: "scheme", id: "团队方案", baseVersion: 0, data: { round: 1 } }] }),
    });
    expect(createdScheme.body.results[0]).toMatchObject({ ok: true, version: 1 });

    const conflict = await request("/api/team/push", {
      method: "POST",
      token: viewerToken,
      body: JSON.stringify({ changes: [{ kind: "scheme", id: "团队方案", baseVersion: 0, data: { round: 2 } }] }),
    });
    expect(conflict.body.results[0]).toMatchObject({ ok: false, error: "conflict", current: { id: "团队方案", version: 1 } });
  }, 30_000);

  it("执行副本记录删除权限、登录码、移除成员和邀请码重置规则", async () => {
    const raid = await request("/api/team/push", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({ changes: [{ kind: "raidLog", id: "管理员记录", baseVersion: 0, data: { raid: 1 } }] }),
    });
    expect(raid.body.results[0]).toMatchObject({ ok: true });

    const forbiddenDelete = await request("/api/team/push", {
      method: "POST",
      token: viewerToken,
      body: JSON.stringify({ changes: [{ kind: "raidLog", id: "管理员记录", baseVersion: 1, deleted: true }] }),
    });
    expect(forbiddenDelete.body.results[0]).toMatchObject({ ok: false, error: "forbidden" });

    const adminDelete = await request("/api/team/push", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({ changes: [{ kind: "raidLog", id: "管理员记录", baseVersion: 1, deleted: true }] }),
    });
    expect(adminDelete.body.results[0]).toMatchObject({ ok: true, version: 2 });

    const loginCode = await request("/api/team/login-code", { method: "POST", token: adminToken, body: "{}" });
    expect(loginCode.response.status).toBe(200);
    const login = await request("/api/team/login", {
      method: "POST",
      body: JSON.stringify({ code: loginCode.body.code, platform: "mac" }),
    });
    expect(login.response.status).toBe(200);
    const used = await request("/api/team/login", {
      method: "POST",
      body: JSON.stringify({ code: loginCode.body.code, platform: "mac" }),
    });
    expect(used.response.status).toBe(404);
    expect(used.body).toMatchObject({ error: "code_invalid" });

    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.insert(loginCodes).values({
      id: randomId(),
      memberId: adminId,
      codeHash: sha256("23456789"),
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(),
    });
    const expired = await request("/api/team/login", {
      method: "POST",
      body: JSON.stringify({ code: "2345-6789", platform: "mac" }),
    });
    expect(expired.response.status).toBe(404);

    const reset = await request("/api/team/invite/reset", { method: "POST", token: adminToken, body: "{}" });
    expect(reset.response.status).toBe(200);
    expect(reset.body.inviteCode).not.toBe(originalInvite);
    const oldInvite = await request("/api/team/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode: originalInvite, nickname: "旧码加入", platform: "win" }),
    });
    expect(oldInvite.response.status).toBe(404);
    expect(oldInvite.body).toMatchObject({ error: "invite_invalid" });

    const lastAdmin = await request(`/api/team/members/${adminId}`, {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ role: "viewer" }),
    });
    expect(lastAdmin.response.status).toBe(409);
    expect(lastAdmin.body).toMatchObject({ error: "last_admin" });

    const removed = await request(`/api/team/members/${viewerId}`, { method: "DELETE", token: adminToken });
    expect(removed.response.status).toBe(200);
    const removedSync = await request("/api/team/sync?since=0", { token: viewerToken });
    expect(removedSync.response.status).toBe(401);
  }, 30_000);

  it("返回限流头，并回答桌面端 OPTIONS 预检", async () => {
    const preflight = await fetch(`${baseUrl}/api/team/sync`, {
      method: "OPTIONS",
      headers: { Origin: "tauri://localhost", "Access-Control-Request-Method": "GET" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("PATCH");

    const attempts = await Promise.all(Array.from({ length: 5 }, (_, index) => createTeam(`测试-限流${index}`, `限流${index}`)));
    expect(attempts.filter(result => result.response.status === 201)).toHaveLength(4);
    const limited = attempts.find(result => result.response.status === 429);
    expect(limited?.response.headers.get("retry-after")).toBeTruthy();
    expect(limited?.body).toMatchObject({ error: "rate_limited" });
  }, 30_000);

  const storageConfigured = Boolean(process.env.MANUS_API_URL && process.env.MANUS_API_KEY);
  (storageConfigured ? it : it.skip)("上传图片：未配置存储凭据时跳过此测试", async () => {
    const fake = await request("/api/team/files", {
      method: "POST",
      token: adminToken,
      body: new TextEncoder().encode("<svg onload=alert(1)>"),
      headers: { "Content-Type": "image/png" },
    });
    expect(fake.response.status).toBe(400);
    const upload = await request("/api/team/files", {
      method: "POST",
      token: adminToken,
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
      headers: { "Content-Type": "image/png" },
    });
    expect(upload.response.status).toBe(201);
    expect(upload.body.src).toMatch(/^\/manus-storage\/team\//);
  }, 30_000);

  it("删除服务器上没有的条目不留删除标记，不占住 ID", async () => {
    const ghost = await request("/api/team/push", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({ changes: [{ kind: "character", id: "没有的角色", baseVersion: 0, deleted: true }] }),
    });
    expect(ghost.body.results[0]).toMatchObject({ ok: true, version: 0 });
    const synced = await request("/api/team/sync?since=0", { token: adminToken });
    expect(synced.body.entities.find((item: { id: string }) => item.id === "没有的角色")).toBeUndefined();
  }, 30_000);
});
