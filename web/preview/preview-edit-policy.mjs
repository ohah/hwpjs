import { paragraphSelectionOwner } from './paragraph-selection.mjs';

// View eligibility only. Native observations and source identities stay immutable.
const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const key = (section, node) => `${section}:${node}`;
const independent = new Set([
  'undo',
  'redo',
  'save',
  'enable',
  'history-stats',
  'query-capabilities',
  'query-formatting-capabilities',
  'set-edit-window',
  'set-display-options',
]);
const paragraphs = new Set([
  'splice',
  'splice-font-name',
  'splice-character-properties',
  'splice-rich-character',
  'split',
  'merge',
  'insert-table',
  'query-edit-range',
  'query-split-range',
  'format',
  'character-properties',
  'character-outline',
  'character-effect',
  'character-strike',
  'character-strike-color',
  'character-underline',
  'character-underline-color',
  'character-text-color',
  'character-shade',
  'character-font',
  'character-font-name',
  'paragraph-format',
  'paragraph-alignment',
  'paragraph-flags',
  'paragraph-border-fill',
  'paragraph-margins',
  'paragraph-spacing',
]);
const ranges = new Set([
  'replace-paragraph-ranges',
  'character-properties-ranges',
  'character-outline-ranges',
  'character-effect-ranges',
  'character-strike-ranges',
  'character-underline-ranges',
  'character-text-color-ranges',
  'character-shade-ranges',
  'character-font-ranges',
  'character-font-name-ranges',
]);
// A visible-cell proof permits text/character changes, never structure or cell geometry.
const visibleText = new Set([
  'splice',
  'splice-font-name',
  'splice-character-properties',
  'query-edit-range',
  'format',
  'character-properties',
  'character-outline',
  'character-effect',
  'character-strike',
  'character-strike-color',
  'character-underline',
  'character-underline-color',
  'character-text-color',
  'character-shade',
  'character-font',
  'character-font-name',
]);
const tables = new Set(['source-table-grid', 'table-column-width']);
const cells = new Set(['cell-size', 'cell-background', 'cell-border', 'cell-style']);

/** O(paragraphs + declared owners + cells) construction; point/range checks O(1).
 * Unknown mutation shapes fail closed while active. This grants no Native authority.
 */
