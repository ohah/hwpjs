import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EditorState,
  createParagraphSelection,
  getSelectionFormatting,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '../../src/index.ts';
import { fontNameMessage } from '../../src/commands/font-name.ts';
import { characterFontNameObservations } from '../../src/state/font-name-state.ts';
import { FONT_LANGUAGES } from '../../../../js/font-face-identity.mjs';

function content() {
  return {
    format: 'hwpx',
    characterFontNameAvailable: true,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'ABCD😀',
        editable: true,
        selectionOwner: 'section:0:body',
        characterRanges: [
          { start: 0, end: 2, charShapeId: 1 },
          { start: 2, end: 6, charShapeId: 2 },
        ],
      },
    ],
    fontFaces: FONT_LANGUAGES.flatMap((language) =>
      [0, 1].map((id) => ({ language, id, name: language + id })),
    ),
    characterFontReferences: [
      { id: 1, fontIds: Array(7).fill(0) },
      { id: 2, fontIds: Array(7).fill(1) },
    ],
  };
}
function selected(c = content(), start = 0, end = 1) {
  const s = new EditorState({
    editorId: 'font',
    documentId: 'doc',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
    stateVersion: 4,
    status: 'ready',
    content: c,
  });
  const t = createParagraphSelection(s, {
    section: 0,
    paragraph: 0,
    startUnit: start,
    endUnit: end,
  });
  return { s: new EditorState({ ...s, content: c, selection: t }), t, c };
}
const message = (v: ReturnType<typeof selected>, extra = {}) =>
  fontNameMessage({ target: v.t, language: 'latin', name: 'New Font', ...extra } as any, v.s);
test('공개 typed 명령은 기존 transport의 언어/이름을 보존한다', () => {
  const v = selected();
  assert.equal(SET_CHARACTER_FONT_NAME_COMMAND.name, 'set-character-font-name');
  assert.deepEqual(message(v), {
    kind: 'character-font-name',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 1,
    language: 'latin',
    name: 'New Font',
  });
});
test('언어별 같은 ID는 독립 원이름이다', () => {
  const v = selected(),
    f = getSelectionFormatting(v.s);
  for (const language of FONT_LANGUAGES) {
    assert.deepEqual(f.fontNames[language], { kind: 'single', name: language + '0' });
    assert.equal(f.fontNameAvailableReasons[language], null);
  }
  assert.ok(Object.isFrozen(f.fontNames));
  assert.ok(Object.isFrozen(f.fontNames.latin));
});
test('혼합값과 실제 이름 mixed는 태그로 구분한다', () => {
  const v = selected(content(), 0, 4);
  assert.deepEqual(getSelectionFormatting(v.s).fontNames.latin, { kind: 'mixed' });
  const c = content();
  c.fontFaces.find((x) => x.language === 'latin' && x.id === 0)!.name = 'mixed';
  assert.deepEqual(getSelectionFormatting(selected(c).s).fontNames.latin, {
    kind: 'single',
    name: 'mixed',
  });
});
test('valid ID의 null이름과 부재 바인딩은 다르다', () => {
  const c = content();
  (c.fontFaces[0] as any).name = null;
  const v = selected(c);
  assert.deepEqual(getSelectionFormatting(v.s).fontNames.hangul, { kind: 'single', name: null });
  assert.equal(getSelectionFormatting(v.s).fontNameAvailableReasons.hangul, null);
  c.fontFaces = c.fontFaces.filter((x) => !(x.language === 'latin' && x.id === 0));
  const bad = selected(c);
  assert.deepEqual(getSelectionFormatting(bad.s).fontNames.latin, { kind: 'unknown' });
  assert.equal(
    getSelectionFormatting(bad.s).fontNameAvailableReasons.latin,
    'UnknownCharacterFontName',
  );
  assert.throws(() => message(bad), /UnknownCharacterFontName/);
});
for (const name of ['', '\ud800', '\udc00', '\ud800X'])
  test('빈값/비정상UTF16 거부 ' + JSON.stringify(name), () =>
    assert.throws(() => message(selected(), { name }), /InvalidFontName/),
  );
