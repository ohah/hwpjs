import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspect, records } from './style-preservation/text-record-oracle.mjs';
import { sectionXml } from './fixture-xml.mjs';
import { hwp5TableFlags } from '../../web/preview/hwp5-table-flags.mjs';
test('actual table-bug bit25 cannot stand for noAdjust or a unique pageBreak', () => {
  const base = 'legacy/rust/crates/hwp-core/tests/fixtures/table-bug';
  const flags = records(inspect(readFileSync(`${base}.hwp`)).sections[0].bytes)
    .filter((row) => row.tag === 77)
    .map((row) => row.payload.readUInt32LE(0));
  const xmlTables = [
    ...sectionXml(readFileSync(`${base}.hwpx`)).matchAll(/<hp:tbl\b([^>]*)>/g),
  ].map((match) => match[1]);
  assert.equal(flags.length, 17);
  assert.equal(xmlTables.length, flags.length);
  const bit25 = [],
    adjusted = [];
  for (const [ordinal, raw] of flags.entries()) {
    const attrs = xmlTables[ordinal];
    const noAdjust = /\bnoAdjust="1"/.test(attrs);
    if (raw & 0x02000000) {
      assert.equal(noAdjust, false, `ordinal ${ordinal}`);
      bit25.push({ ordinal, pageBreak: attrs.match(/\bpageBreak="([^"]+)"/)[1] });
    }
    if (noAdjust) {
      assert.equal(raw & 0x02000000, 0);
      adjusted.push(ordinal);
    }
  }
  assert.deepEqual(bit25, [
    { ordinal: 2, pageBreak: 'NONE' },
    { ordinal: 7, pageBreak: 'CELL' },
    { ordinal: 14, pageBreak: 'CELL' },
    { ordinal: 15, pageBreak: 'CELL' },
  ]);
  assert.deepEqual(adjusted, [1, 13]);
});

test('actual paired TABLE bit3 matches noAdjust while unknown flags remain nonzero', () => {
  let tables = 0,
    enabled = 0,
    unknown = 0;
  for (const name of [
    'noori',
    'chart',
    'table-bug',
    'table',
    'table2',
    'table-caption',
    'sample-5017',
  ]) {
    const base = `legacy/rust/crates/hwp-core/tests/fixtures/${name}`;
    const flags = records(inspect(readFileSync(`${base}.hwp`)).sections[0].bytes)
      .filter((row) => row.tag === 77)
      .map((row) => row.payload.readUInt32LE(0));
    const attrs = [...sectionXml(readFileSync(`${base}.hwpx`)).matchAll(/<hp:tbl\b([^>]*)>/g)].map(
      (match) => match[1],
    );
    assert.equal(flags.length, attrs.length, name);
    for (const [index, raw] of flags.entries()) {
      const decoded = hwp5TableFlags(raw),
        noAdjust = attrs[index].match(/\bnoAdjust="([01])"/)[1] === '1';
      assert.equal(decoded.no_adjust, noAdjust, `${name}:${index}`);
      assert.equal(decoded.repeat_header, attrs[index].match(/\brepeatHeader="([01])"/)[1] === '1');
      assert.equal(
        decoded.page_break.toUpperCase(),
        attrs[index].match(/\bpageBreak="([^"]+)"/)[1],
      );
      tables++;
      enabled += Number(noAdjust);
      unknown += Number(decoded.unknown_flags !== 0);
    }
  }
  assert(tables >= 30);
  assert(enabled >= 4);
  assert(unknown >= 6);
});
test('TABLE flag decoder preserves all unknown bits and rejects malformed numbers', () => {
  for (let bit = 4; bit < 32; bit++) {
    const raw = (2 ** bit) >>> 0,
      row = hwp5TableFlags(raw);
    assert.equal(row.unknown_flags, bit === 26 ? 0 : raw);
    assert.equal(row.inner_margin_setup, bit === 26);
  }
  assert.equal(hwp5TableFlags(0x0400000c).no_adjust, true);
  assert.equal(hwp5TableFlags(3).page_break, null);
  for (const value of [-1, 2 ** 32, 1.5, null, '8', NaN])
    assert.throws(() => hwp5TableFlags(value));
});
test('actual Worker accepts observed noAdjust-only tables but still reports unknown high bits', async (t) => {
  const oldSelf = globalThis.self,
    oldFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(value) {
      replies.push(value);
    },
  };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldSelf === undefined) delete globalThis.self;
    else globalThis.self = oldSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?table-flags=${Math.random()}`);
  for (const name of ['noori', 'chart', 'table-bug']) {
    await self.onmessage({
      data: {
        kind: 'load',
        format: 'hwp5',
        bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`),
      },
    });
    assert.equal(replies.length, 1);
    const reply = replies.shift();
    assert.equal(reply.error, undefined);
    for (const table of reply.content.tables) {
      const decoded = hwp5TableFlags(table.layoutSource.table_flags);
      if (decoded.unknown_flags) {
        assert.equal(table.sourceGeometry, undefined);
        const error = reply.content.tableGeometryErrors.find(
          (row) => row.tableNode === table.tableNode,
        );
        assert(error);
        assert.equal(error.rawTableFlags, table.layoutSource.table_flags);
        assert.equal(error.unknownTableFlags, decoded.unknown_flags);
      } else {
        assert.equal(table.sourceGeometry.no_adjust, decoded.no_adjust);
        assert.equal(table.pagination.no_adjust, decoded.no_adjust);
      }
    }
    if (name === 'table-bug')
      assert.equal(
        reply.content.tables.filter((table) => table.sourceGeometry?.no_adjust).length,
        2,
      );
  }
});
