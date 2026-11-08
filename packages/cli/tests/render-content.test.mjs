import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../src/render.ts';
import { createDisplayEscaper } from '../src/render-escape.ts';
import {
  buildObjectReference,
  parseObjectReference,
  canonicalImageId,
} from '../src/object-reference.ts';

let ordinal = 0;
const paragraph = (displayText) => ({
  id: 'p:' + ordinal++,
  type: 'paragraph',
  displayText,
  source: { section: 0, paragraph: 0 },
  editability: 'unknown',
});
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
const model = (body = []) => ({
  version: 1,
  format: 'hwp5',
  sourceSha256: 'a'.repeat(64),
  sections: [{ id: 'section', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
const cell = (row, column, blocks = [], extra = {}) => ({
  id: 'c:' + ordinal++,
  row,
  column,
  rowSpan: 1,
  columnSpan: 1,
  geometryKnown: true,
  contentState: 'observed',
  blocks,
  ...extra,
});
const table = (rows, columns, cells) => ({
  id: 't:' + ordinal++,
  type: 'table',
  rows,
  columns,
  cells,
});
const image = (extra = {}) => ({
  id: 'i:' + ordinal++,
  type: 'image',
  altState: 'not-exposed',
  alt: null,
  sourceInfo: { resourceId: 123 },
  ...extra,
});
const render = (value, format = 'text', options = {}) =>
  renderDocument(value, { format, ...options });
const definition = (kind, blocks) => ({
  id: 'd:' + ordinal++,
  kind,
  apply: 'both',
  range: { state: 'unresolved' },
  blocks,
});

test('기본 내용은 원문만 쓰며 구조용 문자열도 원문이면 보존한다', () => {
  const source = 'Paragraph s0:p0 Table Cell documentSHA256: 2026-11-08 (010-1234-5678).';
  const value = model([paragraph(source)]);
  assert.equal(render(value), source + '\n');
  assert.equal(render(value, 'markdown'), source + '\n');
  assert.equal(render(value, 'text', { view: 'content' }), render(value));
  assert.match(render(value, 'text', { view: 'structure' }), /Section section/);
  assert.throws(() => render(value, 'text', { view: 'other' }), /InvalidRenderView/);
});

test('문단과 빈 문단을 유지하고 Markdown 문단은 빈 줄로 나눈다', () => {
  const value = model([paragraph('앞'), paragraph(''), paragraph('뒤')]);
  assert.equal(render(value), '앞\n\n뒤\n');
  assert.equal(render(value, 'markdown'), '앞\n\n\n\n뒤\n');
  assert.equal(render(model([paragraph('')])), '\n');
  assert.equal(render(model([])), '');
});

test('본문 문법·HTML·제어문자를 보호하되 일반 날짜와 전화번호 구두점은 유지한다', () => {
  const cases = [
    ['# 제목', '\\# 제목'],
    ['- 목록', '\\- 목록'],
    ['+ 목록', '\\+ 목록'],
    ['1. 항목', '1\\. 항목'],
    ['2) 항목', '2\\) 항목'],
    ['---', '\\-\\-\\-'],
    ['> 인용', '\\> 인용'],
    ['    코드', '&#32;   코드'],
    ['2026-11-08 (010-1234-5678).', '2026-11-08 (010-1234-5678).'],
    [
      '<script>&copy; | * _ ` [링크](url)',
      '\\<script\\>&amp;copy; \\| \\* \\_ \\` \\[링크\\](url)',
    ],
    ['🙂\u001b\ud800\n', '🙂\\\\u001b\\\\ud800\\\\u000a'],
  ];
  for (const [source, expected] of cases)
    assert.equal(render(model([paragraph(source)]), 'markdown'), expected + '\n');
});

test('머리말·꼬리말은 실제 내용이 있을 때만 표시하고 상속을 복제하지 않는다', () => {
  const value = model([paragraph('본문')]);
  value.sections[0].header.definitions.push(definition('header', [paragraph('머릿글')]));
  value.sections[0].footer.definitions.push(definition('footer', [paragraph('꼬릿글')]));
  assert.equal(render(value), '머리말\n머릿글\n본문\n꼬리말\n꼬릿글\n');
  assert.equal(render(value, 'markdown'), '머리말\n\n머릿글\n\n본문\n\n꼬리말\n\n꼬릿글\n');
  const empty = model([paragraph('본문')]);
  empty.sections[0].header.definitions.push(definition('header', [paragraph('')]));
  assert.equal(render(empty).includes('머리말'), false);
  assert.equal(render(empty).includes('inheritance'), false);
});

test('이미지는 관측된 대체 설명 또는 이미지 표식만 노출한다', () => {
  const value = model([
    image(),
    image({ altState: 'provided', alt: '관측 설명' }),
    image({ altState: 'not-provided', alt: '노출하지 않을 값' }),
    image({ altState: 'provided', alt: '' }),
  ]);
  assert.equal(
    render(value),
    '[이미지: 추출 참조 확인 불가]\n[이미지: 추출 참조 확인 불가] 관측 설명\n[이미지: 추출 참조 확인 불가]\n[이미지: 추출 참조 확인 불가]\n',
  );
  assert.equal(render(value).includes('123'), false);
});

test('완전히 관측된 단순표만 좌표 순서로 쓰고 첫 데이터행을 헤더로 승격하지 않는다', () => {
  const value = model([
    table(2, 2, [
      cell(1, 1, [paragraph('D')]),
      cell(0, 1, [paragraph('B')]),
      cell(1, 0, [paragraph('C')]),
      cell(0, 0, [paragraph('A')]),
    ]),
  ]);
  assert.equal(render(value), 'A\tB\nC\tD\n');
  assert.equal(render(value, 'markdown'), '|  |  |\n| --- | --- |\n| A | B |\n| C | D |\n');
});

test('표 안 여러 문단은 안전한 구분자를 쓰고 앞뒤 문단과 표를 구분한다', () => {
  const value = model([
    paragraph('앞'),
    table(1, 1, [cell(0, 0, [paragraph('a|<br>'), paragraph(''), paragraph('b')])]),
    paragraph('뒤'),
  ]);
  assert.equal(render(value), '앞\na|<br> /  / b\n뒤\n');
  assert.equal(
    render(value, 'markdown'),
    '앞\n\n|  |\n| --- |\n| a\\|\\<br\\><br><br><br><br>b |\n\n뒤\n',
  );
});

test('희소·거대·병합·중복·범위밖·미관측 기하는 관측 셀만 표시한다', () => {
  const variants = [
    [4_000_000_000, 4_000_000_000, {}],
    [1, 1, { rowSpan: 2 }],
    [1, 1, { column: 1 }],
    [1, 1, { row: null, geometryKnown: false }],
    [1, 1, { contentState: 'not-observed' }],
  ];
  for (const [rows, columns, extra] of variants) {
    const out = render(model([table(rows, columns, [cell(0, 0, [paragraph('유일내용')], extra)])]));
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.split('유일내용').length, 2);
    assert.ok(out.length < 300);
  }
  const duplicate = model([
    table(1, 2, [cell(0, 0, [paragraph('A')]), cell(0, 0, [paragraph('B')])]),
  ]);
  assert.match(render(duplicate), /표 배치를 단순화/);
  assert.match(render(model([table(0, 0, [])])), /관측된 셀 없음/);
});

test('중첩표와 행병합은 텍스트를 복제하지 않고 경계를 드러낸다', () => {
  const inner = table(1, 1, [cell(0, 0, [paragraph('중첩본문')])]);
  const value = model([
    table(2, 2, [
      cell(0, 0, [paragraph('병합본문'), inner], { rowSpan: 2 }),
      cell(0, 1, [paragraph('우측')]),
    ]),
  ]);
  for (const format of ['text', 'markdown']) {
    const out = render(value, format);
    assert.equal(out.split('병합본문').length, 2);
    assert.equal(out.split('중첩본문').length, 2);
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.includes('[셀 경계]'), false);
    assert.equal(out.includes('[관측된 행]'), false);
  }
});

test('미관측 문단·미지원·미배치·실패는 짧은 표식으로 보존한다', () => {
  const value = model([
    paragraph(null),
    {
      id: 'unknown',
      type: 'unknown',
      kind: 'native',
      diagnostic: { code: 'secret-code', message: 'secret-message' },
    },
  ]);
  value.unplaced.push({
    block: paragraph('위치 없는 실제내용'),
    diagnostic: { code: 'unplaced-code', message: 'message' },
  });
  value.sections[0].header.declarations = 'unavailable';
  value.coverage.inventoryComplete = false;
  value.warnings.push({ code: 'warning-code', message: 'message' });
  const out = render(value);
  for (const text of [
    '문단 내용 확인 불가',
    '알 수 없는 내용',
    '위치를 확인할 수 없는 내용',
    '위치 없는 실제내용',
    '머리말 확인 불가',
    '관측이 불완전',
  ])
    assert.ok(out.includes(text));
  assert.equal(out.includes('secret-'), false);
  assert.equal(out.includes('warning-code'), false);
});

test('내용 모드도 전체 검증과 실제 이스케이프 출력 예산을 적용한다', () => {
  const value = model([paragraph('a')]);
  assert.equal(render(value, 'text', { maxOutputUnits: 2 }), 'a\n');
  assert.throws(() => render(value, 'text', { maxOutputUnits: 1 }), /RenderOutputLimitExceeded/);
  assert.throws(
    () => render(model([paragraph('<')]), 'markdown', { maxOutputUnits: 2 }),
    /RenderOutputLimitExceeded/,
  );
  const invalid = model([paragraph('a')]);
  invalid.sections[0].body.push({ ...paragraph('b'), id: invalid.sections[0].body[0].id });
  assert.throws(() => render(invalid), /DuplicateOrEmptyRenderId/);
  assert.throws(
    () => render(model([paragraph('a')]), 'text', { maxNodes: 1 }),
    /RenderNodeLimitExceeded/,
  );
  assert.throws(
    () => render(model([paragraph('a')]), 'text', { maxTextUnits: 1 }),
    /RenderTextLimitExceeded/,
  );
});

test('입력 동결 모델을 변경하지 않으며 원시 텍스트 대체값을 읽지 않는다', () => {
  const block = paragraph(null);
  Object.defineProperty(block, 'text', {
    get() {
      throw new Error('읽으면 안 되는 원시 값');
    },
  });
  const value = model([block]);
  const freeze = (object) => {
    for (const child of Object.values(object))
      if (child && typeof child === 'object') freeze(child);
    Object.freeze(object);
  };
  freeze(value);
  assert.equal(render(value), '[문단 내용 확인 불가]\n');
});

test('작은 병합 3×4 표는 전체 덮임을 증명한 슬롯만 비우고 본문을 복제하지 않는다', () => {
  const value = model([
    table(3, 4, [
      cell(0, 0, [paragraph('병합')], { rowSpan: 2, columnSpan: 2 }),
      cell(0, 2, [paragraph('가')]),
      cell(0, 3, [paragraph('나')]),
      cell(1, 2, [paragraph('다')]),
      cell(1, 3, [paragraph('라')]),
      cell(2, 0, [paragraph('마')]),
      cell(2, 1, [paragraph('바')]),
      cell(2, 2, [paragraph('사')]),
      cell(2, 3, [paragraph('아')]),
    ]),
  ]);
  assert.equal(render(value), '병합\t\t가\t나\n\t\t다\t라\n마\t바\t사\t아\n');
  assert.equal(
    render(value, 'markdown'),
    '|  |  |  |  |\n| --- | --- | --- | --- |\n| 병합 |  | 가 | 나 |\n|  |  | 다 | 라 |\n| 마 | 바 | 사 | 아 |\n',
  );
});

test('병합의 구멍·겹침·과도한 슬롯 확장은 빈 내용으로 위장하지 않는다', () => {
  const cases = [
    table(2, 2, [cell(0, 0, [paragraph('구멍')], { columnSpan: 2 })]),
    table(1, 2, [
      cell(0, 0, [paragraph('겹침')], { columnSpan: 2 }),
      cell(0, 1, [paragraph('두번째')]),
    ]),
    table(1, 9, [cell(0, 0, [paragraph('상수배 제한')], { columnSpan: 9 })]),
    table(1, 4097, [cell(0, 0, [paragraph('절대 제한')], { columnSpan: 4097 })]),
  ];
  for (const value of cases) {
    const out = render(model([value]), 'markdown');
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.includes('| ---'), false);
    assert.ok(out.length < 150);
  }
});

test('큰 복합표의 표식은 표당 한 번이고 관측 본문은 원문 셀 순서를 유지한다', () => {
  const value = model([
    table(4_000_000_000, 4_000_000_000, [
      cell(99, 8, [paragraph('먼저')], { rowSpan: 10 }),
      cell(1, 0, [paragraph('나중')]),
      cell(99, 9, [paragraph('마지막')]),
    ]),
  ]);
  const out = render(value);
  assert.equal(out, '[표 배치를 단순화했습니다: 관측된 내용 순서]\n먼저\n나중\n마지막\n');
});

test('인접한 Markdown 표 사이에도 빈 줄을 두고 표 내부에는 삽입하지 않는다', () => {
  const value = model([
    table(1, 1, [cell(0, 0, [paragraph('A')])]),
    table(1, 1, [cell(0, 0, [paragraph('B')])]),
  ]);
  assert.equal(render(value, 'markdown'), '|  |\n| --- |\n| A |\n\n|  |\n| --- |\n| B |\n');
});

test('작은 격자 조합의 병합·역순 입력에서 관측 앵커만 한 번 출력한다', () => {
  for (let rows = 1; rows <= 5; rows++) {
    for (let columns = 1; columns <= 5; columns++) {
      const cells = [];
      const expected = [];
      for (let row = 0; row < rows; row++) {
        const values = [];
        for (let column = 0; column < columns;) {
          const span = column + 1 < columns && (row + column) % 3 === 0 ? 2 : 1;
          const text = '좌표본문' + row + ':' + column;
          cells.push(cell(row, column, [paragraph(text)], { columnSpan: span }));
          values.push(text);
          if (span === 2) values.push('');
          column += span;
        }
        expected.push(values.join('\t'));
      }
      assert.equal(
        render(model([table(rows, columns, cells.reverse())])),
        expected.join('\n') + '\n',
      );
    }
  }
});

test('내용 출력 예산은 표·문단 구분·HTML 구분자·실패 표식까지 정확히 계산한다', () => {
  const value = model([
    paragraph('<&'),
    table(1, 1, [cell(0, 0, [paragraph('|'), paragraph('두번째')])]),
    image(),
  ]);
  value.coverage.inventoryComplete = false;
  for (const format of ['text', 'markdown']) {
    const expected = render(value, format);
    assert.equal(render(value, format, { maxOutputUnits: expected.length }), expected);
    assert.throws(
      () => render(value, format, { maxOutputUnits: expected.length - 1 }),
      /RenderOutputLimitExceeded/,
    );
  }
});

test('넓은 완전 관측 표도 정렬 없이 출력하며 출력 한도 초과를 거부한다', () => {
  const cells = [];
  for (let row = 0; row < 64; row++)
    for (let column = 0; column < 64; column++) cells.push(cell(row, column, [paragraph('값')]));
  const value = model([table(64, 64, cells.reverse())]);
  const originalSort = Array.prototype.sort;
  let out;
  try {
    Array.prototype.sort = () => {
      throw new Error('정렬 금지');
    };
    out = render(value);
  } finally {
    Array.prototype.sort = originalSort;
  }
  assert.equal(out, (Array(64).fill('값').join('\t') + '\n').repeat(64));
  assert.throws(
    () => render(value, 'markdown', { maxOutputUnits: 100 }),
    /RenderOutputLimitExceeded/,
  );
});

test('내용 모드도 중첩 깊이·순환·미지원 스키마를 완화하지 않는다', () => {
  let block = paragraph('깊은 실제본문');
  for (let i = 0; i < 10; i++) block = table(1, 1, [cell(0, 0, [block])]);
  const value = model([block]);
  assert.equal(render(value).split('깊은 실제본문').length, 2);
  assert.throws(() => render(value, 'text', { maxDepth: 4 }), /RenderDepthLimitExceeded/);
  const circular = table(1, 1, []);
  circular.cells.push(cell(0, 0, [circular]));
  assert.throws(() => render(model([circular])), /RepeatedRenderNodeOrCycle/);
  assert.throws(
    () => render(model([{ id: 'invalid', type: 'unexpected' }])),
    /UnsupportedRenderBlockType/,
  );
});

test('공통 표시 factory는 형식·보기·문자열만 허용하고 암묵적 변환을 하지 않는다', () => {
  for (const options of [undefined, null, [], 'text', {}, { format: 'html' }])
    assert.throws(() => createDisplayEscaper(options), /InvalidRenderFormat/);
  for (const view of [null, false, '', 'other'])
    assert.throws(() => createDisplayEscaper({ format: 'text', view }), /InvalidRenderView/);
  const escape = createDisplayEscaper({ format: 'text' });
  const object = {
    toString() {
      throw new Error('암묵적 변환 금지');
    },
  };
  for (const input of [undefined, null, 1, false, [], object, new String('문자열 객체')])
    assert.throws(() => escape(input), /InvalidRenderString/);
  assert.equal(escape(''), '');
});

test('공통 표시 factory는 파일명·메시지의 HTML·C1·bidi·고립 surrogate를 같은 정책으로 보호한다', () => {
  const source = '<img src=x>&copy;\u0085\u009b\u202e\u2066\ud800🙂';
  const text = '\\u0085\\u009b\\u202e\\u2066\\ud800🙂';
  const expectedMarkdown = '\\<img src=x\\>&amp;copy;' + text.replace(/\\/gu, '\\\\');
  for (const view of ['content', 'structure']) {
    const escape = createDisplayEscaper({ format: 'text', view });
    assert.equal(escape(source), '<img src=x>&copy;' + text);
    assert.equal(escape(source), escape(source));
  }
  const escape = createDisplayEscaper({ format: 'markdown' });
  assert.equal(escape(source), expectedMarkdown);
  assert.equal(render(model([paragraph(source)]), 'markdown'), escape(source) + '\n');
  assert.equal(
    createDisplayEscaper({ format: 'markdown', view: 'structure' })('2026-11-08 (전화).'),
    '2026\\-11\\-08 \\(전화\\)\\.',
  );
});

test('공통 표시 factory 재사용은 줄 시작 보호와 날짜 구두점 정책을 바꾸지 않는다', () => {
  const escape = createDisplayEscaper({ format: 'markdown', view: 'content' });
  for (let i = 0; i < 3; i++) {
    assert.equal(escape('# 제목'), '\\# 제목');
    assert.equal(escape('2026-11-08 (010-1234-5678).'), '2026-11-08 (010-1234-5678).');
    assert.equal(escape('1. 원문'), '1\\. 원문');
    assert.equal(
      escape('Paragraph s0:p0 Table Cell documentSHA256:'),
      'Paragraph s0:p0 Table Cell documentSHA256:',
    );
  }
});

test('단독 목록 마커는 공백 없이 끝나도 Markdown 내용에서 문자로 보호한다', () => {
  const escape = createDisplayEscaper({ format: 'markdown' });
  const markers = [
    ['-', '\\-'],
    ['+', '\\+'],
    ['1.', '1\\.'],
    ['1)', '1\\)'],
    ['0.', '0\\.'],
    ['999999999)', '999999999\\)'],
  ];
  for (let spaces = 0; spaces <= 3; spaces++) {
    const indent = ' '.repeat(spaces);
    for (const [source, expected] of markers) {
      assert.equal(escape(indent + source), indent + expected);
      assert.equal(createDisplayEscaper({ format: 'text' })(indent + source), indent + source);
    }
  }
  for (const source of ['-3', '+3', '1.2', '1)본문', '1234567890.', '2026-11-08'])
    assert.equal(escape(source), source);
});

test('단독 목록 마커 문단과 연속 문단은 목록 의미를 만들지 않고 원본 모델을 보존한다', () => {
  const sources = ['-', '+', '1.', '1)', '  -'];
  const expected = ['\\-', '\\+', '1\\.', '1\\)', '  \\-'];
  for (let i = 0; i < sources.length; i++) {
    const value = model([paragraph(sources[i])]);
    const original = structuredClone(value);
    assert.equal(render(value, 'markdown'), expected[i] + '\n');
    assert.equal(render(value), sources[i] + '\n');
    assert.deepEqual(value, original);
  }
  const value = model(sources.map(paragraph));
  const original = structuredClone(value);
  assert.equal(render(value, 'markdown'), expected.join('\n\n') + '\n');
  assert.equal(render(value), sources.join('\n') + '\n');
  assert.deepEqual(value, original);
});

const reference = (kind, node, extra = {}) =>
  buildObjectReference({
    sourceSha256: 'a'.repeat(64),
    format: 'hwp5',
    section: 0,
    kind,
    node,
    ...extra,
  });
const referencedImage = (node) =>
  image({
    reference: reference('image', node),
    sourceInfo: { section: 0, pictureNode: node },
  });

test('개체 참조는 모든 허용 종류·형식의 canonical uint32를 왕복하고 실제 이미지 ID와 구분한다', () => {
  for (const format of ['hwp5', 'hwpx']) {
    for (const kind of ['image', 'table', 'chart', 'equation', 'drawing', 'ole', 'unknown']) {
      for (const node of [0, 0xffffffff]) {
        const fields = { sourceSha256: 'a'.repeat(64), format, section: node, kind, node };
        const ref = buildObjectReference(fields);
        assert.deepEqual(parseObjectReference(ref), fields);
        assert.equal(buildObjectReference(parseObjectReference(ref)), ref);
        assert.deepEqual(
          parseObjectReference(ref, { sourceSha256: fields.sourceSha256, format }),
          fields,
        );
      }
    }
    assert.equal(canonicalImageId({ format, section: 2, node: 123 }), format + ':s2:i123');
  }
});

test('개체 참조 parser와 builder는 경로·외부URL·비정규 수치·잘못된 필드·stale 문서를 거부한다', () => {
  const valid = reference('image', 12);
  const prefix = 'hwpjs-object:' + 'a'.repeat(64) + '/hwp5/';
  const invalid = [
    undefined,
    null,
    {},
    [],
    '',
    'https://example.com/image',
    valid + '\n',
    valid + '\r',
    valid + '/extra',
    valid + '?x=1',
    valid + '#part',
    prefix + 's00/image/12',
    prefix + 's0/image/012',
    prefix + 's-1/image/12',
    prefix + 's0/image/+12',
    prefix + 's0/image/1e2',
    prefix + 's0/image/4294967296',
    prefix + 's4294967296/image/12',
    prefix + 's0/Image/12',
    prefix + 's0/video/12',
    prefix + 's0/image/%31%32',
    prefix + 's0/image/../12',
    valid.replace('hwp5', 'HWP5'),
    valid.replace('a'.repeat(64), 'A'.repeat(64)),
  ];
  for (const value of invalid)
    assert.throws(() => parseObjectReference(value), /InvalidObjectReference/);
  for (const fields of [
    null,
    { sourceSha256: undefined },
    { format: 'other' },
    { sourceSha256: 'a'.repeat(64) + '\n' },
    { kind: 'video' },
    { section: -0 },
    { node: -1 },
    { node: 0x100000000 },
    { node: '1' },
  ]) {
    const value =
      fields === null
        ? null
        : {
            sourceSha256: 'a'.repeat(64),
            format: 'hwp5',
            section: 0,
            kind: 'image',
            node: 1,
            ...fields,
          };
    assert.throws(() => buildObjectReference(value), /InvalidObjectReferenceFields/);
  }
  assert.throws(
    () => parseObjectReference(valid, { sourceSha256: 'b'.repeat(64) }),
    /StaleObjectReference/,
  );
  assert.throws(
    () => parseObjectReference(valid, { format: 'hwpx' }),
    /ObjectReferenceFormatMismatch/,
  );
  assert.throws(
    () => parseObjectReference(valid, { sourceSha256: 'a'.repeat(64) + '\n' }),
    /InvalidObjectReferenceExpectation/,
  );
  assert.throws(() => parseObjectReference(valid, null), /InvalidObjectReference/);
  assert.throws(
    () => canonicalImageId({ format: 'hwp5', section: -1, node: 1 }),
    /InvalidImageIdentity/,
  );
});

test('이미지 참조는 번호와 관측 설명을 보여주며 fallback 이미지에서 ID를 만들지 않는다', () => {
  const ref = reference('image', 55);
  const value = model([
    image({
      reference: ref,
      sourceInfo: { section: 0, pictureNode: 55, recordNode: 99 },
      altState: 'provided',
      alt: '관측 | 설명',
    }),
    image({ reference: null }),
    image({ metadata: { href: 'https://fake/image' }, sourceInfo: { pictureNode: 100 } }),
  ]);
  assert.equal(
    render(value),
    '[이미지 1: ' +
      ref +
      '] 관측 | 설명\n[이미지: 추출 참조 확인 불가]\n[이미지: 추출 참조 확인 불가]\n',
  );
  assert.equal(
    render(value, 'markdown'),
    '![이미지 1](' +
      ref +
      ') 관측 \\| 설명\n\n[이미지: 추출 참조 확인 불가]\n\n[이미지: 추출 참조 확인 불가]\n',
  );
  assert.equal(render(value).includes('https://'), false);
  const structure = render(value, 'text', { view: 'structure' });
  assert.ok(structure.includes(value.sections[0].body[0].id));
  assert.ok(structure.includes('Reference ' + ref));
});

test('표·이미지·차트의 공개 순번은 출력 순회에서 전역 결정적이며 실제 표 내용을 유지한다', () => {
  const imageRef = reference('image', 2);
  const tableRef = reference('table', 1);
  const chartRef = reference('chart', 3);
  const observedTable = {
    ...table(1, 1, [cell(0, 0, [referencedImage(2)])]),
    reference: tableRef,
    source: { section: 0, tableNode: 1 },
  };
  const chart = {
    id: 'chart',
    type: 'unknown',
    kind: 'chart',
    reference: chartRef,
    source: { section: 0, node: 3 },
    diagnostic: { code: 'not-read', message: 'not-read' },
  };
  const value = model([observedTable, chart, paragraph('실제 본문')]);
  const original = structuredClone(value);
  const markdown = render(value, 'markdown');
  assert.ok(markdown.includes('[표 1](' + tableRef + ')'));
  assert.ok(markdown.includes('| ![이미지 2](' + imageRef + ') |'));
  assert.ok(markdown.includes('[차트 3](' + chartRef + ') [내용 확인 불가]'));
  assert.ok(markdown.includes('실제 본문'));
  assert.equal(markdown, render(value, 'markdown'));
  assert.deepEqual(value, original);
});

test('관측된 개체 종류만 명명하며 이미지 없는 모델에서 차트를 추측하지 않는다', () => {
  const blocks = [];
  for (const kind of ['chart', 'equation', 'drawing', 'ole', 'unknown'])
    blocks.push({
      id: kind,
      type: 'unknown',
      kind,
      reference: reference(kind, blocks.length),
      source: { section: 0, node: blocks.length },
      diagnostic: { code: 'unsupported', message: 'unsupported' },
    });
  const out = render(model(blocks));
  for (const name of ['차트 1', '수식 2', '도형 3', '임베디드 개체 4', '알 수 없는 개체 5'])
    assert.ok(out.includes(name));
  assert.equal(render(model([image()])).includes('차트'), false);
});

test('renderer는 문서·종류·source·중복 참조를 검증한 뒤에만 출력한다', () => {
  const bad = [
    image({ reference: reference('image', 1, { sourceSha256: 'b'.repeat(64) }) }),
    image({ reference: reference('image', 1, { format: 'hwpx' }) }),
    image({ reference: reference('table', 1) }),
    image({ reference: 'https://fake/image' }),
    image({ reference: reference('image', 1), sourceInfo: { section: 1, pictureNode: 1 } }),
    image({ reference: reference('image', 1), sourceInfo: { section: 0, pictureNode: 2 } }),
  ];
  for (const block of bad)
    for (const view of ['content', 'structure'])
      assert.throws(() => render(model([block]), 'markdown', { view }));
  assert.throws(
    () => render(model([referencedImage(1), referencedImage(1)])),
    /DuplicateObjectReference/,
  );
  const missingSha = model([referencedImage(1)]);
  delete missingSha.sourceSha256;
  assert.throws(() => render(missingSha), /InvalidDocumentReferenceSource/);
  assert.throws(
    () => render(model([{ ...paragraph('본문'), reference: reference('unknown', 1) }])),
    /ObjectReferenceKindMismatch/,
  );
});

test('개체 참조와 순번도 공통 출력 예산에 포함하며 일부 결과를 절단하지 않는다', () => {
  const value = model([referencedImage(1)]);
  for (const format of ['text', 'markdown']) {
    const expected = render(value, format);
    assert.equal(render(value, format, { maxOutputUnits: expected.length }), expected);
    assert.throws(
      () => render(value, format, { maxOutputUnits: expected.length - 1 }),
      /RenderOutputLimitExceeded/,
    );
  }
});

test('머리말·중첩표·꼬리말·미배치 개체의 순번을 공유하고 원본 내부 ID를 노출 순번으로 바꾸지 않는다', () => {
  const first = referencedImage(100);
  const nested = {
    ...table(1, 1, [cell(0, 0, [referencedImage(200)])]),
    reference: reference('table', 20),
    source: { section: 0, tableNode: 20 },
  };
  const value = model([nested]);
  value.sections[0].header.definitions.push(definition('header', [first]));
  value.sections[0].footer.definitions.push(definition('footer', [referencedImage(300)]));
  value.unplaced.push({
    block: referencedImage(400),
    diagnostic: { code: 'unplaced', message: 'unplaced' },
  });
  const original = structuredClone(value);
  const out = render(value);
  for (const [label, ref] of [
    ['이미지 1', first.reference],
    ['표 2', nested.reference],
    ['이미지 3', reference('image', 200)],
    ['이미지 4', reference('image', 300)],
    ['이미지 5', reference('image', 400)],
  ])
    assert.ok(out.includes('[' + label + ': ' + ref + ']'));
  assert.deepEqual(value, original);
  assert.equal(canonicalImageId(parseObjectReference(first.reference)), 'hwp5:s0:i100');
});

test('개체 참조 builder는 검증한 필드를 한 번 포착해 getter의 후속 값으로 바꾸지 않는다', () => {
  let kindReads = 0;
  const fields = {
    sourceSha256: 'a'.repeat(64),
    format: 'hwp5',
    section: 0,
    node: 1,
    get kind() {
      return ++kindReads === 1 ? 'image' : 'image/../fake';
    },
  };
  assert.equal(buildObjectReference(fields), reference('image', 1));
  assert.equal(kindReads, 1);
  let nodeReads = 0;
  assert.equal(
    canonicalImageId({
      format: 'hwp5',
      section: 0,
      get node() {
        return ++nodeReads === 1 ? 1 : 'fake';
      },
    }),
    'hwp5:s0:i1',
  );
  assert.equal(nodeReads, 1);
});

test('null·구형 미지정 이미지 참조는 관측 alt를 보존하면서 추출 참조 미확인을 명시한다', () => {
  for (const reference of [null, undefined]) {
    const value = model([image({ reference, altState: 'provided', alt: '관측 | 설명 <그림>' })]);
    assert.equal(render(value), '[이미지: 추출 참조 확인 불가] 관측 | 설명 <그림>\n');
    assert.equal(
      render(value, 'markdown'),
      '[이미지: 추출 참조 확인 불가] 관측 \\| 설명 \\<그림\\>\n',
    );
    assert.equal(render(value, 'markdown').includes('hwpjs-object:'), false);
    assert.equal(render(value, 'markdown').includes('!['), false);
  }
  assert.equal(render(model([paragraph('[이미지]')])), '[이미지]\n');
});

test('참조가 있는 개체는 source 객체와 section·정식 node 키가 없으면 광고하지 않는다', () => {
  for (const kind of ['image', 'table', 'chart', 'equation', 'drawing', 'ole', 'unknown']) {
    const sourceKey = kind === 'image' ? 'sourceInfo' : 'source';
    const nodeKey = kind === 'image' ? 'pictureNode' : kind === 'table' ? 'tableNode' : 'node';
    const shapes = [
      {},
      { section: 0 },
      { [nodeKey]: 1 },
      undefined,
      null,
      { section: null, [nodeKey]: 1 },
      { section: 0, [nodeKey]: null },
      Object.assign([], { section: 0, [nodeKey]: 1 }),
    ];
    for (const source of shapes) {
      const block =
        kind === 'image'
          ? image()
          : kind === 'table'
            ? table(1, 1, [])
            : {
                id: kind,
                type: 'unknown',
                kind,
                diagnostic: { code: 'deferred', message: 'deferred' },
              };
      block.reference = reference(kind, 1);
      block[sourceKey] = source;
      for (const format of ['text', 'markdown'])
        for (const view of ['content', 'structure'])
          assert.throws(
            () => render(model([block]), format, { view }),
            /ObjectReferenceSourceMismatch/,
          );
    }
  }
});

test('참조 없는 레거시 모델은 source 위치가 없어도 기존 관측 내용을 유지한다', () => {
  for (const reference of [null, undefined]) {
    const value = model([
      image({ reference, sourceInfo: {}, altState: 'provided', alt: '관측 설명' }),
      { ...table(1, 1, [cell(0, 0, [paragraph('관측 셀')])]), reference },
      {
        id: 'legacy-chart',
        type: 'unknown',
        kind: 'chart',
        reference,
        diagnostic: { code: 'unavailable', message: 'unavailable' },
      },
    ]);
    for (const view of ['content', 'structure']) {
      const out = render(value, 'text', { view });
      assert.ok(out.includes('관측 설명'));
      assert.ok(out.includes('관측 셀'));
      assert.equal(out.includes('hwpjs-object:'), false);
    }
  }
});

test('참조 getter는 한 번만 읽고 본문·구조의 모든 출력에는 검증한 값만 쓴다', () => {
  for (const kind of ['image', 'table', 'chart', 'equation', 'drawing', 'ole', 'unknown'])
    for (const format of ['text', 'markdown'])
      for (const view of ['content', 'structure']) {
        const valid = reference(kind, 55);
        const block =
          kind === 'image'
            ? referencedImage(55)
            : kind === 'table'
              ? { ...table(1, 1, []), source: { section: 0, tableNode: 55 } }
              : {
                  id: kind,
                  type: 'unknown',
                  kind,
                  source: { section: 0, node: 55 },
                  diagnostic: { code: 'deferred', message: 'deferred' },
                };
        let reads = 0;
        Object.defineProperty(block, 'reference', {
          get() {
            return ++reads <= 6 ? valid : 'https://example.invalid/fake-image';
          },
        });
        const out = render(model([block]), format, { view });
        assert.equal(reads, 1);
        const expected =
          view === 'structure' ? createDisplayEscaper({ format, view })(valid) : valid;
        assert.ok(out.includes(expected));
        assert.equal(out.includes('https://'), false);
      }
});

test('중복 참조와 참조 없는 fallback 판정도 getter의 후속 값에 영향을 받지 않는다', () => {
  const blocks = [referencedImage(1), referencedImage(1)];
  const reads = [0, 0];
  for (let index = 0; index < blocks.length; index++)
    Object.defineProperty(blocks[index], 'reference', {
      get() {
        return ++reads[index] === 1 ? reference('image', 1) : reference('image', index + 2);
      },
    });
  assert.throws(() => render(model(blocks)), /DuplicateObjectReference/);
  assert.deepEqual(reads, [1, 1]);
  for (const first of [null, undefined]) {
    let reads = 0;
    const block = image();
    Object.defineProperty(block, 'reference', {
      get() {
        return ++reads === 1 ? first : 'https://example.invalid/fake-image';
      },
    });
    const out = render(model([block]), 'markdown');
    assert.equal(reads, 1);
    assert.equal(out, '[이미지: 추출 참조 확인 불가]\n');
  }
  const literal = 'https://example.invalid/원문';
  assert.equal(render(model([paragraph(literal)]), 'markdown'), literal + '\n');
});
