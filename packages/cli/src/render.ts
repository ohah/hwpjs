import type {
  DocumentView,
  DocumentBlock,
  TableCell,
  PageArea,
  Diagnostic,
  RenderOptions,
  RenderLimits,
  RenderReference,
} from './types/document-view.ts';
import { renderContent } from './render-content.ts';
import { createDisplayEscaper } from './render-escape.ts';
import { parseObjectReference } from './object-reference.ts';

const member = (values: readonly unknown[], value: unknown): boolean => values.includes(value);

const LIMITS = Object.freeze({
  maxDepth: 32,
  maxNodes: 200_000,
  maxTextUnits: 4 * 1024 * 1024,
  maxOutputUnits: 32 * 1024 * 1024,
});
const own = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function optionsFor(options: unknown): RenderLimits {
  if (!own(options) || !member(['text', 'markdown'], options.format))
    throw new TypeError('InvalidRenderFormat');
  if (options.view !== undefined && !member(['content', 'structure'], options.view))
    throw new TypeError('InvalidRenderView');
  const limits: RenderLimits = { ...LIMITS };
  for (const key of Object.keys(LIMITS) as (keyof RenderLimits)[]) {
    const value = options[key] ?? LIMITS[key];
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > LIMITS[key]
    )
      throw new RangeError('InvalidRenderLimit:' + key);
    limits[key] = value;
  }
  return limits;
}

