import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../src/render.ts';
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
const warning = (section, paragraph, code = 'ControlAwareBatchUnavailable') => ({
  code,
  message: '/private/host/secret http://internal.invalid:9999',
  source: { section, paragraph, path: '/private/source', url: 'http://private.invalid' },
});
const model = (warnings) => ({
  version: 1,
  format: 'hwpx',
  sourceSha256: 'd'.repeat(64),
  sections: [
    {
      id: 's0',
      source: { section: 0 },
      header: area(),
      body: [
        {
          id: 'p4',
          type: 'paragraph',
          source: { section: 0, paragraph: 4 },
          displayText: 'site.text 원문 A\ufffcB',
          editability: 'read-only',
        },
      ],
      footer: area(),
    },
  ],
  unplaced: [],
  warnings,
  coverage: { inventoryComplete: true },
});
for (const format of ['text', 'markdown'])
  test(`${format} thousands of repeated paragraph warnings become one bounded code/section summary`, () => {
    const warnings = [];
    for (let p = 5000; p >= 1; p--)
      for (let copy = 0; copy < 3; copy++) warnings.push(warning(0, p));
    const out = renderDocument(model(warnings), { format, maxOutputUnits: 512 });
    assert.equal(out.split('부분 읽기: ControlAwareBatchUnavailable').length - 1, 1);
    assert(out.includes('영향 문단 5000개'));
    assert(out.includes('관측 번호 범위 1–5000'));
    assert(out.includes('대표 Native 문단 5000'));
    assert(out.includes('본문 텍스트는 보존해 읽었습니다'));
    assert(out.includes('site.text 원문 A\ufffcB'));
    assert(!out.includes('/private/'));
    assert(!out.includes('http://'));
    assert(out.length < 512);
  });
test('equal Native ordinals in distinct sections aggregate separately without treating envelope gaps as observed paragraphs', () => {
  const out = renderDocument(
    model([warning(0, 8), warning(0, 4), warning(1, 4), warning(1, 8), warning(0, 8)]),
    { format: 'text' },
  );
  assert.equal(out.split('부분 읽기: ControlAwareBatchUnavailable').length - 1, 2);
  assert.equal(out.split('영향 문단 2개').length - 1, 2);
  assert.equal(out.split('관측 번호 범위 4–8').length - 1, 2);
  assert(out.includes('대표 Native 문단 8'));
  assert(out.includes('대표 Native 문단 4'));
  assert(out.includes('구역 0'));
  assert(out.includes('구역 1'));
});
test('distinct partial codes in one section get one summary each and duplicate events do not inflate affected count', () => {
  const out = renderDocument(
    model([
      warning(0, 4),
      warning(0, 4),
      warning(0, 9, 'ControlAwareTextMismatch'),
      warning(0, 9, 'ControlAwareTextMismatch'),
    ]),
    { format: 'text' },
  );
  assert.equal(out.split('부분 읽기:').length - 1, 2);
  assert.equal(out.split('영향 문단 1개').length - 1, 2);
  assert(!out.includes('영향 문단 2개'));
});
test('unknown or invalid locations remain explicitly unknown instead of issuing false Native ordinals', () => {
  const out = renderDocument(
    model([
      warning(undefined, undefined),
      warning(-1, 0),
      warning(0x100000000, -3),
      warning(0, 4),
      warning(0, NaN),
    ]),
    { format: 'text' },
  );
  assert.equal(out.split('부분 읽기: ControlAwareBatchUnavailable').length - 1, 2);
  assert(out.includes('구역 미확인'));
  assert(out.includes('영향 문단 번호 미확인'));
  assert(out.includes('영향 문단 1개'));
  assert(out.includes('일부 영향 문단 번호 미확인'));
  for (const text of [
    'Native 문단 0',
    'Native 문단 -3',
    'Native 문단 NaN',
    '구역 -1',
    '구역 4294967296',
  ])
    assert(!out.includes(text));
  assert(!out.includes('/private/'));
  assert(!out.includes('http://'));
});
test('partial summaries preserve unrelated warning policy and still consume the shared output budget', () => {
  const out = renderDocument(
    model([{ code: 'SomeOtherWarning', message: 'not a fallback', source: {} }]),
    { format: 'text' },
  );
  assert(!out.includes('부분 읽기:'));
  assert(out.includes('일부 내용의 관측이 불완전합니다'));
  assert.throws(
    () => renderDocument(model([warning(0, 4)]), { format: 'text', maxOutputUnits: 32 }),
    /RenderOutputLimitExceeded/,
  );
});
