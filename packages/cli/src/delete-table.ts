import { detectDocumentFormat } from '../../../js/document-format.mjs';
import {
  createTableDeleter,
  TABLE_FILE_DELETION_LIMITS as limits,
} from '../../../js/table-file-deletion.mjs';
import { copyPictureInput } from '../../../js/picture-replacement-input.mjs';
import { openDocument } from './engine.ts';
import { readDocumentModel } from './document-model.ts';
import { parseObjectReference } from './object-reference.ts';
import type { DocumentFormat } from './types/native-document.ts';
import type { ObservationSdk } from './types/document-view.ts';

interface DeletionDocument {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
  close(): void | Promise<void>;
}
interface TableDeleter {
  delete(
    bytes: Uint8Array,
    target: { format: DocumentFormat; section: number; tableNodes: number[] },
  ): unknown;
  close(): void | Promise<void>;
}
export interface TableDeletionDependencies {
  openDocument?: (input: {
    bytes: Uint8Array;
    wasm: Uint8Array;
    expectedSha256: string;
  }) => Promise<DeletionDocument>;
  readDocumentModel?: (input: unknown) => Promise<unknown>;
  createDeleter?: (wasm: Uint8Array) => Promise<TableDeleter>;
}
export interface TableDeletionResult {
  format: DocumentFormat;
  sourceSha256: string;
  bytes: Uint8Array;
  layoutRequiresReflow: true;
  previewStale: true;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
function field(value: unknown, key: string, optional = false): unknown {
  if (!record(value)) throw new TypeError('InvalidTableDeletionModel');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor && optional) return undefined;
  if (!descriptor || !Object.hasOwn(descriptor, 'value'))
    throw new TypeError('InvalidTableDeletionModel');
  return descriptor.value;
}

// 관측한 블록만 선형 순회합니다. 기하 기반 행×열 확장이나 원문 편집 모델 생성은 없습니다.
function resolveTable(
  model: unknown,
  reference: string,
  expected: {
    format: DocumentFormat;
    sourceSha256: string;
    sectionCount: number;
  },
): { section: number; tableNode: number } {
  if (
    field(model, 'version') !== 1 ||
    field(model, 'format') !== expected.format ||
    field(model, 'sourceSha256') !== expected.sourceSha256
  )
    throw new Error('InvalidTableDeletionModel');
  const maximum = 200000;
  let edges = 0;
  function list(value: unknown, visit: (item: unknown) => void) {
    if (!Array.isArray(value)) throw new TypeError('InvalidTableDeletionModel');
    const length: unknown = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!uint(length) || length > maximum - edges)
      throw new RangeError('TableInventoryLimitExceeded');
    edges += length;
    for (let index = 0; index < length; index++) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !Object.hasOwn(item, 'value')) throw new TypeError('InvalidTableDeletionModel');
      visit(item.value);
    }
  }
  const stack: { value: unknown; section: number | null; depth: number }[] = [];
  const sections = new Set<number>();
  list(field(model, 'sections'), (section) => {
    const number = field(field(section, 'source'), 'section');
    if (!uint(number) || number >= expected.sectionCount || sections.has(number))
      throw new Error('InvalidTableDeletionModel');
    sections.add(number);
    const enqueue = (value: unknown) => stack.push({ value, section: number, depth: 0 });
    list(field(section, 'body'), enqueue);
    for (const area of ['header', 'footer'])
      list(field(field(section, area), 'definitions'), (definition) =>
        list(field(definition, 'blocks'), enqueue),
      );
  });
  list(field(model, 'unplaced'), (row) =>
    stack.push({ value: field(row, 'block'), section: null, depth: 0 }),
  );
  const visited = new Set<object>(),
    identities = new Set<string>(),
    references = new Set<string>();
  const tables = new Map<string, { section: number; tableNode: number }>();
  while (stack.length) {
    const entry = stack.pop()!;
    if (!record(entry.value) || visited.has(entry.value) || entry.depth > 64)
      throw new Error('InvalidTableDeletionModel');
    visited.add(entry.value);
    const id = field(entry.value, 'id'),
      type = field(entry.value, 'type');
    if (
      typeof id !== 'string' ||
      !id ||
      identities.has(id) ||
      typeof type !== 'string' ||
      !['paragraph', 'table', 'image', 'unknown'].includes(type)
    )
      throw new Error('InvalidTableDeletionModel');
    identities.add(id);
    const value = field(entry.value, 'reference', true);
    if (value !== null && value !== undefined) {
      const parsed = parseObjectReference(value, expected);
      const kind = type === 'unknown' ? field(entry.value, 'kind') : type;
      if (
        parsed.kind !== kind ||
        typeof value !== 'string' ||
        references.has(value) ||
        (entry.section !== null && parsed.section !== entry.section) ||
        parsed.section >= expected.sectionCount
      )
        throw new Error('InvalidTableDeletionModel');
      references.add(value);
      if (type === 'table') {
        const source = field(entry.value, 'source');
        const section = field(source, 'section'),
          tableNode = field(source, 'tableNode');
        if (
          !uint(section) ||
          !uint(tableNode) ||
          section !== parsed.section ||
          tableNode !== parsed.node
        )
          throw new Error('InvalidTableDeletionModel');
        tables.set(value, { section, tableNode });
      }
    }
    if (type === 'table')
      list(field(entry.value, 'cells'), (cell) =>
        list(field(cell, 'blocks'), (value) =>
          stack.push({ value, section: entry.section, depth: entry.depth + 1 }),
        ),
      );
  }
  const selected = tables.get(reference);
  if (!selected) throw new Error('TableReferenceNotFound');
  return selected;
}

