import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
// Existing MIT ZIP reader, test-only. No product HWPX implementation implied.
export function sectionXml(hwpx, section = 0) {
  return indexedXml(hwpx, 'section', section);
}
export function masterPageXml(hwpx, index) {
  return indexedXml(hwpx, 'masterpage', index);
}
export function headerXml(hwpx) {
  return xmlEntry(hwpx, 'header.xml');
}
function indexedXml(hwpx, kind, indexNumber) {
  assert.ok(Number.isInteger(indexNumber) && indexNumber >= 0 && indexNumber <= 65535);
  return xmlEntry(hwpx, `${kind}${indexNumber}.xml`);
}
function xmlEntry(hwpx, filename) {
  const context = {
    module: { exports: {} },
    require: createRequire(import.meta.url),
    Buffer,
    process,
    console,
  };
  runInNewContext(
    readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
    context,
  );
  const zip = context.module.exports.read(hwpx, { type: "buffer" });
  const index = zip.FullPaths.findIndex((path) =>
    path.endsWith(`/Contents/${filename}`),
  );
  assert.ok(index >= 0);
  return Buffer.from(zip.FileIndex[index].content).toString("utf8");
}
