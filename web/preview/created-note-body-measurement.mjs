import { layoutContent } from './layout.mjs';
import { layoutCreatedTable } from './created-table-layout.mjs';
import { measureCreatedTableHost } from './created-table-host-measurement.mjs';
import { createdTableInlinePolicy } from './created-table-inline-policy.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';

// Local note coordinates; physical note reservation stays with the note engine.
export function measureCreatedNoteBody(paragraphs, tables, format, width, measure, maxRows) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(paragraphs) ||
    !paragraphs.length ||
    !Array.isArray(tables) ||
    typeof measure !== 'function' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidCreatedNoteBodyMeasurement');
  const groups = new Map(),
    cellFlows = new Map();
  let remaining = maxRows;
  for (const table of tables) {
    if (!table) return unavailable('InvalidCreatedNoteBodyMeasurement');
    if (!createdTableInlinePolicy(table, format) || cellFlows.has(table.identity))
      return unavailable('UnsupportedCreatedTableInlinePolicy');
    if (remaining < 1) return unavailable('NoteBodyMeasurementLimit');
    let flow;
    try {
      flow = layoutCreatedTable(table, measure, { x: 0, y: 0, maxRows: remaining });
    } catch (error) {
      if (
        [
          'InvalidTableGrid',
          'InvalidCreatedTableLayout',
          'CreatedTableLayoutRowBudgetExceeded',
        ].includes(error.message)
      )
        return unavailable(error.message);
      throw error;
    }
    remaining -= flow.rows.length;
    cellFlows.set(table.identity, flow);
    const key = `${table.section}:${table.hostParagraph}`,
      entries = groups.get(key) ?? [];
    entries.push({ table, width: flow.width, height: flow.height });
    groups.set(key, entries);
  }
  const rows = [],
    boxes = [],
    numberPrefixes = [],
    usedHosts = new Set();
  const continuationUnits = format === 'hwp5' && tables.length === 1 ? [] : null;
  let unitsValid = true;
  let height = 0;
  for (const paragraph of paragraphs) {
    if (remaining < 1) return unavailable('NoteBodyMeasurementLimit');
    const key = `${paragraph.section}:${paragraph.paragraph}`,
      entries = groups.get(key);
    if (!entries) {
      const flow = layoutContent(
        { paragraphs: [paragraph], limited: false },
        width,
        measure,
        remaining,
        { documentBody: true },
      );
      if (flow.limited) return unavailable('NoteBodyMeasurementLimit');
      const firstRow = rows.length;
      rows.push(...flow.rows.map((row) => ({ ...row, x: row.x ?? 0, y: row.y + height })));
      if (continuationUnits)
        for (let i = firstRow; i < rows.length; i++)
          continuationUnits.push({
            y: rows[i].y,
            height: rows[i].height,
            rowIndices: [i],
            boxIndices: [],
            prefixIndices: [],
          });
      remaining -= flow.rows.length;
      height += flow.height;
      continue;
    }
    usedHosts.add(key);
    const host = measureCreatedTableHost(paragraph, entries, width, measure, {
      maxRows: remaining,
    });
    if (host.state !== 'measured') return host;
    const hostUnits = new Map();
    if (continuationUnits)
      for (const line of host.lines) {
        const unit = {
          y: height + line.y,
          height: line.height,
          rowIndices: [],
          boxIndices: [],
          prefixIndices: [],
        };
        hostUnits.set(line.lineOrdinal, unit);
        continuationUnits.push(unit);
      }
    const firstHostRow = rows.length;
    rows.push(...host.rows.map((row) => ({ ...row, x: (row.x ?? 20) - 20, y: row.y + height })));
    if (continuationUnits)
      host.rows.forEach((row, i) => {
        const unit = hostUnits.get(row.lineOrdinal);
        if (unit) unit.rowIndices.push(firstHostRow + i);
        else unitsValid = false;
      });
    const firstPrefix = numberPrefixes.length;
    numberPrefixes.push(
      ...host.numberPrefixes.map((prefix) => ({
        ...prefix,
        x: prefix.x - 20,
        y: prefix.y + height,
      })),
    );
    if (continuationUnits)
      host.numberPrefixes.forEach((prefix, i) => {
        const unit = hostUnits.get(prefix.lineOrdinal);
        if (unit) unit.prefixIndices.push(firstPrefix + i);
        else unitsValid = false;
      });
    remaining -= host.rows.length + host.numberPrefixes.length;
    for (const anchor of host.anchors) {
      const flow = cellFlows.get(anchor.createdTableIdentity),
        x = anchor.x,
        y = height + anchor.y;
      if (x < 0 || x + flow.width > width + 1e-8)
        return unavailable('CreatedTablePageWidthOverflow');
      const firstBox = boxes.length,
        firstCellRow = rows.length;
      boxes.push(...flow.boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y })));
      rows.push(
        ...flow.rows.map((row) => ({
          ...row,
          x: row.x + x,
          y: row.y + y,
          pageClip: { ...row.pageClip, x: row.pageClip.x + x, y: row.pageClip.y + y },
        })),
      );
      if (continuationUnits) {
        const unit = hostUnits.get(anchor.lineOrdinal);
        if (!unit || unit.tableIdentity !== undefined) unitsValid = false;
        else {
          unit.tableIdentity = anchor.createdTableIdentity;
          unit.tableBounds = { x, y, width: flow.width, height: flow.height };
          for (let i = firstBox; i < boxes.length; i++) unit.boxIndices.push(i);
          for (let i = firstCellRow; i < rows.length; i++) unit.rowIndices.push(i);
        }
      }
    }
    height += host.height;
  }
  if (usedHosts.size !== groups.size || rows.length + numberPrefixes.length > maxRows)
    return unavailable('NoteBodyMeasurementLimit');
  const texts = new Map(paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p.text]));
  const coverage = pageParagraphCoverage(
    paragraphs,
    rows.filter(
      (row) =>
        !row.createdCell &&
        (row.kind !== 'text' ||
          row.startUnit < row.endUnit ||
          texts.get(`${row.section}:${row.paragraph}`) === ''),
    ),
  );
  if (coverage.state !== 'complete') return coverage;
  return {
    state: 'measured',
    rows,
    boxes,
    numberPrefixes,
    height,
    createdCellParagraphs: [...cellFlows.values()].flatMap((flow) => flow.paragraphs),
    rowCount: rows.length + numberPrefixes.length,
    ...(continuationUnits && unitsValid ? { continuationUnits } : {}),
  };
}
