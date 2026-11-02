import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "events";
import type { Server } from "http";
import { inArray } from "drizzle-orm";
import {
  deviceTokens,
  entities,
  loginCodes,
  memberLogins,
  members,
  teamFiles,
  teams,
} from "../drizzle/schema";
import { getDb } from "./db";
import { registerTeamRoutes } from "./teamRoute";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdTeamIds: string[] = [];
let server: Server;
let baseUrl = "";
/** 每次运行不同，避免和线上真实用户名撞上 */
const tag = Math.random().toString(36).slice(2, 8);

async function request(
  path: string,
  options: RequestInit & { token?: string; ip?: string } = {}
) {
  const { token, ip, headers, ...init } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // 不同测试段用不同的来源 IP，互不占用每个 IP 的登录次数
      "CF-Connecting-IP": ip ?? "203.0.113.1",
      ...headers,
    },
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

const setAccount = (token: string, body: Record<string, unknown>) =>
  request("/api/team/account", {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
const passwordLogin = (username: string, password: string, ip: string) =>
  request("/api/team/login/password", {
    method: "POST",
    ip,
    body: JSON.stringify({ username, password, platform: "mac" }),
  });

describe.skipIf(!hasDatabase)("登录密码路由集成", { timeout: 30_000 }, () => {
  let adminToken = "";
  let adminId = "";
  let inviteCode = "";
  let friendToken = "";
  let friendId = "";
  const adminName = `测试Ab_${tag}`;
  const friendName = `friend.${tag}`;

  beforeAll(async () => {
    const app = express();
    registerTeamRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("测试服务器未监听端口");
    baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await request("/api/team/create", {
      method: "POST",
      body: JSON.stringify({
        teamName: "测试-登录密码",
        nickname: "管理员",
        platform: "win",
      }),
    });
    expect(created.response.status).toBe(201);
    createdTeamIds.push(created.body.team.id);
    adminToken = created.body.token;
    adminId = created.body.memberId;
    inviteCode = created.body.team.inviteCode;
    const joined = await request("/api/team/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode, nickname: "朋友", platform: "mac" }),
    });
    expect(joined.response.status).toBe(201);
    friendToken = joined.body.token;
    friendId = joined.body.memberId;
  });

  afterAll(async () => {
    if (server)
      await new Promise<void>(resolve => server.close(() => resolve()));
    const db = await getDb();
    if (!db || createdTeamIds.length === 0) return;
    const memberRows = await db
      .select({ id: members.id })
      .from(members)
      .where(inArray(members.teamId, createdTeamIds));
    const memberIds = memberRows.map(row => row.id);
    await db.delete(teamFiles).where(inArray(teamFiles.teamId, createdTeamIds));
    await db.delete(entities).where(inArray(entities.teamId, createdTeamIds));
    if (memberIds.length > 0) {
      await db
        .delete(memberLogins)
        .where(inArray(memberLogins.memberId, memberIds));
      await db
        .delete(loginCodes)
        .where(inArray(loginCodes.memberId, memberIds));
      await db
        .delete(deviceTokens)
        .where(inArray(deviceTokens.memberId, memberIds));
    }
    await db.delete(members).where(inArray(members.teamId, createdTeamIds));
    await db.delete(teams).where(inArray(teams.id, createdTeamIds));
  });

  it("没设置时是 null；第一次设置要同时有用户名和密码，格式不对按项报错", async () => {
    const empty = await request("/api/team/account", { token: adminToken });
    expect(empty.response.status).toBe(200);
    expect(empty.body).toEqual({ username: null });
    expect((await request("/api/team/account")).response.status).toBe(401);

    const onlyName = await setAccount(adminToken, { username: adminName });
    expect(onlyName.response.status).toBe(400);
    expect(onlyName.body.error).toBe("password_invalid");
    const onlyPassword = await setAccount(adminToken, {
      password: "secret123",
    });
    expect(onlyPassword.body.error).toBe("username_invalid");
    expect(
      (
        await setAccount(adminToken, {
          username: "有 空格",
          password: "secret123",
        })
      ).body.error
    ).toBe("username_invalid");
    expect(
      (await setAccount(adminToken, { username: adminName, password: "12345" }))
        .body.error
    ).toBe("password_invalid");
    expect(
      (
        await setAccount(adminToken, {
          username: adminName,
          password: adminName.toLowerCase(),
        })
      ).body.error
    ).toBe("password_invalid");

    const ok = await setAccount(adminToken, {
      username: `  ${adminName} `,
      password: "secret123",
    });
    expect(ok.response.status).toBe(200);
    expect(ok.body).toEqual({ username: adminName });
    expect(
      (await request("/api/team/account", { token: adminToken })).body
    ).toEqual({ username: adminName });
  });

  it("用户名不分大小写、全角半角唯一", async () => {
    const upper = await setAccount(friendToken, {
      username: adminName.toUpperCase(),
      password: "another1",
    });
    expect(upper.response.status).toBe(409);
    expect(upper.body.error).toBe("username_taken");
    const ok = await setAccount(friendToken, {
      username: friendName,
      password: "another1",
    });
    expect(ok.response.status).toBe(200);
  });

  it("用户名和密码对了才能登录，登录后是原来的成员；改密码、改用户名后旧的不能用", async () => {
    const ip = "203.0.113.10";
    const wrong = await passwordLogin(adminName, "secret12", ip);
    expect(wrong.response.status).toBe(400);
    expect(wrong.body.error).toBe("credentials_invalid");
    const unknown = await passwordLogin(`nobody_${tag}`, "secret123", ip);
    expect(unknown.body).toMatchObject({
      error: "credentials_invalid",
      message: wrong.body.message,
    });

    const ok = await passwordLogin(
      ` ${adminName.toLowerCase()} `,
      "secret123",
      ip
    );
    expect(ok.response.status).toBe(200);
    expect(ok.body.memberId).toBe(adminId);
    expect(ok.body.team.inviteCode).toBe(inviteCode);
    const synced = await request("/api/team/sync?since=0", {
      token: ok.body.token,
    });
    expect(synced.response.status).toBe(200);
    expect(synced.body.me.memberId).toBe(adminId);

    // 只改密码
    expect(
      (await setAccount(ok.body.token, { password: "newpass99" })).body
    ).toEqual({ username: adminName });
    expect((await passwordLogin(adminName, "secret123", ip)).body.error).toBe(
      "credentials_invalid"
    );
    expect(
      (await passwordLogin(adminName, "newpass99", ip)).response.status
    ).toBe(200);

    // 只改用户名
    const renamed = `${adminName}x`;
    expect((await setAccount(adminToken, { username: renamed })).body).toEqual({
      username: renamed,
    });
    const ip2 = "203.0.113.11";
    expect((await passwordLogin(adminName, "newpass99", ip2)).body.error).toBe(
      "credentials_invalid"
    );
    expect(
      (await passwordLogin(renamed, "newpass99", ip2)).response.status
    ).toBe(200);
  });

  it("同一个用户名输错 5 次后暂停，密码对了也要等", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await passwordLogin(
        friendName,
        `wrong${i}xx`,
        `203.0.113.${20 + i}`
      );
      expect(r.body.error).toBe("credentials_invalid");
    }
    const blocked = await passwordLogin(friendName, "another1", "203.0.113.30");
    expect(blocked.response.status).toBe(429);
    expect(blocked.body.error).toBe("rate_limited");
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
  });

  it("每个 IP 10 分钟最多试 10 次", async () => {
    const ip = "203.0.113.40";
    for (let i = 0; i < 10; i++) {
      expect(
        (await passwordLogin(`nobody${i}_${tag}`, "whatever1", ip)).response
          .status
      ).toBe(400);
    }
    expect(
      (await passwordLogin(`nobody_${tag}`, "whatever1", ip)).response.status
    ).toBe(429);
  });

  it("成员被移出后登录密码失效，用户名可以给别人用", async () => {
    const removed = await request(`/api/team/members/${friendId}`, {
      method: "DELETE",
      token: adminToken,
    });
    expect(removed.response.status).toBe(200);
    // 计数器按用户名记，换一个用户名测：被移出的人已经登录不了
    const rejoined = await request("/api/team/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode, nickname: "新朋友", platform: "win" }),
    });
    expect(rejoined.response.status).toBe(201);
    const take = await setAccount(rejoined.body.token, {
      username: friendName,
      password: "third123",
    });
    expect(take.response.status).toBe(200);
    expect(take.body).toEqual({ username: friendName });
  });
});
