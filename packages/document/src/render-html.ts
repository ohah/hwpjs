import type { DocumentBlock, PageArea, RenderLimits, TableBlock } from './types/document-view.ts';
import { prepareDocumentRender } from './render.ts';
import { simpleCells } from './render-content.ts';
import { escapeHTMLText } from './html-escape.ts';

export interface HTMLRenderOptions extends Partial<RenderLimits> {
  title?: string;
  fragment?: boolean;
  imageData?: ReadonlyMap<string, string>;
}
const limitKeys = ['maxDepth', 'maxNodes', 'maxTextUnits', 'maxOutputUnits'] as const;
const imagePrefixes = ['png', 'jpeg', 'gif', 'webp', 'bmp'].map(
  (type) => `data:image/${type};base64,`,
);
const nativeEntries: (this: ReadonlyMap<unknown, unknown>) => IterableIterator<[unknown, unknown]> =
  Map.prototype.entries;
const nativeSize: (this: unknown) => unknown = Object.getOwnPropertyDescriptor(
  Map.prototype,
  'size',
)!.get!;
const names = new Map([
  ['image', '이미지'],
  ['table', '표'],
  ['chart', '차트'],
  ['equation', '수식'],
  ['drawing', '도형'],
  ['ole', '임베디드 개체'],
]);
function optionsFor(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('InvalidHtmlRenderOptions');
  const values: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || ![...limitKeys, 'title', 'fragment', 'imageData'].includes(key))
      throw new TypeError('InvalidHtmlRenderOption');
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !Object.hasOwn(property, 'value'))
      throw new TypeError('InvalidHtmlRenderOption');
    values[key] = property.value;
  }
  const title = values.title === undefined ? '문서' : values.title;
  if (typeof title !== 'string' || title.length > 1024) throw new TypeError('InvalidHtmlTitle');
  if (values.fragment !== undefined && typeof values.fragment !== 'boolean')
    throw new TypeError('InvalidHtmlFragmentOption');
  const limits: Partial<RenderLimits> = {};
  for (const key of limitKeys)
    if (values[key] !== undefined) {
      if (typeof values[key] !== 'number') throw new TypeError('InvalidRenderLimit:' + key);
      limits[key] = values[key];
    }
  return { title, fragment: values.fragment === true, imageData: values.imageData, limits };
}
function base64Digit(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  return code === 43 ? 62 : code === 47 ? 63 : -1;
}
// URL 문법과 작은 식별 접두부만 검사합니다. 픽셀 디코딩·전체 형식 검증은 아닙니다.
function safeImageURI(value: string): void {
  const prefix = imagePrefixes.find((p) => value.startsWith(p));
  if (!prefix) throw new TypeError('UnsupportedHtmlImageDataURI');
  const length = value.length - prefix.length;
  if (length === 0 || length % 4 !== 0) throw new TypeError('InvalidHtmlImageBase64');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const end = value.length - padding;
  for (let i = prefix.length; i < end; i++)
    if (base64Digit(value.charCodeAt(i)) < 0) throw new TypeError('InvalidHtmlImageBase64');
  if (
    (padding === 2 && (base64Digit(value.charCodeAt(end - 1)) & 15) !== 0) ||
    (padding === 1 && (base64Digit(value.charCodeAt(end - 1)) & 3) !== 0)
  )
    throw new TypeError('InvalidHtmlImageBase64');
  const head: number[] = [];
  let bits = 0,
    available = 0;
  for (let i = prefix.length; i < end && head.length < 12; i++) {
    bits = (bits << 6) | base64Digit(value.charCodeAt(i));
    available += 6;
    if (available >= 8) {
      available -= 8;
      head.push((bits >>> available) & 255);
    }
  }
  const ascii = (offset: number, text: string) =>
    [...text].every((c, i) => head[offset + i] === c.charCodeAt(0));
  const mime = prefix.slice(11, prefix.indexOf(';'));
  const matches =
    mime === 'png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => head[i] === n)
      : mime === 'jpeg'
        ? head[0] === 255 && head[1] === 216 && head[2] === 255
        : mime === 'gif'
          ? ascii(0, 'GIF87a') || ascii(0, 'GIF89a')
          : mime === 'webp'
            ? ascii(0, 'RIFF') && ascii(8, 'WEBP')
            : ascii(0, 'BM');
  if (!matches) throw new TypeError('HtmlImageMimeSignatureMismatch');
}

/** 관측된 논리 내용을 HTML로 직렬화합니다. 원본 서식·쪽 조판 재현기는 아닙니다.
 * I/O와 모델 변경 없이 작동하고 임의 URL·SVG·스크립트를 만들지 않습니다.
 * imageData의 키는 검증된 이미지 reference이며 기본값은 바이트 없는 figure입니다.
 */
