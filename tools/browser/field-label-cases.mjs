// Fixture identity and oracle coordinates, not browser interaction policy.
export const fieldLabelBrowserCases = Object.freeze({
  memo: Object.freeze({
    fixturePath: "reference/rhwp/samples/hwpx/aift.hwpx",
    section: 2,
    paragraph: 3007,
    marker: "브라우저메모😀",
    oraclePath: "tools/memo-label-oracle.py",
    oracleParagraph: 2694,
    beginId: "2135782115",
    port: 58861,
    sessionPrefix: "hwpjs-memo-roundtrip",
    outputPrefix: "hwpjs-memo-browser-",
    phaseKind: "memo-browser-phase",
    resultKind: "memo-browser-roundtrip",
    cleanupKind: "memo-browser-cleanup",
    scope:
      "one actual MEMO label, trusted input/history/download/reupload, independent XML/ZIP; not OS IME or layout equivalence",
  }),
  title: Object.freeze({
    fixturePath: "reference/rhwp/samples/추진일정.hwpx",
    section: 0,
    paragraph: 0,
    marker: "브라우저제목😀",
    oraclePath: "tools/title-field-oracle.py",
    oracleParagraph: 1,
    beginId: "1126376209",
    port: 58862,
    sessionPrefix: "hwpjs-title-field",
    outputPrefix: "hwpjs-title-field-browser-",
    phaseKind: "title-field-browser-phase",
    resultKind: "title-field-browser-roundtrip",
    cleanupKind: "title-field-browser-cleanup",
    scope:
      "one actual title BOOKMARK label, trusted input/history/download/reupload, independent XML/ZIP; not OS IME or layout equivalence",
  }),
});
