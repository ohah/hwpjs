import type {
  DocumentView,
  DocumentBlock,
  ObjectReference,
  ReadFormat,
} from './types/document-view.ts';
import type { OpenedDocument } from './types/native-document.ts';
import { parseObjectReference, canonicalImageId } from './object-reference.ts';
import { createDisplayEscaper } from './render-escape.ts';
import { readDocumentModel } from './document-model.ts';

const MAX_ROWS = 200000;
const MAX_TEXT_BYTES = 64 * 1024;
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// 실제 투영의 참조만 조회합니다. URI 문법이 맞는 것만으로 소유권을 인정하지 않습니다.
function findObject(
  model: DocumentView,
  reference: string,
  expected: Pick<ObjectReference, 'format' | 'sourceSha256'>,
): DocumentBlock {
  if (
    model?.version !== 1 ||
    model.format !== expected.format ||
    model.sourceSha256 !== expected.sourceSha256 ||
    !Array.isArray(model.sections) ||
    !Array.isArray(model.unplaced)
  )
    throw new Error('InvalidObjectModel');
  const stack: DocumentBlock[] = [];
  for (const section of model.sections) {
    if (!Array.isArray(section.body)) throw new Error('InvalidObjectModel');
    for (const block of section.body) stack.push(block);
    for (const name of ['header', 'footer'] as const) {
      if (!Array.isArray(section[name]?.definitions)) throw new Error('InvalidObjectModel');
      for (const definition of section[name].definitions) {
        if (!Array.isArray(definition.blocks)) throw new Error('InvalidObjectModel');
        for (const block of definition.blocks) stack.push(block);
      }
    }
  }
  for (const row of model.unplaced) stack.push(row.block);
  const visited = new Set(),
    references = new Set(),
    identities = new Set();
  let found: DocumentBlock | undefined;
  while (stack.length) {
    const block = stack.pop();
    if (
      !record(block) ||
      visited.has(block) ||
      typeof block.id !== 'string' ||
      block.id.length === 0 ||
      identities.has(block.id)
    )
      throw new Error('InvalidObjectModel');
    identities.add(block.id);
    visited.add(block);
    if (visited.size > MAX_ROWS) throw new RangeError('ObjectInventoryLimitExceeded');
    if (block.reference !== null && block.reference !== undefined) {
      const parsed = parseObjectReference(block.reference, expected);
      const kind = block.type === 'unknown' ? block.kind : block.type;
      const source = block.type === 'image' ? block.sourceInfo : block.source;
      const node =
        block.type === 'image'
          ? block.sourceInfo?.pictureNode
          : block.type === 'table'
            ? block.source?.tableNode
            : block.source?.node;
      if (
        kind !== parsed.kind ||
        source?.section !== parsed.section ||
        node !== parsed.node ||
        references.has(block.reference)
      )
        throw new Error('InvalidObjectModel');
      references.add(block.reference);
      if (block.reference === reference) found = block;
    }
    if (block.type === 'table') {
      if (!Array.isArray(block.cells) || block.cells.length > MAX_ROWS)
        throw new Error('InvalidObjectModel');
      for (const cell of block.cells) {
        if (!Array.isArray(cell.blocks)) throw new Error('InvalidObjectModel');
        for (const child of cell.blocks) stack.push(child);
      }
    }
  }
  if (!found) throw new Error('ObjectReferenceNotFound');
  return found;
}

