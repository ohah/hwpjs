// Independent saved-byte oracle. No Native/product model or parser is imported.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspect, records, paragraphRecords, expectedSection } from './text-record-oracle.mjs';
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export function buildExpected(original) {
  assert.equal(sha(original), '360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9');
  const before = inspect(original);
  const owners = [];
  for (let section = 0; section < before.sections.length; section++) {
    const all = records(before.sections[section].bytes),
      stack = [];
    let paragraph = -1;
    for (const r of all) {
      while (stack.length && stack.at(-1).level >= r.level) stack.pop();
      if (r.tag === 71) {
        assert(r.payload.length >= 4, 'TruncatedControl');
        const owner = { level: r.level, id: r.payload.readUInt32LE(0), section, paragraphs: [] };
        stack.push(owner);
        if (owner.id === 0x666e2020) owners.push(owner); // MAKE_4CHID('f','n',' ',' ')
      }
      if (r.tag === 66) {
        paragraph++;
        const owner = stack.findLast((o) => o.id === 0x666e2020);
        if (owner) owner.paragraphs.push(paragraph);
      }
    }
  }
  assert.equal(owners.length, 2, 'ExpectedOriginalTwoFootnotes');
  assert(
    owners.every((o) => o.paragraphs.length === 1),
    'ExpectedOneParagraphPerFootnote',
  );
  const expected = new Map(before.sections.map((s) => [s.path, s.bytes]));
  const additions = [' first-note-0123456789', ' second-note-0123456789'].map((s) => s.repeat(150));
  const targets = [];
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i],
      section = before.sections[owner.section],
      paragraph = owner.paragraphs[0];
    const current = expected.get(section.path),
      parsed = paragraphRecords(current, paragraph);
    const text = parsed.direct.filter((r) => r.level === parsed.head.level + 1 && r.tag === 67);
    assert.equal(text.length, 1, 'AmbiguousTextRecord');
    assert.equal(text[0].payload.length % 2, 0, 'OddUTF16');
    const units = text[0].payload.length / 2;
    assert(units > 0 && text[0].payload.readUInt16LE((units - 1) * 2) === 13, 'MissingTerminalCR');
    expected.set(
      section.path,
      expectedSection(current, paragraph, units - 1, units - 1, additions[i]),
    );
    targets.push({
      section: owner.section,
      paragraph,
      originalSourceUnits: units,
      insertedUnits: additions[i].length,
    });
  }
  return { before, expected, targets };
}
export function verifyParsed(before, after, expected) {
  assert.deepEqual(
    [...before.streams.keys()].sort(),
    [...after.streams.keys()].sort(),
    'StreamSetChanged',
  );
  assert.deepEqual(after.metadata, before.metadata, 'ContainerMetadataChanged');
  for (const [path, bytes] of before.streams) {
    const replacement = expected.get(path);
    if (replacement) {
      const actual = after.sections.find((s) => s.path === path);
      assert(actual, 'MissingSection');
      assert.deepEqual(actual.bytes, replacement, 'FullRawSectionMismatch:' + path);
    } else assert.deepEqual(after.streams.get(path), bytes, 'NonTargetStreamChanged:' + path);
  }
}
export function verifySavedBytes(original, edited) {
  const { before, expected, targets } = buildExpected(original);
  const after = inspect(edited);
  verifyParsed(before, after, expected);
  return {
    passed: true,
    originalSHA: sha(original),
    editedSHA: sha(edited),
    targets,
    streamCount: before.streams.size,
  };
}
