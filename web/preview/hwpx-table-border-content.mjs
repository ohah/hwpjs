// 원본 리소스를 현재 표시 목록과 대조합니다. 색·선의 표시 의미는 별도입니다.
export function attachHwpxTableBorders(editor, content, available) {
  if (!available) return content;
  content.tableBorderSources = [];
  content.tableBorderSourceErrors = [];
  const sections = new Set((content.tables ?? []).map((table) => table.section));
  let batch;
  if (typeof editor.tableBorderSourcesBatch === 'function') {
    batch = new Map();
    const selected = [...sections],
      limit = editor.tableBorderSourcesBatchMaxSections ?? Math.max(1, selected.length);
    if (!Number.isInteger(limit) || limit < 1) {
      for (const section of selected)
        batch.set(section, { section, error: 'InvalidTableBorderBatchLimit' });
    } else
      for (let start = 0; start < selected.length; start += limit) {
        const chunk = selected.slice(start, start + limit);
        try {
          for (const entry of editor.tableBorderSourcesBatch(chunk))
            batch.set(entry.section, entry);
        } catch (error) {
          for (const section of chunk) batch.set(section, { section, error: error.message });
        }
      }
  }
  for (const section of sections) {
    try {
      const entry = batch?.get(section);
      if (batch && !entry) throw new Error('MissingTableBorderBatchSection');
      if (entry?.error) throw new Error(entry.error);
      const report = entry ? entry.value : editor.tableBorderSources(section);
      const selected = [];
      const byList = new Map(),
        used = new Set();
      for (const row of report.cells) {
        const key = `${row.table_node}:${row.list_node}`;
        byList.set(key, byList.has(key) ? null : row);
      }
      for (const table of content.tables.filter((t) => t.section === section))
        for (const cell of table.cells) {
          const key = `${table.tableNode}:${cell.listNode}`,
            row = byList.get(key);
          if (!row || used.has(key)) throw new Error('TableBorderSourceOwnerMismatch');
          used.add(key);
          selected.push(row);
        }
      content.tableBorderSources.push({
        section,
        sourceOnly: true,
        cells: selected,
        styles: report.styles,
      });
    } catch (error) {
      content.tableBorderSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}
