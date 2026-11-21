import { createdTableIdentity } from './created-table-identity.mjs';
import { validateCellFill } from './cell-fill-command.mjs';
import { CELL_BORDER_STYLES, CELL_BORDER_WIDTHS } from './cell-border-command.mjs';

const invalid = () => {
  throw TypeError('InvalidCreatedCellProperties');
};
function own(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return invalid();
  const array = Array.isArray(value);
  if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length > 32 || keys.some((key) => typeof key !== 'string')) return invalid();
  const out = array ? [] : Object.create(null);
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !Object.hasOwn(field, 'value')) return invalid();
    if (array && key === 'length') continue;
    if (!field.enumerable) return invalid();
    if (array && !/^(0|[1-9][0-9]*)$/.test(key)) return invalid();
    Object.defineProperty(out, key, { value: own(field.value, depth + 1), enumerable: true });
  }
  if (array && (out.length !== value.length || keys.length !== out.length + 1)) return invalid();
  return Object.freeze(out);
}
function shape(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    return invalid();
  return keys;
}
function uint(value, positive = false, max = 0xffffffff) {
  if (!Number.isInteger(value) || Object.is(value, -0) || value < Number(positive) || value > max)
    throw RangeError('InvalidCreatedCellPropertiesInteger');
  return value;
}
/** Patch-only boundary prevents callers from replacing the captured identity/address. */
export function captureCreatedCellPropertiesPatch(input) {
  const value = own(input);
  if (!shape(value, ['size', 'appearance', 'verticalAlignment']).length) return invalid();
  if (Object.hasOwn(value, 'verticalAlignment')) uint(value.verticalAlignment, false, 2);
  return value;
}
/** Distinct generated identity address. No source tableNode/listNode is accepted. */
export function captureCreatedCellPropertiesRequest(input) {
  const value = own(input);
  shape(
    value,
    ['section', 'identity', 'row', 'column', 'expected', 'size', 'appearance', 'verticalAlignment'],
    ['section', 'identity', 'row', 'column', 'expected'],
  );
  for (const key of ['section', 'row', 'column']) uint(value[key]);
  if (
    typeof value.identity !== 'string' ||
    createdTableIdentity(value.identity).toString() !== value.identity
  )
    throw RangeError('InvalidCreatedTableIdentity');
  shape(value.expected, ['width', 'height'], ['width', 'height']);
  uint(value.expected.width, true);
  uint(value.expected.height, true);
  let changed = Object.hasOwn(value, 'verticalAlignment');
  if (changed) uint(value.verticalAlignment, false, 2);
  if (Object.hasOwn(value, 'size')) {
    if (!shape(value.size, ['width', 'height']).length) return invalid();
    for (const key of Reflect.ownKeys(value.size)) uint(value.size[key], true);
    changed = true;
  }
  let appearance;
  if (Object.hasOwn(value, 'appearance')) {
    if (!shape(value.appearance, ['borders', 'fill']).length) return invalid();
    appearance = { ...value.appearance };
    if (Object.hasOwn(appearance, 'borders')) {
      const edges = shape(appearance.borders, ['left', 'right', 'top', 'bottom']);
      if (!edges.length) return invalid();
      for (const edge of edges) {
        const stroke = appearance.borders[edge];
        if (!shape(stroke, ['style', 'width', 'color']).length) return invalid();
        if (Object.hasOwn(stroke, 'style') && !CELL_BORDER_STYLES.includes(stroke.style))
          return invalid();
        if (Object.hasOwn(stroke, 'width') && !CELL_BORDER_WIDTHS.includes(stroke.width))
          return invalid();
        if (Object.hasOwn(stroke, 'color')) uint(stroke.color, false, 0xffffff);
      }
    }
    if (Object.hasOwn(appearance, 'fill')) appearance.fill = validateCellFill(appearance.fill);
    appearance = Object.freeze(appearance);
    changed = true;
  }
  if (!changed) return invalid();
  return Object.freeze({ ...value, ...(appearance ? { appearance } : {}) });
}

/** Shared source-only admission; Native capability stays false until writer integration. */
export function createdCellPropertiesMessage(input, state) {
  const request = captureCreatedCellPropertiesRequest(input);
  const content = state.content;
  if (state.status !== 'ready' || state.historyRecoveryRequired || content?.readOnly === true)
    throw Error('CreatedCellPropertiesReadOnly');
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited !== false ||
    content.window ||
    content.viewKind
  )
    throw Error('FullTableObservationRequired');
  if (
    state.capabilities?.createdCellPropertiesAvailable !== true ||
    content.createdCellPropertiesAvailable !== true
  )
    throw Error('CreatedCellPropertiesUnavailable');
  const tables = content.createdTables?.filter(
    (table) => table.section === request.section && table.identity === request.identity,
  );
  if (
    !Array.isArray(tables) ||
    tables.length !== 1 ||
    tables[0].partial ||
    request.row >= tables[0].rows ||
    request.column >= tables[0].columns
  )
    throw Error('InvalidCreatedCellPropertiesTarget');
  const cells = tables[0].cells?.filter(
    (cell) => cell.row === request.row && cell.column === request.column,
  );
  if (
    !Array.isArray(cells) ||
    cells.length !== 1 ||
    cells[0].width !== request.expected.width ||
    cells[0].height !== request.expected.height
  )
    throw Error('StaleCreatedCellProperties');
  if (
    request.verticalAlignment !== undefined &&
    (state.capabilities?.createdCellVerticalAlignmentAvailable !== true ||
      content.createdCellVerticalAlignmentAvailable !== true ||
      ![0, 1, 2].includes(cells[0].verticalAlignment))
  )
    throw Error('CreatedCellVerticalAlignmentUnavailable');
  return Object.freeze({ kind: 'created-cell-properties', ...request });
}
