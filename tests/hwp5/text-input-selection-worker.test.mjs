import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import {
  inspect,
  paragraphRecords,
  expectedSection,
} from './style-preservation/text-record-oracle.mjs';

test('document replacement discards an old composition even after the new paragraph is selected', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const [format, nextFormat] of [
    ['hwp5', 'hwpx'],
    ['hwpx', 'hwp5'],
  ]) {
    const bytes = (name) =>
      readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${name === 'hwp5' ? 'hwp' : 'hwpx'}`,
      );
    const loaded = await h.send({ kind: 'load', format, bytes: bytes(format) });
    assert.equal(loaded.error, undefined);
    assert.equal((await h.send({ kind: 'enable' })).error, undefined);
    assert.equal(
      h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
      true,
    );
    dispatchCanvasEvent(h.input, 'compositionstart');
    dispatchCanvasEvent(h.input, 'beforeinput', {
      inputType: 'insertCompositionText',
      data: 'ㄱ',
      isComposing: true,
    });
    h.input.value = 'ㄱ' + h.input.value;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input', { isComposing: true });
    const stale = h.input.value,
      start = h.requests.length,
      nextBytes = bytes(nextFormat);
    const replacement = await h.send({ kind: 'load', format: nextFormat, bytes: nextBytes });
    assert.equal(replacement.error, undefined);
    assert.equal((await h.send({ kind: 'enable' })).error, undefined);
    assert.equal(
      h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
      true,
    );
    const text = h.input.value;
    assert.equal(
      dispatchCanvasEvent(h.input, 'beforeinput', {
        inputType: 'insertCompositionText',
        data: '가',
        isComposing: true,
      }).defaultPrevented,
      true,
    );
    h.input.value = stale;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input', { isComposing: true });
    dispatchCanvasEvent(h.input, 'compositionend', { data: '가' });
    await Promise.resolve();
    assert.equal(h.requests.length, start);
    assert.equal(h.input.value, text);
    assert.equal(h.controller.settled(), true);
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), nextBytes);
    dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: 'x' });
    h.input.value = 'x' + text;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input');
    assert.equal((await h.flush()).error, undefined);
    assert.equal(h.input.value, 'x' + text);
  }
});

test('rejected in-flight input invalidates late composition events before new typing', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const format of ['hwp5', 'hwpx']) {
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    const loaded = await h.send({ kind: 'load', format, bytes });
    assert.equal(loaded.error, undefined);
    assert.equal((await h.send({ kind: 'enable' })).error, undefined);
    const original = loaded.content.paragraphs.find((row) => row.paragraph === 5).text;
    assert.equal(
      h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
      true,
    );
    const start = h.requests.length;
    dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: '\u000b' });
    h.input.value = '\u000b' + original;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input');
    h.input.setSelectionRange(0, 0);
    dispatchCanvasEvent(h.input, 'compositionstart');
    dispatchCanvasEvent(h.input, 'beforeinput', {
      inputType: 'insertCompositionText',
      data: 'ㄱ',
      isComposing: true,
    });
    h.input.value = 'ㄱ\u000b' + original;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input', { isComposing: true });
    assert.match((await h.flush()).error, /Control|Character|Text|Payload/);
    assert.equal(h.input.value, original);
    dispatchCanvasEvent(h.input, 'beforeinput', {
      inputType: 'insertCompositionText',
      data: '가',
      isComposing: true,
    });
    h.input.value = '가\u000b' + original;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input', { isComposing: true });
    dispatchCanvasEvent(h.input, 'compositionend', { data: '가' });
    await Promise.resolve();
    assert.equal(
      h.requests.length,
      start + 1,
      'invalidated composition must not submit against the restored document',
    );
    assert.equal(h.input.value, original);
    assert.equal(h.controller.settled(), true);
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), bytes);
    h.input.setSelectionRange(0, 0);
    dispatchCanvasEvent(h.input, 'compositionstart');
    dispatchCanvasEvent(h.input, 'beforeinput', {
      inputType: 'insertCompositionText',
      data: '나',
      isComposing: true,
    });
    h.input.value = '나' + original;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input', { isComposing: true });
    dispatchCanvasEvent(h.input, 'compositionend', { data: '나' });
    await Promise.resolve();
    assert.equal((await h.flush()).error, undefined);
    assert.equal(h.input.value, '나' + original);
  }
});

test('composition completed behind queued repeated input retains its original insertion point', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const format of ['hwp5', 'hwpx'])
    for (const acknowledgeDuringComposition of [false, true])
      for (const cancelled of [false, true]) {
        const loaded = await h.send({
          kind: 'load',
          format,
          bytes: readFileSync(
            `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
          ),
        });
        assert.equal(loaded.error, undefined);
        assert.equal((await h.send({ kind: 'enable' })).error, undefined);
        const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
        assert.equal(
          (
            await h.send({
              kind: 'splice',
              section: 0,
              paragraph: 5,
              startUnit: 0,
              endUnit: original.text.length,
              text: '가가',
            })
          ).error,
          undefined,
        );
        const baseline = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
        assert.equal(
          h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
          true,
        );
        const start = h.requests.length;
        for (const [caret, value] of [
          [0, '가가가'],
          [1, '가가가가'],
        ]) {
          h.input.setSelectionRange(caret, caret);
          dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: '가' });
          h.input.value = value;
          h.input.setSelectionRange(caret + 1, caret + 1);
          dispatchCanvasEvent(h.input, 'input');
        }
        h.input.setSelectionRange(0, 0);
        dispatchCanvasEvent(h.input, 'compositionstart');
        dispatchCanvasEvent(h.input, 'beforeinput', {
          inputType: 'insertCompositionText',
          data: 'ㄱ',
          isComposing: true,
        });
        h.input.value = 'ㄱ가가가가';
        h.input.setSelectionRange(1, 1);
        dispatchCanvasEvent(h.input, 'input', { isComposing: true });
        assert.equal(
          h.requests.length,
          start + 1,
          'intermediate composition must not become a native edit',
        );
        if (acknowledgeDuringComposition) assert.equal((await h.flush()).error, undefined);
        dispatchCanvasEvent(h.input, 'beforeinput', {
          inputType: 'insertCompositionText',
          data: '가',
          isComposing: true,
        });
        const finalText = cancelled ? '가가가가' : '가가가가가',
          operations = cancelled ? 2 : 3;
        h.input.value = finalText;
        h.input.setSelectionRange(cancelled ? 0 : 1, cancelled ? 0 : 1);
        dispatchCanvasEvent(h.input, 'input', { isComposing: true });
        dispatchCanvasEvent(h.input, 'compositionend', { data: cancelled ? '' : '가' });
        await Promise.resolve();
        for (let index = 0; index < operations - Number(acknowledgeDuringComposition); index++)
          assert.equal((await h.flush()).error, undefined);
        const expected = [
          { startUnit: 0, endUnit: 0, text: '가' },
          { startUnit: 1, endUnit: 1, text: '가' },
        ];
        if (!cancelled) expected.push({ startUnit: 0, endUnit: 0, text: '가' });
        assert.deepEqual(
          h.requests
            .slice(start)
            .map(({ startUnit, endUnit, text }) => ({ startUnit, endUnit, text })),
          expected,
        );
        assert.equal(h.input.value, finalText);
        assert.equal(h.controller.settled(), true);
        const saved = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
        for (let index = 0; index < operations; index++) {
          assert.equal(h.controller.history('undo'), true);
          assert.equal((await h.flush()).error, undefined);
        }
        assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, baseline);
        for (let index = 0; index < operations; index++) {
          assert.equal(h.controller.history('redo'), true);
          assert.equal((await h.flush()).error, undefined);
        }
        assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved);
      }
});

