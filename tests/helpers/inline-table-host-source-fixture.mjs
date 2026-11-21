// Existing independently authored own DTO from inline-table-paper-preview.test.mjs.
export function inlineTableHostFixture(format = 'hwp5', width = 9000) {
  const paragraphShape = { alignment: 1, left: 0, right: 0, indent: 0, before: 0, after: 0 };
  const table = {
    section: 0,
    tableNode: 7,
    hostParagraph: 1,
    anchorUnit: 0,
    parentTableNode: null,
    partial: false,
    rows: 1,
    columns: 2,
    sourceGeometry: {
      geometry: {
        width,
        height: 3000,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: true,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      has_caption: false,
      text_wrap: 3,
      text_flow: 0,
      flow_with_text: true,
      vertical_relative: 2,
      horizontal_relative: 2,
      vertical_alignment: 0,
      horizontal_alignment: 0,
      out_margin: [0, 0, 0, 0],
      in_margin: [0, 0, 0, 0],
    },
    pagination: { page_break: 'table', repeat_header: false, cell_spacing: 0 },
    cells: [0, 1].map((column) => ({
      listNode: 8 + column,
      row: 0,
      column,
      rowSpan: 1,
      columnSpan: 1,
      width: column === 0 ? Math.floor(width / 2) : width - Math.floor(width / 2),
      height: 3000,
      paragraphs: [2 + column],
      sourceMargin: { has_margin: false, header: false, margin: [0, 0, 0, 0] },
      sourceVerticalAlignment: 0,
      sourceLineWrap: 0,
      sourceTextDirection: 0,
    })),
  };
  const paragraphs = ['앞 본문', '\ufffc', '셀 한😀', '두 번째', '뒤 본문'].map(
    (text, paragraph) => ({
      section: 0,
      paragraph,
      text,
      editable: true,
      paragraphShape: { ...paragraphShape },
      ...(paragraph === 2 || paragraph === 3
        ? {
            tableCell: {
              tableNode: 7,
              listNode: 8 + paragraph - 2,
              row: 0,
              column: paragraph - 2,
              rowSpan: 1,
              columnSpan: 1,
            },
          }
        : {}),
    }),
  );
  return {
    format,
    limited: false,
    tables: [table],
    paragraphs,
    pictures: [],
    drawings: [],
    lines: [],
    pageSettings: [
      {
        section_ordinal: 0,
        width: 7500,
        height: 15000,
        orientation: 'widely',
        gutter_type: 'left_only',
        duplicate_margins: 0,
        margin: { left: 750, right: 750, top: 750, bottom: 750, gutter: 0, header: 0, footer: 0 },
      },
    ],
    paragraphFlows: paragraphs.map((p) => ({
      section: 0,
      paragraph: p.paragraph,
      top_level: !p.tableCell,
      host: p.tableCell ? 'table' : 'body',
      single_column: true,
      page_break: false,
      column_break: false,
      column_changes: [],
      column_declaration: null,
    })),
  };
}
