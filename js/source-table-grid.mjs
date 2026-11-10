import { CREATED_TABLE_GRID_ACTION } from './abi-schema.mjs';

const fields = ['section', 'tableNode', 'expectedRows', 'expectedColumns', 'action', 'index'];
const actions = Object.freeze({
  'insert-row': CREATED_TABLE_GRID_ACTION.insert_row,
  'delete-row': CREATED_TABLE_GRID_ACTION.delete_row,
  'insert-column': CREATED_TABLE_GRID_ACTION.insert_column,
  'delete-column': CREATED_TABLE_GRID_ACTION.delete_column,
});
/** @typedef {{section: number, tableNode: number, expectedRows: number, expectedColumns: number, action: 'insert-row' | 'delete-row' | 'insert-column' | 'delete-column', index: number, layout?: 'spec6' | 'observed8'}} SourceTableGridRequest */
/** Capture only owned data; never invoke getters or caller conversion hooks. */
export function captureSourceTableGridRequest(input, format) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw new TypeError('InvalidSourceTableGridRequest');
  const captured = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (!fields.includes(key) && key !== 'layout')
      throw new TypeError('InvalidSourceTableGridRequest');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidSourceTableGridRequest');
    captured[key] = descriptor.value;
  }
  for (const key of ['section', 'tableNode', 'expectedRows', 'expectedColumns', 'index']) {
    const value = captured[key];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      Object.is(value, -0) ||
      value < 0 ||
      value > 0xffffffff
    )
      throw new RangeError('InvalidSourceTableGridInteger');
  }
  if (!captured.expectedRows || !captured.expectedColumns)
    throw new RangeError('InvalidSourceTableGridDimensions');
  if (typeof captured.action !== 'string' || !Object.hasOwn(actions, captured.action))
    throw new TypeError('InvalidSourceTableGridAction');
  if (
    Object.hasOwn(captured, 'layout') &&
    captured.layout !== 'spec6' &&
    !(captured.layout === 'observed8' && format === 'hwp5')
  )
    throw new TypeError('InvalidSourceTableGridLayout');
  const row = captured.action === 'insert-row' || captured.action === 'delete-row';
  const insert = captured.action === 'insert-row' || captured.action === 'insert-column';
  const axis = row ? captured.expectedRows : captured.expectedColumns;
  if (
    captured.index > axis ||
    (!insert && (captured.index === axis || axis === 1)) ||
    (insert && axis === 0xffffffff)
  )
    throw new RangeError('InvalidSourceTableGridBounds');
  return Object.freeze(captured);
}

/** Optional ABI 6 addition: presence of the actual export is the capability. */
export function createSourceTableGridApi({ wasm, memory, check, prefix, unavailable }) {
  const name = `${prefix}_source_table_grid`;
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  return {
    supportsSourceTableGrid() {
      check();
      return typeof wasm[name] === 'function';
    },
    /** @param {SourceTableGridRequest} request */
    editSourceTableGrid(request) {
      check();
      const value = captureSourceTableGridRequest(request, format);
      const action = wasm[name];
      if (typeof action !== 'function') throw new Error(unavailable);
      if (
        action(
          value.section,
          value.tableNode,
          value.expectedRows,
          value.expectedColumns,
          actions[value.action],
          value.index,
          value.layout === 'observed8' ? 1 : 0,
        ) !== 1
      )
        throw memory.error();
    },
  };
}
