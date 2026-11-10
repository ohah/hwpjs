// Legacy ordinal callers omit reference. Headless requests carry an exact current binding.
// The source query and insertion are synchronous, so no edit can interleave them.
export function insertHwp5Table(editor, message) {
  if (Object.hasOwn(message, 'reference')) {
    const ref = message.reference;
    const keys = ['epoch', 'scope', 'kind', 'section', 'id', 'row', 'column'];
    const fail = () => {
      throw new Error('InvalidCurrentTableReference');
    };
    if (
      !ref ||
      typeof ref !== 'object' ||
      Array.isArray(ref) ||
      Reflect.ownKeys(ref).length !== keys.length
    )
      fail();
    const values = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(ref, key);
      if (!descriptor || !('value' in descriptor)) fail();
      values[key] = descriptor.value;
    }
    if (
      !['original', 'generated'].includes(values.kind) ||
      values.section !== message.section ||
      values.row !== 0 ||
      values.column !== 0 ||
      !Number.isInteger(message.paragraph) ||
      message.paragraph < 0 ||
      message.paragraph > 0xffffffff
    )
      fail();
    if (!editor.supportsCurrentSourceReferences?.())
      throw new Error('Hwp5CurrentSourceReferenceAbiUnavailable');
    const window = editor.currentSourceReferences(message.section, {
      first: message.paragraph,
      count: 1,
    });
    const actual = window.references?.[0];
    if (
      window.version !== 1 ||
      window.first !== message.paragraph ||
      window.total <= message.paragraph ||
      window.references.length !== 1 ||
      !actual ||
      keys.some((key) => values[key] !== actual[key])
    )
      fail();
    // Original references also exist in nested cells/notes; identity alone is not ownership.
    const flow = editor.paragraphFlow(message.section);
    const host = flow[message.paragraph];
    if (
      flow.length !== window.total ||
      host?.paragraph !== message.paragraph ||
      host.host !== 'body' ||
      host.top_level !== true
    )
      throw new Error('UnsupportedTableInsertOwner');
  }
  return editor.insertTable(hwp5TableCreationRequest(message));
}

// New-object authoring policy, never a heuristic for decoding an existing table.
export function hwp5TableCreationRequest(message) {
  const o = message.options;
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).some(
      (key) => !['rows', 'columns', 'width', 'rowHeight', 'resources'].includes(key),
    )
  )
    throw new Error('InvalidTableCreationOptions');
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
        description: '표',
      },
      table: { page_break: 1, repeat_header: false, cell_spacing: 0, margins: [0, 0, 0, 0] },
      cell: { layout: 'observed8', unknown: 0, attributes: 0, margins: [0, 0, 0, 0] },
    },
  };
}

export function setHwp5CreatedCellText(editor, message) {
  const r = message.reference;
  if (
    !r ||
    r.kind !== 'cell' ||
    r.section !== message.section ||
    r.id !== message.identity ||
    r.row !== message.row ||
    r.column !== message.column
  )
    throw new Error('InvalidCurrentReferenceScope');
  const before = editor.currentText(r);
  if (!before.endsWith('\r')) throw new Error('UnsupportedParagraphTerminator');
  editor.spliceCurrent({
    reference: r,
    startUnit: 0,
    endUnit: before.length - 1,
    text: message.text,
  });
}
