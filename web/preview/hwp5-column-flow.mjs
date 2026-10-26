import { hwp5TablePagination } from './hwp5-table-geometry.mjs';
import { hwp5PageArea } from './hwp5-page-area-content.mjs';
import { validateHwp5OwnedColumnBreak } from './hwp5-owned-column-break.mjs';
/** Derive common column contexts from current HWP5 provenance and display bounds. */
export function hwp5ColumnContext(source) {
  if (
    !source ||
    source.kind !== 0 ||
    ![0, 1].includes(source.direction) ||
    source.extra_bytes !== 0 ||
    (source.flags & ~0x1fff) !== 0
  )
    throw new Error('UnsupportedHwp5ColumnLayout');
  const same = source.count === 1 || source.same_width;
  if (same && (!Number.isInteger(source.spacing) || source.spacing < 0))
    throw new Error('UnsupportedHwp5ColumnGap');
  return {
    ambiguous: false,
    count: source.count,
    same_size: same,
    kind: 'newspaper',
    direction: source.direction === 0 ? 'left' : 'right',
    gap: same ? source.spacing : null,
    sizes: source.columns.map((row) => ({ ...row })),
  };
}
export function projectHwp5ColumnFlow(
  content,
  { tableCells = false, pageAreas = false, notes = false, captions = false, drawings = false } = {},
) {
  if (content.limited || content.flowSourceErrors?.length || content.columnDisplayErrors?.length)
    throw new Error('IncompleteHwp5ColumnFlow');
  const paragraphs = new Map(
    content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]),
  );
  const declarations = new Map();
  for (const source of content.columnDisplaySources ?? []) {
    const key = `${source.section}:${source.current_paragraph}`;
    if (declarations.has(key)) throw new Error('AmbiguousHwp5ColumnFlow');
    declarations.set(key, source);
  }
  const effective = new Map(),
    rows = [];
  for (const source of content.currentParagraphFlows ?? []) {
    const key = `${source.section}:${source.paragraph}`,
      paragraph = paragraphs.get(key);
    if (!paragraph || paragraph.clipped || source.break_flags & ~15)
      throw new Error('UnsupportedHwp5ParagraphFlow');
    const declaration = declarations.get(key);
    if (source.top_level !== true) {
      if (drawings && source.host === 'drawing') {
        if (content.hwp5DrawingBodyErrors?.length) throw new Error('IncompleteHwp5DrawingBodies');
        const bodies = (content.hwp5DrawingBodies ?? []).filter(
          (row) =>
            row.section === source.section &&
            row.ownerNode === source.parent_node &&
            row.listNode === source.list_node &&
            row.paragraphs.includes(source.paragraph),
        );
        if (bodies.length !== 1) throw new Error('MissingHwp5DrawingFlowSource');
        const body = bodies[0];
        const scope = `${source.section}:drawing:${source.list_node}`;
        let column = effective.get(scope) ?? null;
        if (declaration) {
          if (body.kind !== 'body' || declaration.display_unit !== 0)
            throw new Error('UnsupportedHwp5DrawingColumnPosition');
          column = hwp5ColumnContext(declaration);
          effective.set(scope, column);
        }
        validateHwp5OwnedColumnBreak(source.break_flags, declaration, 'drawing');
        rows.push({
          ...source,
          drawing_context: {
            kind: body.kind,
            owner_node: body.ownerNode,
            list_node: body.listNode,
          },
          column_start_declaration: column,
          column_declaration: column,
          column_changes: [],
          single_column: column === null || column.count === 1,
        });
        continue;
      }
      if (captions && source.host === 'table_caption') {
        if (content.hwp5CaptionErrors?.length || content.hwp5CaptionGeometryErrors?.length)
          throw new Error('IncompleteHwp5CaptionSources');
        const owner = paragraph.tableCaption;
        const caption = content.hwp5Captions?.find(
          (row) =>
            row.section === source.section &&
            row.controlNode === source.parent_node &&
            row.listNode === source.list_node &&
            row.paragraphs.includes(source.paragraph),
        );
        if (
          !owner ||
          !caption ||
          owner.tableNode !== caption.tableNode ||
          owner.listNode !== caption.listNode
        )
          throw new Error('MissingHwp5CaptionSource');
        if (declaration || source.break_flags !== 0) throw new Error('UnsupportedHwp5CaptionFlow');
        rows.push({ ...source, column_declaration: null, column_changes: [], single_column: true });
        continue;
      }
      if (notes && ['footnote', 'endnote'].includes(source.host)) {
        if (content.hwp5NoteErrors?.length) throw new Error('IncompleteHwp5NoteSources');
        const note = content.hwp5Notes?.find(
          (row) =>
            row.section === source.section &&
            row.kind === source.host &&
            row.listNode === source.list_node &&
            row.controlNode === source.parent_node &&
            row.paragraphs.includes(source.paragraph),
        );
        if (!note) throw new Error('MissingHwp5NoteSource');
        if (declaration || source.break_flags !== 0) throw new Error('UnsupportedHwp5NoteFlow');
        rows.push({
          ...source,
          note_context: { note_node: note.controlNode, list_node: note.listNode, kind: note.kind },
          column_declaration: null,
          column_changes: [],
          single_column: true,
        });
        continue;
      }
      if (pageAreas && ['header', 'footer'].includes(source.host)) {
        if (content.pageAreaSourceErrors?.length) throw new Error('IncompleteHwp5PageAreaSources');
        const area = content.pageAreaSources?.find(
          (row) =>
            row.section === source.section &&
            row.kind === source.host &&
            row.list_node === source.list_node &&
            row.owner_node === source.parent_node,
        );
        if (!area) throw new Error('MissingHwp5PageAreaSource');
        if (declaration || source.break_flags !== 0) throw new Error('UnsupportedHwp5PageAreaFlow');
        rows.push({
          ...source,
          page_area: hwp5PageArea(area),
          column_declaration: null,
          column_changes: [],
          single_column: true,
        });
        continue;
      }
      if (
        !tableCells ||
        source.host !== 'table_cell' ||
        source.list_node !== paragraph.tableCell?.listNode
      )
        throw new Error('UnsupportedHwp5ParagraphFlow');
      const table = content.tables?.find(
        (row) => row.section === source.section && row.tableNode === paragraph.tableCell.tableNode,
      );
      const cell = table?.cells.find((row) => row.listNode === source.list_node);
      if (!cell || !cell.paragraphs.includes(source.paragraph) || !cell.layoutSource)
        throw new Error('MissingHwp5CellFlowSource');
      const scope = `${source.section}:cell:${source.list_node}`;
      let column = effective.get(scope) ?? null;
      if (declaration) {
        if (declaration.display_unit !== 0) throw new Error('UnsupportedHwp5CellColumnPosition');
        column = hwp5ColumnContext(declaration);
        effective.set(scope, column);
      }
      let pagination = table.pagination;
      if (table.layoutSource) {
        const prefix = hwp5TablePagination(table.layoutSource, { allowOpaqueTableFlags: true });
        if (pagination && pagination.page_break !== prefix.page_break)
          throw new Error('ConflictingHwp5TablePaginationSource');
        pagination = prefix;
      }
      validateHwp5OwnedColumnBreak(source.break_flags, declaration, 'table_cell', {
        allowCellPageBreak: pagination?.page_break === 'cell',
      });
      rows.push({
        ...source,
        column_start_declaration: column,
        column_declaration: column,
        column_changes: [],
        single_column: column === null || column.count === 1,
      });
      continue;
    }
    let previous = effective.get(source.section);
    const changes = [];
    if (declaration) {
      const column = hwp5ColumnContext(declaration),
        unit = declaration.display_unit;
      if (
        !Number.isInteger(unit) ||
        unit < 0 ||
        unit >= paragraph.text.length ||
        paragraph.text[unit] !== '\ufffc'
      )
        throw new Error('InvalidHwp5ColumnPosition');
      if (!previous) {
        // 초기 원본 소유 문단의 cold는 입력으로 이동해도 구역 시작 문맥을 소유합니다.
        // 생성 문단/소유권 미확인 입력에는 이 복원을 적용하지 않습니다.
        const verifiedInitialOwner =
          source.generated === false &&
          Number.isInteger(source.source_node) &&
          source.source_node === declaration.paragraph_node &&
          !(content.currentParagraphFlows ?? []).some(
            (row) =>
              row.section === source.section &&
              row.top_level === true &&
              row.paragraph < source.paragraph,
          );
        if (!/^\ufffc*$/.test(paragraph.text.slice(0, unit)) && !verifiedInitialOwner)
          throw new Error('MissingInitialHwp5ColumnContext');
        previous = column;
      }
      changes.push({ unit, declaration: column });
      effective.set(source.section, column);
    }
    if (!previous) throw new Error('MissingInitialHwp5ColumnContext');
    if (source.multicolumn_break && !declaration) throw new Error('MissingHwp5ColumnDeclaration');
    const current = effective.get(source.section) ?? previous;
    rows.push({
      ...source,
      host: 'body',
      column_start_declaration: previous,
      column_declaration: current,
      column_changes: changes,
      single_column: previous.count === 1 && current.count === 1,
    });
  }
  if (
    rows.length !== content.paragraphs.length ||
    [...declarations.keys()].some((key) => !paragraphs.has(key))
  )
    throw new Error('IncompleteHwp5ColumnFlow');
  return rows;
}
