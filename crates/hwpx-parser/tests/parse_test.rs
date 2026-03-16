use hwpx_parser::HwpxParser;
use std::fs;

fn fixture(name: &str) -> Vec<u8> {
    let path = format!(
        "{}/crates/hwp-core/tests/fixtures/{}",
        env!("CARGO_MANIFEST_DIR").replace("/crates/hwpx-parser", ""),
        name
    );
    fs::read(&path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e))
}

#[test]
fn parse_example_hwpx() {
    let data = fixture("example.hwpx");
    let doc = HwpxParser::parse(&data).expect("Failed to parse example.hwpx");

    // 메타데이터
    assert_eq!(doc.meta.title.as_deref(), Some("◆ 삼강오륜"));
    assert_eq!(doc.meta.creator.as_deref(), Some("dongk"));
    assert_eq!(doc.meta.language.as_deref(), Some("ko"));

    // 섹션
    assert_eq!(doc.sections.len(), 1);

    // 문단
    let paras = &doc.sections[0].paragraphs;
    assert!(!paras.is_empty(), "paragraphs should not be empty");

    // 첫 번째 문단의 텍스트 확인
    let first_text = extract_text(&paras[0]);
    assert!(
        first_text.contains("삼강오륜"),
        "First paragraph should contain '삼강오륜', got: '{}'",
        first_text
    );

    // settings
    assert_eq!(doc.settings.page_start, 1);
    assert_eq!(doc.settings.footnote_start, 1);

    // resources - 글꼴
    assert!(!doc.resources.fonts.hangul.is_empty());
    // 첫 번째 글꼴은 파일마다 다를 수 있으므로 존재만 확인
    assert!(!doc.resources.fonts.hangul[0].face.is_empty());

    // resources - 글자 모양
    assert!(!doc.resources.char_shapes.is_empty());
    assert!(doc.resources.char_shapes[0].height > 0);
}

#[test]
fn parse_table_hwpx() {
    let data = fixture("table.hwpx");
    let doc = HwpxParser::parse(&data).expect("Failed to parse table.hwpx");
    assert_eq!(doc.sections.len(), 1);
    assert!(!doc.sections[0].paragraphs.is_empty());
}

#[test]
fn parse_charshape_hwpx() {
    let data = fixture("charshape.hwpx");
    let doc = HwpxParser::parse(&data).expect("Failed to parse charshape.hwpx");

    // 여러 글자 모양이 있어야 함
    assert!(
        doc.resources.char_shapes.len() > 1,
        "Should have multiple char shapes"
    );
}

#[test]
fn parse_multiple_fixtures() {
    let fixtures = [
        "aligns.hwpx",
        "borderfill.hwpx",
        "facename.hwpx",
        "hyperlink.hwpx",
        "parashape.hwpx",
        "strikethrough.hwpx",
        "tabdef.hwpx",
    ];

    for name in &fixtures {
        let data = fixture(name);
        let result = HwpxParser::parse(&data);
        assert!(result.is_ok(), "Failed to parse {}: {:?}", name, result.err());
    }
}

fn extract_text(para: &hwp_model::paragraph::Paragraph) -> String {
    let mut text = String::new();
    for run in &para.runs {
        for content in &run.contents {
            if let hwp_model::paragraph::RunContent::Text(tc) = content {
                for elem in &tc.elements {
                    if let hwp_model::paragraph::TextElement::Text(s) = elem {
                        text.push_str(s);
                    }
                }
            }
        }
    }
    text
}
