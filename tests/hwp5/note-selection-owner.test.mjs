import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwp5NoteSelectionOwners as attach } from '../../web/preview/hwp5-note-selection-owner.mjs';
// Positive 1 and negative 15 retain the original independent expectations.
import { createControl } from './helpers/note-selection-owner-control.mjs';
const copy = createControl;
test('순수 게시투영은 관측/ref/좌표/권한을변조하지않고확인된note owner만추가', () => {
  const input = copy(),
    prior = JSON.stringify(input),
    result = attach(input);
  assert.notEqual(result, input);
  assert.equal(JSON.stringify(input), prior);
  for (const p of result.paragraphs) {
    const old = input.paragraphs.find(
      (r) => r.section === p.section && r.paragraph === p.paragraph,
    );
    assert.equal(p.currentReference, old.currentReference);
    assert.equal(p.sourceOffsets, old.sourceOffsets);
    assert.equal(p.editable, old.editable);
    assert.equal(p.text, old.text);
    if ([1, 2, 4, 5].includes(p.paragraph)) assert.match(p.selectionOwner, /^hwp5-note:/);
    else assert.equal(p, old);
  }
});
const mutations = {
  'source-node불일치': (x) => (x.paragraphs[1].currentReference.id = '21'),
  scope불일치: (x) => (x.paragraphs[1].currentReference.scope = 'foreign'),
  epoch불일치: (x) => (x.paragraphs[1].currentReference.epoch = '3'),
  잘못된epoch: (x) => (x.paragraphs[1].currentReference.epoch = '0'),
  잘린각주: (x) => (x.paragraphs[1].clipped = true),
  duplicate좌표: (x) => x.paragraphs.push(structuredClone(x.paragraphs[1])),
  duplicateflow: (x) => x.currentParagraphFlows.push(structuredClone(x.currentParagraphFlows[1])),
  잘못된list: (x) => (x.currentParagraphFlows[1].list_node = 20),
  잘못된parent: (x) => (x.currentParagraphFlows[1].parent_node = 19),
  generated범위: (x) => (x.currentParagraphFlows[1].generated = true),
  범위미조회: (x) => (x.hwp5Notes = []),
  Native조회오류: (x) => x.hwp5NoteErrors.push({ section: 0, error: 'NativeRejected' }),
  scope정의밖: (x) => (x.currentParagraphFlows[1].host = 'memo'),
  다른역할중첩: (x) => (x.paragraphs[1].tableCell = { tableNode: 12, listNode: 13 }),
  불완전membership: (x) => (x.hwp5Notes[0].source.paragraph_count = 2),
};
for (const [name, change] of Object.entries(mutations))
  test('순수 부정입력 ' + name + '는승격하지않음', () => {
    const input = copy();
    change(input);
    const prior = JSON.stringify(input);
    const result = attach(input);
    assert.equal(result, input);
    assert.equal(JSON.stringify(input), prior);
    assert.equal(input.paragraphs[1].selectionOwner, null);
  });
