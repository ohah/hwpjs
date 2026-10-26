// In-memory counter-control; never overwrite the real source fixture.
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { createCfbReader } from '../../js/cfb.mjs';
import { inspect, records, encodeRecord } from './style-preservation/text-record-oracle.mjs';

export async function changeFirstObjectNumber(wasm, input, change) {
  const before = inspect(input),
    cfb = await createCfbReader(wasm);
  try {
    cfb.parse(input);
    const doc = cfb.document(),
      section = before.sections[0];
    let changed = 0;
    const bytes = Buffer.concat(
      records(section.bytes).map((record) => {
        if (
          changed ||
          record.tag !== 71 ||
          record.payload.length < 11 ||
          record.payload.readUInt32LE(0) !== 0x25787266
        )
          return record.raw;
        const units = record.payload.readUInt16LE(9),
          text = record.payload.subarray(11, 11 + units * 2).toString('utf16le');
        assert(record.payload.length >= 11 + units * 2);
        assert.match(text, /^\?#\d+;[01];1;0;0;$/);
        const replacement = Buffer.from(change(text), 'utf16le');
        assert.notEqual(
          replacement.toString('utf16le'),
          text,
          'Counter-control must actually change the command',
        );
        const payload = Buffer.concat([
          record.payload.subarray(0, 11),
          replacement,
          record.payload.subarray(11 + units * 2),
        ]);
        payload.writeUInt16LE(replacement.length / 2, 9);
        changed++;
        return encodeRecord(record.tag, record.level, payload);
      }),
    );
    assert.equal(changed, 1);
    const [storageName, sectionName] = section.path.split('/');
    const storage = doc.nodes.findIndex((row) => row.parent === 0 && row.name === storageName);
    assert(storage >= 0);
    const target = doc.nodes.find((row) => row.parent === storage && row.name === sectionName);
    assert(target);
    target.content =
      before.streams.get('FileHeader').readUInt32LE(36) & 1 ? deflateRawSync(bytes) : bytes;
    const output = cfb.write(doc);
    cfb.parse(output, { strict: true });
    const after = inspect(output);
    assert.deepEqual(after.sections[0].bytes, bytes);
    for (const [name, content] of before.streams)
      if (name !== section.path) assert.deepEqual(after.streams.get(name), content);
    return Buffer.from(output);
  } finally {
    cfb.close();
  }
}
