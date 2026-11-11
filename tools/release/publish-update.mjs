#!/usr/bin/env node
/**
 * 给一个已经由 GitHub Actions 打好包的 Release 补上一键更新文件。
 *
 * 用法（在项目根目录）：
 *   node tools/release/publish-update.mjs --tag v2.2.0 --notes notes.md [--dry-run]
 *   node tools/release/publish-update.mjs --self-test
 *
 * 做的事：
 *   1. 用 gh 下载 Release 里的 Windows setup.exe 和 Mac app.tar.gz。
 *      Mac 优先用两种芯片各自的包（darwin_aarch64 / darwin_x64，2.4.0 起由 Actions 打出），
 *      没有就用通用包（darwin_universal）。
 *   2. 用 `tauri signer sign --app-version` 签名（签名里写入版本号）。
 *   3. 用 tauri.conf.json 里的公钥按插件的规则验证签名和版本号。
 *   4. 检查服务端更新接口已经上线（返回 JSON，不是网页）。
 *   5. 生成 latest.json，连同 .sig 上传到这个 Release（--dry-run 只生成不上传）。
 *
 * 私钥不进仓库。默认读 ~/.tauri/jw3memo.key 和 ~/.tauri/jw3memo.password，
 * 也可以用环境变量 TAURI_SIGNING_PRIVATE_KEY_PATH、TAURI_SIGNING_PRIVATE_KEY_PASSWORD。
 * 密码只通过环境变量交给 tauri 命令，不出现在命令行参数里。
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const REPO = "xuan-88-505/jw3-memo";
const PRODUCT = "JW3-Memo";

// ---------- minisign 验证（和 tauri-plugin-updater 2.14 的 verify_signature 同一套规则） ----------

function b64text(s) {
  return Buffer.from(s.trim(), "base64").toString("utf8");
}

/** 解析 tauri.conf.json 里的 pubkey（base64 包着的 minisign 公钥文件） */
export function parsePublicKey(pubkeyB64) {
  const lines = b64text(pubkeyB64).split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("公钥格式不对");
  const blob = Buffer.from(lines[1], "base64");
  if (blob.length !== 42 || blob.subarray(0, 2).toString() !== "Ed") {
    throw new Error("公钥格式不对");
  }
  return { keyId: blob.subarray(2, 10), key: blob.subarray(10, 42) };
}

function ed25519Verify(rawKey, message, signature) {
  const key = crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: rawKey.toString("base64url") },
    format: "jwk",
  });
  return crypto.verify(null, message, key, signature);
}

/** 签名里写的版本号：可信注释按 Tab 分段，取 `version:` 开头的那段 */
export function signedVersion(trustedComment) {
  for (const field of trustedComment.split("\t")) {
    if (field.startsWith("version:")) return field.slice("version:".length);
  }
  return null;
}

const sameVersion = (a, b) => a.replace(/^v/, "") === b.replace(/^v/, "");

/**
 * 验证 .sig 文件内容（base64 字符串）。失败时抛出原因。
 * requireVersion 为 true 时，签名里必须写了版本号，并且等于 announced。
 */
