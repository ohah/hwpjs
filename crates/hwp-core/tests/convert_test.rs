mod common;
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
    // example.hwp에 summary info가 있으면 메타데이터가 채워짐
    // 없더라도 변환 자체는 성공해야 함
    let _ = &doc.meta;
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
fn convert_example_sections() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    assert!(!doc.sections.is_empty(), "Should have sections");
    assert!(
        !doc.sections[0].paragraphs.is_empty(),
        "First section should have paragraphs"
    );
}

#[test]
fn convert_example_paragraph_text() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    // 첫 번째 섹션의 문단에서 텍스트 추출
    let text = extract_all_text(&doc);
    assert!(
        text.contains("삼강오륜"),
        "Should contain '삼강오륜', got: {}",
        &text[..text.len().min(200)]
    );
}

#[test]
fn convert_example_paragraph_runs() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    let para = &doc.sections[0].paragraphs[0];
    assert!(!para.runs.is_empty(), "Paragraph should have runs");
    assert!(
        para.runs[0].char_shape_id < 100,
        "Run should have valid char_shape_id"
    );
}

#[test]
fn convert_example_line_segments() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    // 줄 세그먼트가 보존되어야 함
    let has_line_segs = doc.sections[0]
        .paragraphs
        .iter()
        .any(|p| !p.line_segments.is_empty());
    assert!(has_line_segs, "Should have line segments");
}

#[test]
fn convert_example_para_shape_id() {
    let hwp_doc = parse_hwp("example.hwp");
    let doc = to_document(&hwp_doc);

    let para = &doc.sections[0].paragraphs[0];
    // para_shape_id가 유효한 인덱스여야 함
    assert!(
        (para.para_shape_id as usize) < doc.resources.para_shapes.len(),
        "para_shape_id should be valid index"
    );
}

#[test]
fn convert_table_has_paragraphs() {
    let hwp_doc = parse_hwp("table.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.sections[0].paragraphs.is_empty(),
        "table.hwp should have paragraphs"
    );
    // 표 내부 텍스트는 CtrlHeader 변환 후에 확인 (TODO)
}

#[test]
fn convert_hyperlink_has_text() {
    let hwp_doc = parse_hwp("hyperlink.hwp");
    let doc = to_document(&hwp_doc);

    let text = extract_all_text(&doc);
    assert!(!text.is_empty(), "hyperlink.hwp should have text");
}

#[test]
fn convert_all_fixtures_sections() {
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

        assert!(!doc.sections.is_empty(), "{}: should have sections", name);
        assert!(
            !doc.sections[0].paragraphs.is_empty(),
            "{}: should have paragraphs",
            name
        );

        // 모든 문단에 유효한 para_shape_id
        for para in &doc.sections[0].paragraphs {
            assert!(
                (para.para_shape_id as usize) < doc.resources.para_shapes.len(),
                "{}: para_shape_id {} out of range ({})",
                name,
                para.para_shape_id,
                doc.resources.para_shapes.len()
            );
        }
    }
}

fn extract_all_text(doc: &hwp_model::document::Document) -> String {
    let mut text = String::new();
    for sec in &doc.sections {
        for para in &sec.paragraphs {
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
        }
    }
    text
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
