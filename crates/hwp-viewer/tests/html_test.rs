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
    assert!(html.contains("<meta charset=\"UTF-8\">"));
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
    assert!(html.contains("class=\"hwp-section\""));
}

#[test]
fn html_section_has_a4_page_width() {
    let html = parse_and_render("example.hwpx");
    // A4 width = 59528 HWPUNIT ≈ 210mm
    assert!(
        html.contains("width:209.") || html.contains("width:210"),
        "Section width should be ~210mm (A4)"
    );
}

#[test]
fn html_section_has_margins() {
    let html = parse_and_render("example.hwpx");
    // padding으로 여백이 설정되어야 함
    assert!(
        html.contains("padding:"),
        "Section should have padding for margins"
    );
}

// ═══════════════════════════════════════════
// CSS 스타일 - CharShape
// ═══════════════════════════════════════════

#[test]
fn css_char_shape_font_size() {
    let html = parse_and_render("charshape.hwpx");
    assert!(html.contains(".cs0 {"), "Should have cs0 class");
    // 글자 크기가 pt 단위로 있어야 함
    assert!(html.contains("font-size:"), "cs should have font-size");
    assert!(html.contains("pt"), "font-size should be in pt");
}

#[test]
fn css_char_shape_bold() {
    let html = parse_and_render("charshape.hwpx");
    assert!(
        html.contains("font-weight: bold"),
        "Should have bold style in some cs class"
    );
}

#[test]
fn css_char_shape_italic() {
    let html = parse_and_render("charshape.hwpx");
    assert!(
        html.contains("font-style: italic"),
        "Should have italic style in some cs class"
    );
}

#[test]
fn css_char_shape_underline() {
    let html = parse_and_render("underline-styles.hwpx");
    assert!(
        html.contains("text-decoration: underline"),
        "Should have underline in CSS"
    );
}

#[test]
fn css_char_shape_strikethrough() {
    let html = parse_and_render("strikethrough.hwpx");
    assert!(
        html.contains("text-decoration: line-through"),
        "Should have line-through in CSS"
    );
}

#[test]
fn css_char_shape_color() {
    let html = parse_and_render("charshape.hwpx");
    assert!(html.contains("color: #"), "Should have text color in CSS");
}

#[test]
fn css_char_shape_font_family() {
    let html = parse_and_render("facename.hwpx");
    assert!(
        html.contains("font-family:"),
        "Should have font-family in CSS"
    );
}

#[test]
fn css_char_shape_letter_spacing() {
    let doc = HwpxParser::parse(&fixture("charshape.hwpx")).unwrap();
    let has_spacing = doc
        .resources
        .char_shapes
        .iter()
        .any(|cs| cs.spacing.hangul != 0);

    if has_spacing {
        let html = parse_and_render("charshape.hwpx");
        assert!(
            html.contains("letter-spacing:"),
            "Should have letter-spacing when spacing != 0"
        );
    }
}

#[test]
fn css_char_shape_superscript() {
    let doc = HwpxParser::parse(&fixture("charshape.hwpx")).unwrap();
    let has_super = doc.resources.char_shapes.iter().any(|cs| cs.superscript);

    if has_super {
        let html = parse_and_render("charshape.hwpx");
        assert!(
            html.contains("vertical-align: super"),
            "Should have superscript style"
        );
    }
}

// ═══════════════════════════════════════════
// CSS 스타일 - ParaShape
// ═══════════════════════════════════════════

#[test]
fn css_para_shape_text_align() {
    let html = parse_and_render("parashape.hwpx");
    assert!(html.contains(".ps0 {"), "Should have ps0 class");
    assert!(
        html.contains("text-align: justify")
            || html.contains("text-align: left")
            || html.contains("text-align: center")
            || html.contains("text-align: right"),
        "Should have text-align"
    );
}

#[test]
fn css_para_shape_indent() {
    let html = parse_and_render("parashape.hwpx");
    // parashape.hwpx의 ps0은 indent=-2620
    assert!(
        html.contains("text-indent:"),
        "Should have text-indent for non-zero indent"
    );
}

#[test]
fn css_para_shape_line_height() {
    let html = parse_and_render("parashape.hwpx");
    assert!(html.contains("line-height:"), "Should have line-height");
}

#[test]
fn css_para_shape_margin() {
    let doc = HwpxParser::parse(&fixture("parashape.hwpx")).unwrap();
    let has_left_margin = doc
        .resources
        .para_shapes
        .iter()
        .any(|ps| ps.margin.left.value != 0);

    if has_left_margin {
        let html = parse_and_render("parashape.hwpx");
        assert!(
            html.contains("margin-left:"),
            "Should have margin-left when left margin != 0"
        );
    }
}

