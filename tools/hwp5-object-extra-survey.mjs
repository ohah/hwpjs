// Read-only independent property-tail observation, never a layout eligibility rule.
import { readFileSync, openSync, readSync, closeSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { inspect, readStreams, records } from "../tests/hwp5/style-preservation/text-record-oracle.mjs";

function signature(path) {
  const fd = openSync(path, "r"), bytes = Buffer.alloc(8);
  try { readSync(fd, bytes, 0, 8, 0); } finally { closeSync(fd); }
  return bytes;
}
export function cfbSurveyPaths(paths, peek = signature) {
  return paths.filter(path => peek(path).toString("hex") === "d0cf11e0a1b11ae1");
}

export function commonObjectExtra(payload) {
  if (payload.length < 44) throw new Error("TruncatedCommonObject");
  if (payload.length === 44) return { descriptionUnits: null, extraBytes: 0, extraHex: "" };
  if (payload.length < 46) throw new Error("TruncatedDescriptionLength");
  const descriptionUnits = payload.readUInt16LE(44), end = 46 + descriptionUnits * 2;
  if (end > payload.length) throw new Error("TruncatedObjectDescription");
  return { descriptionUnits, extraBytes: payload.length - end, extraHex: payload.subarray(end).toString("hex") };
}

export function surveyDocument(input) {
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const inputSha256 = hash(input);
  const header = readStreams(input).get("FileHeader");
  if (!header || header.length < 40 || header.subarray(0, 17).toString("ascii") !== "HWP Document File") throw new Error("NotHwp5Document");
  const version = [35, 34, 33, 32].map(offset => header[offset]);
  const flags = header.readUInt32LE(36);
  if (flags & 2) return { inputSha256, version, status: "excluded_password", inputUnchanged: hash(input) === inputSha256 };
  if (flags & 4) return { inputSha256, version, status: "excluded_distribution", inputUnchanged: hash(input) === inputSha256 };
  const groups = new Map();
  let objects = 0;
  const unparsedObjects = [];
  for (const section of inspect(input).sections) for (const row of records(section.bytes)) {
    if (row.tag !== 71 || row.payload.length < 4 || row.payload.readUInt32LE(0) !== 0x67736f20) continue;
    objects++;
    let extra;
    try { extra = commonObjectExtra(row.payload); }
    catch (error) { unparsedObjects.push({ section: section.path, offset: row.start, bytes: row.payload.length, error: error.message }); continue; }
    const key = JSON.stringify(extra);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  if (hash(input) !== inputSha256) throw new Error("SurveyMutatedInput");
  return { inputSha256, version, status: unparsedObjects.length ? "partially_observed" : "observed", objects, unparsedObjects, groups: [...groups].map(([key, count]) => ({ ...JSON.parse(key), count })), inputUnchanged: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = process.argv.slice(2);
  const inventory = paths.length ? paths : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(path => /\.(hwp|hwpx)$/i.test(path));
  const selected = paths.length ? paths : cfbSurveyPaths(inventory);
  if (!selected.length) throw new Error("EmptySurveyInventory");
  const counts = {};
  console.log(JSON.stringify({ kind: "start", inventoryPaths: inventory.length, files: selected.length, excludedNonCfb: inventory.length - selected.length, scope: "CFB signatures and verified HWP5 headers; independent common-object tail observation, not parser/editor/layout completion" }));
  for (const path of selected) {
    let result;
    try { result = surveyDocument(readFileSync(path)); }
    catch (error) { result = { status: "survey_failed", error: error.message }; process.exitCode = 1; }
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    if (result.status === "partially_observed") process.exitCode = 1;
    console.log(JSON.stringify({ kind: "file", path, ...result }));
  }
  console.log(JSON.stringify({ kind: "summary", files: selected.length, counts }));
}
