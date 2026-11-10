import { resolveTableReference } from './table-reference-resolution.ts';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import {
  createSourceTableGridFileApi,
  TABLE_FILE_GRID_LIMITS as limits,
} from '../../../js/table-file-grid.mjs';
import { copyPictureInput } from '../../../js/picture-replacement-input.mjs';
import { openDocument } from './engine.ts';
import { readDocumentModel } from './document-model.ts';
import { parseObjectReference } from './object-reference.ts';
import type { DocumentFormat } from './types/native-document.ts';
import type { ObservationSdk } from './types/document-view.ts';

export type TableGridAction = 'insert-row' | 'delete-row' | 'insert-column' | 'delete-column';

interface GridDocument {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
  close(): void | Promise<void>;
}
interface TableGridEditor {
  edit(
    bytes: Uint8Array,
    target: {
      format: DocumentFormat;
      section: number;
      tableNode: number;
      expectedRows: number;
      expectedColumns: number;
      action: TableGridAction;
      index: number;
      layout?: 'spec6' | 'observed8';
    },
  ): unknown;
  close(): void | Promise<void>;
}
export interface TableGridDependencies {
  openDocument?: (input: {
    bytes: Uint8Array;
    wasm: Uint8Array;
    expectedSha256: string;
  }) => Promise<GridDocument>;
  readDocumentModel?: (input: unknown) => Promise<unknown>;
  createGridApi?: (wasm: Uint8Array) => Promise<TableGridEditor>;
}
export interface TableGridResult {
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
  if (!record(value)) throw new TypeError('InvalidTableGridModel');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor && optional) return undefined;
  if (!descriptor || !Object.hasOwn(descriptor, 'value'))
    throw new TypeError('InvalidTableGridModel');
  return descriptor.value;
}

// 현재 문서에서 소유권과 격자를 관측하고 별도 WASM 인스턴스로 새 파일을 만듭니다.
export async function editDocumentTableGrid(
  input: unknown,
  dependencies: TableGridDependencies = {},
): Promise<TableGridResult> {
  if (
    !record(input) ||
    Reflect.ownKeys(input).some(
      (key) =>
        typeof key !== 'string' ||
        ![
          'bytes',
          'wasm',
          'reference',
          'action',
          'index',
          'expectedRows',
          'expectedColumns',
          'layout',
        ].includes(key),
    )
  )
    throw new TypeError('InvalidTableGridInput');
  const source = copyPictureInput(field(input, 'bytes'), limits.documentBytes, 'Document');
  const wasm = copyPictureInput(field(input, 'wasm'), limits.wasmBytes, 'Wasm');
  const reference = field(input, 'reference');
  const target = parseObjectReference(reference);
  if (target.kind !== 'table' || typeof reference !== 'string')
    throw new TypeError('ExpectedTableReference');
  const action = field(input, 'action');
  const index = field(input, 'index');
  const expectedRows = field(input, 'expectedRows');
  const expectedColumns = field(input, 'expectedColumns');
  const layout = field(input, 'layout', true);
  if (
    typeof action !== 'string' ||
    !['insert-row', 'delete-row', 'insert-column', 'delete-column'].includes(action) ||
    !uint(index) ||
    !uint(expectedRows) ||
    !uint(expectedColumns) ||
    expectedRows < 1 ||
    expectedColumns < 1 ||
    (Object.hasOwn(input, 'layout') && layout !== 'spec6' && layout !== 'observed8')
  )
    throw new TypeError('InvalidTableGridInput');
  const axis = action.endsWith('row') ? expectedRows : expectedColumns;
  const inserting = action.startsWith('insert-');
  if (inserting ? index > axis || axis === 0xffffffff : index >= axis || axis === 1)
    throw new RangeError('InvalidTableGridIndex');
  const format = detectDocumentFormat(source);
  if (format === 'hwpx' && layout === 'observed8') throw new TypeError('InvalidTableGridLayout');
  if (target.format !== format) throw new Error('ObjectReferenceFormatMismatch');
  // 위의 입력 스냅샷은 첫 await 전에 모두 완료됩니다.
  const hash = await crypto.subtle.digest('SHA-256', source);
  const sourceSha256 = Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  if (sourceSha256 !== target.sourceSha256) throw new Error('StaleObjectReference');
  const open = dependencies.openDocument ?? openDocument;
  const observe = dependencies.readDocumentModel ?? readDocumentModel;
  const create = dependencies.createGridApi ?? createSourceTableGridFileApi;
  const releases: (() => void | Promise<void>)[] = [];
  const own = (resource: unknown) => {
    const close = field(resource, 'close');
    if (typeof close !== 'function') throw new TypeError('InvalidTableGridResource');
    releases.push(() => Reflect.apply(close, resource, []) as void | Promise<void>);
  };
  let result: TableGridResult | undefined,
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
      throw new Error('InvalidTableGridDocument');
    const model = await observe({ format, sourceSha256, sectionCount, sdk });
    const selected = resolveTableReference(
      model,
      reference,
      { format, sourceSha256, sectionCount },
      true,
    );
    if (selected.expectedRows !== expectedRows || selected.expectedColumns !== expectedColumns)
      throw new Error('TableGridDimensionsMismatch');
    const editor = await create(Uint8Array.from(wasm));
    own(editor);
    const edit = field(editor, 'edit');
    if (typeof edit !== 'function') throw new TypeError('InvalidTableGridResource');
    const output: unknown = Reflect.apply(edit, editor, [
      source,
      {
        format,
        section: selected.section,
        tableNode: selected.tableNode,
        expectedRows,
        expectedColumns,
        action: action as TableGridAction,
        index,
        ...(layout === undefined ? {} : { layout }),
      },
    ]);
    const bytes = copyPictureInput(output, limits.outputBytes, 'Output');
    if (detectDocumentFormat(bytes) !== format) throw new Error('TableGridFormatMismatch');
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
    throw new AggregateError(failed ? [failure, ...cleanup] : cleanup, 'TableGridCleanupFailed');
  if (failed) throw failure;
  if (!result) throw new Error('InvalidTableGridResult');
  return result;
}
