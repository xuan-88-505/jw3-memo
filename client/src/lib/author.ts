/**
 * 作者码：输入正确后，自己的头像带金色描边和皇冠（只影响显示，不涉及权限）。
 * 仓库是公开的，这里只存作者码的 SHA-256，看不出原文。
 */
const AUTHOR_CODE_SHA256 =
  "ac87bb96362e7be08c7d5553290ad2cee0d4f87d00a0a77b38daffd2796b27bb";

export async function checkAuthorCode(code: string): Promise<boolean> {
  const norm = code.trim().toUpperCase();
  const subtle = globalThis.crypto?.subtle;
  if (!norm || !subtle) return false;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(norm));
  const hex = Array.from(new Uint8Array(buf), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
  return hex === AUTHOR_CODE_SHA256;
}
