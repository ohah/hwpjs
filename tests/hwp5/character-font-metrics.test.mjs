import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inspect, records } from './style-preservation/text-record-oracle.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { decodeCharacterFontMetrics } from '../../js/character-font-metrics.mjs';
import { attachCharacterFonts } from '../../web/preview/character-font-content.mjs';
import { expectedCharacterFontMetrics as hwp5Expected } from './character-font-metrics-oracle.mjs';

function plainPosition(bytes) {
  const source = inspect(bytes);
  for (const [section, body] of source.sections.entries()) {
    let paragraph = -1;
    for (const row of records(body.bytes)) {
      if (row.tag === 66) paragraph++;
      if (row.tag !== 67) continue;
      for (let unit = 0; unit < row.payload.length / 2;) {
        const code = row.payload.readUInt16LE(unit * 2);
        if (code >= 32 && (code < 0xd800 || code > 0xdfff))
          return { section, paragraph, startUnit: unit, endUnit: unit + 1 };
        unit += code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      }
    }
  }
  throw Error('MissingPlainCharacter');
}
const hwpxExpected = (bytes) =>
  JSON.parse(
    execFileSync('python3', ['tests/hwpx/character-font-metrics-oracle.py', '-'], {
      input: bytes,
      encoding: 'utf8',
    }),
  );

test('raw font metric decoder separates source formats, signs, absent and explicit zero', () => {
  const encoded = (wire) => new TextEncoder().encode(JSON.stringify(wire));
  const values = {
    ratio: [255, 0, 100, 100, 100, 100, 100],
    spacing: [-128, 127, 0, 0, 0, 0, 0],
    relativeSize: Array(7).fill(0),
    offset: Array(7).fill(0),
  };
  const wire = { version: 1, format: 'hwp5', shapes: [{ id: 4, values }] };
  assert.deepEqual(decodeCharacterFontMetrics(encoded(wire), 'hwp5'), wire.shapes);
  const invalid = [
    { ...wire, format: 'hwpx' },
    { ...wire, version: 2 },
    { ...wire, shapes: [...wire.shapes, ...wire.shapes] },
  ];
  for (const [key, bad] of [
    ['ratio', null],
    ['ratio', Array(7).fill(256)],
    ['spacing', Array(7).fill(-129)],
    ['offset', Array(7).fill(null)],
    ['relativeSize', [0]],
  ])
    invalid.push({ ...wire, shapes: [{ id: 4, values: { ...values, [key]: bad } }] });
  for (const bad of invalid)
    assert.throws(
      () => decodeCharacterFontMetrics(encoded(bad), 'hwp5'),
      /InvalidCharacterFontMetrics/,
    );
  const xml = {
    version: 1,
    format: 'hwpx',
    shapes: [
      {
        id: 9,
        values: {
          ratio: null,
          spacing: [0, -8, null, null, null, null, null],
          relativeSize: Array(7).fill(null),
          offset: null,
        },
      },
    ],
  };
  assert.deepEqual(decodeCharacterFontMetrics(encoded(xml), 'hwpx'), xml.shapes);
  assert.throws(
    () => decodeCharacterFontMetrics(new Uint8Array([0xff]), 'hwpx'),
    /InvalidCharacterFontMetrics/,
  );
});

