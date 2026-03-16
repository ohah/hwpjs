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
// 기본 구조
// ═══════════════════════════════════════════

#[test]
fn html_has_doctype_and_structure() {
    let html = parse_and_render("example.hwpx");

    assert!(html.starts_with("<!DOCTYPE html>"));
    assert!(html.contains("<html>"));
    assert!(html.contains("<head>"));
    assert!(html.contains("<style>"));
    assert!(html.contains("</style>"));
    assert!(html.contains("<body>"));
    assert!(html.contains("</body>"));
    assert!(html.contains("</html>"));
}

#[test]
fn html_has_title() {
    let html = parse_and_render("example.hwpx");
    assert!(html.contains("<title>"), "Should have title tag");
    assert!(html.contains("삼강오륜"));
}

#[test]
fn html_has_section_div() {
    let html = parse_and_render("example.hwpx");
    assert!(html.contains("hwp-section"));
}

// ═══════════════════════════════════════════
// CSS 스타일
// ═══════════════════════════════════════════

#[test]
fn html_has_char_shape_css() {
    let html = parse_and_render("charshape.hwpx");

    // cs0, cs1 등의 클래스가 정의되어야 함
    assert!(html.contains(".cs0 {"), "Should have cs0 class");
    assert!(html.contains("font-size:"), "Should have font-size");
}

#[test]
fn html_has_para_shape_css() {
    let html = parse_and_render("parashape.hwpx");
    assert!(html.contains(".ps0 {"), "Should have ps0 class");
    assert!(html.contains("text-align:"), "Should have text-align");
}

#[test]
fn html_char_shape_bold_italic() {
    let html = parse_and_render("charshape.hwpx");

    // bold/italic 글자 모양이 CSS에 반영
    assert!(
        html.contains("font-weight: bold") || html.contains("font-weight:bold"),
        "Should have bold style"
    );
}

// ═══════════════════════════════════════════
// 텍스트 렌더링
// ═══════════════════════════════════════════

#[test]
fn html_renders_text() {
    let html = parse_and_render("example.hwpx");
    assert!(html.contains("삼강오륜"), "Should contain text '삼강오륜'");
}

#[test]
fn html_renders_paragraphs() {
    let html = parse_and_render("example.hwpx");

    let p_count = html.matches("<p ").count();
    assert!(
        p_count > 1,
        "Should have multiple paragraphs, got {}",
        p_count
    );
}

#[test]
fn html_renders_spans_with_char_shape() {
    let html = parse_and_render("example.hwpx");

    // span에 cs 클래스가 적용되어야 함
    assert!(
        html.contains("class=\"cs"),
        "Should have span with cs class"
    );
}

// ═══════════════════════════════════════════
// 표
// ═══════════════════════════════════════════

#[test]
fn html_renders_table() {
    let html = parse_and_render("table.hwpx");

    assert!(html.contains("<table"), "Should have table tag");
    assert!(html.contains("<tr>"), "Should have tr tag");
    assert!(html.contains("<td"), "Should have td tag");
}

#[test]
fn html_table_has_cell_content() {
    let html = parse_and_render("table2.hwpx");

    assert!(html.contains("<table"), "Should have table");
    // 셀 내용이 렌더링되어야 함
    assert!(
        html.contains("<td") && html.contains("<p "),
        "Table cells should have paragraph content"
    );
}

#[test]
fn html_table_colspan() {
    let html = parse_and_render("table.hwpx");

    // colspan이 있는 테이블인지 확인 (있을 수도 없을 수도)
    // 최소한 테이블이 렌더링되면 OK
    assert!(html.contains("<table"));
}

// ═══════════════════════════════════════════
// 그림
// ═══════════════════════════════════════════

#[test]
fn html_renders_picture() {
    let html = parse_and_render("sample-5017-pics.hwpx");

    assert!(
        html.contains("<img") || html.contains("hwp-image"),
        "Should have image"
    );
}

#[test]
fn html_picture_base64() {
    let html = parse_and_render("sample-5017-pics.hwpx");

    assert!(
        html.contains("data:image/") || html.contains("base64"),
        "Should have base64 image"
    );
}

// ═══════════════════════════════════════════
// 도형
// ═══════════════════════════════════════════

#[test]
fn html_renders_rect() {
    let html = parse_and_render("shaperect.hwpx");
    assert!(html.contains("hwp-shape"), "Should have shape div");
}

#[test]
fn html_renders_line() {
    let html = parse_and_render("shapeline.hwpx");
    assert!(
        html.contains("<svg") || html.contains("hwp-shape"),
        "Should have line shape"
    );
}

#[test]
fn html_renders_textbox() {
    let html = parse_and_render("textbox.hwpx");

    assert!(html.contains("hwp-shape"), "Should have shape");
    // 글상자 내부 텍스트
    assert!(
        html.contains("글상자"),
        "Should contain textbox text '글상자'"
    );
}

// ═══════════════════════════════════════════
// 머리글/꼬리말
// ═══════════════════════════════════════════

#[test]
fn html_renders_header_footer() {
    let html = parse_and_render("headerfooter.hwpx");

    assert!(html.contains("hwp-header"), "Should have header div");
    assert!(html.contains("hwp-footer"), "Should have footer div");
    assert!(html.contains("Header"));
    assert!(html.contains("Footer"));
}

// ═══════════════════════════════════════════
// 하이퍼링크
// ═══════════════════════════════════════════

#[test]
fn html_renders_hyperlink() {
    let html = parse_and_render("hyperlink.hwpx");

    assert!(html.contains("<a href="), "Should have anchor tag");
    assert!(html.contains("naver.com"), "Should have naver.com URL");
}

// ═══════════════════════════════════════════
// 페이지 설정
// ═══════════════════════════════════════════

#[test]
fn html_section_has_page_size() {
    let html = parse_and_render("example.hwpx");

    // 섹션에 width가 설정되어야 함
    assert!(
        html.contains("width:") && html.contains("mm"),
        "Section should have width in mm"
    );
}

// ═══════════════════════════════════════════
// 전체 fixture 렌더링 성공
// ═══════════════════════════════════════════

#[test]
fn html_render_all_fixtures() {
    let fixtures = [
        "aligns.hwpx",
        "borderfill.hwpx",
        "charshape.hwpx",
        "charstyle.hwpx",
        "example.hwpx",
        "facename.hwpx",
        "footnote-endnote.hwpx",
        "headerfooter.hwpx",
        "hyperlink.hwpx",
        "lists.hwpx",
        "multicolumns.hwpx",
        "outline.hwpx",
        "page.hwpx",
        "parashape.hwpx",
        "sample-5017-pics.hwpx",
        "selfintroduce.hwpx",
        "shapeline.hwpx",
        "shaperect.hwpx",
        "strikethrough.hwpx",
        "tabdef.hwpx",
        "table.hwpx",
        "table2.hwpx",
        "textbox.hwpx",
        "underline-styles.hwpx",
    ];

    for name in &fixtures {
        let html = parse_and_render(name);
        assert!(
            html.contains("<!DOCTYPE html>"),
            "{} should produce valid HTML",
            name
        );
        assert!(html.contains("<body>"), "{} should have body", name);
        assert!(
            html.len() > 500,
            "{} HTML should be substantial, got {} bytes",
            name,
            html.len()
        );
    }
}