export function verifyUpdateSignature(
  data,
  signatureB64,
  pubkeyB64,
  announced,
  requireVersion = true
) {
  const pub = parsePublicKey(pubkeyB64);
  const lines = b64text(signatureB64).split("\n");
  const sigLine = lines[1] ?? "";
  const trustedLine = lines[2] ?? "";
  const globalLine = lines[3] ?? "";
  const blob = Buffer.from(sigLine, "base64");
  if (blob.length !== 74) throw new Error("签名格式不对");
  const alg = blob.subarray(0, 2).toString();
  if (alg !== "ED" && alg !== "Ed") throw new Error("签名算法不对");
  if (!blob.subarray(2, 10).equals(pub.keyId))
    throw new Error("签名用的不是这把密钥");
  const sig = blob.subarray(10);
  const message =
    alg === "ED" ? crypto.createHash("blake2b512").update(data).digest() : data;
  if (!ed25519Verify(pub.key, message, sig))
    throw new Error("文件和签名对不上");
  const prefix = "trusted comment: ";
  if (!trustedLine.startsWith(prefix)) throw new Error("签名缺少可信注释");
  const trusted = trustedLine.slice(prefix.length);
  const global = Buffer.from(globalLine, "base64");
  if (global.length !== 64) throw new Error("签名格式不对");
  if (
    !ed25519Verify(
      pub.key,
      Buffer.concat([sig, Buffer.from(trusted, "utf8")]),
      global
    )
  ) {
    throw new Error("可信注释被改过");
  }
  const signed = signedVersion(trusted);
  if (signed === null) {
    if (requireVersion) throw new Error("签名里没有版本号");
  } else if (!sameVersion(signed, announced)) {
    throw new Error(`签名里的版本是 ${signed}，清单写的是 ${announced}`);
  }
  return { trusted, signed };
}

// ---------- 工具 ----------

function run(cmd, args, opts = {}) {
  const env = { ...(opts.env ?? process.env), NO_COLOR: "1" };
  // 有的环境强制 gh 输出彩色 JSON，会让 JSON.parse 失败
  delete env.CLICOLOR_FORCE;
  delete env.GH_FORCE_TTY;
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts, env });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || "")
      .trim()
      .split("\n")
      .slice(-5)
      .join("\n");
    throw new Error(`${cmd} ${args[0] ?? ""} 失败：${msg}`);
  }
  // eslint-disable-next-line no-control-regex
  return r.stdout.replace(/\u001b\[[0-9;]*m/g, "");
}

/** 用 tauri signer 签名，返回 .sig 文件内容 */
function sign(file, version, keyPath, password) {
  const env = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
  };
  // 只用私钥文件；环境里残留的私钥字符串会和 -f 冲突
  delete env.TAURI_SIGNING_PRIVATE_KEY;
  run(
    "pnpm",
    [
      "exec",
      "tauri",
      "signer",
      "sign",
      ...(version ? ["--app-version", version] : []),
      file,
    ],
    {
      env,
    }
  );
  return fs.readFileSync(`${file}.sig`, "utf8").trim();
}

function readConfig() {
  const conf = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8")
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
  );
  const pubkey = conf.plugins?.updater?.pubkey;
  if (!pubkey) throw new Error("tauri.conf.json 里没有 plugins.updater.pubkey");
  return {
    pubkey,
    version: pkg.version,
    requireVersion: conf.plugins.updater.requireSignedVersion === true,
    endpoints: conf.plugins.updater.endpoints ?? [],
  };
}

/**
 * 插件只在第一个地址请求失败时才换下一个地址。第一个地址如果返回 200 的网页
 * （服务端还没发布这些路由时，前端兜底页会这样），插件会解析失败，不再试 GitHub。
 * 所以上传 latest.json 之前，先确认服务端的检查更新接口在线。
 */
export async function checkServerEndpoint(endpoint, fetchImpl = fetch) {
  const probe = endpoint
    .replace("{{target}}", "windows")
    .replace("{{arch}}", "x86_64")
    .replace("{{current_version}}", "0.0.1");
  const res = await fetchImpl(probe, { redirect: "manual" });
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 204) return { probe, status: 204 };
  if (
    (res.status === 200 || res.status === 503) &&
    type.includes("application/json")
  ) {
    return { probe, status: res.status };
  }
  throw new Error(
    `服务端检查更新接口还没上线（${probe} 返回 ${res.status} ${type || "无类型"}）。先发布网站，再运行本脚本`
  );
}

function parseArgs(argv) {
  const out = { dryRun: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--tag") out.tag = argv[++i];
    else if (a === "--notes") out.notes = argv[++i];
    else throw new Error(`不认识的参数 ${a}`);
  }
  return out;
}