for (const format of ['hwp5', 'hwpx']) {
  test(`actual ${format} raw font metrics match independent source without changing old shapes or save`, async () => {
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
    for (const name of ['facename', 'charshape', 'linespacing']) {
      const path = `legacy/rust/crates/hwp-core/tests/fixtures/${name}.${format === 'hwp5' ? 'hwp' : 'hwpx'}`;
      const bytes = readFileSync(path);
      const expected = format === 'hwp5' ? hwp5Expected(bytes) : hwpxExpected(bytes);
      const editor =
        format === 'hwp5'
          ? await createExperimentalHwp5Editor(wasm, bytes)
          : await createHwpxEditor(wasm);
      try {
        if (format === 'hwpx') editor.open(bytes);
        const old = editor.characterShapes();
        assert.ok(old.every((row) => Object.keys(row).sort().join() === 'bold,height,id,italic'));
        assert.deepEqual(editor.characterFontMetrics(), expected, name);
        assert.deepEqual(editor.characterShapes(), old, name);
        assert.deepEqual(attachCharacterFonts(editor, {}).characterFontMetrics, expected, name);
        const saved = editor.save();
        assert.deepEqual(Buffer.from(format === 'hwp5' ? saved.bytes : saved), bytes, name);
        const detached = editor.characterFontMetrics();
        detached[0].values.ratio = null;
        assert.deepEqual(editor.characterFontMetrics(), expected, name);
        if (name === 'facename') {
          editor.enableHistory();
          const position =
            format === 'hwp5'
              ? plainPosition(bytes)
              : { section: 0, paragraph: 1, startUnit: 0, endUnit: 1 };
          editor.setCharacterFontName({
            ...position,
            language: 'hangul',
            name: 'Raw Metrics History Font',
          });
          const currentSave = editor.save({ allowStaleLayout: true });
          const currentBytes = format === 'hwp5' ? currentSave.bytes : currentSave;
          const current = editor.characterFontMetrics();
          assert.ok(current.length > expected.length);
          assert.deepEqual(
            current,
            format === 'hwp5' ? hwp5Expected(currentBytes) : hwpxExpected(currentBytes),
          );
          assert.equal(editor.undo(), true);
          assert.deepEqual(editor.characterFontMetrics(), expected);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.characterFontMetrics(), current);
        }
      } finally {
        editor.close();
      }
      assert.throws(() => editor.characterFontMetrics(), /Closed/);
    }
  });
  test(
    `older ${format} WASM keeps old shapes and save when metric ABI is absent`,
    { skip: !process.env.HWPJS_METRICS_BASELINE_WASM && 'HWPJS_METRICS_BASELINE_WASM is not set' },
    async () => {
      const wasm = readFileSync(process.env.HWPJS_METRICS_BASELINE_WASM);
      const bytes = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/facename.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
      );
      const editor =
        format === 'hwp5'
          ? await createExperimentalHwp5Editor(wasm, bytes)
          : await createHwpxEditor(wasm);
      try {
        if (format === 'hwpx') editor.open(bytes);
        const shapes = editor.characterShapes();
        assert.throws(() => editor.characterFontMetrics(), /CharacterFontMetricsAbiUnavailable/);
        assert.deepEqual(editor.characterShapes(), shapes);
        const saved = editor.save();
        assert.deepEqual(Buffer.from(format === 'hwp5' ? saved.bytes : saved), bytes);
      } finally {
        editor.close();
      }
    },
  );
}

test('unavailable font metrics remain an isolated optional display error', () => {
  const content = attachCharacterFonts(
    {
      fontFaces: () => [],
      characterFontMetrics: () => {
        throw Error('Hwp5CharacterFontMetricsAbiUnavailable');
      },
    },
    {},
  );
  assert.deepEqual(content.fontFaces, []);
  assert.equal(content.characterFontMetrics, null);
  assert.equal(content.characterFontMetricsError, 'Hwp5CharacterFontMetricsAbiUnavailable');
});

test('actual Worker transports both source formats without treating metric availability as editing support', async (t) => {
  const oldSelf = globalThis.self,
    oldFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldSelf === undefined) delete globalThis.self;
    else globalThis.self = oldSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?raw-font-metrics=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  for (const format of ['hwp5', 'hwpx']) {
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/facename.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    assert.equal((await send({ kind: 'load', format, bytes })).error, undefined);
    const reply = await send({ kind: 'enable' });
    assert.equal(reply.error, undefined);
    assert.equal(reply.content.characterFontMetricsError, null);
    assert.deepEqual(
      reply.content.characterFontMetrics,
      format === 'hwp5' ? hwp5Expected(bytes) : hwpxExpected(bytes),
    );
  }
});
