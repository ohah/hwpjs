// Document identities and expected witnesses; interaction policy lives in the shared flow.
export const documentMenuBrowserCases=Object.freeze({
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