test('queued repeated HWP5 letters preserve independently reconstructed complete sections and style boundaries', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({
    kind: 'load',
    format: 'hwp5',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp'),
  });
  assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
  assert.equal(
    (
      await h.send({
        kind: 'splice',
        section: 0,
        paragraph: 5,
        startUnit: 0,
        endUnit: original.text.length,
        text: 'aa',
      })
    ).error,
    undefined,
  );
  for (const [startUnit, charShapeId] of [
    [0, 0],
    [1, 1],
  ]) {
    assert.equal(
      (
        await h.send({
          kind: 'format',
          section: 0,
          paragraph: 5,
          startUnit,
          endUnit: startUnit + 1,
          charShapeId,
        })
      ).error,
      undefined,
    );
  }
  const save = async () => (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
  const baseline = await save(),
    before = inspect(baseline);
  // Spec table61: little-endian (start UTF-16 unit, character shape ID) pairs.
  const shapeIds = (section) => {
    const owner = paragraphRecords(section, 5),
      own = owner.direct.filter((row) => row.level === owner.head.level + 1);
    const rows = own.filter((row) => row.tag === 68);
    assert.equal(rows.length, 1);
    const payload = rows[0].payload;
    assert.equal(payload.length % 8, 0);
    const runs = Array.from({ length: payload.length / 8 }, (_, index) => ({
      at: payload.readUInt32LE(index * 8),
      id: payload.readUInt32LE(index * 8 + 4),
    }));
    const text = own.find((row) => row.tag === 67).payload.toString('utf16le');
    assert.equal(text.at(-1), '\r');
    return Array.from(
      { length: text.length - 1 },
      (_, unit) => runs.findLast((row) => row.at <= unit).id,
    );
  };
  assert.deepEqual(shapeIds(before.sections[0].bytes), [0, 1]);
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
    true,
  );
  for (const [caret, value] of [
    [0, 'aaa'],
    [1, 'aaaa'],
  ]) {
    h.input.setSelectionRange(caret, caret);
    assert.equal(
      dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: 'a' })
        .defaultPrevented,
      false,
    );
    h.input.value = value;
    h.input.setSelectionRange(caret + 1, caret + 1);
    dispatchCanvasEvent(h.input, 'input');
  }
  for (let index = 0; index < 2; index++) assert.equal((await h.flush()).error, undefined);
  const saved = await save(),
    after = inspect(saved);
  const first = expectedSection(before.sections[0].bytes, 5, 0, 0, 'a');
  const expected = expectedSection(first, 5, 1, 1, 'a');
  assert.deepEqual(after.sections[0].bytes, expected);
  assert.deepEqual(shapeIds(after.sections[0].bytes), [0, 0, 0, 1]);
  assert.notDeepEqual(
    after.sections[0].bytes,
    expectedSection(first, 5, 3, 3, 'a'),
    'same text at the wrong style boundary must fail',
  );
  assert.deepEqual(after.metadata, before.metadata);
  for (const [path, bytes] of before.streams)
    if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
  for (let index = 0; index < 2; index++) {
    assert.equal(h.controller.history('undo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual(await save(), baseline);
  for (let index = 0; index < 2; index++) {
    assert.equal(h.controller.history('redo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual(await save(), saved);
  assert.equal((await h.send({ kind: 'load', format: 'hwp5', bytes: saved })).error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  assert.deepEqual(inspect(await save()).sections[0].bytes, expected);
});

test('queued repeated HWPX letters preserve distinct source styles in independently decoded XML', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx'),
  });
  assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
  assert.equal(
    (
      await h.send({
        kind: 'splice',
        section: 0,
        paragraph: 5,
        startUnit: 0,
        endUnit: original.text.length,
        text: 'aa',
      })
    ).error,
    undefined,
  );
  for (const [startUnit, charShapeId] of [
    [0, 0],
    [1, 1],
  ]) {
    assert.equal(
      (
        await h.send({
          kind: 'format',
          section: 0,
          paragraph: 5,
          startUnit,
          endUnit: startUnit + 1,
          charShapeId,
        })
      ).error,
      undefined,
    );
  }
  // Python's ZIP/XML decoder is independent of the native reader and its wire projection.
  const decode = (bytes, flags = []) =>
    JSON.parse(
      execFileSync(
        'python3',
        [
          ...flags,
          '-c',
          `
import base64, io, json, sys, zipfile, xml.etree.ElementTree as ET
p = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read(), validate=True))) as z:
    paragraph = list(ET.fromstring(z.read('Contents/section0.xml')).iter(p + 'p'))[5]
    result = []
    for run in paragraph.findall(p + 'run'):
        for text in run.findall(p + 't'):
            if len(text): raise ValueError('UnexpectedInlineControl')
            for character in text.text or '': result.append([character, int(run.attrib['charPrIDRef'])])
    print(json.dumps(result))
`,
        ],
        { input: Buffer.from(bytes).toString('base64'), encoding: 'utf8', timeout: 30000 },
      ),
    );
  const save = async () => (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
  const baseline = await save();
  assert.deepEqual(decode(baseline), [
    ['a', 0],
    ['a', 1],
  ]);
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
    true,
  );
  for (const [caret, value] of [
    [0, 'aaa'],
    [1, 'aaaa'],
  ]) {
    h.input.setSelectionRange(caret, caret);
    assert.equal(
      dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: 'a' })
        .defaultPrevented,
      false,
    );
    h.input.value = value;
    h.input.setSelectionRange(caret + 1, caret + 1);
    dispatchCanvasEvent(h.input, 'input');
  }
  for (let index = 0; index < 2; index++) assert.equal((await h.flush()).error, undefined);
  const saved = await save(),
    expected = [
      ['a', 0],
      ['a', 0],
      ['a', 0],
      ['a', 1],
    ];
  for (const flags of [[], ['-O']]) {
    const actual = decode(saved, flags);
    assert.deepEqual(actual, expected);
    assert.notDeepEqual(
      actual,
      [
        ['a', 0],
        ['a', 0],
        ['a', 1],
        ['a', 1],
      ],
      'same string at the wrong style boundary must not pass',
    );
  }
  for (let index = 0; index < 2; index++) {
    assert.equal(h.controller.history('undo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual(await save(), baseline);
  for (let index = 0; index < 2; index++) {
    assert.equal(h.controller.history('redo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual(await save(), saved);
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes: saved })).error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  assert.deepEqual(decode(await save()), expected);
});

test('pending created-cell input sends each acknowledged cell value rather than the final DOM draft', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx'),
  });
  await h.send({ kind: 'enable' });
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }),
    true,
  );
  assert.equal(
    h.controller.insertTable({
      rows: 1,
      columns: 1,
      width: 36000,
      rowHeight: 6000,
      resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 },
    }),
    true,
  );
  const created = await h.flush();
  assert.equal(created.error, undefined);
  assert.equal(h.input.value, '');
  assert.equal(h.input.readOnly, false);
  const baseline = (await h.send({ kind: 'save' })).bytes,
    start = h.requests.length;
  for (const text of ['a', 'aa', 'aaa']) {
    dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: 'a' });
    h.input.value = text;
    h.input.setSelectionRange(text.length, text.length);
    dispatchCanvasEvent(h.input, 'input');
  }
  for (let index = 0; index < 3; index++) assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(
    h.requests.slice(start).map((request) => request.text),
    ['a', 'aa', 'aaa'],
  );
  const saved = (await h.send({ kind: 'save' })).bytes;
  for (let index = 0; index < 3; index++) {
    assert.equal(h.controller.history('undo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, baseline);
  for (let index = 0; index < 3; index++) {
    assert.equal(h.controller.history('redo'), true);
    assert.equal((await h.flush()).error, undefined);
  }
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, saved);
});

