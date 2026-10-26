import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticNumberDisplaySnapshot } from '../../web/preview/automatic-number-display-snapshot.mjs';
import {
  attachAutomaticNumbers,
  retainedAutomaticNumberPlainText,
} from '../../web/preview/automatic-number-content.mjs';

test('one display reuses number metadata without retaining stale values across rebuilds', () => {
  let revision = 1,
    sourceCalls = 0,
    siteCalls = 0;
  const editor = {
    automaticNumberSources(section) {
      sourceCalls++;
      return [
        { number_node: section + 1, anchor_node: 8, revision, values: { raw: ['1', 'FOOTNOTE'] } },
      ];
    },
    automaticNumberSites(section) {
      siteCalls++;
      return [{ number_node: section + 1, anchor_node: 8, paragraph: 1, anchor_unit: 0 }];
    },
    canEdit() {
      return true;
    },
    anchorText() {
      return '\ufffc본문';
    },
  };
  const snapshot = createAutomaticNumberDisplaySnapshot(editor);
  for (let index = 0; index < 100; index++)
    assert.equal(
      retainedAutomaticNumberPlainText(editor, 0, 1, '본문', '\ufffc본문', snapshot),
      '본문',
    );
  const content = { paragraphs: [{ section: 0, paragraph: 0, text: '본문', plainEditable: true }] };
  attachAutomaticNumbers(editor, content, snapshot);
  assert.equal(sourceCalls, 1);
  assert.equal(siteCalls, 1);
  assert.deepEqual(content.automaticNumberErrors, []);
  assert.equal(content.paragraphs[0].automaticNumberPrefixes[0].source.revision, 1);
  assert.equal(snapshot(1).sources.get(2).revision, 1);
  assert.equal(sourceCalls, 2);
  assert.equal(siteCalls, 2);
  revision = 2;
  attachAutomaticNumbers(editor, content);
  assert.equal(content.paragraphs[0].automaticNumberPrefixes[0].source.revision, 2);
  assert.equal(sourceCalls, 3);
  assert.equal(siteCalls, 3);
});

test('failed number snapshot is not published as an empty successful result', () => {
  let fail = true;
  const snapshot = createAutomaticNumberDisplaySnapshot({
    automaticNumberSources: () => [],
    automaticNumberSites() {
      if (fail) throw new Error('InvalidFieldLinks');
      return [];
    },
  });
  assert.throws(() => snapshot(0), /InvalidFieldLinks/);
  fail = false;
  assert.deepEqual(snapshot(0).sites, []);
});