// 읽기 SDK는 관측에만 빌리고 삭제는 별도 WASM 인스턴스의 새 파일 변환으로 수행합니다.
export async function deleteDocumentTable(
  input: unknown,
  dependencies: TableDeletionDependencies = {},
): Promise<TableDeletionResult> {
  if (
    !record(input) ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== 'string' || !['bytes', 'wasm', 'reference'].includes(key),
    )
  )
    throw new TypeError('InvalidTableDeletionInput');
  const source = copyPictureInput(field(input, 'bytes'), limits.documentBytes, 'Document');
  const wasm = copyPictureInput(field(input, 'wasm'), limits.wasmBytes, 'Wasm');
  const reference = field(input, 'reference');
  const target = parseObjectReference(reference);
  if (target.kind !== 'table' || typeof reference !== 'string')
    throw new TypeError('ExpectedTableReference');
  const format = detectDocumentFormat(source);
  if (target.format !== format) throw new Error('ObjectReferenceFormatMismatch');
  // 위의 입력 스냅샷은 첫 await 전에 모두 완료됩니다.
  const hash = await crypto.subtle.digest('SHA-256', source);
  const sourceSha256 = Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  if (sourceSha256 !== target.sourceSha256) throw new Error('StaleObjectReference');
  const open = dependencies.openDocument ?? openDocument;
  const observe = dependencies.readDocumentModel ?? readDocumentModel;
  const create = dependencies.createDeleter ?? createTableDeleter;
  const releases: (() => void | Promise<void>)[] = [];
  const own = (resource: unknown) => {
    const close = field(resource, 'close');
    if (typeof close !== 'function') throw new TypeError('InvalidTableDeletionResource');
    releases.push(() => Reflect.apply(close, resource, []) as void | Promise<void>);
  };
  let result: TableDeletionResult | undefined,
    failed = false,
    failure: unknown;
  try {
    const document = await open({
      bytes: Uint8Array.from(source),
      wasm: Uint8Array.from(wasm),
      expectedSha256: sourceSha256,
    });
    own(document);
    const sectionCount = field(document, 'sectionCount'),
      sdk = field(document, 'sdk');
    if (
      field(document, 'format') !== format ||
      field(document, 'sourceSha256') !== sourceSha256 ||
      !uint(sectionCount) ||
      sectionCount < 1 ||
      sectionCount > 4096 ||
      target.section >= sectionCount ||
      !record(sdk)
    )
      throw new Error('InvalidTableDeletionDocument');
    const model = await observe({ format, sourceSha256, sectionCount, sdk });
    const selected = resolveTable(model, reference, { format, sourceSha256, sectionCount });
    const deleter = await create(Uint8Array.from(wasm));
    own(deleter);
    const remove = field(deleter, 'delete');
    if (typeof remove !== 'function') throw new TypeError('InvalidTableDeletionResource');
    const output: unknown = Reflect.apply(remove, deleter, [
      source,
      { format, section: selected.section, tableNodes: [selected.tableNode] },
    ]);
    const bytes = copyPictureInput(output, limits.outputBytes, 'Output');
    if (detectDocumentFormat(bytes) !== format) throw new Error('TableDeletionFormatMismatch');
    result = { format, sourceSha256, bytes, layoutRequiresReflow: true, previewStale: true };
  } catch (error) {
    failed = true;
    failure = error;
  }
  const cleanup: unknown[] = [];
  for (let index = releases.length - 1; index >= 0; index--) {
    try {
      await releases[index]();
    } catch (error) {
      cleanup.push(error);
    }
  }
  if (cleanup.length)
    throw new AggregateError(
      failed ? [failure, ...cleanup] : cleanup,
      'TableDeletionCleanupFailed',
    );
  if (failed) throw failure;
  if (!result) throw new Error('InvalidTableDeletionResult');
  return result;
}