// 상세 출력은 소유한 문자열만 반환하며 바이너리나 SDK 참조를 보관하지 않습니다.
interface ObjectOptions {
  bytes?: Uint8Array;
  wasm?: Uint8Array;
  reference?: string;
  format?: ReadFormat;
}
interface ObjectDependencies {
  openDocument?: (input: unknown) => Promise<OpenedDocument>;
  readDocumentModel?: (input: unknown) => Promise<DocumentView>;
}
export interface ObjectInspection {
  schemaVersion: 1;
  format: OpenedDocument['format'];
  sourceSha256: string;
  reference: string;
  kind: ObjectReference['kind'];
  status: 'available' | 'unavailable';
  text: string;
}
export async function inspectDocumentObject(
  { bytes, wasm, reference, format = 'text' }: ObjectOptions = {},
  dependencies: ObjectDependencies = {},
): Promise<ObjectInspection> {
  if (!['text', 'markdown'].includes(format)) throw new TypeError('InvalidRenderFormat');
  const target = parseObjectReference(reference);
  if (typeof reference !== 'string') throw new TypeError('InvalidObjectReference');
  const open = dependencies.openDocument ?? (await import('./engine.ts')).openDocument;
  const collect = dependencies.readDocumentModel ?? readDocumentModel;
  const document = await open({ bytes, wasm, expectedSha256: target.sourceSha256 });
  let failed = false,
    failure: unknown,
    output: ObjectInspection | undefined;
  try {
    parseObjectReference(reference, {
      sourceSha256: document.sourceSha256,
      format: document.format,
    });
    if (
      !uint(document.sectionCount) ||
      document.sectionCount < 1 ||
      document.sectionCount > 4096 ||
      target.section >= document.sectionCount
    )
      throw new Error('InvalidObjectSection');
    const model = await collect({
      sdk: document.sdk,
      format: document.format,
      sourceSha256: document.sourceSha256,
      sectionCount: document.sectionCount,
    });
    const block = findObject(model, reference, {
      sourceSha256: document.sourceSha256,
      format: document.format,
    });
    const escape = createDisplayEscaper({ format, view: 'content' });
    const lines: string[] = [];
    let size = 0,
      status: 'available' | 'unavailable' = 'available';
    const line = (value: unknown) => {
      if (typeof value !== 'string' || value.length > MAX_TEXT_BYTES)
        throw new RangeError('ObjectDetailLimitExceeded');
      const output = escape(value);
      size += new TextEncoder().encode(output).length + 1;
      if (size > MAX_TEXT_BYTES) throw new RangeError('ObjectDetailLimitExceeded');
      lines.push(output);
    };
    const unavailable = (reason: unknown) => {
      status = 'unavailable';
      line(`상세 조회 불가: ${reason}`);
    };
    const scalarFields = (source: unknown, keys: readonly string[]) => {
      if (!record(source)) throw new Error('InvalidObjectDetail');
      for (const key of keys) {
        const value = source[key];
        if (value === null || value === undefined) continue;
        if (
          !['string', 'boolean', 'number'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          throw new Error('InvalidObjectDetail');
        line(`${key}: ${value}`);
      }
    };
    const rows = (value: unknown): Record<string, unknown>[] => {
      if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error('InvalidObjectDetail');
      if (!value.every(record)) throw new Error('InvalidObjectDetail');
      return value;
    };
    const query = (
      method: 'chartDisplay' | 'equationScript' | 'oleSource',
      ...args: number[]
    ): { ok: false } | { ok: true; value: unknown } => {
      const getter: unknown = Reflect.get(document.sdk, method);
      if (typeof getter !== 'function') {
        unavailable(`${method} 미지원`);
        return { ok: false };
      }
      try {
        return { ok: true, value: Reflect.apply(getter, document.sdk, args) as unknown };
      } catch (error) {
        unavailable(
          `${method}: ${record(error) && typeof error.message === 'string' ? error.message : '원인 미확인'}`,
        );
        return { ok: false };
      }
    };
    line(`개체 종류: ${target.kind}`);
    line(`참조: ${reference}`);
    line(`원본 위치: 구역 ${target.section}, 노드 ${target.node}`);
    if (block.type === 'unknown' && block.detailUnavailable === true)
      unavailable(block.diagnostic?.code ?? '원본 재고에 상세 조회 오류가 관측됨');
    else if (target.kind === 'image') {
      if (block.type !== 'image') throw new Error('InvalidObjectDetail');
      scalarFields(block.sourceInfo, ['recordNode', 'componentNode', 'ownerNode', 'resourceId']);
      scalarFields(block, ['width', 'height', 'sizeUnit', 'alt']);
      line(`이미지 ID: ${canonicalImageId(target)}`);
      line(`이미지 추출: hwpjs extract-images 입력파일 --ref ${reference} --output 새출력폴더`);
      line('이미지 바이트는 읽지 않았습니다. 렌더링 지원 여부와 추출 가능 여부는 별도입니다.');
    } else if (target.kind === 'table') {
      if (block.type !== 'table') throw new Error('InvalidObjectDetail');
      scalarFields(block, ['rows', 'columns']);
      for (const cell of rows(block.cells)) {
        line(`셀 원본: ${record(cell.source) ? (cell.source.listNode ?? '미확인') : '미확인'}`);
        scalarFields(cell, [
          'row',
          'column',
          'rowSpan',
          'columnSpan',
          'geometryKnown',
          'contentState',
        ]);
        for (const child of rows(cell.blocks)) {
          if (child.type === 'paragraph') {
            if (child.displayText === null) {
              status = 'unavailable';
              line('문단 내용 미관측');
            } else if (typeof child.displayText !== 'string')
              throw new Error('InvalidObjectDetail');
            else line(child.displayText);
          } else
            line(
              `포함 개체: ${child.type === 'unknown' ? child.kind : child.type}${child.reference ? `, 참조: ${child.reference}` : ', 상세 참조 없음'}`,
            );
        }
      }
    } else if (target.kind === 'chart' && document.format === 'hwpx') {
      const result = query('chartDisplay', target.section, target.node);
      if (result.ok) {
        const detail = result.value;
        if (
          !record(detail) ||
          detail.kind !== 'chart_display' ||
          !record(detail.pair) ||
          detail.pair.wrapper_node !== target.node ||
          detail.pair.section_ordinal !== target.section
        )
          throw new Error('InvalidObjectDetail');
        scalarFields(detail.pair, ['chart_path', 'ole_path', 'declared_external']);
        for (const row of rows(detail.rich_text))
          scalarFields(row, ['owner_role', 'owner_node', 'text', 'plain_text_complete']);
        for (const row of rows(detail.series_text)) scalarFields(row, ['series_node', 'text']);
        const bindings = new Map<number, Record<string, unknown>>();
        if (detail.bindings !== undefined)
          for (const binding of rows(detail.bindings)) {
            if (!record(binding) || !uint(binding.point) || bindings.has(binding.point))
              throw new Error('InvalidObjectDetail');
            bindings.set(binding.point, binding);
          }
        let pointOrdinal = 0;
        for (const row of rows(detail.points)) {
          line(`값 순번: ${pointOrdinal}`);
          scalarFields(row, ['kind', 'index', 'value']);
          const binding = bindings.get(pointOrdinal++);
          if (binding) scalarFields(binding, ['series_node', 'plot_node', 'role_node', 'role']);
          else line('계열과 역할 관계 미관측');
        }
        for (const ordinal of bindings.keys())
          if (ordinal >= pointOrdinal) throw new Error('InvalidObjectDetail');
        line('차트 메타데이터 조회이며 외부 자원 다운로드나 바이너리 추출은 하지 않았습니다.');
      }
    } else if (target.kind === 'equation' && document.format === 'hwpx') {
      const result = query('equationScript', target.section, target.node);
      if (result.ok) {
        if (typeof result.value !== 'string') throw new Error('InvalidObjectDetail');
        line(`수식 원문: ${result.value}`);
      }
    } else if (target.kind === 'ole' && document.format === 'hwpx') {
      const result = query('oleSource', target.section, target.node);
      if (result.ok) {
        const keys = [
          'binary_item_id',
          'object_type',
          'draw_aspect',
          'has_moniker',
          'transform_identity',
        ];
        scalarFields(result.value, keys);
        const detail = result.value;
        if (!record(detail)) throw new Error('InvalidObjectDetail');
        if (!keys.some((key) => detail[key] !== null && detail[key] !== undefined))
          unavailable('OLE 원본 상세 필드가 관측되지 않았습니다.');
      }
      line('OLE 바이너리는 읽지 않았습니다.');
    } else {
      scalarFields(block, ['nativeKind', 'subtype']);
      unavailable('종류와 원본 위치는 관측했으나 현재 공통 상세 조회가 지원되지 않습니다.');
    }
    line(`상태: ${status}`);
    output = {
      schemaVersion: 1,
      format: document.format,
      sourceSha256: document.sourceSha256,
      reference,
      kind: target.kind,
      status,
      text: lines.join('\n') + '\n',
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await document.close();
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentObjectInspectionAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentObjectInspectionCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  if (!output) throw new Error('InvalidObjectDetail');
  return output;
}
