import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
import { controlLinkEvidence, linksActual } from "./links.mjs";

const noteIds = new Set([0x666e2020, 0x656e2020]);
const word = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const frame = (tag, level, payload = Buffer.alloc(0)) =>
  Buffer.concat([word(tag | (level << 10) | (payload.length << 20)), payload]);

// Position assertions are independent of the Zig report: this scans raw
// Section records, then checks the existing WASM control-link probe in full.
export function noteSourceSitesActual(call, version, section, expectedSites) {
  linksActual(call, version, section);
  const headers = documentRecords(section)
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.tag === 71 && noteIds.has(section.readUInt32LE(record.start)))
    .map(({ index }) => index);
  const sites = controlLinkEvidence(section).filter(row => noteIds.has(row[6]));
  assert.deepEqual(sites.map(row => row[2]), headers);
  for (const row of sites) {
    assert.equal(row[4], 17);
    assert.equal(row[5], row[6]);
    assert.equal(row[7], 0);
  }
  if (expectedSites) assert.deepEqual(sites.map(row => row.slice(0, 4)), expectedSites);
  return sites.length;
}

export const noteSiteFixtures = Object.freeze({
  "footnote-endnote.hwp": [[0, 1, 12, 20], [0, 1, 19, 28], [26, 27, 30, 4], [26, 27, 37, 12]],
  "footnote-01.hwp": [[48, 49, 52, 7], [71, 72, 75, 6], [110, 111, 114, 20], [141, 142, 145, 15], [184, 185, 188, 4], [207, 208, 211, 42], [222, 223, 226, 24], [233, 234, 237, 6], [233, 234, 244, 22]],
  "endnote-01.hwp": [[48, 49, 52, 7], [83, 84, 87, 6], [110, 111, 114, 20], [137, 138, 141, 20], [164, 165, 168, 38], [219, 220, 223, 6]],
  "footnote-tbox-01.hwp": [[19, 20, 23, 6], [38, 39, 42, 2]],
});

export function noteSourceSiteEdges(call) {
  const version = 0x05000300, id = 0x666e2020;
  const token = (code = 17, tokenId = id) => {
    const bytes = Buffer.alloc(16);
    bytes.writeUInt16LE(code, 0);
    bytes.writeUInt32LE(tokenId, 2);
    bytes.writeUInt16LE(code, 14);
    return bytes;
  };
  const paragraph = frame(66, 0, Buffer.alloc(24));
  const text = bytes => frame(67, 1, bytes);
  const control = frame(71, 1, word(id));
  const good = Buffer.concat([paragraph, text(token()), control]);
  assert.equal(noteSourceSitesActual(call, version, good, [[0, 1, 2, 0]]), 1);
  const pair = Buffer.concat([paragraph, text(Buffer.concat([token(), token()])), control, control]);
  assert.equal(noteSourceSitesActual(call, version, pair, [[0, 1, 2, 0], [0, 1, 3, 8]]), 2);
  const shifted = Buffer.concat([paragraph, text(Buffer.concat([Buffer.from([65, 0]), token()])), control]);
  assert.throws(() => noteSourceSitesActual(call, version, shifted, [[0, 1, 2, 0]]), assert.AssertionError);
  assert.equal(noteSourceSitesActual(call, version, shifted, [[0, 1, 2, 1]]), 1);
  const nested = Buffer.concat([paragraph, text(token()), control, frame(72, 2, Buffer.alloc(8)), frame(66, 2, Buffer.alloc(24)), frame(67, 3, token()), frame(71, 3, word(id))]);
  assert.equal(noteSourceSitesActual(call, version, nested, [[0, 1, 2, 0], [4, 5, 6, 0]]), 2);
  const footer = Buffer.concat([paragraph, text(token(16, 0x666f6f74)), frame(71, 1, word(0x666f6f74))]);
  assert.equal(noteSourceSitesActual(call, version, footer, []), 0);
  const run = section => call(13, Buffer.concat([word(version), section]));
  for (const [bad, error] of [
    [Buffer.concat([paragraph, text(token(17, 0x656e2020)), control]), /ControlIdMismatch/],
    [Buffer.concat([paragraph, text(token(18)), control]), /ControlCodeMismatch/],
    [Buffer.concat([paragraph, text(token())]), /MissingControlHeader/],
    [Buffer.concat([paragraph, control]), /MissingControlToken/],
  ]) {
    assert.throws(() => run(bad), error);
    assert.equal(noteSourceSitesActual(call, version, good), 1);
  }
  return 4;
}
