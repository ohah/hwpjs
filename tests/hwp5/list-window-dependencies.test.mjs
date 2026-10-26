import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { hwp5ListWindowDependencies } from '../../web/preview/hwp5-list-window-dependencies.mjs';
import { planParagraphDependencies } from '../../web/preview/paragraph-dependency-plan.mjs';
import { projectHwp5OwnedWindow } from '../../web/preview/hwp5-window-projection.mjs';

test('actual note and caption windows retain source hosts and all owned list paragraphs', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  for (const name of ['footnote-endnote', 'table-caption']) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const reader = await createHwp5Reader(wasm),
      editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const source = reader.readText(input),
        found = hwp5ListWindowDependencies(editor, source);
      assert(found.dependencies.size > 0, name);
      if (name === 'footnote-endnote') {
        assert.deepEqual(
          planParagraphDependencies({ ...found, offset: 1, count: 1, maxParagraphs: 10 }).ordinals,
          [0, 1, 2],
        );
        assert.deepEqual(
          planParagraphDependencies({ ...found, offset: 4, count: 1, maxParagraphs: 10 }).ordinals,
          [3, 4, 5],
        );
      }
      for (const [child, parents] of found.dependencies)
        for (const parent of parents) assert(found.dependencies.get(parent)?.includes(child));
      const member = editor
        .paragraphFlow(0)
        .find((row) => ['footnote', 'table_caption'].includes(row.host));
      assert(member);
      const offset = found.ordinals.get(`0:${member.paragraph}`);
      const content = projectHwp5OwnedWindow(editor, source, { offset, count: 1 });
      assert.equal(content.paragraphs.filter((row) => !row.windowContext).length, 1);
      assert(
        content.paragraphs
          .filter((row) => row.windowContext)
          .every((row) => row.editable === false && row.selectable === false),
      );
      assert(content.window.contextCount > 0);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
      reader.close();
    }
  }
});

test('caption dependencies require the exact native table control owner', () => {
  const projection = { sections: [{ index: 0, paragraphs: [{}, {}] }] };
  const source = { control_node: 7, list_node: 8, table_record_node: 9, paragraph_count: 1 };
  const editor = (table_node = 7) => ({
    noteSources: () => [],
    captionSources: () => [source],
    tablePlacements: () => [{ tableNode: 9, paragraph: 0 }],
    tableLayoutSources: () => [{ table_record_node: 9, table_node }],
    paragraphFlow: () => [
      { paragraph: 0, host: 'body' },
      { paragraph: 1, host: 'table_caption', parent_node: 7, list_node: 8 },
    ],
  });
  assert.deepEqual(hwp5ListWindowDependencies(editor(), projection).dependencies.get(1), [0]);
  assert.throws(
    () => hwp5ListWindowDependencies(editor(6), projection),
    /WindowDependencyBindingMismatch/,
  );
  assert.throws(
    () => hwp5ListWindowDependencies({ ...editor(), tableLayoutSources: () => [] }, projection),
    /WindowDependencyBindingMismatch/,
  );
});

test('list dependency adapter refuses missing wrong duplicate and unclaimed ownership', () => {
  const projection = { sections: [{ index: 0, paragraphs: [{}, {}] }] };
  const note = {
    kind: 'footnote',
    control_node: 7,
    list_node: 8,
    paragraph: 0,
    paragraph_count: 1,
  };
  const rows = [
    { paragraph: 0, host: 'body' },
    { paragraph: 1, host: 'footnote', parent_node: 7, list_node: 8 },
  ];
  const editor = (notes = [note], flows = rows) => ({
    noteSources: () => notes,
    captionSources: () => [],
    tablePlacements: () => [],
    paragraphFlow: () => flows,
  });
  const found = hwp5ListWindowDependencies(editor(), projection);
  assert.deepEqual(found.dependencies.get(1), [0]);
  for (const notes of [
    [],
    [note, note],
    [{ ...note, paragraph: 99 }],
    [{ ...note, kind: 'other' }],
  ])
    assert.throws(
      () => hwp5ListWindowDependencies(editor(notes), projection),
      /WindowDependencyBindingMismatch/,
    );
  assert.throws(
    () =>
      hwp5ListWindowDependencies(
        editor([note], [rows[0], { ...rows[1], parent_node: 99 }]),
        projection,
      ),
    /MissingWindowListBody/,
  );
  assert.throws(
    () => hwp5ListWindowDependencies(editor([note], [rows[0]]), projection),
    /WindowDependencyBindingMismatch/,
  );
  const empty = { sections: [{ index: 0, paragraphs: [{}] }] };
  assert.equal(
    hwp5ListWindowDependencies(editor([{ ...note, paragraph_count: 0 }], [rows[0]]), empty)
      .dependencies.size,
    0,
  );
});
