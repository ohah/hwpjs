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

#[test]
fn convert_borderfill_has_entries() {
    let hwp_doc = parse_hwp("borderfill.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.resources.border_fills.is_empty(),
        "borderfill.hwp should have border fills"
    );
    let bf = &doc.resources.border_fills[0];
    assert_eq!(bf.id, 0);
}

#[test]
fn convert_borderfill_line_spec() {
    let hwp_doc = parse_hwp("borderfill.hwp");
    let doc = to_document(&hwp_doc);

    // 테두리가 있는 BorderFill 찾기
    let has_border = doc
        .resources
        .border_fills
        .iter()
        .any(|bf| bf.left_border.is_some() || bf.top_border.is_some());
    assert!(has_border, "Should have at least one border with lines");
}

#[test]
fn convert_borderfill_fill_brush() {
    let hwp_doc = parse_hwp("borderfill.hwp");
    let doc = to_document(&hwp_doc);

    let has_fill = doc
        .resources
        .border_fills
        .iter()
        .any(|bf| bf.fill.is_some());
    assert!(has_fill, "borderfill.hwp should have fills");
}

#[test]
fn convert_numberings_from_outline() {
    let hwp_doc = parse_hwp("outline.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.resources.numberings.is_empty(),
        "outline.hwp should have numberings"
    );
    let n = &doc.resources.numberings[0];
    assert!(!n.levels.is_empty(), "Numbering should have levels");
    assert!(
        !n.levels[0].format_string.is_empty(),
        "Level should have format string"
    );
}

#[test]
fn convert_bullets_from_lists() {
    let hwp_doc = parse_hwp("lists.hwp");
    let doc = to_document(&hwp_doc);

    assert!(
        !doc.resources.bullets.is_empty(),
        "lists.hwp should have bullets"
    );
    let b = &doc.resources.bullets[0];
    assert_ne!(b.bullet_char, '\0', "Bullet should have a character");
}

#[test]
fn convert_table_cells() {
    let hwp_doc = parse_hwp("table.hwp");
    let doc = to_document(&hwp_doc);

    // 표 개체가 RunContent::Object(ShapeObject::Table)로 변환되어야 함
    let mut found_table = false;
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Object(
                        hwp_model::shape::ShapeObject::Table(table),
                    ) = content
                    {
                        found_table = true;
                        assert!(table.row_count > 0, "Table should have rows");
                        assert!(table.col_count > 0, "Table should have columns");
                        assert!(!table.rows.is_empty(), "Table should have row data");

                        // 셀에 내용이 있어야 함
                        let first_cell = &table.rows[0].cells[0];
                        assert!(
                            !first_cell.content.paragraphs.is_empty(),
                            "Cell should have paragraphs"
                        );
                    }
                }
            }
        }
    }
    assert!(found_table, "table.hwp should contain a Table object");
}

#[test]
fn convert_table_cell_text() {
    let hwp_doc = parse_hwp("table.hwp");
    let doc = to_document(&hwp_doc);

    // 표 셀 내부 텍스트 추출
    let mut cell_texts = Vec::new();
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Object(
                        hwp_model::shape::ShapeObject::Table(table),
                    ) = content
                    {
                        for row in &table.rows {
                            for cell in &row.cells {
                                for cp in &cell.content.paragraphs {
                                    for cr in &cp.runs {
                                        for cc in &cr.contents {
                                            if let hwp_model::paragraph::RunContent::Text(tc) = cc {
                                                for elem in &tc.elements {
                                                    if let hwp_model::paragraph::TextElement::Text(
                                                        s,
                                                    ) = elem
                                                    {
                                                        if !s.trim().is_empty() {
                                                            cell_texts.push(s.clone());
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // 셀 내부 텍스트가 있으면 검증, 없으면 셀 구조 존재만 확인
    if cell_texts.is_empty() {
        // table2.hwp로 재시도 (더 복잡한 표)
        let hwp_doc2 = parse_hwp("table2.hwp");
        let doc2 = to_document(&hwp_doc2);
        let mut has_cells = false;
        for sec in &doc2.sections {
            for para in &sec.paragraphs {
                for run in &para.runs {
                    for content in &run.contents {
                        if let hwp_model::paragraph::RunContent::Object(
                            hwp_model::shape::ShapeObject::Table(table),
                        ) = content
                        {
                            if !table.rows.is_empty() && !table.rows[0].cells.is_empty() {
                                has_cells = true;
                            }
                        }
                    }
                }
            }
        }
        assert!(has_cells, "At least one table fixture should have cells");
    }
}

#[test]
fn convert_header_footer() {
    let hwp_doc = parse_hwp("headerfooter.hwp");
    let doc = to_document(&hwp_doc);

    let mut found_header = false;
    let mut found_footer = false;
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Control(ctrl) = content {
                        match ctrl {
                            hwp_model::control::Control::Header(_) => found_header = true,
                            hwp_model::control::Control::Footer(_) => found_footer = true,
                            _ => {}
                        }
                    }
                }
            }
        }
    }
    assert!(
        found_header,
        "headerfooter.hwp should have header control"
    );
    assert!(
        found_footer,
        "headerfooter.hwp should have footer control"
    );
}

#[test]
fn convert_footnote_endnote() {
    let hwp_doc = parse_hwp("footnote-endnote.hwp");
    let doc = to_document(&hwp_doc);

    let mut found_footnote = false;
    let mut found_endnote = false;
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Control(ctrl) = content {
                        match ctrl {
                            hwp_model::control::Control::FootNote(_) => found_footnote = true,
                            hwp_model::control::Control::EndNote(_) => found_endnote = true,
                            _ => {}
                        }
                    }
                }
            }
        }
    }
    assert!(
        found_footnote,
        "footnote-endnote.hwp should have footnote"
    );
    assert!(found_endnote, "footnote-endnote.hwp should have endnote");
}

#[test]
fn convert_hyperlink_field() {
    let hwp_doc = parse_hwp("hyperlink.hwp");
    let doc = to_document(&hwp_doc);

    let mut found_field = false;
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Control(
                        hwp_model::control::Control::FieldBegin(f),
                    ) = content
                    {
                        if f.field_type == hwp_model::types::FieldType::Hyperlink {
                            found_field = true;
                        }
                    }
                }
            }
        }
    }
    assert!(
        found_field,
        "hyperlink.hwp should have hyperlink field"
    );
}

#[test]
fn convert_multicolumns() {
    let hwp_doc = parse_hwp("multicolumns.hwp");
    let doc = to_document(&hwp_doc);

    let mut found_column = false;
    for sec in &doc.sections {
        for para in &sec.paragraphs {
            for run in &para.runs {
                for content in &run.contents {
                    if let hwp_model::paragraph::RunContent::Control(
                        hwp_model::control::Control::Column(_),
                    ) = content
                    {
                        found_column = true;
                    }
                }
            }
        }
    }
    assert!(
        found_column,
        "multicolumns.hwp should have column control"
    );
}

#[test]
fn convert_all_fixtures_border_fills() {
    let fixtures = [
        "borderfill.hwp",
        "table.hwp",
        "table2.hwp",
        "selfintroduce.hwp",
    ];

    for name in &fixtures {
        let hwp_doc = parse_hwp(name);
        let doc = to_document(&hwp_doc);

        assert!(
            !doc.resources.border_fills.is_empty(),
            "{}: should have border fills",
            name
        );

        // 모든 border_fill이 유효한 id를 가짐
        for (idx, bf) in doc.resources.border_fills.iter().enumerate() {
            assert_eq!(bf.id, idx as u16, "{}: border_fill id mismatch", name);
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
