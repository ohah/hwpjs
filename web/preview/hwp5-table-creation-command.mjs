// New-object authoring policy, never a heuristic for decoding an existing table.
export function hwp5TableCreationRequest(message) {
  const o = message.options;
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some(
      (key) => !["rows", "columns", "width", "rowHeight", "resources"].includes(key),
    )
  )
    throw new Error("InvalidTableCreationOptions");
  return {
    version: 1,
    section: message.section,
    paragraph: message.paragraph,
    unit: message.unit,
    rows: o.rows,
    columns: o.columns,
    width: o.width,
    row_height: o.rowHeight,
    resources: o.resources,
    options: {
      common: {
        flags: 0x6a2211,
        offset_x: 0,
        offset_y: 0,
        z_order: 0,
        margins: [0, 0, 0, 0],
        prevent_page_break: false,
        description: "표",
      },
      table: { page_break: 1, repeat_header: false, cell_spacing: 0, margins: [0, 0, 0, 0] },
      cell: { layout: "observed8", unknown: 0, attributes: 0, margins: [0, 0, 0, 0] },
    },
  };
}

export function setHwp5CreatedCellText(editor, message) {
  const r = message.reference;
  if (
    !r ||
    r.kind !== "cell" ||
    r.section !== message.section ||
    r.id !== message.identity ||
    r.row !== message.row ||
    r.column !== message.column
  )
    throw new Error("InvalidCurrentReferenceScope");
  const before = editor.currentText(r);
  if (!before.endsWith("\r")) throw new Error("UnsupportedParagraphTerminator");
  editor.spliceCurrent({
    reference: r,
    startUnit: 0,
    endUnit: before.length - 1,
    text: message.text,
  });
}
