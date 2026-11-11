import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "events";
import type { Server } from "http";
import {
  compareSemver,
  DIRECT_HEADER,
  isMirrorFile,
  mirrorUrl,
  parseSemver,
  pickUpdate,
  registerUpdateRoutes,
} from "./update";

const GH = "https://github.com/xuan-88-505/jw3-memo/releases/download";
const ORIGIN = "https://example.test";

function manifest(version = "2.2.0") {
  return {
    version,
    notes: "## 本版更新\n- 一键更新",
    pub_date: "2026-11-03T08:00:00Z",
    platforms: {
      "windows-x86_64": {
        url: `${GH}/v${version}/JW3-Memo_${version}_windows_x64-setup.exe`,
        signature: "sig-win",
      },
      "darwin-aarch64": {
        url: `${GH}/v${version}/JW3-Memo_${version}_darwin_universal.app.tar.gz`,
        signature: "sig-mac",
      },
      "darwin-x86_64": {
        url: `${GH}/v${version}/JW3-Memo_${version}_darwin_universal.app.tar.gz`,
        signature: "sig-mac",
      },
    },
  };
}

const sv = (v: string) => {
  const p = parseSemver(v);
  if (!p) throw new Error(`bad semver ${v}`);
  return p;
};

describe("版本号比较", () => {
  it("解析 v 前缀、预发布号，拒绝不合规的写法", () => {
    expect(parseSemver("v2.1.0")?.core).toEqual([2, 1, 0]);
    expect(parseSemver("2.2.0-beta.1")?.pre).toEqual(["beta", "1"]);
    expect(parseSemver("2.1")).toBeNull();
    expect(parseSemver("2.1.0; rm -rf")).toBeNull();
  });
  it("按 semver 规则比较", () => {
    expect(compareSemver(sv("2.2.0"), sv("2.1.0"))).toBeGreaterThan(0);
    expect(compareSemver(sv("2.1.0"), sv("2.1.0"))).toBe(0);
    expect(compareSemver(sv("2.10.0"), sv("2.9.9"))).toBeGreaterThan(0);
    expect(compareSemver(sv("2.2.0-beta.1"), sv("2.2.0"))).toBeLessThan(0);
    expect(compareSemver(sv("2.2.0-beta.2"), sv("2.2.0-beta.10"))).toBeLessThan(
      0
    );
    expect(compareSemver(sv("2.2.0-beta"), sv("2.2.0-alpha"))).toBeGreaterThan(
      0
    );
  });
});

describe("下载地址改成本服务器转发", () => {
  it("只改本仓库 Release 里的更新包", () => {
    expect(
      mirrorUrl(`${GH}/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`, ORIGIN)
    ).toBe(
      `${ORIGIN}/api/update/file/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`
    );
    // dmg 不是更新包、别的仓库、路径多一层，都原样返回
    const dmg = `${GH}/v2.2.0/JW3-Memo_2.2.0_darwin_universal.dmg`;
    expect(mirrorUrl(dmg, ORIGIN)).toBe(dmg);
    const other =
      "https://github.com/someone/else/releases/download/v1.0.0/a-setup.exe";
    expect(mirrorUrl(other, ORIGIN)).toBe(other);
    const deep = `${GH}/v2.2.0/x/a-setup.exe`;
    expect(mirrorUrl(deep, ORIGIN)).toBe(deep);
  });
  it("转发接口只认版本标签和更新包后缀", () => {
    expect(
      isMirrorFile("v2.2.0", "JW3-Memo_2.2.0_darwin_universal.app.tar.gz")
    ).toBe(true);
    expect(isMirrorFile("v2.2.0", "JW3-Memo_2.2.0_windows_x64-setup.exe")).toBe(
      true
    );
    expect(isMirrorFile("v2.2.0", "latest.json")).toBe(false);
    expect(isMirrorFile("v2.2.0", "..")).toBe(false);
    expect(isMirrorFile("main", "a-setup.exe")).toBe(false);
  });
});

