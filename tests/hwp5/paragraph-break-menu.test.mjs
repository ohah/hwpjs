import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { createDocumentMenuControls } from '../../web/preview/document-menu-controls.mjs';
import { inspect, paragraphRecords } from './style-preservation/text-record-oracle.mjs';
import { expectedSplitSection } from './style-preservation/structure-record-oracle.mjs';

function menu(controller) {
  return createDocumentMenuControls(
    ['page', 'column'].map((kind) => ({
      button: Object.assign(new EventTarget(), {
        id: `menu-insert-${kind}-break`,
        textContent: `${kind} break`,
      }),
      target: {
        get disabled() {
          return controller.canInsertParagraphBreak() !== true;
        },
        click() {
          return controller.insertParagraphBreak(kind);
        },
      },
    })),
  );
}

for (const format of ['hwp5', 'hwpx'])
  for (const kind of ['page', 'column'])
    for (const [startUnit, endUnit] of [
      [1, 1],
      [1, 3],
      [0, 2],
      [2, 4],
    ]) {
      test(
        `${format} ${kind} menu splits actual selection [${startUnit},${endUnit}) atomically`,
        { skip: !process.env.HWPJS_TEST_WASM && 'explicit flow candidate required' },
        async (t) => {
          const h = await workerCanvasHarness(t),
            registry = menu(h.controller);
          t.after(() => registry.close());
          const input = readFileSync(
            `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
          );
          assert.equal((await h.send({ kind: 'load', format, bytes: input })).error, undefined);
          assert.equal((await h.send({ kind: 'enable' })).error, undefined);
          assert(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit, endUnit }));
          h.input.blur();
          assert.equal(registry.execute(`menu-insert-${kind}-break`), true);
          assert.deepEqual(h.requests, [
            {
              kind: 'split',
              origin: 'canvas',
              section: 0,
              paragraph: 1,
              atUnit: startUnit,
              endUnit,
              breakBefore: kind,
            },
          ]);
          assert.equal((await h.flush()).error, undefined);
          const saved = await h.send({ kind: 'save', allowStaleLayout: true });
          assert.equal(saved.error, undefined);
          if (format === 'hwp5') {
            const before = inspect(input),
              after = inspect(saved.bytes);
            const expected = expectedSplitSection(before.sections, 0, 1, startUnit, endUnit);
            const right = paragraphRecords(expected, 2).head;
            expected[right.start + right.raw.length - right.payload.length + 11] =
              kind === 'page' ? 4 : 8;
            assert.deepEqual(after.sections[0].bytes, expected);
            assert.deepEqual(after.metadata, before.metadata);
            assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
            for (const [path, bytes] of before.streams)
              if (path !== before.sections[0].path)
                assert.deepEqual(after.streams.get(path), bytes, path);
          } else
            for (const flags of [[], ['-O']]) {
              const payload = {
                before: input.toString('base64'),
                after: Buffer.from(saved.bytes).toString('base64'),
                kind,
                startUnit,
                endUnit,
              };
              assert.equal(
                execFileSync('python3', [...flags, 'tools/hwpx-flow-selection-oracle.py'], {
                  input: JSON.stringify(payload),
                  encoding: 'utf8',
                }).trim(),
                'verified',
              );
              assert.throws(
                () =>
                  execFileSync('python3', [...flags, 'tools/hwpx-flow-selection-oracle.py'], {
                    input: JSON.stringify({
                      ...payload,
                      kind: kind === 'page' ? 'column' : 'page',
                    }),
                    stdio: ['pipe', 'pipe', 'pipe'],
                  }),
                /Command failed/,
              );
            }
          assert.equal((await h.send({ kind: 'undo' })).changed, true);
          assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
          assert.equal((await h.send({ kind: 'undo' })).changed, false);
          assert.equal((await h.send({ kind: 'redo' })).changed, true);
          assert.deepEqual(
            (await h.send({ kind: 'save', allowStaleLayout: true })).bytes,
            saved.bytes,
          );
          assert.equal(
            (await h.send({ kind: 'load', format, bytes: saved.bytes })).error,
            undefined,
          );
          assert.equal((await h.send({ kind: 'enable' })).error, undefined);
          const reopened = await h.send({ kind: 'save' });
          assert.equal(reopened.error, undefined);
          assert.deepEqual(reopened.bytes, saved.bytes);
        },
      );
    }

for (const format of ['hwp5', 'hwpx'])
  for (const kind of ['page', 'column']) {
    test(
      `${format} ${kind} menu reuses Canvas split selection and one native history entry`,
      { skip: !process.env.HWPJS_TEST_WASM && 'explicit flow candidate required' },
      async (t) => {
        const h = await workerCanvasHarness(t),
          registry = menu(h.controller);
        t.after(() => registry.close());
        assert(registry.commands().every((row) => !row.enabled));
        const input = readFileSync(
          `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
        );
        assert.equal((await h.send({ kind: 'load', format, bytes: input })).error, undefined);
        assert.equal((await h.send({ kind: 'enable' })).paragraphBreakAvailable, true);
        const paragraph = format === 'hwp5' ? 1 : 0;
        assert(h.controller.selectTextRange({ section: 0, paragraph, startUnit: 0, endUnit: 0 }));
        h.input.blur();
        assert(
          registry.commands().every((row) => row.enabled),
          'menu focus must retain the Canvas selection',
        );
        assert.equal(registry.execute(`menu-insert-${kind}-break`), true);
        assert.equal(h.requests.length, 1);
        assert.deepEqual(h.requests[0], {
          kind: 'split',
          origin: 'canvas',
          section: 0,
          paragraph,
          breakBefore: kind,
          atUnit: 0,
          endUnit: 0,
        });
        assert(
          registry.commands().every((row) => !row.enabled),
          'pending command must disable both menu entries',
        );
        const split = await h.flush();
        assert.equal(split.error, undefined);
        const saved = await h.send({ kind: 'save', allowStaleLayout: format === 'hwp5' });
        assert.equal(saved.error, undefined);
        assert(saved.bytes instanceof Uint8Array);
        if (format === 'hwp5') {
          const before = inspect(input),
            after = inspect(saved.bytes),
            expected = expectedSplitSection(before.sections, 0, 1, 0);
          const right = paragraphRecords(expected, 2).head;
          expected[right.start + right.raw.length - right.payload.length + 11] =
            kind === 'page' ? 4 : 8;
          assert.deepEqual(after.sections[0].bytes, expected);
          assert.deepEqual(after.metadata, before.metadata);
          for (const [path, bytes] of before.streams)
            if (path !== before.sections[0].path)
              assert.deepEqual(after.streams.get(path), bytes, path);
        } else
          for (const flags of [[], ['-O']]) {
            assert.equal(
              execFileSync('python3', [...flags, 'tools/hwpx-flow-break-oracle.py'], {
                input: JSON.stringify({
                  before: input.toString('base64'),
                  after: Buffer.from(saved.bytes).toString('base64'),
                  kind,
                }),
                encoding: 'utf8',
              }).trim(),
              'verified',
            );
          }
        assert.equal((await h.send({ kind: 'undo' })).changed, true);
        const undone = await h.send({ kind: 'save' });
        assert.equal(undone.error, undefined);
        assert.deepEqual(Buffer.from(undone.bytes), input);
        assert.equal(
          (await h.send({ kind: 'undo' })).changed,
          false,
          'one menu click is one history entry',
        );
        assert.equal((await h.send({ kind: 'redo' })).changed, true);
        const redone = await h.send({ kind: 'save', allowStaleLayout: format === 'hwp5' });
        assert.equal(redone.error, undefined);
        assert.deepEqual(redone.bytes, saved.bytes);
        registry.close();
        assert.equal(registry.execute(`menu-insert-${kind}-break`), false);
      },
    );
  }

