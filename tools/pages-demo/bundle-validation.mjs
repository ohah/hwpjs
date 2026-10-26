import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function assertBundlePath(path) {
  if (
    typeof path !== "string" ||
    !/^[A-Za-z0-9_./-]+$/.test(path) ||
    path.startsWith("/") ||
    !path.split("/").every((part) => part && part !== "." && part !== "..")
  ) {
    throw Error("UnsafeBundleManifest");
  }
  return path;
}
export function assertOutputPath(root, output) {
  if (
    output !== resolve(root, "apps/docs/docs/public/editor") &&
    !output.startsWith(resolve(root, "zig-out/verification") + "/")
  ) {
    throw Error("OutputOutsideOwnedPaths");
  }
}
export async function rejectSymlinkAncestors(path) {
  for (let current = resolve(path); ;) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw Error("SymlinkBundlePath");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
export function assertPublicText(path, bytes) {
  if (
    /\.(js|css|html|json|txt)$/.test(path) &&
    /(?:\.ts\.net|tailscale|\/Users\/|reference\/rhwp|legacy\/rust\/|sourceMappingURL)/i.test(
      bytes.toString(),
    )
  ) {
    throw Error("PrivateOrSourcePathInPublishedText:" + path);
  }
}
async function inspectTree(directory, expected, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error("SymlinkBundleEntry");
    if (entry.isDirectory())
      await inspectTree(resolve(directory, entry.name), expected, path + "/");
    else if (!entry.isFile() || !expected.has(path)) throw Error("UnexpectedStaticFile");
  }
}

/** Dependency-free primitive used by both docs CI verification and production input. */
export async function validateBundle(directory) {
  await rejectSymlinkAncestors(resolve(directory, "manifest.json"));
  const manifestBytes = await readFile(resolve(directory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.mode !== "frozen-dist-closure" ||
    manifest.base !== "relative" ||
    !Array.isArray(manifest.files)
  ) {
    throw Error("InvalidStaticManifest");
  }
  const expected = new Set(["manifest.json"]);
  for (const file of manifest.files) {
    assertBundlePath(file.path);
    if (
      expected.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw Error("UnsafeBundleManifest");
    expected.add(file.path);
  }
  await inspectTree(directory, expected);
  const files = new Map([["manifest.json", manifestBytes]]);
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(directory, file.path));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
      throw Error("ChecksumMismatch:" + file.path);
    assertPublicText(file.path, bytes);
    files.set(file.path, bytes);
  }
  const wasm = manifest.files.filter((file) => file.path.endsWith(".wasm"));
  if (
    wasm.length !== 1 ||
    wasm[0].path !== "hwpjs/hwpjs.wasm" ||
    wasm[0].sha256 !== manifest.wasmSha256
  ) {
    throw Error("NonCanonicalWasm");
  }
  return { directory, manifest, manifestBytes, files };
}
