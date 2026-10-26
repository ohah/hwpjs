import { test, expect } from 'bun:test';
import {
  EditorState,
  createEditor,
  findTextMatch,
  selectionMatchesText,
  getDocumentTextStatistics,
  SPLICE_TEXT_COMMAND,
} from '../../src/index.ts';
import type { SelectionTarget } from '../../src/index.ts';

const rows = [
  { section: 0, paragraph: 0, text: '가 😀 가', selectionOwner: 'section:0:body', editable: true },
  {
    section: 0,
    paragraph: 1,
    text: '표 안 가',
    tableCell: { tableNode: 7, listNode: 9 },
    editable: true,
  },
];
function snapshot(selection: SelectionTarget | null = null, patch: Record<string, unknown> = {}) {
  return new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
    stateVersion: 4,
    status: 'ready',
    content: { format: 'hwpx', paragraphs: rows, ...patch },
    selection,
  });
}
test('literal search uses UTF-16 target coordinates, canonical table owner, and wraps past the last match', () => {
  const state = snapshot(),
    emoji = findTextMatch(state, '😀')!;
  expect([emoji.startUnit, emoji.endUnit]).toEqual([2, 4]);
  expect(Object.isFrozen(emoji)).toBe(true);
  const first = findTextMatch(state, '가')!;
  expect(first.startUnit).toBe(0);
  const second = findTextMatch(snapshot(first), '가')!;
  expect(second.startUnit).toBe(5);
  const table = findTextMatch(snapshot(second), '가')!;
  expect(table.owner).toBe('section:0:table:7:list:9');
  expect(table.paragraph).toBe(1);
  expect(findTextMatch(snapshot(table), '가')).toEqual(first);
  expect(selectionMatchesText(snapshot(emoji), '😀')).toBe(true);
  expect(findTextMatch(state, '없음')).toBeNull();
});
test('search rejects malformed query and ambiguous identities without silently returning a false absence', () => {
  for (const query of ['', '\ud800'])
    expect(() => findTextMatch(snapshot(), query)).toThrow('InvalidSearchQuery');
  expect(() => findTextMatch(snapshot(null, { paragraphs: [rows[0], rows[0]] }), '가')).toThrow(
    'AmbiguousDocumentText',
  );
  expect(() =>
    getDocumentTextStatistics(snapshot(null, { paragraphs: [{ text: 'lost identity' }] })),
  ).toThrow('InvalidDocumentTextSnapshot');
  expect(
    findTextMatch(snapshot(null, { paragraphs: [{ ...rows[0], clipped: true }] }), '가'),
  ).toBeNull();
});
test('statistics count Unicode scalars and whitespace-defined words, excluding object anchors; partial scope remains explicit', () => {
  const state = snapshot(null, {
    paragraphs: [
      { section: 0, paragraph: 0, text: '가 😀\ufffc A', selectionOwner: 'section:0:body' },
    ],
  });
  expect(getDocumentTextStatistics(state)).toEqual({
    complete: true,
    paragraphs: 1,
    characters: 5,
    charactersWithoutWhitespace: 3,
    words: 3,
  });
  expect(
    getDocumentTextStatistics(snapshot(null, { window: { first: 0, last: 1 } })).complete,
  ).toBe(false);
  expect(() =>
    getDocumentTextStatistics(
      new EditorState({
        editorId: 'e',
        documentId: null,
        generation: 0,
        operationRevision: 0,
        viewRevision: 0,
        stateVersion: 0,
        status: 'empty',
      }),
    ),
  ).toThrow('EditorNotReady');
});
test('headless callers can find, select and replace through public APIs with no DOM, and old search targets become stale', async () => {
  let text = '가 😀 가';
  const content = () => ({
    format: 'hwpx',
    paragraphs: [
      { section: 0, paragraph: 0, text, selectionOwner: 'section:0:body', editable: true },
    ],
  });
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message: any) {
        if (message.kind === 'splice') {
          text = text.slice(0, message.startUnit) + message.text + text.slice(message.endUnit);
          return {
            kind: 'splice',
            content: content(),
            meta: { application: 'applied', changed: true },
          };
        }
        return { kind: message.kind, content: content() };
      },
      dispose() {},
    }),
  });
  try {
    await editor.load(new Uint8Array([1]), { format: 'hwpx' });
    const target = findTextMatch(editor.getEditorState(), '😀')!;
    await editor.setSelection(target);
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '나' });
    expect(result.status.startsWith('committed')).toBe(true);
    expect((editor.getEditorState().content as any).paragraphs[0].text).toBe('가 나 가');
    await expect(editor.setSelection(target)).rejects.toThrow('StaleTarget');
  } finally {
    await editor.dispose();
  }
});

