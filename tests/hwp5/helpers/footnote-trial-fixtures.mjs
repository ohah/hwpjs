const setting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const policy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 1,
  belowLine: 2,
  betweenNotes: 3,
  beneathText: false,
};
function sample(n = 8, rowCount = 32, heights = [1]) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    kind: 'text',
    section: 0,
    paragraph: i,
    startUnit: 0,
    endUnit: i === 0 ? n + 1 : 1,
    x: 0,
    y: i,
    width: n + 1,
    height: 1,
    text: i === 0 ? 'x'.repeat(n + 1) : 'x',
  }));
  const flows = rows.map((row) => ({
    section: 0,
    paragraph: row.paragraph,
    top_level: true,
    column_break: null,
    page_break: null,
  }));
  const notes = Array.from({ length: n }, (_, i) => {
    let y = 0;
    const noteRows = heights.map((height, unit) => {
      const row = {
        kind: 'text',
        section: 0,
        paragraph: 100 + i,
        startUnit: unit,
        endUnit: unit + 1,
        x: 0,
        y,
        width: 1,
        height,
        text: 'n',
      };
      y += height;
      return row;
    });
    return {
      kind: 'footnote',
      section: 0,
      noteNode: 40 + i,
      hostParagraph: 0,
      anchorUnit: i,
      width: 100,
      height: y,
      boxes: [],
      rows: noteRows,
    };
  });
  return [
    rows,
    { ...setting, height: 75000000 },
    flows,
    notes,
    { ...policy, aboveLine: 0, belowLine: 0, betweenNotes: 0 },
    0,
    { maxRows: 20000, maxPages: 2000, maxPasses: 4000 },
    true,
  ];
}
function mixedSample() {
  const a = sample(1, 8);
  a[1].height = 7500;
  const cell = { identity: '1', row: 0, column: 0 };
  const owner = { noteNode: 40, noteKind: 'footnote' };
  const rows = [
    { ...a[3][0].rows[0], ...owner, y: 0, height: 10 },
    {
      ...a[3][0].rows[0],
      ...owner,
      y: 10,
      height: 30,
      createdCell: cell,
      pageClip: { x: 0, y: 10, width: 100, height: 30 },
    },
    { ...a[3][0].rows[0], ...owner, y: 40, height: 10 },
  ];
  const box = { x: 0, y: 10, width: 100, height: 30, createdCell: cell };
  a[3][0] = {
    ...a[3][0],
    height: 50,
    rows,
    boxes: [box],
    numberPrefixes: [],
    continuationUnits: [
      { y: 0, height: 10, rowIndices: [0], boxIndices: [], prefixIndices: [] },
      {
        y: 10,
        height: 30,
        rowIndices: [1],
        boxIndices: [0],
        prefixIndices: [],
        tableIdentity: '1',
        tableBounds: { x: 0, y: 10, width: 100, height: 30 },
      },
      { y: 40, height: 10, rowIndices: [2], boxIndices: [], prefixIndices: [] },
    ],
  };
  return a;
}

export { sample, mixedSample, policy };
