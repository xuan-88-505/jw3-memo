import { describe, expect, it } from "vitest";
import { passwordProblem, usernameKey, usernameProblem } from "@shared/teamApi";
import { dummyHash, hashPassword, verifyPassword } from "./password";
import {
  parseAccountRequest,
  parsePasswordLogin,
  TeamRateLimiter,
} from "./team";

describe("用户名和密码规则", () => {
  it("用户名可以用中文、字母、数字和 _ - .，2–20 个字", () => {
    expect(usernameProblem("云间鹤")).toBeNull();
    expect(usernameProblem("山鬼")).toBeNull();
    expect(usernameProblem("Xuan_88.cn-1")).toBeNull();
    expect(usernameProblem("")).toBe("empty");
    expect(usernameProblem("a")).toBe("short");
    expect(usernameProblem("a".repeat(21))).toBe("long");
    expect(usernameProblem("鹤".repeat(20))).toBeNull();
    expect(usernameProblem("有 空格")).toBe("chars");
    expect(usernameProblem("_开头")).toBe("chars");
    expect(usernameProblem("带@符号")).toBe("chars");
  });
  it("用户名比较不分大小写，全角半角算同一个", () => {
    expect(usernameKey("XuanYu")).toBe(usernameKey("xuanyu"));
    expect(usernameKey("ｘｕａｎ１")).toBe(usernameKey("xuan1"));
  });
  it("密码 6–64 位，不能和用户名相同", () => {
    expect(passwordProblem("")).toBe("empty");
    expect(passwordProblem("12345")).toBe("short");
    expect(passwordProblem("123456")).toBeNull();
    expect(passwordProblem("x".repeat(65))).toBe("long");
    expect(passwordProblem("Yunjianhe", "yunjianhe")).toBe("same");
    expect(passwordProblem("yunjianhe1", "yunjianhe")).toBeNull();
  });
});

describe("请求解析", () => {
  it("设置登录密码：去掉用户名首尾空格，格式不对按项报错", () => {
    const ok = parseAccountRequest(
      { username: "  云间鹤 ", password: "secret1" },
      null
    );
    expect(ok).toEqual({
      ok: true,
      username: { display: "云间鹤", key: "云间鹤" },
      password: "secret1",
    });
    expect(parseAccountRequest({}, null)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseAccountRequest(null, null)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseAccountRequest({ username: "a b" }, null)).toEqual({
      ok: false,
      error: "username_invalid",
    });
    expect(parseAccountRequest({ username: 12 }, null)).toEqual({
      ok: false,
      error: "username_invalid",
    });
    expect(parseAccountRequest({ password: "123" }, "云间鹤")).toEqual({
      ok: false,
      error: "password_invalid",
    });
    // 只改密码时拿现在的用户名比较
    expect(parseAccountRequest({ password: "云间鹤" + "" }, "云间鹤")).toEqual({
      ok: false,
      error: "password_invalid",
    });
    expect(parseAccountRequest({ password: "abcdef" }, "云间鹤")).toEqual({
      ok: true,
      password: "abcdef",
    });
  });
  it("密码登录：用户名统一大小写，平台必须是 win 或 mac", () => {
    expect(
      parsePasswordLogin({
        username: " XuanYu ",
        password: "secret1",
        platform: "mac",
      })
    ).toEqual({
      key: "xuanyu",
      password: "secret1",
      platform: "mac",
    });
    expect(
      parsePasswordLogin({ username: "xuan", password: "", platform: "win" })
    ).toBeNull();
    expect(
      parsePasswordLogin({
        username: "xuan",
        password: "secret1",
        platform: "linux",
      })
    ).toBeNull();
    expect(
      parsePasswordLogin({ username: "", password: "secret1", platform: "win" })
    ).toBeNull();
    expect(parsePasswordLogin("xuan")).toBeNull();
  });
});

describe("密码哈希", () => {
  it("同一个密码每次的哈希不同，都能验过；错的密码和坏格式验不过", async () => {
    const a = await hashPassword("secret1");
    const b = await hashPassword("secret1");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("secret1", a)).toBe(true);
    expect(await verifyPassword("secret1", b)).toBe(true);
    expect(await verifyPassword("secret2", a)).toBe(false);
    expect(await verifyPassword("secret1", "plain")).toBe(false);
    expect(await verifyPassword("secret1", "scrypt$x$8$1$aa$bb")).toBe(false);
    expect(await verifyPassword("secret1", await dummyHash())).toBe(false);
  });
});

describe("只数失败次数的限流", () => {
  it("wait 只查不计数，take 才记一次", () => {
    const limiter = new TeamRateLimiter();
    const now = 1_000_000;
    expect(limiter.wait("k", 2, 60_000, now)).toBe(0);
    expect(limiter.wait("k", 2, 60_000, now)).toBe(0);
    limiter.take("k", 2, 60_000, now);
    limiter.take("k", 2, 60_000, now + 1000);
    expect(limiter.wait("k", 2, 60_000, now + 2000)).toBe(58);
    expect(limiter.wait("k", 2, 60_000, now + 60_001)).toBe(0);
  });
});
