// Document identities and expected witnesses; interaction policy lives in the shared flow.
export const documentMenuBrowserCases=Object.freeze({
  "numeric-input":Object.freeze({
    fixturePath:"reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx",paragraph:19,
    original:"328",marker:"1",replaceWhole:true,protectedAnchors:0,
    oraclePath:"tools/hwpx-chart-numeric-input-oracle.py",oracleMode:"numeric-input",
    entryPath:"tools/numeric-input-browser-audit.mjs",
    port:58866,sessionPrefix:"hwpjs-numeric-input",outputPrefix:"hwpjs-numeric-browser-",
    scope:"one actual numeric cell: trusted Canvas replacement, dependent SUM, menu U/R/S, independent full XML/ZIP, download and reupload; not all numeric cells or layout equivalence",
  }),
  "manual-result":Object.freeze({
    fixturePath:"reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx",paragraph:39,
    original:"4,319",marker:"결과브라우저😀<&",protectedAnchors:0,
    oraclePath:"tools/hwpx-manual-result-save-oracle.py",oracleMode:"manual-result",formulaOrdinal:0,
    entryPath:"tools/manual-result-browser-audit.mjs",
    port:58865,sessionPrefix:"hwpjs-manual-result",outputPrefix:"hwpjs-manual-browser-",
    scope:"one actual formula result: trusted Canvas input, menu U/R/S, independent full XML/ZIP, download and reupload; not recalculation, every result or layout equivalence",
  }),
  plain:Object.freeze({
    fixturePicker:true,
    fixturePath:"legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx",paragraph:1,
    original:"가",marker:"메뉴검증😀<&",protectedAnchors:0,
    oraclePath:"tools/hwpx-anchor-prefix-oracle.py",oracleMode:"plain_text",
    port:58863,sessionPrefix:"hwpjs-menu-mnemonic",outputPrefix:"hwpjs-menu-browser-",
    scope:"View P; disabled U/S; one real plain text edit with U/R/S, download, independent XML/ZIP and reupload; not all menus or layout equivalence",
  }),
  "unknown-object":Object.freeze({
    fixturePath:"reference/rhwp/samples/issue6035/cgmp_evaluation_table.hwpx",paragraph:932,
    original:"\ufffc".repeat(6),marker:"브라우저보존개체😀<&",protectedAnchors:6,
    oraclePath:"tools/hwpx-unknown-anchor-oracle.py",oracleMode:"anchored",
    port:58864,sessionPrefix:"hwpjs-unknown-anchor",outputPrefix:"hwpjs-unknown-browser-",
    scope:"one actual paragraph with two tables and four unknown objects; actual unknown-object Delete refusal and outside text with U/R/S, download, independent XML/ZIP and reupload; not object rendering or layout equivalence",
  }),
});