describe("挑出这台电脑要的更新", () => {
  it("新版本：返回动态格式，地址改成转发地址", () => {
    const u = pickUpdate(manifest(), "windows", "x86_64", "2.1.0", ORIGIN);
    expect(u).toEqual({
      version: "2.2.0",
      notes: "## 本版更新\n- 一键更新",
      pub_date: "2026-11-03T08:00:00Z",
      url: `${ORIGIN}/api/update/file/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`,
      signature: "sig-win",
    });
    const mac = pickUpdate(manifest(), "darwin", "aarch64", "2.1.0", ORIGIN);
    expect(mac && mac !== "invalid" && mac.url).toBe(
      `${ORIGIN}/api/update/file/v2.2.0/JW3-Memo_2.2.0_darwin_universal.app.tar.gz`
    );
  });
  it("direct：下载地址保持 GitHub 原样，其他字段不变", () => {
    const u = pickUpdate(
      manifest(),
      "windows",
      "x86_64",
      "2.1.0",
      ORIGIN,
      true
    );
    expect(u).toEqual({
      version: "2.2.0",
      notes: "## 本版更新\n- 一键更新",
      pub_date: "2026-11-03T08:00:00Z",
      url: `${GH}/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`,
      signature: "sig-win",
    });
  });
  it("Mac 两种芯片各有自己的包时，各拿各的（转发和直连都是）", () => {
    const m = manifest("2.4.0");
    m.platforms["darwin-aarch64"] = {
      url: `${GH}/v2.4.0/JW3-Memo_2.4.0_darwin_aarch64.app.tar.gz`,
      signature: "sig-arm",
    };
    m.platforms["darwin-x86_64"] = {
      url: `${GH}/v2.4.0/JW3-Memo_2.4.0_darwin_x64.app.tar.gz`,
      signature: "sig-intel",
    };
    const arm = pickUpdate(m, "darwin", "aarch64", "2.3.0", ORIGIN);
    const intel = pickUpdate(m, "darwin", "x86_64", "2.3.0", ORIGIN, true);
    expect(arm && arm !== "invalid" && [arm.url, arm.signature]).toEqual([
      `${ORIGIN}/api/update/file/v2.4.0/JW3-Memo_2.4.0_darwin_aarch64.app.tar.gz`,
      "sig-arm",
    ]);
    expect(
      intel && intel !== "invalid" && [intel.url, intel.signature]
    ).toEqual([
      `${GH}/v2.4.0/JW3-Memo_2.4.0_darwin_x64.app.tar.gz`,
      "sig-intel",
    ]);
  });
  it("一样或更旧的版本、没有这个平台：没有更新", () => {
    expect(
      pickUpdate(manifest(), "windows", "x86_64", "2.2.0", ORIGIN)
    ).toBeNull();
    expect(
      pickUpdate(manifest(), "windows", "x86_64", "2.3.0", ORIGIN)
    ).toBeNull();
    expect(
      pickUpdate(manifest(), "linux", "x86_64", "2.1.0", ORIGIN)
    ).toBeNull();
  });
  it("格式不对：invalid；pub_date 不合规时不带", () => {
    expect(pickUpdate(null, "windows", "x86_64", "2.1.0")).toBe("invalid");
    expect(
      pickUpdate({ version: "x", platforms: {} }, "windows", "x86_64", "2.1.0")
    ).toBe("invalid");
    const m = manifest();
    m.platforms["windows-x86_64"].signature = "";
    expect(pickUpdate(m, "windows", "x86_64", "2.1.0")).toBe("invalid");
    const d = { ...manifest(), pub_date: "昨天" };
    const u = pickUpdate(d, "windows", "x86_64", "2.1.0");
    expect(u && u !== "invalid" && "pub_date" in u).toBe(false);
  });
});

