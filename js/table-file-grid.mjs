import { ABI_VERSION, CREATED_TABLE_GRID_ACTION } from './abi-schema.mjs';
import { createMemory } from './wasm-memory.mjs';
import { copyPictureInput, PICTURE_REPLACEMENT_LIMITS } from './picture-replacement-input.mjs';

export const TABLE_FILE_GRID_LIMITS = Object.freeze({
  documentBytes: 64 * 1024 * 1024,
  wasmBytes: PICTURE_REPLACEMENT_LIMITS.wasmBytes,
  outputBytes: 128 * 1024 * 1024,
});
const fields = [
  'format',
  'section',
  'tableNode',
  'expectedRows',
  'expectedColumns',
  'action',
  'index',
];
const actions = Object.freeze({
  'insert-row': CREATED_TABLE_GRID_ACTION.insert_row,
  'delete-row': CREATED_TABLE_GRID_ACTION.delete_row,
  'insert-column': CREATED_TABLE_GRID_ACTION.insert_column,
  'delete-column': CREATED_TABLE_GRID_ACTION.delete_column,
});
const uint = (value) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;

function captureRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    throw new TypeError('InvalidTableFileGridRequest');
  const captured = Object.create(null);
  for (const key of Reflect.ownKeys(request)) {
    if (!fields.includes(key) && key !== 'layout')
      throw new TypeError('InvalidTableFileGridRequest');
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidTableFileGridRequest');
    captured[key] = descriptor.value;
  }
  if (fields.some((key) => !Object.hasOwn(captured, key)))
    throw new TypeError('InvalidTableFileGridRequest');
  if (!['hwp5', 'hwpx'].includes(captured.format))
    throw new TypeError('InvalidTableFileGridFormat');
  for (const key of ['section', 'tableNode', 'expectedRows', 'expectedColumns', 'index'])
    if (!uint(captured[key])) throw new RangeError('InvalidTableFileGridInteger');
  if (captured.expectedRows === 0 || captured.expectedColumns === 0)
    throw new RangeError('InvalidTableFileGridDimensions');
  if (typeof captured.action !== 'string' || !Object.hasOwn(actions, captured.action))
    throw new TypeError('InvalidTableFileGridAction');
  if (
    Object.hasOwn(captured, 'layout') &&
    captured.layout !== 'spec6' &&
    !(captured.format === 'hwp5' && captured.layout === 'observed8')
  )
    throw new TypeError('InvalidTableFileGridLayout');
  const axis = captured.action.endsWith('row') ? captured.expectedRows : captured.expectedColumns;
  const insert = captured.action.startsWith('insert-');
  if (
    captured.index > axis ||
    (!insert && (captured.index === axis || axis === 1)) ||
    (insert && axis === 0xffffffff)
  )
    throw new RangeError('InvalidTableFileGridBounds');
  return captured;
}

/** Independent immutable file transform; edit is synchronous after instantiation. */
export async function createSourceTableGridFileApi(
  source,
  { instantiate = WebAssembly.instantiate } = {},
) {
  const binary =
    source instanceof WebAssembly.Module
      ? source
      : copyPictureInput(source, TABLE_FILE_GRID_LIMITS.wasmBytes, 'Wasm');
  const module = binary instanceof WebAssembly.Module ? binary : await WebAssembly.compile(binary);
  const { exports: wasm } = await instantiate(module, {});
  for (const name of [
    'hwpjs_abi_version',
    'cfb_alloc',
    'cfb_free',
    'cfb_error_ptr',
    'cfb_error_len',
    'table_file_grid_edit',
    'table_file_grid_ptr',
    'table_file_grid_len',
    'table_file_grid_free',
  ])
    if (typeof wasm?.[name] !== 'function') throw new Error('TableFileGridAbiUnavailable');
  if (wasm.hwpjs_abi_version() !== ABI_VERSION) throw new Error('TableFileGridAbiVersionMismatch');
  if (!(wasm.memory instanceof WebAssembly.Memory)) throw new Error('MissingTableFileGridMemory');
  const memory = createMemory(wasm);
  let closed = false,
    busy = false;
  return {
    edit(input, request) {
      if (closed) throw new Error('TableFileGridClosed');
      if (busy) throw new Error('TableFileGridBusy');
      // Guard descriptor traps and cleanup callbacks as well as the Native call.
      busy = true;
      try {
        const target = captureRequest(request);
        const document = copyPictureInput(input, TABLE_FILE_GRID_LIMITS.documentBytes, 'Document');
        const errors = [];
        let output;
        const attempt = (action) => {
          try {
            return action();
          } catch (error) {
            errors.push(error);
          }
        };
        attempt(() =>
          memory.withBytes(document, (ptr, length) =>
            attempt(() => {
              if (
                wasm.table_file_grid_edit(
                  target.format === 'hwp5' ? 1 : 2,
                  ptr,
                  length,
                  target.section,
                  target.tableNode,
                  target.expectedRows,
                  target.expectedColumns,
                  actions[target.action],
                  target.index,
                  target.layout === 'observed8' ? 1 : 0,
                ) !== 1
              )
                throw memory.error();
              const pointer = wasm.table_file_grid_ptr(),
                size = wasm.table_file_grid_len();
              if (
                !uint(pointer) ||
                pointer === 0 ||
                !uint(size) ||
                size === 0 ||
                size > TABLE_FILE_GRID_LIMITS.outputBytes ||
                pointer > wasm.memory.buffer.byteLength - size
              )
                throw new RangeError('InvalidTableFileGridOutput');
              output = memory.copy(pointer, size);
            }),
          ),
        );
        attempt(() => wasm.table_file_grid_free());
        if (errors.length > 1) throw new AggregateError(errors, 'TableFileGridAndCleanupFailed');
        if (errors.length === 1) throw errors[0];
        return output;
      } finally {
        busy = false;
      }
    },
    close() {
      if (busy) throw new Error('TableFileGridBusy');
      if (!closed) {
        closed = true;
        wasm.table_file_grid_free();
      }
    },
  };
}