export function renderDocumentHTML(input: unknown, rawOptions: HTMLRenderOptions = {}): string {
  const options = optionsFor(rawOptions);
  const { model, limits, references } = prepareDocumentRender(input, {
    ...options.limits,
    format: 'text',
    view: 'content',
  });
  if (options.title.length > limits.maxTextUnits) throw new RangeError('RenderTextLimitExceeded');
  const images = new Map<string, string>();
  if (options.imageData !== undefined) {
    const size = nativeSize.call(options.imageData);
    if (typeof size !== 'number' || size > 4096 || size > limits.maxNodes)
      throw new RangeError('HtmlImageLimitExceeded');
    const allowed = new Set(
      [...references.values()].filter((r) => r.kind === 'image').map((r) => r.text),
    );
    let units = 0;
    for (const [key, value] of nativeEntries.call(
      options.imageData as ReadonlyMap<unknown, unknown>,
    )) {
      if (typeof key !== 'string' || typeof value !== 'string' || !allowed.has(key))
        throw new TypeError('InvalidHtmlImageReference');
      units += key.length + value.length;
      if (units > limits.maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
      safeImageURI(value);
      images.set(key, value);
    }
  }
  const chunks: string[] = [];
  let units = 0,
    ordinal = 0;
  const emit = (value: string) => {
    units += value.length;
    if (units > limits.maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    chunks.push(value);
  };
  const text = (value: string) => emit(escapeHTMLText(value, limits.maxOutputUnits - units));
  const attr = (name: string, value: string) => {
    emit(' ' + name + '="');
    text(value);
    emit('"');
  };
  const referenceAttr = (block: DocumentBlock) => {
    const reference = references.get(block);
    if (reference) attr('data-ref', reference.text);
    return reference;
  };
  const notice = (value: string) => {
    emit('<p class="unobserved">');
    text(value);
    emit('</p>');
  };
  const diagnostic = (code: string, message: string) => {
    emit('<p class="diagnostic"><code>');
    text(code);
    emit('</code> ');
    text(message);
    emit('</p>');
  };
  const blocks = (values: readonly DocumentBlock[]): void => {
    for (const block of values) {
      if (block.type === 'paragraph') {
        emit('<p>');
        if (block.displayText === null) {
          text('[문단 내용 미관측]');
          if (block.reason) {
            emit(' ');
            text(block.reason);
          }
        } else text(block.displayText);
        emit('</p>');
      } else if (block.type === 'table') table(block);
      else if (block.type === 'image') {
        emit('<figure class="image"');
        const reference = referenceAttr(block);
        attr('data-alt-state', block.altState);
        for (const key of ['width', 'height'] as const)
          if (block[key] !== undefined) attr('data-' + key, String(block[key]));
        if (block.sizeUnit !== undefined) attr('data-size-unit', block.sizeUnit);
        emit('>');
        const image = reference ? images.get(reference.text) : undefined;
        if (image) {
          emit('<img');
          attr('src', image);
          attr('alt', block.altState === 'provided' ? block.alt : '');
          emit('>');
        }
        emit('<figcaption data-caption-origin="generated-label">');
        text('이미지 ' + ++ordinal);
        if (block.altState === 'provided' && block.alt !== '') {
          emit(' — ');
          text(block.alt);
        }
        emit('</figcaption>');
        if (!image)
          notice(reference ? '이미지 바이트가 포함되지 않았습니다.' : '이미지 추출 참조 미관측');
        if (block.altState !== 'provided')
          notice(block.altState === 'not-provided' ? '대체 텍스트 없음' : '대체 텍스트 미관측');
        emit('</figure>');
      } else {
        emit('<figure class="object-unavailable"');
        referenceAttr(block);
        attr('data-kind', block.kind);
        emit('><figcaption data-caption-origin="generated-label">');
        text((names.get(block.kind) ?? '알 수 없는 개체') + ' ' + ++ordinal);
        emit('</figcaption>');
        notice('본문에 상세 내용이 포함되지 않았습니다.');
        diagnostic(block.diagnostic.code, block.diagnostic.message);
        emit('</figure>');
      }
    }
  };
  const table = (block: TableBlock): void => {
    const grid = block.cells.some((c) => (c.rowSpan ?? 0) > 1000 || (c.columnSpan ?? 0) > 1000)
      ? null
      : simpleCells(block, true);
    if (!grid) {
      emit('<div class="table-unresolved"');
      referenceAttr(block);
      attr('data-rows', String(block.rows));
      attr('data-columns', String(block.columns));
      emit('>');
      notice('표 구조의 일부를 확인할 수 없어 관측된 셀 내용을 순서대로 표시합니다.');
      for (const cell of block.cells) {
        emit('<div class="cell"');
        attr('data-row', String(cell.row));
        attr('data-column', String(cell.column));
        attr('data-rowspan', String(cell.rowSpan));
        attr('data-colspan', String(cell.columnSpan));
        attr('data-content-state', cell.contentState);
        emit('>');
        if (cell.contentState !== 'observed') notice('셀 내용 일부 미관측');
        blocks(cell.blocks);
        emit('</div>');
      }
      emit('</div>');
      return;
    }
    emit('<table');
    referenceAttr(block);
    emit('><caption data-caption-origin="generated-label">');
    text('표 ' + ++ordinal);
    emit('</caption><tbody>');
    for (let row = 0; row < grid.rows; row++) {
      emit('<tr>');
      for (let column = 0; column < grid.columns; column++) {
        const cell = grid.grid.get(row * grid.columns + column);
        if (!cell) continue;
        emit('<td');
        if (cell.rowSpan !== 1) attr('rowspan', String(cell.rowSpan));
        if (cell.columnSpan !== 1) attr('colspan', String(cell.columnSpan));
        emit('>');
        blocks(cell.blocks);
        emit('</td>');
      }
      emit('</tr>');
    }
    emit('</tbody></table>');
  };
  const area = (value: PageArea, kind: 'header' | 'footer'): void => {
    emit('<' + kind);
    attr('data-declarations', value.declarations);
    attr('data-inheritance', value.inheritance.state);
    if (value.inheritance.fromSection !== undefined)
      attr('data-inherit-from-section', String(value.inheritance.fromSection));
    if (value.inheritance.definitionId !== undefined)
      attr('data-inherit-definition-id', value.inheritance.definitionId);
    emit('>');
    if (value.declarations === 'unavailable')
      notice((kind === 'header' ? '머리말' : '꼬리말') + ' 정의 미관측');
    if (value.inheritance.state === 'unresolved')
      notice((kind === 'header' ? '머리말' : '꼬리말') + ' 상속 관계 미관측');
    for (const definition of value.definitions) {
      emit('<section class="page-area-definition"');
      attr('data-definition-id', definition.id);
      attr('data-kind', definition.kind);
      attr('data-apply', definition.apply ?? 'unknown');
      attr('data-range', definition.range.state);
      if (definition.range.from !== undefined) attr('data-from', String(definition.range.from));
      if (definition.range.to !== undefined) attr('data-to', String(definition.range.to));
      emit('>');
      blocks(definition.blocks);
      emit('</section>');
    }
    emit('</' + kind + '>');
  };
  if (!options.fragment) {
    emit(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>',
    );
    text(options.title);
    emit(
      '</title><style>p,figcaption,td{white-space:pre-wrap}table{border-collapse:collapse}td{border:1px solid #aaa;padding:.3em;vertical-align:top}figure{margin:1em 0}.unobserved,.diagnostic{color:#555}</style></head><body>',
    );
  }
  emit('<article class="hwpjs-semantic-document">');
  notice('관측된 논리 내용의 HTML입니다. 원본 서식과 쪽 배치는 재현하지 않습니다.');
  if (!model.coverage.inventoryComplete) notice('문서 내용의 일부를 확인하지 못했습니다.');
  if (model.coverage.imagesKnown === false) notice('이미지 재고 일부 미관측');
  if (model.coverage.pageAreasKnown === false) notice('머리말·꼬리말 재고 일부 미관측');
  if (model.coverage.pageAreaInheritanceKnown === false) notice('머리말·꼬리말 상속 일부 미관측');
  if (model.coverage.objectInventoryComplete === false) notice('개체 재고 일부 미관측');
  for (const section of model.sections) {
    emit('<section class="document-section"');
    attr('data-section', String(section.source.section));
    emit('>');
    area(section.header, 'header');
    emit('<div class="body">');
    blocks(section.body);
    emit('</div>');
    area(section.footer, 'footer');
    emit('</section>');
  }
  if (model.unplaced.length) {
    emit('<section class="unplaced" aria-label="배치 위치 미관측">');
    notice('다음 내용의 배치 위치는 확인하지 못했습니다.');
    for (const item of model.unplaced) {
      diagnostic(item.diagnostic.code, item.diagnostic.message);
      blocks([item.block]);
    }
    emit('</section>');
  }
  if (model.warnings.length) {
    emit('<aside class="warnings" aria-label="문서 읽기 경고">');
    for (const warning of model.warnings) diagnostic(warning.code, warning.message);
    emit('</aside>');
  }
  emit('</article>');
  if (!options.fragment) emit('</body></html>');
  return chunks.join('');
}