test(
  'flow menu rejects invalid intent, composition, unavailable ABI and closed Canvas',
  { skip: !process.env.HWPJS_TEST_WASM && 'explicit flow candidate required' },
  async (t) => {
    const h = await workerCanvasHarness(t);
    const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');
    await h.send({ kind: 'load', format: 'hwpx', bytes: input });
    await h.send({ kind: 'enable' });
    assert(h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }));
    assert.throws(() => h.controller.insertParagraphBreak('PAGE'), /InvalidParagraphBreakKind/);
    dispatchCanvasEvent(h.input, 'compositionstart');
    assert.equal(h.controller.canInsertParagraphBreak(), false);
    assert.equal(h.controller.insertParagraphBreak('page'), false);
    dispatchCanvasEvent(h.input, 'compositionend');
    h.controller.message({
      kind: 'enable',
      structureAvailable: true,
      paragraphBreakAvailable: false,
    });
    assert.equal(h.controller.canInsertParagraphBreak(), false);
    assert.equal(h.controller.insertParagraphBreak('column'), false);
    h.controller.close();
    assert.equal(h.controller.canInsertParagraphBreak(), false);
    assert.equal(h.controller.insertParagraphBreak('page'), false);
    assert.equal(h.requests.length, 0);
    const saved = await h.send({ kind: 'save' }, false);
    assert.equal(saved.error, undefined);
    assert.deepEqual(Buffer.from(saved.bytes), input);
  },
);