// ═══════════════════════════════════════════
// 텍스트 렌더링
// ═══════════════════════════════════════════

#[test]
fn html_renders_text_content() {
    let html = parse_and_render("example.hwpx");
    assert!(html.contains("삼강오륜"), "Should render Korean text");
    assert!(html.contains("군위신강"), "Should render paragraph text");
}

#[test]
fn html_renders_multiple_paragraphs() {
    let html = parse_and_render("example.hwpx");
    let p_count = html.matches("<p ").count();
    assert!(p_count > 5, "Should have many paragraphs, got {}", p_count);
}

#[test]
fn html_runs_have_char_shape_class() {
    let html = parse_and_render("example.hwpx");
    assert!(
        html.contains("<span class=\"cs"),
        "Runs should have span with cs class"
    );
}

#[test]
fn html_paragraphs_have_para_shape_class() {
    let html = parse_and_render("example.hwpx");
    assert!(
        html.contains("<p class=\"ps"),
        "Paragraphs should have p with ps class"
    );
}

#[test]
fn html_empty_paragraph_has_br() {
    let html = parse_and_render("example.hwpx");
    // 빈 문단에는 <br>이 있어야 함
    assert!(html.contains("<br>"), "Empty paragraphs should have <br>");
}

// ═══════════════════════════════════════════
// 특수 텍스트 요소
// ═══════════════════════════════════════════

#[test]
fn html_renders_tab_as_emsp() {
    let doc = HwpxParser::parse(&fixture("tabdef.hwpx")).unwrap();
    let has_tab = doc.sections.iter().any(|s| {
        s.paragraphs.iter().any(|p| {
            p.runs.iter().any(|r| {
                r.contents.iter().any(|c| {
                    if let hwp_model::paragraph::RunContent::Text(tc) = c {
                        tc.elements
                            .iter()
                            .any(|e| matches!(e, hwp_model::paragraph::TextElement::Tab { .. }))
                    } else {
                        false
                    }
                })
            })
        })
    });

    if has_tab {
        let html = parse_and_render("tabdef.hwpx");
        assert!(html.contains("&emsp;"), "Tabs should render as &emsp;");
    }
}

#[test]
fn html_renders_line_break() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    let has_linebreak = doc.sections.iter().any(|s| {
        s.paragraphs.iter().any(|p| {
            p.runs.iter().any(|r| {
                r.contents.iter().any(|c| {
                    if let hwp_model::paragraph::RunContent::Text(tc) = c {
                        tc.elements
                            .iter()
                            .any(|e| matches!(e, hwp_model::paragraph::TextElement::LineBreak))
                    } else {
                        false
                    }
                })
            })
        })
    });

    if has_linebreak {
        let html = parse_and_render("example.hwpx");
        assert!(html.contains("<br>"), "LineBreak should render as <br>");
    }
}

// ═══════════════════════════════════════════
// 표 - 상세
// ═══════════════════════════════════════════

#[test]
fn html_table_has_width() {
    let html = parse_and_render("table.hwpx");
    // 테이블에 width 스타일이 있어야 함
    assert!(
        html.contains("class=\"hwp-table\"") && html.contains("width:"),
        "Table should have width style"
    );
}

#[test]
fn html_table_rows_and_cells() {
    let html = parse_and_render("table.hwpx");
    let tr_count = html.matches("<tr>").count();
    let td_count = html.matches("<td").count();
    assert!(
        tr_count >= 2,
        "Should have at least 2 rows, got {}",
        tr_count
    );
    assert!(
        td_count >= 3,
        "Should have at least 3 cells, got {}",
        td_count
    );
}

#[test]
fn html_table_cell_vertical_align() {
    let html = parse_and_render("table.hwpx");
    // 최소한 렌더링 성공 + vertical-align이 있으면 middle/bottom 값 확인
    assert!(html.contains("<table"));
    if html.contains("vertical-align:") {
        assert!(
            html.contains("vertical-align:middle") || html.contains("vertical-align:bottom"),
            "vertical-align should be middle or bottom"
        );
    }
}

#[test]
fn html_table_cell_has_paragraphs() {
    let html = parse_and_render("table2.hwpx");
    // td 내부에 p 태그가 있어야 함
    let has_p_in_td = html.contains("<td") && html.contains("<p ");
    assert!(has_p_in_td, "Table cells should contain paragraphs");
}

// ═══════════════════════════════════════════
// 그림 - 상세
// ═══════════════════════════════════════════

#[test]
fn html_picture_has_img_tag() {
    let html = parse_and_render("sample-5017-pics.hwpx");
    assert!(html.contains("<img"), "Should have <img> tag");
}