describe("更新接口路由（假的 GitHub）", () => {
  let server: Server;
  let base = "";
  let clock = 1_000_000;
  let manifestStatus = 200;
  let manifestBody: unknown = manifest();
  const calls: string[] = [];
  const payload = Buffer.alloc(300_000, 7);

  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/releases/latest/download/latest.json")) {
      return new Response(JSON.stringify(manifestBody), {
        status: manifestStatus,
      });
    }
    if (url === `${GH}/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`) {
      return new Response(payload, {
        status: 200,
        headers: { "content-length": String(payload.length) },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  beforeAll(async () => {
    const app = express();
    registerUpdateRoutes(app, {
      fetchImpl: fakeFetch,
      origin: ORIGIN,
      now: () => clock,
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("测试服务器未监听端口");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("有新版本返回 200，没有返回 204，参数不对返回 400", async () => {
    const r = await fetch(`${base}/api/update/windows/x86_64/2.1.0`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body.version).toBe("2.2.0");
    expect(body.url).toBe(
      `${ORIGIN}/api/update/file/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`
    );
    expect(body.signature).toBe("sig-win");
    expect(
      (await fetch(`${base}/api/update/windows/x86_64/2.2.0`)).status
    ).toBe(204);
    expect((await fetch(`${base}/api/update/plan9/x86_64/2.1.0`)).status).toBe(
      400
    );
    expect((await fetch(`${base}/api/update/windows/x86_64/abc`)).status).toBe(
      400
    );
  });

  it("带直连请求头：返回 GitHub 原始地址；值不对按转发处理", async () => {
    const direct = await fetch(`${base}/api/update/windows/x86_64/2.1.0`, {
      headers: { [DIRECT_HEADER]: "Direct" },
    });
    expect(direct.status).toBe(200);
    expect(direct.headers.get("cache-control")).toBe("no-store");
    expect((await direct.json()).url).toBe(
      `${GH}/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`
    );
    const other = await fetch(`${base}/api/update/windows/x86_64/2.1.0`, {
      headers: { [DIRECT_HEADER]: "yes" },
    });
    expect((await other.json()).url).toBe(
      `${ORIGIN}/api/update/file/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`
    );
    const latest = await fetch(`${base}/api/update/windows/x86_64/2.2.0`, {
      headers: { [DIRECT_HEADER]: "direct" },
    });
    expect(latest.status).toBe(204);
  });

  it("latest.json 缓存 5 分钟；GitHub 读不到时 1 天内用旧缓存，没缓存返回 503", async () => {
    const before = calls.filter(c => c.endsWith("latest.json")).length;
    await fetch(`${base}/api/update/darwin/aarch64/2.1.0`);
    expect(calls.filter(c => c.endsWith("latest.json")).length).toBe(before);
    clock += 6 * 60 * 1000;
    manifestStatus = 500;
    const stale = await fetch(`${base}/api/update/darwin/aarch64/2.1.0`);
    expect(stale.status).toBe(200);
    expect(calls.filter(c => c.endsWith("latest.json")).length).toBe(
      before + 1
    );
    clock += 25 * 60 * 60 * 1000;
    expect(
      (await fetch(`${base}/api/update/darwin/aarch64/2.1.0`)).status
    ).toBe(503);
    manifestStatus = 200;
    manifestBody = { version: "2.2.0" };
    expect(
      (await fetch(`${base}/api/update/darwin/aarch64/2.1.0`)).status
    ).toBe(503);
    manifestBody = manifest();
    clock += 6 * 60 * 1000;
    expect(
      (await fetch(`${base}/api/update/darwin/aarch64/2.1.0`)).status
    ).toBe(200);
  });

  it("转发安装包：内容和长度一致；不合规的文件名和 GitHub 上没有的文件返回 404", async () => {
    const r = await fetch(
      `${base}/api/update/file/v2.2.0/JW3-Memo_2.2.0_windows_x64-setup.exe`
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-length")).toBe(String(payload.length));
    const got = Buffer.from(await r.arrayBuffer());
    expect(got.equals(payload)).toBe(true);
    expect(
      (await fetch(`${base}/api/update/file/v2.2.0/latest.json`)).status
    ).toBe(404);
    expect(
      (await fetch(`${base}/api/update/file/main/a-setup.exe`)).status
    ).toBe(404);
    expect(
      (
        await fetch(
          `${base}/api/update/file/v9.9.9/JW3-Memo_9.9.9_windows_x64-setup.exe`
        )
      ).status
    ).toBe(404);
  });
});
