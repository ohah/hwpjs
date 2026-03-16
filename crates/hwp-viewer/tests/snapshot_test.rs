/// 스냅샷 테스트: 기존 hwp-core viewer의 HWP 렌더링 결과를 기준으로,
/// 새 파이프라인(hwpx-parser → hwp-viewer)의 HWPX 렌더링 결과가 동일한지 비교.
///
/// 기준 생성: hwp-core가 HWP 파일을 렌더링한 HTML을 insta 스냅샷으로 저장
/// 비교 대상: hwpx-parser + hwp-viewer가 같은 문서의 HWPX를 렌더링한 HTML
///
/// 스냅샷 업데이트: `cargo insta accept`
/// 의도치 않은 변경: 테스트 실패
use hwp_viewer::{to_html, RenderOptions};
use hwpx_parser::HwpxParser;
use std::fs;

fn fixtures_dir() -> String {
    format!(
        "{}/crates/hwp-core/tests/fixtures",
        env!("CARGO_MANIFEST_DIR").replace("/crates/hwp-viewer", "")
    )
}

fn render_hwpx(name: &str) -> String {
    let path = format!("{}/{}", fixtures_dir(), name);
    let data = fs::read(&path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e));
    let doc =
        HwpxParser::parse(&data).unwrap_or_else(|e| panic!("Failed to parse {}: {}", name, e));
    to_html(&doc, &RenderOptions::new())
}

// ═══════════════════════════════════════════
// HWPX → HTML 스냅샷
// 기존 hwp-core의 HWP 렌더링 결과와 점진적으로 맞춰가기 위한 기준
// ═══════════════════════════════════════════

macro_rules! snapshot_hwpx {
    ($name:ident, $file:literal) => {
        #[test]
        fn $name() {
            let html = render_hwpx($file);
            insta::assert_snapshot!(html);
        }
    };
}

snapshot_hwpx!(snapshot_example, "example.hwpx");
snapshot_hwpx!(snapshot_table, "table.hwpx");
snapshot_hwpx!(snapshot_table2, "table2.hwpx");
snapshot_hwpx!(snapshot_charshape, "charshape.hwpx");
snapshot_hwpx!(snapshot_parashape, "parashape.hwpx");
snapshot_hwpx!(snapshot_borderfill, "borderfill.hwpx");
snapshot_hwpx!(snapshot_facename, "facename.hwpx");
snapshot_hwpx!(snapshot_hyperlink, "hyperlink.hwpx");
snapshot_hwpx!(snapshot_headerfooter, "headerfooter.hwpx");
snapshot_hwpx!(snapshot_footnote_endnote, "footnote-endnote.hwpx");
snapshot_hwpx!(snapshot_shapeline, "shapeline.hwpx");
snapshot_hwpx!(snapshot_shaperect, "shaperect.hwpx");
snapshot_hwpx!(snapshot_textbox, "textbox.hwpx");
snapshot_hwpx!(snapshot_strikethrough, "strikethrough.hwpx");
snapshot_hwpx!(snapshot_underline_styles, "underline-styles.hwpx");
snapshot_hwpx!(snapshot_tabdef, "tabdef.hwpx");
snapshot_hwpx!(snapshot_lists, "lists.hwpx");
snapshot_hwpx!(snapshot_aligns, "aligns.hwpx");
snapshot_hwpx!(snapshot_selfintroduce, "selfintroduce.hwpx");
snapshot_hwpx!(snapshot_multicolumns, "multicolumns.hwpx");
snapshot_hwpx!(snapshot_outline, "outline.hwpx");
snapshot_hwpx!(snapshot_page, "page.hwpx");
snapshot_hwpx!(snapshot_sample_5017_pics, "sample-5017-pics.hwpx");
snapshot_hwpx!(snapshot_noori, "noori.hwpx");