test('rejected in-flight input discards dependent intents without replaying them into another document', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const format of ['hwp5', 'hwpx']) {
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    const loaded = await h.send({ kind: 'load', format, bytes });
    await h.send({ kind: 'enable' });
    const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
    assert.equal(
      h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
      true,
    );
    const start = h.requests.length;
    for (const [value, caret, text] of [
      ['\u000b' + original.text, 1, '\u000b'],
      ['q\u000b' + original.text, 1, 'q'],
    ]) {
      h.input.setSelectionRange(0, 0);
      dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: text });
      h.input.value = value;
      h.input.setSelectionRange(caret, caret);
      dispatchCanvasEvent(h.input, 'input');
    }
    const rejected = await h.flush();
    assert.match(rejected.error, /Control|Character|Text|Payload/);
    assert.equal(h.requests.length, start + 1);
    assert.equal(h.input.value, original.text);
    assert.equal(h.controller.settled(), true);
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), bytes);
    const reloaded = await h.send({ kind: 'load', format, bytes });
    assert.equal(reloaded.error, undefined);
    await h.send({ kind: 'enable' });
    assert.equal(
      h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
      true,
    );
    dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: 'x' });
    h.input.value = 'x' + original.text;
    h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, 'input');
    const changed = await h.flush();
    assert.equal(changed.error, undefined);
    assert.equal(
      changed.content.paragraphs.find((row) => row.paragraph === 5).text,
      'x' + original.text,
    );
  }
});

