import { paginateBodyRows } from './page-row-flow.mjs';

// Prefix replay uses the existing paginator and never rewrites an earlier source band.
export function paginateRepeatedTableBands(rows, setting, flows, options, prepared) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(rows) ||
    !Array.isArray(prepared) ||
    rows.some((row) => !row || row.repeatedTableHeader !== undefined)
  )
    return fail('InvalidRepeatedHeaderPagination');
  if (options.columnZones || options.columnDeclaration !== undefined)
    return fail('UnsupportedRepeatedHeaderColumns');
  const paginate = options.paginateRows ?? paginateBodyRows,
    maxRows = options.maxRows ?? 20000,
    maxInspections = options.maxHeaderInspections ?? 400000;
  if (!Number.isSafeInteger(maxInspections) || maxInspections < 1)
    return fail('InvalidRepeatedHeaderBudget');
  const pending = [],
    lastPage = new Map();
  let inspections = 0;
  for (const source of rows) {
    const header = prepared[source.tableIndex]?.repeatedHeader;
    if (!header || source.bandOrdinal === undefined) {
      pending.push(source);
      continue;
    }
    const row = { ...source };
    if (row.bandOrdinal === 0 ? lastPage.has(row.tableIndex) : !lastPage.has(row.tableIndex))
      return fail('InvalidRepeatedHeaderPagination');
    if (row.bandOrdinal === 0) {
      const next = prepared[row.tableIndex].rows[1];
      if (next) row.keepNextHeight = next.height;
    }
    inspections += pending.length + 1;
    if (inspections > maxInspections) return fail('RepeatedHeaderPaginationLimit');
    const probe = paginate([...pending, row], setting, flows, options);
    if (probe.state !== 'paginated' || probe.limited)
      return probe.state === 'paginated' ? fail('TablePagePlanLimit') : probe;
    const placed = probe.rows.at(-1);
    if (!placed || placed.tableIndex !== row.tableIndex || placed.bandOrdinal !== row.bandOrdinal)
      return fail('InvalidRepeatedHeaderPagination');
    if (row.bandOrdinal > 0 && placed.pageOrdinal !== lastPage.get(row.tableIndex)) {
      pending.push({
        kind: 'gap',
        section: row.section,
        paragraph: row.paragraph,
        tableIndex: row.tableIndex,
        bandOrdinal: 0,
        height: header.height,
        keepNextHeight: row.height,
        repeatedTableHeader: true,
      });
      inspections += pending.length + 1;
      if (inspections > maxInspections) return fail('RepeatedHeaderPaginationLimit');
      const withHeader = paginate([...pending, row], setting, flows, options);
      if (withHeader.state !== 'paginated' || withHeader.limited)
        return withHeader.state === 'paginated' ? fail('TablePagePlanLimit') : withHeader;
      const current = withHeader.rows.at(-1),
        repeat = withHeader.rows.at(-2);
      if (!current || !repeat?.repeatedTableHeader || repeat.pageOrdinal !== current.pageOrdinal)
        return fail('RepeatedHeaderTooTall');
      lastPage.set(row.tableIndex, current.pageOrdinal);
    } else lastPage.set(row.tableIndex, placed.pageOrdinal);
    pending.push(row);
    if (pending.length > maxRows) return fail('TablePagePlanLimit');
  }
  return paginate(pending, setting, flows, options);
}