test(
  'flow menu keeps an editable nested header outside the body break scope',
  { skip: !process.env.HWPJS_TEST_WASM && 'explicit flow candidate required' },
  async (t) => {
    const h = await workerCanvasHarness(t),
      registry = menu(h.controller);
    t.after(() => registry.close());
    const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx');
    assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes: input })).error, undefined);
    await h.send({ kind: 'enable' });
    assert(h.controller.selectTextRange({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0 }));
    assert.equal(h.controller.canInsertParagraphBreak(), false);
    assert(registry.commands().every((row) => !row.enabled));
    assert.equal(registry.execute('menu-insert-page-break'), false);
    assert.equal(h.requests.length, 0);
    const saved = await h.send({ kind: 'save' });
    assert.equal(saved.error, undefined);
    assert.deepEqual(Buffer.from(saved.bytes), input);
  },
);

for (const format of ['hwp5', 'hwpx']) {
  test(
    `${format} open flow registry cannot reuse a selection after document replacement`,
    { skip: !process.env.HWPJS_TEST_WASM && 'explicit flow candidate required' },
    async (t) => {
      const h = await workerCanvasHarness(t),
        registry = menu(h.controller);
      t.after(() => registry.close());
      const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
      assert.equal((await h.send({ kind: 'load', format: 'hwp5', bytes: input })).error, undefined);
      assert.equal((await h.send({ kind: 'enable' })).error, undefined);
      assert(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 1, endUnit: 3 }));
      assert(registry.commands().every((row) => row.enabled));
      const replacement = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
      );
      assert.equal((await h.send({ kind: 'load', format, bytes: replacement })).error, undefined);
      for (const kind of ['page', 'column'])
        assert.equal(registry.execute(`menu-insert-${kind}-break`), false);
      assert.equal((await h.send({ kind: 'enable' })).error, undefined);
      assert(
        registry.commands().every((row) => !row.enabled),
        'enabling a new editor must not restore the old selection',
      );
      for (const kind of ['page', 'column'])
        assert.equal(registry.execute(`menu-insert-${kind}-break`), false);
      assert.deepEqual(h.requests, []);
      const saved = await h.send({ kind: 'save' });
      assert.equal(saved.error, undefined);
      assert.deepEqual(Buffer.from(saved.bytes), replacement);
      assert.equal((await h.send({ kind: 'undo' })).changed, false);
      assert(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }));
      assert.equal(registry.execute('menu-insert-page-break'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.equal(h.requests.length, 1);
    },
  );
}