// 이스케이프·출력 생성 전에 포함 트리 전체를 검증합니다.
// 사용하지 않는 원문·서식 메타데이터를 복구 텍스트로 출력하지 않습니다.
function validate(model: unknown, limits: RenderLimits): Map<object, RenderReference> {
  const references = new Map<object, RenderReference>();
  const referenceIds = new Set();
  let nodes = 0,
    units = 0;
  const seen = new Set();
  const ids = new Set();
  const stack: { type: string; value: Record<string, unknown>; depth: number }[] = [];
  function string(value: unknown): asserts value is string {
    if (typeof value !== 'string') throw new TypeError('InvalidRenderString');
    units += value.length;
    if (units > limits.maxTextUnits) throw new RangeError('RenderTextLimitExceeded');
  }
  const integer = (value: unknown, nullable = false, min = 0) => {
    if (nullable && value === null) return;
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > 0xffffffff
    )
      throw new TypeError('InvalidRenderCoordinate');
  };
  function object(value: unknown): asserts value is Record<string, unknown> {
    if (!own(value)) throw new TypeError('InvalidRenderObject');
  }
  const id = (value: unknown) => {
    string(value);
    if (!value || ids.has(value)) throw new TypeError('DuplicateOrEmptyRenderId');
    ids.add(value);
  };
  const enqueue = (type: string, value: unknown, depth: number) => {
    if (++nodes > limits.maxNodes) throw new RangeError('RenderNodeLimitExceeded');
    if (depth > limits.maxDepth) throw new RangeError('RenderDepthLimitExceeded');
    object(value);
    if (seen.has(value)) throw new TypeError('RepeatedRenderNodeOrCycle');
    seen.add(value);
    stack.push({ type, value, depth });
  };
  const array = (value: unknown, type: string, depth: number) => {
    if (!Array.isArray(value)) throw new TypeError('InvalidRenderArray');
    if (value.length > limits.maxNodes - nodes) throw new RangeError('RenderNodeLimitExceeded');
    for (let i = value.length - 1; i >= 0; i--) enqueue(type, value[i], depth);
  };
  const diagnostic = (value: unknown) => {
    object(value);
    string(value.code);
    string(value.message);
  };
  object(model);
  if (model.version !== 1 || !member(['hwp5', 'hwpx'], model.format))
    throw new TypeError('InvalidDocumentViewVersionOrFormat');
  array(model.sections, 'section', 0);
  array(model.unplaced, 'unplaced', 0);
  if (!Array.isArray(model.warnings)) throw new TypeError('InvalidRenderWarnings');
  if (model.warnings.length > limits.maxNodes - nodes)
    throw new RangeError('RenderNodeLimitExceeded');
  nodes += model.warnings.length;
  for (const warning of model.warnings) diagnostic(warning);
  object(model.coverage);
  if (typeof model.coverage.inventoryComplete !== 'boolean')
    throw new TypeError('InvalidRenderCoverage');
  while (stack.length) {
    const { type, value: v, depth } = stack.pop()!;
    if (type === 'section') {
      id(v.id);
      object(v.source);
      integer(v.source.section);
      enqueue('area', v.header, depth);
      array(v.body, 'block', depth);
      enqueue('area', v.footer, depth);
    } else if (type === 'area') {
      if (!member(['known', 'unavailable'], v.declarations))
        throw new TypeError('InvalidPageAreaDeclarations');
      object(v.inheritance);
      if (!member(['observed', 'unresolved', 'not-applicable'], v.inheritance.state))
        throw new TypeError('InvalidPageAreaInheritance');
      if (v.inheritance.fromSection !== undefined) integer(v.inheritance.fromSection);
      if (v.inheritance.definitionId !== undefined) string(v.inheritance.definitionId);
      array(v.definitions, 'definition', depth);
    } else if (type === 'definition') {
      id(v.id);
      if (!member(['header', 'footer'], v.kind) || !member([null, 'both', 'odd', 'even'], v.apply))
        throw new TypeError('InvalidPageAreaDefinition');
      object(v.range);
      if (!member(['observed', 'unresolved'], v.range.state))
        throw new TypeError('InvalidPageAreaRange');
      for (const key of ['from', 'to']) if (v.range[key] !== undefined) integer(v.range[key]);
      array(v.blocks, 'block', depth);
    } else if (type === 'unplaced') {
      diagnostic(v.diagnostic);
      enqueue('block', v.block, depth);
    } else if (type === 'cell') {
      id(v.id);
      for (const key of ['row', 'column']) integer(v[key], true);
      for (const key of ['rowSpan', 'columnSpan']) integer(v[key], true, 1);
      if (typeof v.geometryKnown !== 'boolean') throw new TypeError('InvalidCellGeometryState');
      string(v.contentState);
      array(v.blocks, 'block', depth + 1);
    } else if (type === 'block') {
      id(v.id);
      const referenceText = v.reference;
      if (referenceText !== undefined && referenceText !== null) {
        string(referenceText);
        if (typeof model.sourceSha256 !== 'string')
          throw new TypeError('InvalidDocumentReferenceSource');
        const reference = parseObjectReference(referenceText, {
          sourceSha256: model.sourceSha256,
          format: model.format,
        });
        const kind =
          v.type === 'unknown'
            ? member(['chart', 'equation', 'drawing', 'ole'], v.kind)
              ? v.kind
              : 'unknown'
            : v.type;
        if (reference.kind !== kind || v.type === 'paragraph')
          throw new TypeError('ObjectReferenceKindMismatch');
        if (referenceIds.has(referenceText)) throw new TypeError('DuplicateObjectReference');
        const source = v.type === 'image' ? v.sourceInfo : v.source;
        if (!own(source) || source.section !== reference.section)
          throw new TypeError('ObjectReferenceSourceMismatch');
        const node =
          v.type === 'image'
            ? source?.pictureNode
            : v.type === 'table'
              ? source?.tableNode
              : source?.node;
        if (node !== reference.node) throw new TypeError('ObjectReferenceSourceMismatch');
        referenceIds.add(referenceText);
        references.set(v, { ...reference, text: referenceText });
      }
      if (v.type === 'paragraph') {
        if (
          !Object.hasOwn(v, 'displayText') ||
          (v.displayText !== null && typeof v.displayText !== 'string')
        )
          throw new TypeError('InvalidDocumentViewDisplayText');
        if (v.displayText !== null) string(v.displayText);
        if (v.reason !== undefined) string(v.reason);
        object(v.source);
        integer(v.source.section);
        integer(v.source.paragraph, false, model.format === 'hwpx' ? 1 : 0);
        if (!member(['range-check-required', 'read-only', 'unknown'], v.editability))
          throw new TypeError('InvalidParagraphEditability');
      } else if (v.type === 'table') {
        integer(v.rows, true);
        integer(v.columns, true);
        array(v.cells, 'cell', depth + 1);
      } else if (v.type === 'image') {
        if (!member(['provided', 'not-provided', 'not-exposed'], v.altState))
          throw new TypeError('InvalidImageAltState');
        if (v.alt !== null) string(v.alt);
        if (v.altState === 'provided' && v.alt === null)
          throw new TypeError('MissingProvidedImageAlt');
        object(v.sourceInfo);
        for (const key of [
          'section',
          'pictureNode',
          'recordNode',
          'componentNode',
          'ownerNode',
          'resourceId',
        ] as const)
          if (v.sourceInfo[key] !== undefined && v.sourceInfo[key] !== null)
            integer(v.sourceInfo[key]);
        for (const key of ['width', 'height'])
          if (
            v[key] !== undefined &&
            v[key] !== null &&
            (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0)
          )
            throw new TypeError('InvalidImageSize');
        if (v.sizeUnit !== undefined) string(v.sizeUnit);
      } else if (v.type === 'unknown') {
        string(v.kind);
        diagnostic(v.diagnostic);
      } else throw new TypeError('UnsupportedRenderBlockType');
    }
  }
  return references;
}

