import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import {
  inspect,
  expectedSection,
  paragraphRecords,
} from './style-preservation/text-record-oracle.mjs';
import { sectionCountFixtures } from './section-count-fixtures.mjs';

assert(process.env.HWPJS_TEST_WASM, 'Explicit section-copy candidate required');
for (const [fixtureIndex, [name, , , available, digest]] of sectionCountFixtures.entries()) {
  for (let section = 0; section < available; section++)
    test(`section-copy Canvas retained anchors and queued input preserve complete source: ${name} section ${section}`, async (t) => {
      const path = `reference/rhwp/samples/${name}`;
      if (!existsSync(path)) {
        t.skip('Reference fixture unavailable');
        return;
      }
      const input = readFileSync(path);
      assert.equal(createHash('sha256').update(input).digest('hex'), digest);
      const h = await workerCanvasHarness(t);
      const loaded = await h.send({ kind: 'load', bytes: input, availableSectionCopy: true });
      assert.equal(loaded.error, undefined);
      assert.equal((await h.send({ kind: 'enable' })).error, undefined);
      const baselineReply = await h.send({ kind: 'save' });
      assert.equal(baselineReply.error, undefined);
      const baseline = Buffer.from(baselineReply.bytes),
        before = inspect(baseline);
      const owner = paragraphRecords(before.sections[section].bytes, 0);
      const raw = owner.direct.find(
        (row) => row.tag === 67 && row.level === owner.head.level + 1,
      ).payload;
      const codes = fixtureIndex === 2 ? [8, 2, 2] : section === 1 ? [2, 2] : [2];
      // Independent record bytes establish boundaries; do not derive expected
      // source coordinates from the product's sourceOffsets.
      for (const [index, code] of codes.entries()) {
        assert.equal(raw.readUInt16LE(index * 16), code);
        assert.equal(raw.readUInt16LE(index * 16 + 14), code);
      }
      const original = loaded.content.paragraphs.find(
        (row) => row.section === section && row.paragraph === 0,
      );
      assert.equal(original.editable, true);
      assert.equal(original.text.slice(0, codes.length), '\ufffc'.repeat(codes.length));
      // The oldest fixture begins with a combining enclosing square. Its
      // grapheme joins the preceding placeholder, so the first visible caret
      // boundary is after that mark, not inside the grapheme.
      const combining = fixtureIndex === 0 ? 1 : 0;
      if (combining) {
        assert.equal(original.text.charCodeAt(1), 0x20de);
        assert.equal(
          h.controller.selectTextRange({ section, paragraph: 0, startUnit: 1, endUnit: 1 }),
          false,
        );
      }
      const displayBoundary = codes.length + combining,
        sourceBoundary = codes.length * 8 + combining;
      assert.equal(
        h.controller.selectTextRange({
          section,
          paragraph: 0,
          startUnit: displayBoundary,
          endUnit: displayBoundary,
        }),
        true,
      );
      const start = h.requests.length;
      const steps = [
        { display: displayBoundary, source: sourceBoundary, text: '😀' },
        { display: 0, source: 0, text: '앞' },
        { display: displayBoundary + 1, source: sourceBoundary + 1, text: '가' },
      ];
      let draft = original.text;
      for (const step of steps) {
        h.input.setSelectionRange(step.display, step.display);
        assert.equal(
          dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: step.text })
            .defaultPrevented,
          false,
        );
        draft = draft.slice(0, step.display) + step.text + draft.slice(step.display);
        step.after = draft;
        h.input.value = draft;
        h.input.setSelectionRange(step.display + step.text.length, step.display + step.text.length);
        dispatchCanvasEvent(h.input, 'input');
      }
      assert.equal(
        h.requests.length,
        start + 1,
        'Only the first pending edit may be sent before a reply',
      );
      for (const step of steps) assert.equal((await h.flush()).error, undefined, step.after);
      assert.deepEqual(
        h.requests.slice(start),
        steps.map((step) => ({
          kind: 'splice',
          origin: 'canvas',
          section,
          paragraph: 0,
          startUnit: step.source,
          endUnit: step.source,
          text: step.text,
        })),
      );
      assert.equal(h.input.value, draft);
      const saved = await h.send({ kind: 'save', allowStaleLayout: true });
      assert.equal(saved.error, undefined);
      const after = inspect(saved.bytes);
      let expected = before.sections[section].bytes;
      for (const step of steps)
        expected = expectedSection(expected, 0, step.source, step.source, step.text);
      assert.deepEqual(after.sections[section].bytes, expected, 'Independent full Section oracle');
      assert.deepEqual(after.metadata, before.metadata);
      for (const [path, bytes] of before.streams)
        if (path !== before.sections[section].path)
          assert.deepEqual(after.streams.get(path), bytes, path);
      let wrong = before.sections[section].bytes;
      for (const step of steps)
        wrong = expectedSection(
          wrong,
          0,
          step.source,
          step.source,
          step.text === '가' ? '나' : step.text,
        );
      assert.notDeepEqual(
        after.sections[section].bytes,
        wrong,
        'Wrong inserted value must fail exact comparison',
      );

      assert.equal(h.controller.history('undo'), true);
      const undone = await h.flush();
      assert.equal(undone.error, undefined);
      const undoBytes = (await h.send({ kind: 'save', allowStaleLayout: true })).bytes;
      assert.equal(
        h.controller.selectTextRange({
          section,
          paragraph: 0,
          startUnit: 1,
          endUnit: 2 + combining,
        }),
        true,
      );
      h.controller.replaceSelection('');
      const rejected = await h.flush();
      assert.equal(rejected.error, 'UnsupportedControlDeletion');
      assert.equal(rejected.applied, false);
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, undoBytes);
      assert.deepEqual(rejected.historyRevisions, undone.historyRevisions);
      assert.equal(h.controller.history('redo'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
      for (let unit = 2; unit < 9; unit++) {
        const bad = await h.send({
          kind: 'splice',
          section,
          paragraph: 0,
          startUnit: unit,
          endUnit: unit,
          text: 'bad',
        });
        assert.equal(bad.error, 'SplitControlToken');
        assert.equal(bad.applied, false);
      }
      assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
      for (let index = steps.length - 1; index >= 0; index--) {
        assert.equal(h.controller.history('undo'), true);
        assert.equal((await h.flush()).error, undefined);
      }
      assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), baseline);
      for (let redoIndex = 0; redoIndex < steps.length; redoIndex++) {
        assert.equal(h.controller.history('redo'), true);
        assert.equal((await h.flush()).error, undefined);
      }
      const reopened = await h.send({ kind: 'load', bytes: saved.bytes });
      assert.equal(reopened.error, undefined);
      assert.equal(
        reopened.content.paragraphs.find((row) => row.section === section && row.paragraph === 0)
          .text,
        draft,
      );
      assert.deepEqual(readFileSync(path), input);
    });
}