#[test]
fn html_picture_base64_data_uri() {
    let html = parse_and_render("sample-5017-pics.hwpx");
    assert!(html.contains("data:image/"), "Image src should be data URI");
    assert!(html.contains("base64,"), "Image should be base64 encoded");
}

#[test]
fn html_picture_has_dimensions() {
    let html = parse_and_render("sample-5017-pics.hwpx");
    // 이미지에 width/height가 mm로 설정
    assert!(
        html.contains("width:") && html.contains("height:"),
        "Image should have width and height"
    );
}

#[test]
fn html_picture_inline_vs_absolute() {
    let html = parse_and_render("sample-5017-pics.hwpx");
    // treatAsChar=1이면 인라인, 아니면 absolute
    assert!(html.contains("<img"), "Should render picture as img");
}

// ═══════════════════════════════════════════
// 도형 - 상세
// ═══════════════════════════════════════════

#[test]
fn html_line_shape_svg() {
    let html = parse_and_render("shapeline.hwpx");
    assert!(html.contains("<svg"), "Line should render as SVG");
    assert!(html.contains("<line"), "SVG should have line element");
    assert!(html.contains("stroke="), "Line should have stroke");
}

#[test]
fn html_rect_shape_div() {
    let html = parse_and_render("shaperect.hwpx");
    assert!(
        html.contains("class=\"hwp-shape\""),
        "Rect should have hwp-shape class"
    );
}

#[test]
fn html_rect_with_fill_background() {
    let html = parse_and_render("shaperect.hwpx");
    // 배경색이 있는 사각형
    if html.contains("background-color:") {
        assert!(
            html.contains("background-color:#"),
            "Fill should be CSS background-color"
        );
    }
}

#[test]
fn html_rect_with_border() {
    let html = parse_and_render("shaperect.hwpx");
    if html.contains("border:") {
        assert!(html.contains("solid"), "Border should be solid style");
    }
}

#[test]
fn html_textbox_has_inner_text() {
    let html = parse_and_render("textbox.hwpx");
    assert!(html.contains("hwp-shape"), "Should have shape div");
    assert!(html.contains("글상자"), "Should contain textbox text");
}

#[test]
fn html_textbox_caption() {
    let html = parse_and_render("textbox.hwpx");
    // 캡션이 있으면 hwp-caption div
    if html.contains("hwp-caption") {
        assert!(
            html.contains("캡션") || html.contains("그림"),
            "Caption should have text"
        );
    }
}

// ═══════════════════════════════════════════
// 수식
// ═══════════════════════════════════════════

#[test]
fn html_equation_renders() {
    // latex.hwpx에 수식이 있으면 확인
    let doc = HwpxParser::parse(&fixture("latex.hwpx")).unwrap();
    let has_eq = doc.sections.iter().any(|s| {
        s.paragraphs.iter().any(|p| {
            p.runs.iter().any(|r| {
                r.contents.iter().any(|c| {
                    matches!(
                        c,
                        hwp_model::paragraph::RunContent::Object(
                            hwp_model::shape::ShapeObject::Equation(_)
                        )
                    )
                })
            })
        })
    });

    if has_eq {
        let html = parse_and_render("latex.hwpx");
        assert!(
            html.contains("hwp-equation"),
            "Equation should have hwp-equation class"
        );
    }
}

// ═══════════════════════════════════════════
// 머리글/꼬리말 - 상세
// ═══════════════════════════════════════════

#[test]
fn html_header_div() {
    let html = parse_and_render("headerfooter.hwpx");
    assert!(
        html.contains("class=\"hwp-header\""),
        "Header should have hwp-header class"
    );
}

#[test]
fn html_footer_div() {
    let html = parse_and_render("headerfooter.hwpx");
    assert!(
        html.contains("class=\"hwp-footer\""),
        "Footer should have hwp-footer class"
    );
}

#[test]
fn html_header_contains_text() {
    let html = parse_and_render("headerfooter.hwpx");
    assert!(
        html.contains("Header") && html.contains("머리말"),
        "Header should contain text"
    );
}

#[test]
fn html_footer_contains_text() {
    let html = parse_and_render("headerfooter.hwpx");
    assert!(
        html.contains("Footer") && html.contains("꼬리말"),
        "Footer should contain text"
    );
}

// ═══════════════════════════════════════════
// 각주/미주
// ═══════════════════════════════════════════

#[test]
fn html_footnote_ref() {
    let html = parse_and_render("footnote-endnote.hwpx");
    assert!(
        html.contains("hwp-footnote-ref"),
        "Should have footnote reference"
    );
}

#[test]
fn html_footnote_body() {
    let html = parse_and_render("footnote-endnote.hwpx");
    assert!(
        html.contains("hwp-footnote-body"),
        "Should have footnote body"
    );
}

