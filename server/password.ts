/**
 * 登录密码的哈希和校验。用 Node 自带的 scrypt，不引入新依赖。
 * 存储格式：scrypt$N$r$p$<盐 base64>$<哈希 base64>，参数写进字符串，以后调参数旧密码照样能验。
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

function scrypt(
  password: string,
  salt: Buffer,
  keyLen: number,
  opts: ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keyLen, opts, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** 格式不对一律算不通过，不抛错 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(v => Number.isSafeInteger(v) && v > 0) || n > 1 << 20)
    return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!salt.length || !expected.length) return false;
  try {
    const key = await scrypt(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 256 * n * r + 1024 * 1024,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** 用户名不存在时拿它算一次，让响应时间和用户名存在时差不多 */
let dummy: Promise<string> | null = null;
export function dummyHash() {
  dummy ??= hashPassword(randomBytes(12).toString("base64"));
  return dummy;
}
