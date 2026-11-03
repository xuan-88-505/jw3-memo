import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("版本号", () => {
  it("package.json、tauri.conf.json、Cargo.toml、Cargo.lock 四处一致", () => {
    const pkg = JSON.parse(read("package.json")).version;
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")).version;
    const cargo = /^version = "([^"]+)"/m.exec(
      read("src-tauri/Cargo.toml")
    )?.[1];
    const lock = /\[\[package\]\]\nname = "tongdiao"\nversion = "([^"]+)"/.exec(
      read("src-tauri/Cargo.lock")
    )?.[1];
    expect(pkg).toMatch(/^\d+\.\d+\.\d+$/);
    expect({ tauri, cargo, lock }).toEqual({
      tauri: pkg,
      cargo: pkg,
      lock: pkg,
    });
  });
});
