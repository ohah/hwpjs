import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renderDocumentHTML } from '../src/render-html.ts';
import { escapeHTMLText } from '../src/html-escape.ts';
import { buildObjectReference } from '../src/object-reference.ts';

const SHA = 'a'.repeat(64);
const area = (declarations = 'known', state = 'not-applicable') => ({
  declarations,
  definitions: [],
  inheritance: { state },
});
const paragraph = (id, displayText = '본문', extra = {}) => ({
  id: `p:${id}`,
  type: 'paragraph',
  displayText,
  source: { section: 0, paragraph: id },
  editability: 'range-check-required',
  ...extra,
});
const cell = (id, row, column, blocks = [], extra = {}) => ({
  id: `c:${id}`,
  row,
  column,
  rowSpan: 1,
  columnSpan: 1,
  geometryKnown: true,
  contentState: 'observed',
  blocks,
  ...extra,
});
const table = (id, rows, columns, cells) => ({
  id: `t:${id}`,
  type: 'table',
  rows,
  columns,
  cells,
});
const ref = (kind = 'image', node = 10) =>
  buildObjectReference({ sourceSha256: SHA, format: 'hwp5', section: 0, kind, node });
const image = (id = 10, extra = {}) => ({
  id: `i:${id}`,
  type: 'image',
  reference: ref('image', id),
  imageId: `hwp5:s0:i${id}`,
  sourceInfo: { section: 0, pictureNode: id },
  altState: 'provided',
  alt: '원본 대체 텍스트',
  ...extra,
});
const model = (body = []) => ({
  version: 1,
  format: 'hwp5',
  sourceSha256: SHA,
  sections: [{ id: 's:0', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
const fragment = (m, options = {}) => renderDocumentHTML(m, { fragment: true, ...options });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function parseHTML(html) {
  const script = `import sys,json
from html.parser import HTMLParser
class P(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.tags=[];self.text=[]
 def handle_starttag(self,t,a):self.tags.append({'tag':t,'attrs':dict(a)})
 def handle_data(self,d):self.text.append(d)
p=P();p.feed(sys.stdin.read());p.close();print(json.dumps({'tags':p.tags,'text':''.join(p.text)}))`;
  const r = spawnSync('python3', ['-I', '-B', '-c', script], {
    input: html,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('전체 HTML은 UTF8 문서이고 원문 문자를 보존하며 제목·목록을 추측하지 않는다', () => {
  const raw = 'Table Cell ID SHA # 제목 - 목록 1. 문자 <&> "인용" 🙂';
  const html = renderDocumentHTML(model([paragraph(0, raw)]));
  assert.ok(html.startsWith('<!doctype html><html lang="ko">'));
  assert.ok(html.endsWith('</body></html>'));
  assert.match(html, /<meta charset="utf-8">/);
  const parsed = parseHTML(html);
  assert.ok(parsed.text.includes(raw));
  assert.equal(
    parsed.tags.some((t) => /^(h[1-6]|ul|ol|li|th)$/.test(t.tag)),
    false,
  );
  assert.ok(html.includes('원본 서식과 쪽 배치는 재현하지 않습니다.'));
});
test('빈 관측 문단·null 미관측·displayText 누락을 구분하고 과거 raw text는 출력하지 않는다', () => {
  const html = fragment(
    model([
      paragraph(0, '', { text: '유출금지漢字制御' }),
      paragraph(1, null, { reason: '미관측 이유', text: '유출금지' }),
    ]),
  );
  assert.ok(html.includes('<p></p>'));
  assert.ok(html.includes('[문단 내용 미관측] 미관측 이유'));
  assert.equal(html.includes('유출금지'), false);
  const p = paragraph(0);
  delete p.displayText;
  assert.throws(() => fragment(model([p])), /DisplayText/);
});
test('본문·제목·진단의 HTML 주입은 텍스트이며 attribute와 script를 생성하지 않는다', () => {
  const attack = '</p><script>alert(1)</script><img src=x onerror="run()"> &lt;';
  const m = model([paragraph(0, attack)]);
  m.warnings.push({ code: '"onclick="x', message: attack });
  const html = renderDocumentHTML(m, { title: attack });
  const parsed = parseHTML(html);
  assert.equal(
    parsed.tags.some((t) => ['script', 'img'].includes(t.tag)),
    false,
  );
  assert.ok(parsed.text.includes(attack));
  assert.ok(html.includes('&amp;lt;'));
  assert.equal(
    parsed.tags.some((t) => Object.keys(t.attrs).some((k) => k.startsWith('on'))),
    false,
  );
});
test('기존 renderer와 같은 제어문자 표시 정책과 Unicode 경계 이스케이프를 사용한다', () => {
  const raw = '\u001b[31m\u0085\u202e\u2066\ud800';
  const html = fragment(model([paragraph(0, raw)]));
  for (const code of ['001b', '0085', '202e', '2066', 'd800'])
    assert.ok(html.includes('\\u' + code));
  assert.equal(html.includes('\u001b'), false);
  assert.equal(html.isWellFormed(), true);
  const boundary = 'x'.repeat(511) + '🙂<&';
  assert.equal(escapeHTMLText(boundary, 1000), 'x'.repeat(511) + '🙂&lt;&amp;');
});
test('머리말·본문·꼬리말 순서와 정의 apply/range를 보존하고 상속 내용을 복제하지 않는다', () => {
  const m = model([paragraph(1, '본문')]);
  m.sections[0].header = {
    declarations: 'known',
    inheritance: { state: 'observed', fromSection: 0, definitionId: 'head:0' },
    definitions: [
      {
        id: 'head:0',
        kind: 'header',
        apply: 'odd',
        range: { state: 'observed', from: 0, to: 2 },
        blocks: [paragraph(0, '머리말')],
      },
    ],
  };
  m.sections[0].footer.definitions.push({
    id: 'foot:0',
    kind: 'footer',
    apply: null,
    range: { state: 'unresolved' },
    blocks: [paragraph(2, '꼬리말')],
  });
  const html = fragment(m);
  assert.ok(html.indexOf('>머리말<') < html.indexOf('>본문<'));
  assert.ok(html.indexOf('>본문<') < html.indexOf('>꼬리말<'));
  assert.equal(html.split('>머리말<').length, 2);
  assert.ok(html.includes('data-apply="odd" data-range="observed" data-from="0" data-to="2"'));
  assert.ok(html.includes('data-apply="unknown" data-range="unresolved"'));
  assert.ok(html.includes('data-inherit-from-section="0" data-inherit-definition-id="head:0"'));
  assert.ok(html.includes('data-definition-id="head:0"'));
});
test('확인된 머리말 없음과 선언·상속 미관측은 같은 빈값으로 숨기지 않는다', () => {
  const known = fragment(model());
  assert.equal(known.includes('머리말 정의 미관측'), false);
  const m = model();
  m.sections[0].header = area('unavailable', 'unresolved');
  const html = fragment(m);
  assert.ok(html.includes('머리말 정의 미관측'));
  assert.ok(html.includes('머리말 상속 관계 미관측'));
});
test('완전한 병합 표는 rowspan/colspan으로 보존하고 첫 데이터 행을 th로 바꾸지 않는다', () => {
  const t = table(1, 2, 2, [
    cell(1, 0, 0, [paragraph(0, '병합')], { rowSpan: 2 }),
    cell(2, 0, 1, [paragraph(1, '오른쪽 위')]),
    cell(3, 1, 1, [paragraph(2, '오른쪽 아래')]),
  ]);
  const parsed = parseHTML(fragment(model([t])));
  assert.equal(parsed.tags.filter((t) => t.tag === 'tr').length, 2);
  assert.equal(parsed.tags.filter((t) => t.tag === 'td').length, 3);
  assert.equal(parsed.tags.find((t) => t.tag === 'td').attrs.rowspan, '2');
  assert.equal(
    parsed.tags.some((t) => t.tag === 'th'),
    false,
  );
  const c = table(2, 1, 3, [cell(4, 0, 0, [], { columnSpan: 2 }), cell(5, 0, 2)]);
  assert.ok(fragment(model([c])).includes('colspan="2"'));
});
test('중첩 표와 빈 관측 셀은 실제 td의 하위 내용으로 보존한다', () => {
  const inner = table(2, 1, 1, [cell(2, 0, 0, [paragraph(0, '안쪽')])]);
  const outer = table(1, 1, 2, [cell(1, 0, 0, [inner]), cell(3, 0, 1)]);
  const html = fragment(model([outer]));
  assert.equal((html.match(/<table/g) ?? []).length, 2);
  assert.ok(html.includes('<td><table'));
  assert.ok(html.includes('<td></td>'));
  assert.equal(html.includes('셀 내용 일부 미관측'), false);
});
test('수십억 좌표의 희소 표는 좌표 범위가 아닌 관측 셀만 출력한다', () => {
  const t = table(1, 0xffffffff, 2, [cell(1, 0xfffffffe, 1, [paragraph(0, '희소 본문')])]);
  const html = fragment(model([t]));
  assert.ok(html.length < 2000);
  assert.equal((html.match(/희소 본문/g) ?? []).length, 1);
  assert.equal(html.includes('<tr>'), false);
  assert.ok(html.includes('data-row="4294967294"'));
  assert.equal((html.match(/표 구조의 일부/g) ?? []).length, 1);
});
test('겹침·범위 밖·미관측 셀은 정직한 fallback과 원문 내용을 보존한다', () => {
  for (const cells of [
    [cell(1, 0, 0), cell(2, 0, 0)],
    [cell(1, 2, 0)],
    [cell(1, 0, 0, [paragraph(0, '부분')], { contentState: 'unavailable' })],
  ]) {
    const html = fragment(model([table(1, 1, 1, cells)]));
    assert.ok(html.includes('table-unresolved'));
    assert.equal(html.includes('<td'), false);
  }
  const t = table(1, null, null, [
    cell(1, null, null, [], { geometryKnown: false, contentState: 'unavailable' }),
  ]);
  assert.ok(fragment(model([t])).includes('셀 내용 일부 미관측'));
});
test('이미지는 기본 figure 논리 참조이며 src/href 네트워크 요청을 만들지 않는다', () => {
  const i = image();
  const html = fragment(model([i]));
  const parsed = parseHTML(html);
  assert.equal(
    parsed.tags.some((t) => t.tag === 'img' || 'src' in t.attrs || 'href' in t.attrs),
    false,
  );
  assert.equal(parsed.tags.find((t) => t.tag === 'figure').attrs['data-ref'], i.reference);
  assert.ok(parsed.text.includes('원본 대체 텍스트'));
  assert.ok(parsed.text.includes('이미지 바이트가 포함되지 않았습니다.'));
});
test('이미지 대체 텍스트의 관측 빈문자·없음·미관측과 참조 부재를 구분한다', () => {
  const html = fragment(
    model([
      image(10, { alt: '' }),
      image(11, { altState: 'not-provided', alt: null }),
      image(12, { altState: 'not-exposed', alt: null, reference: null }),
    ]),
  );
  assert.ok(html.includes('data-alt-state="provided"'));
  assert.ok(html.includes('대체 텍스트 없음'));
  assert.ok(html.includes('대체 텍스트 미관측'));
  assert.ok(html.includes('이미지 추출 참조 미관측'));
});
test('명시 imageData는 일치하는 논리 참조의 base64 raster만 img에 넣는다', () => {
  const i = image(10, { alt: '<&" alt' });
  const html = fragment(model([i]), { imageData: new Map([[i.reference, PNG]]) });
  const parsed = parseHTML(html);
  const img = parsed.tags.find((t) => t.tag === 'img');
  assert.equal(img.attrs.src, PNG);
  assert.equal(img.attrs.alt, '<&" alt');
  assert.equal(parsed.tags.filter((t) => t.tag === 'img').length, 1);
});
test('data URI MIME·base64·작은 magic 검사는 SVG·외부URL·위장본문·잘못된 padding을 거부한다', () => {
  const i = image();
  const inputs = [
    'https://example.invalid/x.png',
    'javascript:run()',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,PHN2Zz4=',
    'data:image/png;base64,',
    'data:image/png;base64,iVBORw0KGgo=\n',
    'data:image/png;base64,iVBORw0KGgp=',
    'data:image/png;base64,====',
  ];
  for (const value of inputs)
    assert.throws(
      () => fragment(model([i]), { imageData: new Map([[i.reference, value]]) }),
      /Image|Base64/,
    );
});
test('허용 raster MIME의 작은 접두부 검사는 픽셀 디코딩의 성공으로 계수하지 않는다', () => {
  const i = image();
  for (const [mime, bytes] of [
    ['jpeg', [255, 216, 255]],
    ['gif', [...Buffer.from('GIF89a')]],
    ['webp', [...Buffer.from('RIFF0000WEBP')]],
    ['bmp', [...Buffer.from('BM')]],
  ]) {
    const uri = `data:image/${mime};base64,` + Buffer.from(bytes).toString('base64');
    assert.ok(fragment(model([i]), { imageData: new Map([[i.reference, uri]]) }).includes('<img'));
  }
});
test('모델에 없는 참조·이미지가 아닌 참조와 임의 Map 대체 객체는 거부한다', () => {
  const i = image();
  for (const key of [ref('image', 99), ref('table', 10), 'not-a-reference'])
    assert.throws(
      () => fragment(model([i]), { imageData: new Map([[key, PNG]]) }),
      /ImageReference/,
    );
  assert.throws(
    () => fragment(model([i]), { imageData: { entries: () => [[i.reference, PNG]], size: 1 } }),
    TypeError,
  );
});
test('reference getter는 검증 때 단 한 번 캡처한 문자열을 모든 HTML 소비처에서 쓴다', () => {
  const i = image();
  const original = i.reference;
  let reads = 0;
  Object.defineProperty(i, 'reference', {
    get: () => (++reads === 1 ? original : ref('image', 99)),
  });
  const html = fragment(model([i]), { imageData: new Map([[original, PNG]]) });
  assert.equal(reads, 1);
  assert.ok(html.includes(original));
  assert.equal(html.includes(ref('image', 99)), false);
});
test('Map subclass의 iterator와 size 후크 대신 실제 Map 저장값을 소유하여 사용한다', () => {
  class HostileMap extends Map {
    get size() {
      throw Error('hook');
    }
    entries() {
      throw Error('hook');
    }
    [Symbol.iterator]() {
      throw Error('hook');
    }
  }
  const i = image();
  const value = new HostileMap([[i.reference, PNG]]);
  assert.ok(fragment(model([i]), { imageData: value }).includes('<img'));
});
test('미분류 객체·배치 불명·전역 coverage와 경고를 누락 없이 표시한다', () => {
  const m = model([
    {
      id: 'u:0',
      type: 'unknown',
      kind: 'equation',
      reference: ref('equation', 11),
      source: { section: 0, node: 11 },
      diagnostic: { code: 'EquationUnknown', message: '<원문> 미관측' },
    },
  ]);
  m.unplaced.push({
    block: paragraph(0, '배치 불명 본문'),
    diagnostic: { code: 'Unplaced', message: '위치 미관측' },
  });
  m.coverage.inventoryComplete = false;
  m.coverage.imagesKnown = false;
  m.coverage.objectInventoryComplete = false;
  m.warnings.push({ code: 'Warning', message: '보존된 경고' });
  const html = fragment(m);
  for (const text of [
    'EquationUnknown',
    '&lt;원문&gt;',
    '배치 불명 본문',
    '문서 내용의 일부',
    '이미지 재고 일부',
    '개체 재고 일부',
    '보존된 경고',
  ])
    assert.ok(html.includes(text));
});
test('모델·옵션·imageData 입력을 변경하지 않는 순수 변환이다', () => {
  const i = image();
  const m = freeze(model([i, paragraph(0)])),
    copy = structuredClone(m),
    images = new Map([[i.reference, PNG]]);
  const before = [...images];
  fragment(m, { imageData: images });
  assert.deepEqual(m, copy);
  assert.deepEqual([...images], before);
});
test('전체 선검증은 순환·중복·깊이·노드·텍스트 한도를 기존 SSOT와 동일하게 거부한다', () => {
  const p = paragraph(0);
  assert.throws(() => fragment(model([p, p])), /Repeated|Duplicate/);
  const cyclic = table(1, 1, 1, []);
  cyclic.cells.push(cell(1, 0, 0, [cyclic]));
  assert.throws(() => fragment(model([cyclic])), /Repeated|Cycle/);
  let nested = paragraph(0);
  for (let i = 0; i < 20; i++) nested = table(i, 1, 1, [cell(i, 0, 0, [nested])]);
  assert.throws(() => fragment(model([nested])), /Depth/);
  assert.throws(() => fragment(model([paragraph(0)]), { maxNodes: 2 }), /NodeLimit/);
  assert.throws(() => fragment(model([paragraph(0)]), { maxTextUnits: 5 }), /TextLimit/);
});
test('출력·이미지·제목·잘못된 옵션 예산을 실패 문자열 없이 거부한다', () => {
  assert.throws(
    () => fragment(model([paragraph(0, '&'.repeat(1000))]), { maxOutputUnits: 500 }),
    /OutputLimit/,
  );
  const i = image();
  assert.throws(
    () => fragment(model([i]), { maxOutputUnits: 32, imageData: new Map([[i.reference, PNG]]) }),
    /OutputLimit/,
  );
  assert.throws(() => fragment(model(), { title: 'x'.repeat(1025) }), /HtmlTitle/);
  for (const options of [
    null,
    [],
    { fragment: 1 },
    { maxNodes: 0 },
    { format: 'html' },
    { maxOutputUnits: Infinity },
  ])
    assert.throws(() => renderDocumentHTML(model(), options));
  let calls = 0;
  const getter = {};
  Object.defineProperty(getter, 'title', {
    enumerable: true,
    get: () => {
      calls++;
      return 'x';
    },
  });
  assert.throws(() => renderDocumentHTML(model(), getter), /Option/);
  assert.equal(calls, 0);
});

test('생성한 객체 라벨은 원문 캡션으로 위장하지 않고 별도 캡션 문단을 그대로 둔다', () => {
  const i = image(10, { label: '추정 금지 캡션', alt: '' });
  const html = fragment(model([i, paragraph(0, '그림 1. 관측된 원문 문단')]));
  assert.ok(
    html.includes('<figcaption data-caption-origin="generated-label">이미지 1</figcaption>'),
  );
  assert.ok(html.includes('<p>그림 1. 관측된 원문 문단</p>'));
  assert.equal(html.includes('추정 금지 캡션'), false);
});
test('관측된 이미지 크기·단위는 메타데이터로 남기고 픽셀 조판으로 추정하지 않는다', () => {
  const html = fragment(model([image(10, { width: 12000, height: null, sizeUnit: 'hwpunit' })]));
  const parsed = parseHTML(html),
    figure = parsed.tags.find((t) => t.tag === 'figure');
  assert.equal(figure.attrs['data-width'], '12000');
  assert.equal(figure.attrs['data-height'], 'null');
  assert.equal(figure.attrs['data-size-unit'], 'hwpunit');
  assert.equal(
    parsed.tags.some((t) => 'width' in t.attrs || 'height' in t.attrs),
    false,
  );
});

test('HTML 모듈 그래프는 Node 전용 import·Buffer·process 없이 순수 모델을 처리한다', () => {
  const url = new URL('../src/render-html.ts', import.meta.url).href;
  const program = `import {registerHooks} from 'node:module';
const hostProcess=process;
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('node:')||(!specifier.startsWith('.')&&!specifier.startsWith('file:')))throw Error('NonPortableHtmlDependency:'+specifier);
 return next(specifier,context);
}});
globalThis.Buffer=undefined;globalThis.process=undefined;globalThis.require=undefined;
const {renderDocumentHTML}=await import(${JSON.stringify(url)});
const html=renderDocumentHTML(${JSON.stringify(model([paragraph(0, '순수 HTML 🙂')]))},{fragment:true});
if(!html.includes('순수 HTML 🙂'))throw Error('MissingPureHtmlText');
globalThis.process=hostProcess;`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=128', '--input-type=module', '-e', program],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
