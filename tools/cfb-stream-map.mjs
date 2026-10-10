// Independent legacy CFB observation; never modifies the caller's input bytes.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync(new URL("../legacy/cfb.js", import.meta.url), "utf8"), context);

export function readLegacyCfbStreams(bytes) {
  const parsed = context.module.exports.parse(Buffer.from(bytes));
  const result = new Map();
  parsed.FileIndex.forEach((entry, index) => {
    if (entry.type !== 2) return;
    const path = parsed.FullPaths[index].slice(parsed.FullPaths[0].length);
    if (result.has(path)) throw new Error("DuplicateLegacyCfbStreamPath");
    result.set(path, Buffer.from(entry.content ?? []));
  });
  return result;
}