test('4096 UTF8 bytes 허용/4097과 다중바이트 초과 거부', () => {
  assert.equal(message(selected(), { name: 'a'.repeat(4096) }).name.length, 4096);
  assert.doesNotThrow(() => message(selected(), { name: '😀'.repeat(1024) }));
  assert.throws(() => message(selected(), { name: 'a'.repeat(4097) }), /LimitExceeded/);
  assert.throws(() => message(selected(), { name: '가'.repeat(1366) }), /LimitExceeded/);
});
test('공백/잘형성surrogate 이름은 정규화하지 않는다', () => {
  assert.equal(message(selected(), { name: '  😀 Font  ' }).name, '  😀 Font  ');
  assert.equal(message(selected(), { name: ' ' }).name, ' ');
});
test('언어 부재/숫자/잘못된 이름 거부', () => {
  for (const language of [undefined, null, 0, 'unknown', 'LATIN'])
    assert.throws(() => message(selected(), { language }), /InvalidCharacterFontLanguage/);
});
test('empty range와 surrogate 내부 선택 거부', () => {
  assert.throws(() => message(selected(content(), 1, 1)), /EmptyCharacterSelection/);
  assert.throws(() => selected(content(), 4, 5), /InvalidScalarBoundary/);
  assert.doesNotThrow(() => message(selected(content(), 4, 6)));
});
test('잘못된 owner와 stale token 거부', () => {
  const v = selected();
  assert.throws(() => message(v, { target: { ...v.t, owner: 'forged' } }), /InvalidSelectionOwner/);
  for (const key of ['operationRevision', 'viewRevision', 'generation'])
    assert.throws(() => message(v, { target: { ...v.t, [key]: 99 } }), /StaleTarget/);
});
test('지원 capability 부재는 원 FormattingCapabilityUnavailable', () => {
  const c = content();
  c.characterFontNameAvailable = false;
  assert.throws(() => message(selected(c)), /FormattingCapabilityUnavailable/);
});
test('불완전/중복/오류 font catalog는 권위를 획득하지 못한다', () => {
  for (const edit of [
    (c) => c.fontFaces.push({ ...c.fontFaces[0] }),
    (c) => c.characterFontReferences.push({ ...c.characterFontReferences[0] }),
    (c) => c.characterFontReferences[0].fontIds.pop(),
    (c) => (c.characterFontReferences[0].fontIds[0] = -1),
    (c) => (c.fontFacesError = 'ReadFailed'),
    (c) => (c.characterFontReferencesError = 'ReadFailed'),
  ]) {
    const c = content();
    edit(c);
    assert.throws(() => message(selected(c)), /UnknownCharacterFontName/);
  }
});
test('원 charshape span gap/중복 거부', () => {
  for (const ranges of [
    [{ start: 1, end: 2, charShapeId: 1 }],
    [
      { start: 0, end: 2, charShapeId: 1 },
      { start: 1, end: 3, charShapeId: 2 },
    ],
  ]) {
    const c = content();
    c.paragraphs[0].characterRanges = ranges;
    const v = selected(c, 0, 3);
    assert.throws(() => message(v), /UnknownCharacterFontName/);
  }
});
test('H5는 original reference 권한 계약을 유지한다', () => {
  const c = content() as any;
  c.format = 'hwp5';
  c.paragraphs[0].currentReference = { kind: 'created', section: 0, id: '87' };
  assert.throws(() => message(selected(c)), /UnsupportedFormattingReference/);
});
test('새 명령의 fontId/owner 옵션 또는 accessor는 거부한다', () => {
  for (const extra of [{ fontId: 7 }, { owner: 'forged' }])
    assert.throws(() => message(selected(), extra), /InvalidCharacterFontNamePayload/);
  const v = selected(),
    payload: any = { target: v.t, language: 'latin' };
  Object.defineProperty(payload, 'name', {
    get() {
      throw Error('GetterRan');
    },
    enumerable: true,
  });
  assert.throws(() => fontNameMessage(payload, v.s), /InvalidCharacterFontNamePayload/);
});
test('관측은 원문단/리소스/ID를 변경하지 않는다', () => {
  const c = content(),
    before = JSON.stringify(c);
  characterFontNameObservations(c, c.paragraphs[0], 0, 4);
  assert.equal(JSON.stringify(c), before);
});

test('n/2n/4n 실제 source/resource/span 방문은 선형이다', () => {
  const observations = [];
  const tracked = (rows: any[], key: string, counts: Record<string, number>) =>
    new Proxy(rows, {
      get(target, p, receiver) {
        if (typeof p === 'string' && /^(0|[1-9][0-9]*)$/.test(p)) counts[key]++;
        return Reflect.get(target, p, receiver);
      },
    });
  for (const n of [32, 64, 128]) {
    const count = { source: 0, faces: 0, refs: 0, spans: 0 };
    const last = {
      section: 0,
      paragraph: n - 1,
      text: 'a'.repeat(n),
      editable: true,
      characterRanges: tracked(
        Array.from({ length: n }, (_, i) => ({ start: i, end: i + 1, charShapeId: i })),
        'spans',
        count,
      ),
    };
    const c = {
      characterFontNameAvailable: true,
      paragraphs: tracked(
        Array.from({ length: n }, (_, i) =>
          i === n - 1
            ? last
            : { section: 0, paragraph: i, text: 'a', editable: true, characterRanges: [] },
        ),
        'source',
        count,
      ),
      fontFaces: tracked(
        FONT_LANGUAGES.flatMap((language) =>
          Array.from({ length: n }, (_, id) => ({
            language,
            id,
            name: 'F' + String(id).padStart(4, '0'),
          })),
        ),
        'faces',
        count,
      ),
      characterFontReferences: tracked(
        Array.from({ length: n }, (_, id) => ({ id, fontIds: Array(7).fill(id) })),
        'refs',
        count,
      ),
    };
    const r = characterFontNameObservations(c, last, 0, n);
    assert.equal(r.latin.bindingValid, true);
    assert.deepEqual(r.latin.value, { kind: 'mixed' });
    observations.push({ n, ...count });
  }
  for (let i = 1; i < observations.length; i++)
    for (const key of ['source', 'faces', 'refs', 'spans'])
      assert.equal(observations[i][key], observations[i - 1][key] * 2, key);
  console.log(
    JSON.stringify({
      scope: '실helper Proxy 배열 element방문/권위없는synthetic관측',
      observations,
      resourceMapBuildsPerCall: 1,
      perRunFontArrayFinds: 0,
    }),
  );
});

test('noDOM import와 codec 없는 새 명령 실행은 분리한다', () => {
  for (const mode of ['root', 'font-no-codec']) {
    const child = spawnSync(
      process.execPath,
      [
        '--no-install',
        new URL('../helpers/character-font-name-no-dom.mjs', import.meta.url).pathname,
        mode,
      ],
      { encoding: 'utf8', env: process.env },
    );
    assert.equal(child.status, 0, child.stdout + child.stderr);
    console.log(child.stdout.trim());
  }
});
test('필수 language는 자기 data field여야 한다', () => {
  const v = selected();
  const inherited = Object.assign(Object.create({ language: 'latin' }), {
    target: v.t,
    name: 'Font',
  });
  assert.throws(() => fontNameMessage(inherited, v.s), /InvalidCharacterFontNamePayload/);
});
