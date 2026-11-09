import { CREATED_TABLE_GRID_ACTION } from './abi-schema.mjs';
import { createdTableIdentity } from './created-table-identity.mjs';

/** @typedef {'insert-row' | 'delete-row' | 'insert-column' | 'delete-column'} CreatedTableGridAction */
/** @typedef {{section: number, identity: string, action: CreatedTableGridAction, index: number}} CreatedTableGridRequest */
const actions = Object.freeze({
  'insert-row': CREATED_TABLE_GRID_ACTION.insert_row,
  'delete-row': CREATED_TABLE_GRID_ACTION.delete_row,
  'insert-column': CREATED_TABLE_GRID_ACTION.insert_column,
  'delete-column': CREATED_TABLE_GRID_ACTION.delete_column,
});
const fields = ['section', 'identity', 'action', 'index'];

// Read each own data descriptor once; never invoke getters or serialization hooks.
/** @param {unknown} input @returns {Readonly<CreatedTableGridRequest>} */
export function captureCreatedTableGridRequest(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw new TypeError('InvalidCreatedTableGridRequest');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)))
    throw new TypeError('InvalidCreatedTableGridRequest');
  const captured = Object.create(null);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidCreatedTableGridRequest');
    captured[key] = descriptor.value;
  }
  for (const key of ['section', 'index']) {
    const value = captured[key];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      Object.is(value, -0) ||
      value < 0 ||
      value > 0xffffffff
    )
      throw new RangeError('InvalidCreatedTableGridInteger');
  }
  const identity = createdTableIdentity(captured.identity);
  if (identity.toString() !== captured.identity)
    throw new RangeError('InvalidCreatedTableIdentity');
  if (typeof captured.action !== 'string' || !Object.hasOwn(actions, captured.action))
    throw new TypeError('InvalidCreatedTableGridAction');
  return Object.freeze(captured);
}

// This capability remains optional so older WASMs can still open documents.
export function createCreatedTableGridApi({ wasm, memory, check, prefix, unavailable }) {
  const name = `${prefix}_created_table_grid`;
  return {
    supportsCreatedTableGrid() {
      check();
      return typeof wasm[name] === 'function';
    },
    /** @param {CreatedTableGridRequest} request */
    editCreatedTableGrid(request) {
      check();
      const captured = captureCreatedTableGridRequest(request);
      const action = wasm[name];
      if (typeof action !== 'function') throw new Error(unavailable);
      const identity = BigInt(captured.identity);
      if (
        action(
          captured.section,
          Number(identity & 0xffffffffn),
          Number(identity >> 32n),
          actions[captured.action],
          captured.index,
        ) !== 1
      )
        throw memory.error();
    },
  };
}
