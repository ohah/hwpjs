// Independent CFB.js + Node zlib/framing oracle; no product source offsets.
import assert from 'node:assert/strict';
import { inspect, records } from './style-preservation/text-record-oracle.mjs';

export function borderFillSourceOracle(bytes) {
  const container = inspect(bytes),
    docinfo = container.decode(container.streams.get('DocInfo'));
  const rows = [];
  for (const [record_index, record] of records(docinfo).entries()) {
    if (record.tag !== 20) continue;
    assert.equal(record.level, 1);
    const b = record.payload;
    assert.ok(b.length >= 36);
    const fill_flags = b.readUInt32LE(32),
      fill_known = (fill_flags & ~7) === 0;
    const row = {
      id: rows.length + 1,
      record_index,
      attributes: b.readUInt16LE(0),
      borders: Array.from({ length: 5 }, (_, i) => ({
        kind: b[2 + i * 6],
        width: b[3 + i * 6],
        color: b.readUInt32LE(4 + i * 6),
      })),
      fill_flags,
      fill_known,
      pattern: null,
      gradient: null,
      image: null,
      alpha: null,
      additional_present: null,
      additional_bytes: null,
      extra_bytes: null,
      unknown_fill_bytes: null,
    };
    let at = 36;
    const u8 = () => {
      assert.ok(at < b.length);
      return b[at++];
    };
    const u32 = () => {
      const value = b.readUInt32LE(at);
      at += 4;
      return value;
    };
    const i32 = () => {
      const value = b.readInt32LE(at);
      at += 4;
      return value;
    };
    if (!fill_known) row.unknown_fill_bytes = b.length - at;
    else {
      if (fill_flags & 1) row.pattern = { background: u32(), foreground: u32(), kind: i32() };
      if (fill_flags & 4) {
        const kind = u8(),
          angle = u32(),
          center_x = u32(),
          center_y = u32(),
          blur = u32(),
          count = u32();
        assert.ok(count <= (b.length - at) / (count > 2 ? 8 : 4));
        const positions = Array.from({ length: count > 2 ? count : 0 }, i32),
          colors = Array.from({ length: count }, u32);
        row.gradient = {
          kind,
          angle,
          center_x,
          center_y,
          blur,
          blur_center: null,
          colors,
          positions,
        };
      }
      if (fill_flags & 2) {
        const mode = u8(),
          contrast = b.readInt8(at++),
          brightness = b.readInt8(at++),
          effect = u8(),
          bin_data_id = b.readUInt16LE(at);
        at += 2;
        row.image = { mode, picture: { contrast, brightness, effect, bin_data_id } };
      }
      row.additional_present = !(fill_flags <= 1 && at === b.length);
      row.additional_bytes = row.additional_present ? u32() : 0;
      assert.ok(row.additional_bytes <= b.length - at);
      if (row.gradient && row.additional_bytes === 1) row.gradient.blur_center = b[at];
      at += row.additional_bytes;
      const count = [1, 4, 2].filter((flag) => fill_flags & flag).length;
      if (count > 0 && b.length - at === count)
        row.alpha = {
          pattern: fill_flags & 1 ? u8() : null,
          gradient: fill_flags & 4 ? u8() : null,
          image: fill_flags & 2 ? u8() : null,
        };
      row.extra_bytes = b.length - at;
    }
    rows.push(row);
  }
  return rows;
}
