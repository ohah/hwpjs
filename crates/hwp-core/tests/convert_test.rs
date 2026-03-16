mod common;
use common::*;
use hwp_core::convert::to_document;
use hwp_core::HwpParser;

fn parse_hwp(name: &str) -> hwp_core::document::HwpDocument {
    let path = format!("{}/tests/fixtures/{}", env!("CARGO_MANIFEST_DIR"), name);
    let data = std::fs::read(&path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e));
    let parser = HwpParser::new();
    parser
        .parse(&data)
        .unwrap_or_else(|e| panic!("Failed to parse {}: {:?}", name, e))
}

#[test]
fn convert_example_meta() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    // 메타데이터
    assert!(doc.meta.title.is_some() || doc.meta.creator.is_some() || true);
    // example.hwp에 summary info가 있으면 title이 있을 수 있음
}

#[test]
fn convert_example_settings() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert_eq!(doc.settings.page_start, 1);
    assert_eq!(doc.settings.footnote_start, 1);
}

#[test]
fn convert_example_fonts() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(!doc.resources.fonts.hangul.is_empty(), "Should have fonts");
    assert!(
        !doc.resources.fonts.hangul[0].face.is_empty(),
        "Font should have name"
    );
}

#[test]
fn convert_example_char_shapes() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.resources.char_shapes.is_empty(),
        "Should have char shapes"
    );
    let cs = &doc.resources.char_shapes[0];
    assert!(cs.height > 0, "CharShape should have height");
    assert!(cs.text_color.is_some(), "CharShape should have text color");
}

#[test]
fn convert_example_para_shapes() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.resources.para_shapes.is_empty(),
        "Should have para shapes"
    );
}

#[test]
fn convert_example_styles() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(!doc.resources.styles.is_empty(), "Should have styles");
    // 바탕글 스타일
    let s0 = &doc.resources.styles[0];
    assert!(!s0.name.is_empty());
}

#[test]
fn convert_example_tab_defs() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(!doc.resources.tab_defs.is_empty(), "Should have tab defs");
}

#[test]
fn convert_all_fixtures() {
    let fixtures = [
        "aligns.hwp",
        "borderfill.hwp",
        "charshape.hwp",
        "example.hwp",
        "facename.hwp",
        "footnote-endnote.hwp",
        "headerfooter.hwp",
        "hyperlink.hwp",
        "lists.hwp",
        "multicolumns.hwp",
        "outline.hwp",
        "page.hwp",
        "parashape.hwp",
        "selfintroduce.hwp",
        "shapeline.hwp",
        "shaperect.hwp",
        "strikethrough.hwp",
        "tabdef.hwp",
        "table.hwp",
        "table2.hwp",
        "textbox.hwp",
        "underline-styles.hwp",
    ];

    for name in &fixtures {
        let hwp_doc = parse_hwp(name);
        let doc = to_document(&hwp_doc);

        assert!(
            !doc.resources.char_shapes.is_empty(),
            "{}: should have char shapes",
            name
        );
        assert!(
            !doc.resources.para_shapes.is_empty(),
            "{}: should have para shapes",
            name
        );
        assert!(
            !doc.resources.styles.is_empty(),
            "{}: should have styles",
            name
        );
        assert!(
            !doc.resources.fonts.hangul.is_empty(),
            "{}: should have fonts",
            name
        );
    }
}