// ---------- 自检：用临时密钥确认签名、验证、拒绝三种坏情况 ----------

async function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jw3-sign-test-"));
  try {
    const key = path.join(dir, "test.key");
    const pw = crypto.randomBytes(12).toString("hex");
    run("pnpm", [
      "exec",
      "tauri",
      "signer",
      "generate",
      "--ci",
      "-w",
      key,
      "-p",
      pw,
    ]);
    const pubkey = fs.readFileSync(`${key}.pub`, "utf8").trim();
    const file = path.join(dir, "JW3-Memo_9.9.9_windows_x64-setup.exe");
    fs.writeFileSync(file, crypto.randomBytes(4096));
    const data = fs.readFileSync(file);
    const results = [];
    const expect = (name, fn, ok) => {
      let err = null;
      try {
        fn();
      } catch (e) {
        err = e.message;
      }
      const pass = ok ? err === null : err !== null;
      results.push(pass);
      console.log(
        `${pass ? "PASS" : "FAIL"} ${name}${err ? `（${err}）` : ""}`
      );
    };
    const sig = sign(file, "9.9.9", key, pw);
    expect(
      "签名带版本号，验证通过",
      () => verifyUpdateSignature(data, sig, pubkey, "9.9.9"),
      true
    );
    expect(
      "清单写 v9.9.9 也算同一版本",
      () => verifyUpdateSignature(data, sig, pubkey, "v9.9.9"),
      true
    );
    expect(
      "文件被改过，拒绝",
      () => {
        const bad = Buffer.from(data);
        bad[100] ^= 1;
        verifyUpdateSignature(bad, sig, pubkey, "9.9.9");
      },
      false
    );
    expect(
      "清单版本和签名不一致，拒绝",
      () => verifyUpdateSignature(data, sig, pubkey, "9.9.8"),
      false
    );
    const legacy = sign(file, null, key, pw);
    expect(
      "签名没写版本号，拒绝",
      () => verifyUpdateSignature(data, legacy, pubkey, "9.9.9"),
      false
    );
    expect(
      "别的密钥的公钥，拒绝",
      () => verifyUpdateSignature(data, sig, readConfig().pubkey, "9.9.9"),
      false
    );
    const fake = (status, type) => async () => ({
      status,
      headers: new Headers(type ? { "content-type": type } : {}),
    });
    const probe = async (name, status, type, ok) => {
      let err = null;
      try {
        await checkServerEndpoint(
          "https://x.test/api/update/{{target}}/{{arch}}/{{current_version}}",
          fake(status, type)
        );
      } catch (e) {
        err = e.message;
      }
      const pass = ok ? err === null : err !== null;
      results.push(pass);
      console.log(
        `${pass ? "PASS" : "FAIL"} ${name}${err ? `（${err}）` : ""}`
      );
    };
    await probe(
      "服务端返回 JSON 清单，算在线",
      200,
      "application/json; charset=utf-8",
      true
    );
    await probe("服务端返回 204（没有新版本），算在线", 204, null, true);
    await probe(
      "服务端拿不到清单返回 503 JSON，算在线",
      503,
      "application/json",
      true
    );
    await probe(
      "服务端返回 200 网页（还没发布），拒绝",
      200,
      "text/html; charset=utf-8",
      false
    );
    await probe("服务端返回 404，拒绝", 404, "text/html", false);
    const ok = results.every(Boolean);
    console.log(ok ? "SELF-TEST OK" : "SELF-TEST FAILED");
    return ok;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) process.exit((await selfTest()) ? 0 : 1);

  const cfg = readConfig();
  const tag = args.tag ?? `v${cfg.version}`;
  const version = tag.replace(/^v/, "");
  if (version !== cfg.version) {
    throw new Error(
      `package.json 是 ${cfg.version}，要发的是 ${tag}。先确认版本号`
    );
  }
  if (!args.notes)
    throw new Error("要用 --notes 指定更新内容文件（显示在更新弹窗里）");
  const notes = fs.readFileSync(args.notes, "utf8").trim();
  const keyPath =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ||
    path.join(os.homedir(), ".tauri/jw3memo.key");
  const password =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??
    fs
      .readFileSync(path.join(os.homedir(), ".tauri/jw3memo.password"), "utf8")
      .trim();
  if (!fs.existsSync(keyPath))
    throw new Error(`找不到私钥 ${keyPath}（备份在项目共享文件里）`);

  const rel = JSON.parse(
    run("gh", [
      "release",
      "view",
      tag,
      "--repo",
      REPO,
      "--json",
      "assets,publishedAt,isDraft",
    ])
  );
  const names = new Set(rel.assets.map(a => a.name));
  const win = `${PRODUCT}_${version}_windows_x64-setup.exe`;
  // Mac：两种芯片优先用各自的包（只有一种芯片的代码，小一半）；没有就用通用包
  const macUniversal = `${PRODUCT}_${version}_darwin_universal.app.tar.gz`;
  const macFor = {
    "darwin-aarch64": `${PRODUCT}_${version}_darwin_aarch64.app.tar.gz`,
    "darwin-x86_64": `${PRODUCT}_${version}_darwin_x64.app.tar.gz`,
  };
  for (const [platform, n] of Object.entries(macFor)) {
    if (names.has(n)) continue;
    if (!names.has(macUniversal))
      throw new Error(
        `${tag} 里没有 ${n}，也没有 ${macUniversal}，等打包完成再运行`
      );
    console.log(`WARN ${tag} 里没有 ${n}，${platform} 改用通用包`);
    macFor[platform] = macUniversal;
  }
  if (!names.has(win))
    throw new Error(`${tag} 里没有 ${win}，等打包完成再运行`);
  const files = [...new Set([win, ...Object.values(macFor)])];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jw3-update-${version}-`));
  console.log(`下载到 ${dir}`);
  for (const n of files) {
    run("gh", [
      "release",
      "download",
      tag,
      "--repo",
      REPO,
      "-p",
      n,
      "-D",
      dir,
      "--clobber",
    ]);
  }

  const url = n => `https://github.com/${REPO}/releases/download/${tag}/${n}`;
  const signed = {};
  for (const n of files) {
    const file = path.join(dir, n);
    const sig = sign(file, version, keyPath, password);
    verifyUpdateSignature(
      fs.readFileSync(file),
      sig,
      cfg.pubkey,
      version,
      cfg.requireVersion
    );
    console.log(`PASS 签名并验证 ${n}`);
    signed[n] = sig;
  }

  const pubDate = (
    rel.publishedAt && !rel.isDraft ? new Date(rel.publishedAt) : new Date()
  )
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const manifest = {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": { signature: signed[win], url: url(win) },
      ...Object.fromEntries(
        Object.entries(macFor).map(([platform, n]) => [
          platform,
          { signature: signed[n], url: url(n) },
        ])
      ),
    },
  };
  const out = path.join(dir, "latest.json");
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已生成 ${out}`);
  for (const [platform, n] of Object.entries(macFor))
    console.log(`  ${platform} → ${n}`);

  const server = cfg.endpoints.find(e => !e.includes("github.com"));
  if (server) {
    try {
      const r = await checkServerEndpoint(server);
      console.log(`PASS 服务端接口在线（${r.status}）`);
    } catch (e) {
      if (!args.dryRun) throw e;
      console.log(`WARN ${e.message}`);
    }
  }
  if (args.dryRun) {
    console.log("--dry-run：没有上传");
    return;
  }
  run("gh", [
    "release",
    "upload",
    tag,
    "--repo",
    REPO,
    "--clobber",
    out,
    ...files.map(n => path.join(dir, `${n}.sig`)),
  ]);
  console.log(`已上传 latest.json 和 ${files.length} 个 .sig 到 ${tag}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(e => {
    console.error(`出错：${e.message}`);
    process.exit(1);
  });
}