export function createPreviewEditPolicy(content, layout) {
  const declared = layout?.previewReadOnlyTables;
  if (declared === undefined || (Array.isArray(declared) && declared.length === 0))
    return Object.freeze({
      active: false,
      content,
      allowsPoint: () => true,
      allowsRange: () => true,
      allowsRequest: () => true,
    });
  const source = Array.isArray(content?.paragraphs) ? content.paragraphs : [];
  const byId = new Map(),
    byOwner = new Map(),
    byCell = new Map(),
    tableById = new Map(),
    cellById = new Map();
  const denied = new Set(),
    admitted = new Set(),
    deniedTables = new Set();
  let valid = Array.isArray(declared) && source.length > 0;
  source.forEach((p, i) => {
    if (!p || !uint(p.section) || !uint(p.paragraph) || typeof p.text !== 'string') {
      valid = false;
      return;
    }
    const id = key(p.section, p.paragraph);
    if (byId.has(id)) valid = false;
    byId.set(id, i);
    if (p.tableCell) {
      const owner = key(p.section, p.tableCell.tableNode);
      if (!uint(p.tableCell.tableNode) || !uint(p.tableCell.listNode)) valid = false;
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(p.paragraph);
      const cellOwner = key(p.section, p.tableCell.listNode);
      let cell = byCell.get(cellOwner);
      if (!cell) {
        cell = { tableNode: p.tableCell.tableNode, paragraphs: [] };
        byCell.set(cellOwner, cell);
      }
      if (cell.tableNode !== p.tableCell.tableNode) valid = false;
      cell.paragraphs.push(p.paragraph);
    }
  });
  for (const table of content?.tables ?? []) {
    const id = key(table.section, table.tableNode);
    if (tableById.has(id)) valid = false;
    tableById.set(id, table);
    for (const cell of table.cells ?? []) {
      const id = key(table.section, cell.listNode);
      if (cellById.has(id)) cellById.set(id, null);
      else cellById.set(id, { table, cell });
    }
  }
  for (const table of Array.isArray(declared) ? declared : []) {
    if (
      !table ||
      ![table.section, table.tableNode, table.hostParagraph].every(uint) ||
      (table.reason !== 'InlineTablePaperOverflow' &&
        table.reason !== 'IncompleteOverflowTableProjection') ||
      !Array.isArray(table.paragraphs)
    ) {
      valid = false;
      continue;
    }
    const owner = key(table.section, table.tableNode);
    if (deniedTables.has(owner)) {
      valid = false;
      continue;
    }
    deniedTables.add(owner);
    const actual = byOwner.get(owner) ?? [],
      seen = new Set(table.paragraphs);
    if (
      !actual.length ||
      seen.size !== table.paragraphs.length ||
      seen.size !== actual.length ||
      actual.some((id) => !seen.has(id)) ||
      !table.paragraphs.every(uint)
    )
      valid = false;
    const host = key(table.section, table.hostParagraph),
      hostIndex = byId.get(host);
    if (hostIndex === undefined || source[hostIndex].tableCell) valid = false;
    const nativeTable = tableById.get(owner);
    if (
      nativeTable?.hostParagraph !== undefined &&
      nativeTable.hostParagraph !== table.hostParagraph
    )
      valid = false;
    denied.add(host);
    for (const id of actual) denied.add(key(table.section, id));
    if (table.editableCells !== undefined) {
      if (!Array.isArray(table.editableCells)) {
        valid = false;
        continue;
      }
      // An incomplete projection has no geometry proof that can admit a cell.
      if (table.reason === 'IncompleteOverflowTableProjection') {
        if (table.editableCells.length !== 0) valid = false;
        continue;
      }
      const lists = new Set();
      for (const proof of table.editableCells) {
        if (
          !proof ||
          !uint(proof.listNode) ||
          !Array.isArray(proof.paragraphs) ||
          proof.paragraphs.length === 0 ||
          lists.has(proof.listNode)
        ) {
          valid = false;
          continue;
        }
        lists.add(proof.listNode);
        const id = key(table.section, proof.listNode);
        const native = cellById.get(id),
          cellSource = byCell.get(id);
        if (
          !native ||
          native.table !== nativeTable ||
          !cellSource ||
          cellSource.tableNode !== table.tableNode ||
          !Array.isArray(native.cell.paragraphs) ||
          proof.paragraphs.length !== cellSource.paragraphs.length ||
          native.cell.paragraphs.length !== cellSource.paragraphs.length
        ) {
          valid = false;
          continue;
        }
        // Both the Native cell declaration and the geometry proof must match the
        // complete actual source-owner sequence, not a text-equality guess.
        for (let i = 0; i < cellSource.paragraphs.length; i++) {
          const paragraph = cellSource.paragraphs[i];
          const sourceIndex = byId.get(key(table.section, paragraph));
          const p = source[sourceIndex];
          if (
            proof.paragraphs[i] !== paragraph ||
            native.cell.paragraphs[i] !== paragraph ||
            !p ||
            p.editable !== true ||
            p.createdCell ||
            p.clipped ||
            p.drawingText ||
            p.drawingCaption
          ) {
            valid = false;
          }
          admitted.add(key(table.section, paragraph));
        }
      }
    }
  }
  const blocked = source.map(
    (p) =>
      !valid ||
      (denied.has(key(p?.section, p?.paragraph)) && !admitted.has(key(p?.section, p?.paragraph))),
  );
  // Contiguous owner regions prevent body/cell and cell/cell range crossings,
  // including adjacent cells that are both individually editable.
  const regions = [];
  let previousOwner,
    region = 0;
  for (const p of source) {
    const owner = `${p?.section}:${paragraphSelectionOwner(p) ?? 'body'}`;
    if (regions.length && owner !== previousOwner) region++;
    regions.push(region);
    previousOwner = owner;
  }
  const prefix = [0];
  for (const value of blocked) prefix.push(prefix.at(-1) + Number(value));
  const index = (point) => {
    if (!valid || !point || point.createdCell || !uint(point.section) || !uint(point.paragraph))
      return null;
    const i = byId.get(key(point.section, point.paragraph));
    if (i === undefined || blocked[i]) return null;
    // This is an owner barrier, not a committed-text coordinate validator.
    // A valid body draft can extend past canonical text before Native ACK.
    // Native/input paths still validate edit coordinates against their own basis.
    if (point.unit !== undefined && !uint(point.unit)) return null;
    // A boundary point must not impersonate a body paragraph of another table.
    if (point.tableNode !== undefined && deniedTables.has(key(point.section, point.tableNode)))
      return null;
    return i;
  };
  const allowsPoint = (point) => index(point) !== null;
  const allowsRange = (anchor, focus) => {
    const first = index(anchor),
      last = index(focus);
    if (first === null || last === null || anchor.section !== focus.section) return false;
    const low = Math.min(first, last),
      high = Math.max(first, last);
    return regions[low] === regions[high] && prefix[high + 1] === prefix[low];
  };
  const allowsTargets = (items) => {
    if (!Array.isArray(items) || items.length === 0) return false;
    let low = Infinity,
      high = -1;
    for (const item of items) {
      const i = index(item);
      if (i === null) return false;
      low = Math.min(low, i);
      high = Math.max(high, i);
    }
    return regions[low] === regions[high] && prefix[high + 1] === prefix[low];
  };
  const allowsTable = (table) =>
    Boolean(
      valid &&
      table &&
      !deniedTables.has(key(table.section, table.tableNode)) &&
      allowsPoint({ section: table.section, paragraph: table.hostParagraph }),
    );
  const allowsRequest = (message) => {
    if (!message || typeof message.kind !== 'string') return false;
    if (independent.has(message.kind)) return true;
    if (!valid) return false;
    if (paragraphs.has(message.kind)) {
      if (!allowsPoint(message)) return false;
      if (admitted.has(key(message.section, message.paragraph)) && !visibleText.has(message.kind))
        return false;
      if (message.kind === 'merge') {
        const right = message.rightParagraph ?? message.right_paragraph ?? message.paragraph + 1;
        return uint(right) && allowsRange(message, { section: message.section, paragraph: right });
      }
      return true;
    }
    if (ranges.has(message.kind)) {
      if (!allowsTargets(message.ranges)) return false;
      return (
        message.kind !== 'replace-paragraph-ranges' ||
        !message.ranges.some((p) => admitted.has(key(p.section, p.paragraph)))
      );
    }
    if (message.kind === 'query-formatting') return allowsTargets(message.selectors);
    if (tables.has(message.kind)) {
      if (!uint(message.section) || !uint(message.tableNode)) return false;
      return allowsTable(tableById.get(key(message.section, message.tableNode)));
    }
    if (cells.has(message.kind)) {
      if (!uint(message.section) || !uint(message.listNode)) return false;
      return allowsTable(cellById.get(key(message.section, message.listNode))?.table);
    }
    // Opaque reference batches and new mutation kinds need an explicit identity proof.
    return false;
  };
  const masked = source.map((p, i) =>
    blocked[i] ? Object.freeze({ ...p, editable: false, selectable: false }) : p,
  );
  return Object.freeze({
    active: true,
    content: Object.freeze({ ...content, paragraphs: Object.freeze(masked) }),
    allowsPoint,
    allowsRange,
    allowsRequest,
  });
}
