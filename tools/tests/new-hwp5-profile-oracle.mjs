// Independent authored-profile expectations; no factory/model/writer imports.
import assert from 'node:assert/strict';

export function inspectNewHwp5Profile({ header, info, body }, profile = 'modern_5_0_3_0') {
  assert.ok(['modern_5_0_3_0', 'legacy_5_0_1_7'].includes(profile));
  const modern = profile === 'modern_5_0_3_0';
  assert.equal(header.length, 256);
  assert.equal(header.readUInt32LE(32), modern ? 0x05000300 : 0x05000107);
  assert.equal(header.readUInt32LE(36), 0);
  const only = (tag) => {
    const rows = info.filter((row) => row.tag === tag);
    assert.equal(rows.length, 1);
    return rows[0].payload;
  };
  const mapping = only(17);
  assert.equal(mapping.length, modern ? 64 : 60);
  for (let index = 0; index < mapping.length / 4; index++)
    assert.equal(
      mapping.readUInt32LE(index * 4),
      [1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14].includes(index) ? 1 : 0,
    );
  const character = only(21);
  assert.equal(character.length, modern ? 74 : 68);
  const paragraph = only(25);
  assert.equal(paragraph.length, modern ? 54 : 46);
  if (modern) {
    assert.equal(character.readUInt16LE(68), 0);
    assert.equal(character.readUInt32LE(70), 0);
    assert.equal(paragraph.readUInt32LE(46), 0);
    assert.equal(paragraph.readUInt32LE(50), 160);
  }
  const notes = body.filter((row) => row.tag === 74);
  const borders = body.filter((row) => row.tag === 75);
  assert.equal(notes.length, modern ? 2 : 0);
  assert.equal(borders.length, modern ? 1 : 0);
  for (const child of [...notes, ...borders]) {
    assert.equal(child.level, 2);
    const index = body.indexOf(child);
    let owner;
    for (let at = index - 1; at >= 0; at--)
      if (body[at].level < child.level) {
        owner = body[at];
        break;
      }
    assert.equal(owner?.tag, 71);
    assert.equal(owner?.level, 1);
    assert.ok(owner.payload.length >= 4);
    assert.equal(owner.payload.readUInt32LE(0), 0x73656364);
    assert.equal(child.payload.length, child.tag === 74 ? 28 : 14);
    if (child.tag === 74) {
      assert.equal(child.payload.readUInt32LE(0), 0);
      assert.equal(child.payload.readUInt16LE(10), 1);
    } else assert.equal(child.payload.readUInt16LE(12), 0);
  }
  return {
    profile,
    version: header.readUInt32LE(32),
    noteShapes: notes.length,
    borders: borders.length,
  };
}
