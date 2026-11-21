import { validateCreatedTables } from './hwpx-created-tables.mjs';
import { decodeHwp5CreatedTables } from './hwp5-created-tables.mjs';
import {
  BORDER_LINE_STYLES as CELL_BORDER_STYLES,
  BORDER_WIDTHS_HUNDREDTH_MM as CELL_BORDER_WIDTHS,
} from './border-fill-values.mjs';
import { validateCellFill } from './cell-fill-command.mjs';
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw Error('InvalidCreatedCellProjection');
}
const uint = (n, max = 0xffffff) => Number.isInteger(n) && n >= 0 && n <= max;
export function validateCreatedCellAppearance(value) {
  exact(value, ['edges', 'background', 'diagonal']);
  if (!Array.isArray(value.edges) || value.edges.length !== 4)
    throw Error('InvalidCreatedCellProjection');
  for (const edge of value.edges) {
    exact(edge, ['style', 'width_hundredth_mm', 'color']);
    if (
      (edge.style !== null && !CELL_BORDER_STYLES.includes(edge.style)) ||
      (edge.width_hundredth_mm !== null && !CELL_BORDER_WIDTHS.includes(edge.width_hundredth_mm)) ||
      (edge.color !== null && !uint(edge.color))
    )
      throw Error('InvalidCreatedCellProjection');
  }
  exact(value.diagonal, ['directions', 'stroke']);
  exact(value.diagonal.stroke, ['style', 'width_hundredth_mm', 'color']);
  const ds = value.diagonal.stroke;
  if (
    (ds.style !== null && !CELL_BORDER_STYLES.includes(ds.style)) ||
    (ds.width_hundredth_mm !== null && !CELL_BORDER_WIDTHS.includes(ds.width_hundredth_mm)) ||
    (ds.color !== null && !uint(ds.color))
  )
    throw Error('InvalidCreatedCellProjection');
  const d = value.diagonal.directions;
  if (d !== null && !['none', 'rising', 'falling', 'cross'].includes(d))
    throw Error('InvalidCreatedCellProjection');
  if (value.background !== null) {
    const keys = Object.keys(value.background);
    if (keys.length !== 1) throw Error('InvalidCreatedCellProjection');
    const kind = keys[0],
      f = value.background[kind];
    if (kind === 'none') {
      exact(f, []);
    } else if (kind === 'solid') {
      exact(f, ['color', 'hatch_color']);
      if (!uint(f.color) || (f.hatch_color !== null && !uint(f.hatch_color)))
        throw Error('InvalidCreatedCellProjection');
    } else if (kind === 'hatch') {
      exact(f, ['face', 'hatch', 'style']);
      validateCellFill({ kind, face: f.face, hatch: f.hatch, style: f.style });
    } else if (kind === 'linear') {
      exact(f, ['colors', 'angle', 'center_x', 'center_y', 'step', 'step_center']);
      validateCellFill({
        kind,
        colors: f.colors,
        angle: f.angle,
        centerX: f.center_x,
        centerY: f.center_y,
        step: f.step,
        stepCenter: f.step_center,
      });
    } else throw Error('InvalidCreatedCellProjection');
  }
  return value;
}
export function decodeCreatedCellDocumentProjection(bytes, format, alignmentBytes) {
  const value = JSON.parse(decoder.decode(bytes));
  exact(value, ['schemaVersion', 'format', 'sections', 'styles']);
  if (
    value.schemaVersion !== 1 ||
    value.format !== format ||
    !['hwp5', 'hwpx'].includes(format) ||
    !Array.isArray(value.sections) ||
    !Array.isArray(value.styles) ||
    value.styles.length > 100000
  )
    throw Error('InvalidCreatedCellProjection');
  const owners = new Map(),
    identities = new Set(),
    sections = [];
  for (const [section, part] of value.sections.entries()) {
    exact(part, ['section', 'tables']);
    if (part.section !== section) throw Error('InvalidCreatedCellProjection');
    const rows =
      format === 'hwp5'
        ? decodeHwp5CreatedTables(encoder.encode(JSON.stringify(part.tables)), {
            cellGeometryVersion: 1,
          })
        : validateCreatedTables(part.tables, { cellGeometryVersion: 1 });
    sections.push(rows);
    for (const row of rows) {
      const table = format === 'hwp5' ? row.table : row;
      if (identities.has(table.identity)) throw Error('InvalidCreatedCellProjection');
      identities.add(table.identity);
      table.createdCellPropertiesVersion = 1;
      for (const cell of table.cells) {
        owners.set(`${section}:${table.identity}:${cell.row}:${cell.column}`, cell);
        if (owners.size > 100000) throw Error('LimitExceeded');
      }
    }
  }
  if (owners.size !== value.styles.length) throw Error('InvalidCreatedCellProjection');
  const seen = new Set();
  for (const entry of value.styles) {
    exact(entry, [
      'section',
      'identity',
      'row',
      'column',
      'value',
      'resource_id',
      'raw_sha256',
      'effects_supported',
      'raw_origin',
    ]);
    if (
      !uint(entry.resource_id, 0xffffffff) ||
      !uint(entry.section, 0xffffffff) ||
      typeof entry.effects_supported !== 'boolean' ||
      typeof entry.raw_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.raw_sha256)
    )
      throw Error('InvalidCreatedCellProjection');
    if (
      !['save_materialized_resource', 'owned_absent_profile'].includes(entry.raw_origin) ||
      (entry.raw_origin === 'owned_absent_profile' &&
        (format !== 'hwp5' || entry.resource_id !== 0))
    )
      throw Error('InvalidCreatedCellProjection');
    if (
      typeof entry.identity !== 'string' ||
      !uint(entry.row, 0xffffffff) ||
      !uint(entry.column, 0xffffffff)
    )
      throw Error('InvalidCreatedCellProjection');
    const key = `${entry.section}:${entry.identity}:${entry.row}:${entry.column}`,
      cell = owners.get(key);
    if (!cell || seen.has(key)) throw Error('InvalidCreatedCellProjection');
    seen.add(key);
    cell.createdCellAppearance = {
      value: validateCreatedCellAppearance(entry.value),
      effectsSupported: entry.effects_supported,
      resourceId: entry.resource_id,
      rawSHA256: entry.raw_sha256,
      rawOrigin: entry.raw_origin,
    };
  }
  if (alignmentBytes !== undefined) {
    const alignment = JSON.parse(decoder.decode(alignmentBytes));
    exact(alignment, ['schemaVersion', 'format', 'alignments']);
    if (
      alignment.schemaVersion !== 1 ||
      alignment.format !== format ||
      !Array.isArray(alignment.alignments) ||
      alignment.alignments.length !== owners.size
    )
      throw Error('InvalidCreatedCellProjection');
    const aligned = new Set();
    for (const entry of alignment.alignments) {
      exact(entry, ['section', 'identity', 'row', 'column', 'value']);
      if (
        typeof entry.identity !== 'string' ||
        ![entry.section, entry.row, entry.column].every(
          (n) => uint(n, 0xffffffff) && !Object.is(n, -0),
        ) ||
        ![0, 1, 2, null].includes(entry.value) ||
        Object.is(entry.value, -0)
      )
        throw Error('InvalidCreatedCellProjection');
      const key = `${entry.section}:${entry.identity}:${entry.row}:${entry.column}`,
        cell = owners.get(key);
      if (!cell || aligned.has(key)) throw Error('InvalidCreatedCellProjection');
      aligned.add(key);
      cell.verticalAlignment = entry.value;
    }
  }
  return sections;
}
export function decodeCreatedCellProjection(bytes, format, section = 0) {
  const sections = decodeCreatedCellDocumentProjection(bytes, format);
  if (!uint(section, 0xffffffff) || section >= sections.length) throw Error('InvalidSection');
  return sections[section];
}
