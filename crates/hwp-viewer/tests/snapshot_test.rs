use hwp_viewer::{to_html, RenderOptions};
use hwpx_parser::HwpxParser;
use std::fs;

fn fixture(name: &str) -> Vec<u8> {
    let path = format!(
        "{}/crates/hwp-core/tests/fixtures/{}",
        env!("CARGO_MANIFEST_DIR").replace("/crates/hwp-viewer", ""),
        name
    );
    fs::read(&path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e))
}

fn parse_and_render(name: &str) -> String {
    let doc = HwpxParser::parse(&fixture(name))
        .unwrap_or_else(|e| panic!("Failed to parse {}: {}", name, e));
    to_html(&doc, &RenderOptions::new())
}

// ═══════════════════════════════════════════
// HTML 스냅샷 테스트
// 각 fixture의 렌더링 결과가 변경되면 테스트 실패
// ═══════════════════════════════════════════

#[test]
fn snapshot_example() {
    let html = parse_and_render("example.hwpx");
    insta::assert_snapshot!("html_example", html);
}

#[test]
fn snapshot_table() {
    let html = parse_and_render("table.hwpx");
    insta::assert_snapshot!("html_table", html);
}

#[test]
fn snapshot_table2() {
    let html = parse_and_render("table2.hwpx");
    insta::assert_snapshot!("html_table2", html);
}

#[test]
fn snapshot_charshape() {
    let html = parse_and_render("charshape.hwpx");
    insta::assert_snapshot!("html_charshape", html);
}

#[test]
fn snapshot_parashape() {
    let html = parse_and_render("parashape.hwpx");
    insta::assert_snapshot!("html_parashape", html);
}

#[test]
fn snapshot_borderfill() {
    let html = parse_and_render("borderfill.hwpx");
    insta::assert_snapshot!("html_borderfill", html);
}

#[test]
fn snapshot_facename() {
    let html = parse_and_render("facename.hwpx");
    insta::assert_snapshot!("html_facename", html);
}

#[test]
fn snapshot_hyperlink() {
    let html = parse_and_render("hyperlink.hwpx");
    insta::assert_snapshot!("html_hyperlink", html);
}

#[test]
fn snapshot_headerfooter() {
    let html = parse_and_render("headerfooter.hwpx");
    insta::assert_snapshot!("html_headerfooter", html);
}

#[test]
fn snapshot_footnote_endnote() {
    let html = parse_and_render("footnote-endnote.hwpx");
    insta::assert_snapshot!("html_footnote_endnote", html);
}

#[test]
fn snapshot_shapeline() {
    let html = parse_and_render("shapeline.hwpx");
    insta::assert_snapshot!("html_shapeline", html);
}

#[test]
fn snapshot_shaperect() {
    let html = parse_and_render("shaperect.hwpx");
    insta::assert_snapshot!("html_shaperect", html);
}

#[test]
fn snapshot_textbox() {
    let html = parse_and_render("textbox.hwpx");
    insta::assert_snapshot!("html_textbox", html);
}

#[test]
fn snapshot_strikethrough() {
    let html = parse_and_render("strikethrough.hwpx");
    insta::assert_snapshot!("html_strikethrough", html);
}

#[test]
fn snapshot_underline_styles() {
    let html = parse_and_render("underline-styles.hwpx");
    insta::assert_snapshot!("html_underline_styles", html);
}

#[test]
fn snapshot_tabdef() {
    let html = parse_and_render("tabdef.hwpx");
    insta::assert_snapshot!("html_tabdef", html);
}

#[test]
fn snapshot_lists() {
    let html = parse_and_render("lists.hwpx");
    insta::assert_snapshot!("html_lists", html);
}

#[test]
fn snapshot_aligns() {
    let html = parse_and_render("aligns.hwpx");
    insta::assert_snapshot!("html_aligns", html);
}

#[test]
fn snapshot_selfintroduce() {
    let html = parse_and_render("selfintroduce.hwpx");
    insta::assert_snapshot!("html_selfintroduce", html);
}

#[test]
fn snapshot_multicolumns() {
    let html = parse_and_render("multicolumns.hwpx");
    insta::assert_snapshot!("html_multicolumns", html);
}

#[test]
fn snapshot_outline() {
    let html = parse_and_render("outline.hwpx");
    insta::assert_snapshot!("html_outline", html);
}

#[test]
fn snapshot_sample_5017_pics() {
    let html = parse_and_render("sample-5017-pics.hwpx");
    insta::assert_snapshot!("html_sample_5017_pics", html);
}

#[test]
fn snapshot_page() {
    let html = parse_and_render("page.hwpx");
    insta::assert_snapshot!("html_page", html);
}

#[test]
fn snapshot_noori() {
    let html = parse_and_render("noori.hwpx");
    insta::assert_snapshot!("html_noori", html);
}
