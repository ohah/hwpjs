import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  open,
  make,
  find,
  original,
  sha,
  createParagraphSelection,
  SPLICE_TEXT_COMMAND,
} from './helpers/existing-note-runtime.ts';
import {
  inspect,
  records,
  paragraphRecords,
  expectedSection,
} from '../../tests/hwp5/style-preservation/text-record-oracle.mjs';
import { verifyParsed } from '../../tests/hwp5/style-preservation/plain-footnote-saved-oracle.mjs';
const output = process.env.HWPJS_TEST_NOTE_OUTPUT;
if (
  output &&
  (!isAbsolute(output) ||
    ['title-column-roundtrip', 'hwpers_test4_complex_table', 'legacy/hwpers'].some((x) =>
      output.toLowerCase().includes(x),
    ) ||
    output.split('/').includes('..'))
)
  throw Error('InvalidOwnedNoteOutput');
const artifact = output ? pathToFileURL(output.endsWith('/') ? output : output + '/') : null;
const coord = (end: number) => ({ section: 0, paragraph: 1, startUnit: end, endUnit: end });
const checkResult = (r: any) => {
  assert.equal(r.error, undefined);
  assert.equal(r.status, 'committed-with-snapshot');
};
function firstFootnoteOriginal() {
  const before = inspect(original);
  let result: any;
  for (let section = 0; section < before.sections.length; section++) {
    const stack: any[] = [];
    let paragraph = -1;
    for (const rec of records(before.sections[section].bytes)) {
      while (stack.length && stack.at(-1).level >= rec.level) stack.pop();
      if (rec.tag === 71 && rec.payload.length >= 4)
        stack.push({ level: rec.level, id: rec.payload.readUInt32LE(0) });
      if (rec.tag === 66) {
        paragraph++;
        if (!result && stack.some((x) => x.id === 0x666e2020)) result = { section, paragraph };
      }
    }
  }
  assert.deepEqual(result, { section: 0, paragraph: 1 });
  return { before, ...result };
}
function verifyOneCharacter(saved: Uint8Array) {
  const { before, section, paragraph } = firstFootnoteOriginal(),
    body = before.sections[section];
  const p = paragraphRecords(body.bytes, paragraph),
    text = p.direct.find((r: any) => r.tag === 67 && r.level === p.head.level + 1)!;
  assert.equal(text.payload.readUInt16LE(text.payload.length - 2), 13);
  const at = text.payload.length / 2 - 1;
  const expected = new Map(before.sections.map((s: any) => [s.path, s.bytes]));
  expected.set(body.path, expectedSection(body.bytes, paragraph, at, at, '가'));
  verifyParsed(before, inspect(Buffer.from(saved)), expected);
  return {
    independentTarget: paragraph,
    streamsExactExceptTarget: true,
    allSectionRecordsExact: true,
    containerMetadataExact: true,
  };
}
test('실 d849 canonical 공개 각주 선택→한글자→독립CFB→undo원본→redo→재열기', async () => {
  const editor = await open(),
    reopened = make();
  try {
    const s = editor.getEditorState(),
      before = find(editor),
      otherBefore = s.content.paragraphs
        .filter((r: any) => r.paragraph !== 1)
        .map((r: any) => [r.paragraph, r.text]);
    assert.equal(before.editable, true);
    assert.match(before.selectionOwner, /^hwp5-note:/);
    assert.equal(before.currentReference.id, '14');
    const target = createParagraphSelection(s, coord(before.text.length));
    assert.equal(Object.hasOwn(target, 'reference'), false);
    await editor.setSelection(target);
    assert.equal((editor.getEditorState().selection as any).owner, before.selectionOwner);
    checkResult(await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '가' }));
    assert.equal(find(editor).text, before.text + '가');
    assert.deepEqual(
      editor
        .getEditorState()
        .content.paragraphs.filter((r: any) => r.paragraph !== 1)
        .map((r: any) => [r.paragraph, r.text]),
      otherBefore,
    );
    await assert.rejects(editor.setSelection(target), /StaleTarget/);
    const saved = await editor.save({ allowStaleLayout: true });
    const independent = verifyOneCharacter(saved.bytes);
    const beforeUndo = createParagraphSelection(
      editor.getEditorState(),
      coord(find(editor).text.length),
    );
    checkResult(await editor.undo());
    assert.equal(find(editor).text, before.text);
    await assert.rejects(editor.setSelection(beforeUndo), /StaleTarget/);
    const restored = await editor.save({ allowStaleLayout: true });
    assert.deepEqual(restored.bytes, new Uint8Array(original));
    checkResult(await editor.redo());
    assert.equal(find(editor).text, before.text + '가');
    const redone = await editor.save({ allowStaleLayout: true });
    assert.deepEqual(redone.bytes, saved.bytes);
    await reopened.load(saved.bytes, { format: 'hwp5', editable: true });
    assert.equal(find(reopened).text, before.text + '가');
    const newTarget = createParagraphSelection(
      reopened.getEditorState(),
      coord(find(reopened).text.length),
    );
    await reopened.setSelection(newTarget);
    assert.notEqual(find(reopened).currentReference.scope, before.currentReference.scope);
    const result = {
      scope: 'actual canonical source ReaderRuntime/Editor + fixed d849/360c',
      independent,
      selectedParagraph: 1,
      inserted: '가',
      undoOriginalBytesExact: true,
      redoSavedBytesExact: true,
      reopenedSelection: true,
      fixtureSHA256: sha(original),
      savedSHA256: sha(saved.bytes),
    };
    if (artifact) {
      writeFileSync(new URL('ROUNDTRIP.json', artifact), JSON.stringify(result, null, 2) + '\n');
      writeFileSync(new URL('edited.hwp', artifact), saved.bytes);
      writeFileSync(new URL('restored.hwp', artifact), restored.bytes);
    }
    console.log(JSON.stringify(result));
  } finally {
    await editor.dispose();
    await reopened.dispose();
  }
});
test('실 canonical 위조owner·추가권한옵션·foreign token 거부와 원본보존', async () => {
  const editor = await open();
  try {
    const s = editor.getEditorState(),
      row = find(editor),
      target = createParagraphSelection(s, coord(row.text.length));
    const other = find(editor, 2);
    assert.notEqual(row.selectionOwner, other.selectionOwner);
    await assert.rejects(
      editor.setSelection({ ...target, owner: other.selectionOwner }),
      /InvalidSelectionOwner/,
    );
    for (const key of ['owner', 'reference', 'token', 'brand'])
      assert.throws(
        () => createParagraphSelection(s, { ...coord(1), [key]: 'forged' } as any),
        /InvalidParagraphSelectionOptions/,
      );
    for (const delta of [
      { editorId: 'foreign' },
      { documentId: 'foreign' },
      { generation: target.generation + 1 },
      { operationRevision: target.operationRevision + 1 },
      { viewRevision: target.viewRevision + 1 },
    ])
      await assert.rejects(editor.setSelection({ ...target, ...delta }), /StaleTarget/);
    assert.deepEqual(
      (await editor.save({ allowStaleLayout: true })).bytes,
      new Uint8Array(original),
    );
  } finally {
    await editor.dispose();
  }
});
test('실 Native scope·epoch와 load/undo후stale참조를 현재token으로도 거부', async () => {
  const editor = await open();
  try {
    const old = find(editor).currentReference;
    const first = await editor.readResource({ kind: 'query-current-text', reference: old });
    assert.equal(first.error, undefined);
    await assert.rejects(
      editor.readResource({
        kind: 'query-current-text',
        reference: { ...old, scope: 'forged-scope' },
      }),
      /CurrentReferenceScope/,
    );
    const t = createParagraphSelection(editor.getEditorState(), coord(find(editor).text.length));
    checkResult(await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target: t, text: '가' }));
    await assert.rejects(
      editor.readResource({ kind: 'query-current-text', reference: old }),
      /Reference|Epoch|Stale/,
    );
    const edited = find(editor).currentReference;
    checkResult(await editor.undo());
    await assert.rejects(
      editor.readResource({ kind: 'query-current-text', reference: edited }),
      /Reference|Epoch|Stale/,
    );
    const beforeLoad = createParagraphSelection(
      editor.getEditorState(),
      coord(find(editor).text.length),
    );
    const priorScope = find(editor).currentReference;
    await editor.load(new Uint8Array(original), { format: 'hwp5', editable: true });
    await assert.rejects(editor.setSelection(beforeLoad), /StaleTarget/);
    await assert.rejects(
      editor.readResource({ kind: 'query-current-text', reference: priorScope }),
      /CurrentReferenceScope/,
    );
    assert.deepEqual(
      (await editor.save({ allowStaleLayout: true })).bytes,
      new Uint8Array(original),
    );
  } finally {
    await editor.dispose();
  }
});
test('실 각주 자동번호 보호앵커 삭제는 공개 splice에서 거부', async () => {
  const editor = await open();
  try {
    const target = createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 1,
      startUnit: 0,
      endUnit: 1,
    });
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '' });
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, 'ProtectedAnchorRange');
    assert.deepEqual(
      (await editor.save({ allowStaleLayout: true })).bytes,
      new Uint8Array(original),
    );
  } finally {
    await editor.dispose();
  }
});