/** 관측한 논리 내용의 text/Markdown 보기입니다.
 * 입출력·모델 변경 없이 표시 문자열을 만들며 원문 바이트를 대체하지 않습니다.
 * 한도는 낮출 수만 있고 희소 셀은 무제한 밀집 격자로 확장하지 않습니다.
 */
export function renderDocument(input: unknown, rawOptions: unknown): string {
  const options = rawOptions as RenderOptions;
  const model = input as DocumentView;
  const limits = optionsFor(rawOptions);
  const references = validate(input, limits);
  const markdown = options.format === 'markdown';
  const content = (options.view ?? 'content') === 'content';
  const chunks: string[] = [];
  let outputUnits = 0;
  const escape = createDisplayEscaper({ format: options.format, view: options.view });
  const line = (text: string) => {
    outputUnits += text.length + 1;
    if (outputUnits > limits.maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    chunks.push(text, '\n');
  };
  if (content) {
    renderContent(model, {
      markdown,
      escape,
      line,
      references,
      maxOutputUnits: limits.maxOutputUnits,
    });
    return chunks.join('');
  }
  const item = (depth: number, text: string) =>
    line('  '.repeat(depth) + (markdown ? '- ' : '') + text);
  const heading = (level: number, text: string) =>
    line((markdown ? '#'.repeat(level) + ' ' : '') + text);
  const value = (x: unknown) => (x === null || x === undefined ? 'unknown' : String(x));
  const diagnostic = (v: Diagnostic) => escape(v.code) + ': ' + escape(v.message);
  // 범위 안내는 본문이며 호스트의 형식·SHA 메타데이터와 구분합니다.
  line(
    markdown
      ? '> AI logical view; display escapes are not original text bytes.'
      : 'AI logical view; display escapes are not original text bytes.',
  );
  const stack: (
    | { type: 'cell'; value: TableCell; depth: number }
    | { type: 'block'; value: DocumentBlock; depth: number }
  )[] = [];
  const pushBlocks = (blocks: readonly DocumentBlock[], depth: number) => {
    for (let i = blocks.length - 1; i >= 0; i--)
      stack.push({ type: 'block', value: blocks[i], depth });
  };
  const drain = () => {
    while (stack.length) {
      const { type, value: v, depth } = stack.pop()!;
      const reference = references.get(v);
      if (reference) item(depth, 'Reference ' + escape(reference.text));
      if (type === 'cell') {
        item(
          depth,
          'Cell ' +
            escape(v.id) +
            ' row=' +
            value(v.row) +
            ' column=' +
            value(v.column) +
            ' rowSpan=' +
            value(v.rowSpan) +
            ' columnSpan=' +
            value(v.columnSpan) +
            (v.geometryKnown ? '' : ' [geometry unknown]') +
            ' content=' +
            escape(v.contentState),
        );
        pushBlocks(v.blocks, depth + 1);
      } else if (v.type === 'paragraph') {
        item(
          depth,
          'Paragraph ' +
            escape(v.id) +
            ' (native paragraph=' +
            v.source.paragraph +
            '): ' +
            (v.displayText === null
              ? '[Unknown display text' +
                (v.reason ? ': ' + escape(v.reason) : ': not observed') +
                ']'
              : escape(v.displayText)),
        );
      } else if (v.type === 'table') {
        item(
          depth,
          'Table ' +
            escape(v.id) +
            ' rows=' +
            value(v.rows) +
            ' columns=' +
            value(v.columns) +
            ' [cell coordinates are zero-based]',
        );
        for (let i = v.cells.length - 1; i >= 0; i--)
          stack.push({ type: 'cell', value: v.cells[i], depth: depth + 1 });
      } else if (v.type === 'image') {
        const alt =
          v.altState === 'provided'
            ? 'alt=' + escape(v.alt)
            : v.altState === 'not-exposed'
              ? 'alt not observed'
              : 'alt not provided';
        let metadata = '';
        for (const key of [
          'section',
          'pictureNode',
          'recordNode',
          'componentNode',
          'ownerNode',
          'resourceId',
        ] as const)
          if (v.sourceInfo[key] !== undefined && v.sourceInfo[key] !== null)
            metadata += ' ' + key + '=' + v.sourceInfo[key];
        if (v.width !== undefined || v.height !== undefined)
          metadata +=
            ' width=' +
            value(v.width) +
            ' height=' +
            value(v.height) +
            ' unit=' +
            (v.sizeUnit ? escape(v.sizeUnit) : 'unknown');
        item(depth, '[Image ' + escape(v.id) + '; ' + alt + metadata + ']');
      } else
        item(
          depth,
          '[Unknown ' +
            escape(v.id) +
            '; ' +
            escape(v.kind) +
            '; ' +
            diagnostic(v.diagnostic) +
            ']',
        );
    }
  };
  const area = (label: string, v: PageArea) => {
    heading(
      2,
      label +
        ' (own definitions; declarations=' +
        v.declarations +
        ', inheritance=' +
        v.inheritance.state +
        ')',
    );
    if (v.inheritance.state === 'observed')
      item(
        0,
        'Inherited source section=' +
          value(v.inheritance.fromSection) +
          (v.inheritance.definitionId ? ' definition=' + escape(v.inheritance.definitionId) : ''),
      );
    if (v.declarations === 'unavailable') item(0, '[Warning: page-area declarations unavailable]');
    for (const def of v.definitions) {
      item(
        0,
        'Definition ' +
          escape(def.id) +
          ' apply=' +
          value(def.apply) +
          ' range=' +
          def.range.state +
          (def.range.state === 'observed'
            ? ' from=' + value(def.range.from) + ' to=' + value(def.range.to)
            : ''),
      );
      pushBlocks(def.blocks, 1);
      drain();
    }
  };
  for (const section of model.sections) {
    heading(1, 'Section ' + escape(section.id));
    area('Headers', section.header);
    heading(2, 'Body');
    pushBlocks(section.body, 0);
    drain();
    area('Footers', section.footer);
  }
  if (model.unplaced.length) {
    heading(1, 'Unplaced');
    for (const entry of model.unplaced) {
      item(0, '[Warning: ' + diagnostic(entry.diagnostic) + ']');
      pushBlocks([entry.block], 1);
      drain();
    }
  }
  if (model.warnings.length || !model.coverage.inventoryComplete) {
    heading(1, 'Warnings');
    if (!model.coverage.inventoryComplete) item(0, 'Inventory incomplete; this view is partial.');
    for (const warning of model.warnings) item(0, diagnostic(warning));
  }
  return chunks.join('');
}