test('pending Canvas input replays each location including moved carets and repeated emoji', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  const cases = [
    {
      before: 'aa',
      steps: [
        [0, 'aaa', 1, 'a'],
        [1, 'aaaa', 2, 'a'],
        [2, 'aaaaa', 3, 'a'],
      ],
    },
    {
      before: 'ab',
      steps: [
        [0, 'xab', 1, 'x'],
        [3, 'xaby', 4, 'y'],
        [0, 'zxaby', 1, 'z'],
      ],
    },
    {
      before: '😀😀',
      steps: [
        [0, '😀😀😀', 2, '😀'],
        [2, '😀😀😀😀', 4, '😀'],
      ],
    },
    {
      before: 'aa',
      steps: [
        [0, 'aaa', 1, 'a'],
        [1, 'aa', 0, '', 'deleteContentBackward', 0, 1],
        [0, 'a', 0, '', 'deleteContentForward', 0, 1],
      ],
    },
  ];
  for (const format of ['hwp5', 'hwpx'])
    for (const { before, steps } of cases) {
      const loaded = await h.send({
        kind: 'load',
        format,
        bytes: readFileSync(
          `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
        ),
      });
      assert.equal((await h.send({ kind: 'enable' })).error, undefined);
      const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
      assert.equal(
        (
          await h.send({
            kind: 'splice',
            section: 0,
            paragraph: 5,
            startUnit: 0,
            endUnit: original.text.length,
            text: before,
          })
        ).error,
        undefined,
      );
      const baseline = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
      assert.equal(
        h.controller.selectTextRange({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0 }),
        true,
      );
      const start = h.requests.length;
      for (const [caret, after, afterCaret, text, inputType = 'insertText'] of steps) {
        h.input.setSelectionRange(caret, caret);
        assert.equal(
          dispatchCanvasEvent(h.input, 'beforeinput', { inputType, data: text }).defaultPrevented,
          false,
        );
        h.input.value = after;
        h.input.setSelectionRange(afterCaret, afterCaret);
        dispatchCanvasEvent(h.input, 'input');
      }
      for (let index = 0; index < steps.length; index++) {
        assert.equal(h.controller.history('undo'), false);
        assert.equal((await h.flush()).error, undefined);
      }
      assert.deepEqual(
        h.requests.slice(start),
        steps.map(([caret, , , text, , first = caret, last = caret]) => ({
          kind: 'splice',
          origin: 'canvas',
          section: 0,
          paragraph: 5,
          startUnit: first,
          endUnit: last,
          text,
        })),
      );
      const saved = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
      for (let index = steps.length - 1; index >= 0; index--) {
        assert.equal(h.controller.history('undo'), true);
        const result = await h.flush();
        assert.equal(result.error, undefined);
        assert.equal(
          result.content.paragraphs.find((row) => row.paragraph === 5).text,
          index === 0 ? before : steps[index - 1][1],
        );
        assert.equal(h.input.selectionStart, steps[index][0]);
      }
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, baseline);
      for (const step of steps) {
        assert.equal(h.controller.history('redo'), true);
        const result = await h.flush();
        assert.equal(result.error, undefined);
        assert.equal(result.content.paragraphs.find((row) => row.paragraph === 5).text, step[1]);
      }
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved);
    }
});

test('repeated text deletions preserve exact Canvas ranges through HWP5 and HWPX history', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const format of ['hwp5', 'hwpx']) {
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/parashape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    for (const [before, after, caret, inputType, startUnit, endUnit] of [
      ['aaa', 'aa', 1, 'deleteContentBackward', 0, 1],
      ['aaa', 'aa', 0, 'deleteContentForward', 0, 1],
      ['😀😀😀', '😀😀', 2, 'deleteContentBackward', 0, 2],
    ]) {
      const loaded = await h.send({ kind: 'load', format, bytes });
      assert.equal(loaded.error, undefined);
      assert.equal((await h.send({ kind: 'enable' })).error, undefined);
      const original = loaded.content.paragraphs.find((row) => row.paragraph === 5);
      assert.equal(
        (
          await h.send({
            kind: 'splice',
            section: 0,
            paragraph: 5,
            startUnit: 0,
            endUnit: original.text.length,
            text: before,
          })
        ).error,
        undefined,
      );
      const baseline = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
      assert.equal(
        h.controller.selectTextRange({
          section: 0,
          paragraph: 5,
          startUnit: caret,
          endUnit: caret,
        }),
        true,
      );
      assert.equal(
        dispatchCanvasEvent(h.input, 'beforeinput', { inputType }).defaultPrevented,
        false,
      );
      h.input.value = after;
      h.input.setSelectionRange(startUnit, startUnit);
      dispatchCanvasEvent(h.input, 'input');
      assert.deepEqual(h.requests.at(-1), {
        kind: 'splice',
        origin: 'canvas',
        section: 0,
        paragraph: 5,
        startUnit,
        endUnit,
        text: '',
      });
      const changed = await h.flush();
      assert.equal(changed.error, undefined);
      assert.equal(changed.content.paragraphs.find((row) => row.paragraph === 5).text, after);
      const saved = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
      assert.equal(h.controller.history('undo'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, baseline);
      assert.equal(h.controller.history('redo'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved);
    }
  }
});