// ═══════════════════════════════════════════
// 하이퍼링크 - 상세
// ═══════════════════════════════════════════

#[test]
fn html_hyperlink_anchor_tag() {
    let html = parse_and_render("hyperlink.hwpx");
    assert!(html.contains("<a href="), "Should have anchor tag");
    assert!(
        html.contains("target=\"_blank\""),
        "Link should open in new tab"
    );
}

#[test]
fn html_hyperlink_url() {
    let html = parse_and_render("hyperlink.hwpx");
    assert!(html.contains("naver.com"), "Should contain naver.com URL");
}

// ═══════════════════════════════════════════
// 덧말 (ruby)
// ═══════════════════════════════════════════

#[test]
fn html_dutmal_ruby_tag() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    let has_dutmal = doc.sections.iter().any(|s| {
        s.paragraphs.iter().any(|p| {
            p.runs.iter().any(|r| {
                r.contents.iter().any(|c| {
                    matches!(
                        c,
                        hwp_model::paragraph::RunContent::Control(
                            hwp_model::control::Control::Dutmal(_)
                        )
                    )
                })
            })
        })
    });

    if has_dutmal {
        let html = parse_and_render("example.hwpx");
        assert!(html.contains("<ruby>"), "Dutmal should render as <ruby>");
        assert!(
            html.contains("<rt>"),
            "Dutmal should have <rt> for sub text"
        );
    }
}

// ═══════════════════════════════════════════
// HTML 이스케이프
// ═══════════════════════════════════════════

#[test]
fn html_escapes_special_characters() {
    // 특수문자가 이스케이프되는지 확인
    use hwp_model::document::Document;
    use hwp_model::paragraph::*;
    use hwp_model::section::Section;

    let mut doc = Document::default();
    let mut section = Section::default();
    let mut para = Paragraph::default();
    let mut run = Run::default();
    run.contents.push(RunContent::Text(TextContent {
        char_shape_id: None,
        elements: vec![TextElement::Text(
            "<script>alert('xss')</script>".to_string(),
        )],
    }));
    para.runs.push(run);
    section.paragraphs.push(para);
    doc.sections.push(section);

    let html = to_html(&doc, &RenderOptions::new());
    assert!(!html.contains("<script>"), "Should escape script tags");
    assert!(
        html.contains("&lt;script&gt;"),
        "Should HTML-escape angle brackets"
    );
}

// ═══════════════════════════════════════════
// 전체 fixture 렌더링 성공
// ═══════════════════════════════════════════

#[test]
fn html_render_all_fixtures_structure() {
    let fixtures = [
        "aligns.hwpx",
        "borderfill.hwpx",
        "charshape.hwpx",
        "charstyle.hwpx",
        "example.hwpx",
        "facename.hwpx",
        "facename2.hwpx",
        "footnote-endnote.hwpx",
        "headerfooter.hwpx",
        "hyperlink.hwpx",
        "linespacing.hwpx",
        "lists.hwpx",
        "lists-bullet.hwpx",
        "multicolumns.hwpx",
        "multicolumns-layout.hwpx",
        "outline.hwpx",
        "page.hwpx",
        "pagedefs.hwpx",
        "parashape.hwpx",
        "sample-5017-pics.hwpx",
        "selfintroduce.hwpx",
        "shapeline.hwpx",
        "shaperect.hwpx",
        "strikethrough.hwpx",
        "tabdef.hwpx",
        "table.hwpx",
        "table2.hwpx",
        "table-bug.hwpx",
        "table-caption.hwpx",
        "table-position.hwpx",
        "textbox.hwpx",
        "underline-styles.hwpx",
        "noori.hwpx",
        "matrix.hwpx",
        "issue30.hwpx",
    ];

    for name in &fixtures {
        let html = parse_and_render(name);

        // 기본 HTML 구조
        assert!(
            html.starts_with("<!DOCTYPE html>"),
            "{}: should start with DOCTYPE",
            name
        );
        assert!(html.contains("<body>"), "{}: should have body", name);
        assert!(
            html.contains("hwp-section"),
            "{}: should have section",
            name
        );

        // CSS 클래스 존재
        assert!(html.contains(".cs0 {"), "{}: should have cs0 CSS", name);
        assert!(html.contains(".ps0 {"), "{}: should have ps0 CSS", name);

        // 문단 존재
        let p_count = html.matches("<p ").count();
        assert!(p_count > 0, "{}: should have paragraphs, got 0", name);

        // 충분한 크기
        assert!(
            html.len() > 500,
            "{}: HTML too small ({} bytes)",
            name,
            html.len()
        );
    }
}
