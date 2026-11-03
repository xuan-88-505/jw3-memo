/**
 * 版本号比较，服务端（server/update.ts）和客户端（一键更新提示）共用。
 * 规则按 semver：先比 主.次.修订，再比预发布号；没有预发布号的比有的新。
 */
export type Semver = { core: [number, number, number]; pre: string[] };

/** 解析 1.2.3、v1.2.3、1.2.3-beta.1；+ 后面的构建信息忽略 */
export function parseSemver(v: string): Semver | null {
  const m =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      v.trim()
    );
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
  };
}

/** a 比 b 新返回正数，旧返回负数，相同返回 0。按 semver 规则比较预发布号 */
export function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  }
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** a 是否比 b 新；任何一个不是合法版本号都返回 false */
export function isNewerVersion(a: string, b: string): boolean {
  const x = parseSemver(a);
  const y = parseSemver(b);
  return !!x && !!y && compareSemver(x, y) > 0;
}
