import { hwp5WindowIdentities } from './hwp5-window-identities.mjs';
import { hwpxWindowIdentities } from './hwpx-window-identities.mjs';
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
// Only a freshly queried Native selection supplies this display address.
// Pending-cell host comes from a Native created-table snapshot, never paragraph 0.
export function documentTextWindow(editor, projection, format, observation) {
  const target = observation?.target;
  if (
    observation?.scope !== 'native-document-text-selection' ||
    observation.executionAuthority !== false ||
    observation.format !== format ||
    !target ||
    !uint(target.section)
  )
    throw Error('InvalidDocumentTextReveal');
  const index =
    format === 'hwp5'
      ? hwp5WindowIdentities(projection)
      : format === 'hwpx'
        ? hwpxWindowIdentities(projection)
        : null;
  if (!index) throw Error('UnsupportedDocumentWindowFormat');
  let ordinal;
  if (target.kind === 'paragraph') {
    if (!uint(target.paragraph)) throw Error('InvalidDocumentTextReveal');
    ordinal =
      format === 'hwp5'
        ? index.resolve(target.section, target.paragraph)
        : index.resolve(target.section, target.paragraph);
  } else if (target.kind === 'created-cell') {
    if (typeof target.identity !== 'string' || !uint(target.row) || !uint(target.column))
      throw Error('InvalidDocumentTextReveal');
    const tables = new Map();
    for (const raw of editor.createdTables(target.section)) {
      const table = format === 'hwp5' ? raw.table : raw;
      if (!table || typeof table.identity !== 'string' || tables.has(table.identity))
        throw Error('AmbiguousCreatedTableIdentity');
      tables.set(table.identity, table);
    }
    const table = tables.get(target.identity);
    if (!table || !uint(table.host_paragraph)) throw Error('MissingCreatedTableHost');
    const cells = new Set();
    for (const cell of table.cells) {
      const key = `${cell.row}:${cell.column}`;
      if (!uint(cell.row) || !uint(cell.column) || cells.has(key))
        throw Error('AmbiguousCreatedTableCell');
      cells.add(key);
    }
    if (!cells.has(`${target.row}:${target.column}`)) throw Error('InvalidCreatedTableCell');
    ordinal = index.resolve(target.section, table.host_paragraph);
  } else throw Error('InvalidDocumentTextReveal');
  return Object.freeze({ offset: ordinal, count: 1 });
}