test('backward literal search crosses Korean/emoji/table rows and cycles in source order', () => {
  const state = snapshot(),
    options = { direction: 'backward' as const };
  const table = findTextMatch(state, '가', options)!;
  expect([table.paragraph, table.startUnit, table.owner]).toEqual([
    1,
    4,
    'section:0:table:7:list:9',
  ]);
  const middle = findTextMatch(snapshot(table), '가', options)!;
  expect([middle.paragraph, middle.startUnit]).toEqual([0, 5]);
  const first = findTextMatch(snapshot(middle), '가', options)!;
  expect([first.paragraph, first.startUnit]).toEqual([0, 0]);
  expect(findTextMatch(snapshot(first), '가', options)).toEqual(table);
  const emoji = findTextMatch(snapshot(table), '😀', options)!;
  expect([emoji.startUnit, emoji.endUnit]).toEqual([2, 4]);
  expect(Object.isFrozen(emoji)).toBe(true);
  expect(selectionMatchesText(snapshot(emoji), '😀')).toBe(true);
});
test('backward index zero and single-match wrap do not rely on negative lastIndexOf coercion', () => {
  const one = { paragraphs: [{ ...rows[0], text: '가' }] },
    initial = snapshot(null, one);
  const hit = findTextMatch(initial, '가', { direction: 'backward', wrap: false })!;
  expect(hit.startUnit).toBe(0);
  expect(
    findTextMatch(snapshot(hit, one), '가', { direction: 'backward', wrap: false }),
  ).toBeNull();
  expect(findTextMatch(snapshot(hit, one), '가', { direction: 'backward' })).toEqual(hit);
  const longer = snapshot(null, { paragraphs: [{ ...rows[0], text: '가나' }] });
  const all = findTextMatch(longer, '가나')!;
  expect(
    findTextMatch(
      snapshot(
        { ...all, startUnit: 1, endUnit: 1 },
        { paragraphs: [{ ...rows[0], text: '가나' }] },
      ),
      '가나',
      { direction: 'backward', wrap: false },
    ),
  ).toBeNull();
});
test('no-wrap returns null at both edges and does not wrap through other rows', () => {
  const first = findTextMatch(snapshot(), '가')!,
    last = findTextMatch(snapshot(), '가', { direction: 'backward' })!;
  expect(findTextMatch(snapshot(first), '가', { direction: 'backward', wrap: false })).toBeNull();
  expect(findTextMatch(snapshot(last), '가', { wrap: false })).toBeNull();
  expect(
    findTextMatch(snapshot(last), '가', { direction: 'backward', wrap: false })?.startUnit,
  ).toBe(5);
  expect(findTextMatch(snapshot(first), '가', { wrap: false })?.startUnit).toBe(5);
  expect(findTextMatch(snapshot(), '없음', { direction: 'backward', wrap: false })).toBeNull();
});
test('document origin ignores selection; null selection uses first/last directional boundary', () => {
  const first = findTextMatch(snapshot(), '가')!,
    last = findTextMatch(snapshot(), '가', { direction: 'backward' })!;
  expect(findTextMatch(snapshot(last), '가', { origin: 'document', wrap: false })).toEqual(first);
  expect(
    findTextMatch(snapshot(first), '가', {
      direction: 'backward',
      origin: 'document',
      wrap: false,
    }),
  ).toEqual(last);
  expect(findTextMatch(snapshot(null), '가', { direction: 'backward', wrap: false })).toEqual(last);
  expect(findTextMatch(snapshot(null), '가', { wrap: false })).toEqual(first);
});
test('options reject unknown fields/types/accessors; literal scalar and owner/clipped rules remain intact', () => {
  for (const options of [
    null,
    [],
    { direction: 'reverse' },
    { wrap: 0 },
    { origin: 'page' },
    { extra: true },
    { wrap: null },
  ])
    expect(() => findTextMatch(snapshot(), '가', options as any)).toThrow('InvalidFindTextOptions');
  let reads = 0;
  expect(() =>
    findTextMatch(
      snapshot(),
      '가',
      Object.defineProperty({}, 'wrap', {
        get() {
          reads++;
          return true;
        },
      }),
    ),
  ).toThrow('InvalidFindTextOptions');
  expect(reads).toBe(0);
  const content = {
    paragraphs: [
      { ...rows[0], text: '[가]. 😀' },
      { ...rows[1], clipped: true },
      { section: 0, paragraph: 2, text: '[가].', editable: true },
    ],
  };
  const state = snapshot(null, content),
    hit = findTextMatch(state, '[가].', { direction: 'backward' })!;
  expect([hit.paragraph, hit.startUnit, hit.endUnit]).toEqual([0, 0, 4]);
  expect(findTextMatch(state, '😀', { direction: 'backward' })?.startUnit).toBe(5);
  expect(() => findTextMatch(state, '\ud83d', { direction: 'backward' })).toThrow(
    'InvalidSearchQuery',
  );
  expect(
    findTextMatch(snapshot(null, { paragraphs: [] }), '가', { direction: 'backward' }),
  ).toBeNull();
});
