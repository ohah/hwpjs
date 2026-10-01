import assert from "node:assert/strict";
import { inflateRawSync, inflateSync } from "node:zlib";
import { rawParagraphTexts } from "./hwp5-preview-record-oracle.mjs";

export const marker = "검증😀";

// Inventory comes from Git, not a hand-picked list of successful examples.
export function fixturePaths(paths) {
  return [...new Set(paths.filter(path => /(?:^|\/)fixtures\//.test(path) && /\.(hwp|hwpx)$/i.test(path)))].sort();
}

export function sectionTexts(streams) {
  const header = streams.get("FileHeader");
  assert(header?.length >= 40, "oracle FileHeader missing or truncated");
  const result = new Map();
  for (const [path, encoded] of streams) {
    if (!/^BodyText\/Section\d+$/.test(path)) continue;
    let raw = encoded;
    if (header[36] & 1) {
      try { raw = inflateRawSync(encoded, { maxOutputLength: 32 * 1024 * 1024 }); }
      catch (error) {
        if (error.code !== "Z_DATA_ERROR") throw error;
        raw = inflateSync(encoded, { maxOutputLength: 32 * 1024 * 1024 });
      }
    }
    result.set(Number(path.slice("BodyText/Section".length)), rawParagraphTexts(raw));
  }
  return result;
}

// Verifies text bytes of EVERY paragraph, plus EVERY non-body stream.
// This is not an oracle for formatting, pagination, or cell geometry.
export function verifySaved(beforeStreams, afterStreams, expected) {
  assert.deepEqual([...afterStreams.keys()].sort(), [...beforeStreams.keys()].sort(), "stream inventory changed");
  const actual = sectionTexts(afterStreams);
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), "section inventory changed");
  for (const [section, texts] of expected) assert.deepEqual(actual.get(section), texts, `section ${section} paragraph text bytes`);
  for (const [path, bytes] of beforeStreams) {
    if (!/^BodyText\/Section\d+$/.test(path)) assert.deepEqual(afterStreams.get(path), bytes, `unselected stream ${path}`);
  }
}

export function exerciseEditor(editor, expected) {
  const failures = {}, edits = [];
  let attempted = 0;
  assert.equal(editor.sectionCount(), expected.size, "editor section count differs from oracle");
  for (const [section, texts] of expected) {
    assert.equal(editor.paragraphCount(section), texts.length, "editor paragraph count differs from oracle");
    for (let paragraph = 0; paragraph < texts.length; paragraph++) {
      attempted++;
      let before;
      try { before = Buffer.from(editor.copyText(section, paragraph)); }
      catch (error) { failures[`copyText:${error.message}`] = (failures[`copyText:${error.message}`] ?? 0) + 1; continue; }
      assert.deepEqual(before, texts[paragraph] ?? Buffer.alloc(0), "source text differs from independent oracle");
      try { editor.splice({ section, paragraph, startUnit: 0, endUnit: 0, text: marker }); }
      catch (error) {
        assert.deepEqual(Buffer.from(editor.copyText(section, paragraph)), before, "refused edit mutated paragraph");
        failures[error.message] = (failures[error.message] ?? 0) + 1;
        continue;
      }
      const after = Buffer.concat([Buffer.from(marker, "utf16le"), before.length ? before : Buffer.from("\r", "utf16le")]);
      assert.deepEqual(Buffer.from(editor.copyText(section, paragraph)), after, "accepted edit did not insert marker");
      texts[paragraph] = after;
      edits.push({ section, paragraph });
    }
  }
  if (edits.length) assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
  const saved = editor.save({ allowStaleLayout: true });
  assert.equal(saved.layoutRequiresReflow, edits.length > 0, "save reflow status differs from applied edits");
  return { attempted, edited: edits.length, failures, saved };
}
