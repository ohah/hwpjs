use hwp_model::resources::*;
use hwp_model::types::*;
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

// ═══════════════════════════════════════════
// 메타데이터
// ═══════════════════════════════════════════

#[test]
fn parse_metadata() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();

    assert_eq!(doc.meta.title.as_deref(), Some("◆ 삼강오륜"));
    assert_eq!(doc.meta.creator.as_deref(), Some("dongk"));
    assert_eq!(doc.meta.language.as_deref(), Some("ko"));
    assert!(doc.meta.created_date.is_some());
    assert!(doc.meta.modified_date.is_some());
}

#[test]
fn parse_settings_begin_num() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();

    assert_eq!(doc.settings.page_start, 1);
    assert_eq!(doc.settings.footnote_start, 1);
    assert_eq!(doc.settings.endnote_start, 1);
    assert_eq!(doc.settings.picture_start, 1);
    assert_eq!(doc.settings.table_start, 1);
    assert_eq!(doc.settings.equation_start, 1);
}

// ═══════════════════════════════════════════
// 글꼴 (fontfaces)
// ═══════════════════════════════════════════

#[test]
fn parse_fontfaces() {
    let doc = HwpxParser::parse(&fixture("facename.hwpx")).unwrap();
    let fonts = &doc.resources.fonts;

    // 7개 언어 그룹 모두 존재
    assert!(!fonts.hangul.is_empty());
    assert!(!fonts.latin.is_empty());
    assert!(!fonts.hanja.is_empty());
    assert!(!fonts.japanese.is_empty());
    assert!(!fonts.other.is_empty());
    assert!(!fonts.symbol.is_empty());
    assert!(!fonts.user.is_empty());

    // 첫 번째 한글 글꼴 상세
    let f = &fonts.hangul[0];
    assert!(!f.face.is_empty());
    assert_eq!(f.font_type, FontType::Ttf);
    assert!(!f.is_embedded);

    // typeInfo 존재
    assert!(f.type_info.is_some());
    let ti = f.type_info.as_ref().unwrap();
    assert!(ti.weight > 0);
}

// ═══════════════════════════════════════════
// 글자 모양 (charProperties)
// ═══════════════════════════════════════════

#[test]
fn parse_char_shapes_basic() {
    let doc = HwpxParser::parse(&fixture("charshape.hwpx")).unwrap();
    let shapes = &doc.resources.char_shapes;

    assert!(shapes.len() > 1, "Should have multiple char shapes");

    let cs0 = &shapes[0];
    assert_eq!(cs0.id, 0);
    assert!(cs0.height > 0);
    assert!(cs0.text_color.is_some()); // #000000
    assert_eq!(cs0.sym_mark, SymMark::None);
}

#[test]
fn parse_char_shapes_bold_italic() {
    // charshape.hwpx에서 bold/italic이 있는 글자 모양 확인
    let doc = HwpxParser::parse(&fixture("charshape.hwpx")).unwrap();
    let shapes = &doc.resources.char_shapes;

    // bold나 italic이 있는 shape가 하나라도 있어야 함
    let has_bold = shapes.iter().any(|cs| cs.bold);
    let has_italic = shapes.iter().any(|cs| cs.italic);
    assert!(
        has_bold || has_italic,
        "charshape.hwpx should have bold or italic char shapes"
    );
}

#[test]
fn parse_char_shapes_lang_group() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    let cs = &doc.resources.char_shapes[0];

    // fontRef: 7개 언어 그룹 모두 파싱
    // ratio: 기본 100
    assert_eq!(cs.ratio.hangul, 100);
    assert_eq!(cs.ratio.latin, 100);

    // spacing: 기본 0
    assert_eq!(cs.spacing.hangul, 0);

    // relSz: 기본 100
    assert_eq!(cs.rel_size.hangul, 100);
}

#[test]
fn parse_strikethrough() {
    let doc = HwpxParser::parse(&fixture("strikethrough.hwpx")).unwrap();
    let shapes = &doc.resources.char_shapes;

    let has_strikeout = shapes.iter().any(|cs| cs.strikeout.is_some());
    assert!(has_strikeout, "strikethrough.hwpx should have strikeout char shapes");
}

#[test]
fn parse_underline_styles() {
    let doc = HwpxParser::parse(&fixture("underline-styles.hwpx")).unwrap();
    let shapes = &doc.resources.char_shapes;

    let has_underline = shapes.iter().any(|cs| cs.underline.is_some());
    assert!(has_underline, "underline-styles.hwpx should have underline char shapes");
}

// ═══════════════════════════════════════════
// 테두리/배경 (borderFills)
// ═══════════════════════════════════════════

#[test]
fn parse_border_fills() {
    let doc = HwpxParser::parse(&fixture("borderfill.hwpx")).unwrap();
    let bfs = &doc.resources.border_fills;

    // borderfill.hwpx에는 9개 borderFill
    assert_eq!(bfs.len(), 9);

    // 첫 번째: 테두리 없음
    let bf1 = &bfs[0];
    assert_eq!(bf1.id, 1);
    assert!(!bf1.three_d);
    assert!(!bf1.shadow);
    assert_eq!(bf1.center_line, CenterLineType::None);

    // leftBorder 확인
    let lb = bf1.left_border.as_ref().unwrap();
    assert_eq!(lb.line_type, LineType3::None);
    assert_eq!(lb.width, "0.1 mm");
    assert_eq!(lb.color, Some(0x000000));

    // 두 번째: winBrush 채우기
    let bf2 = &bfs[1];
    assert!(bf2.fill.is_some());
    match bf2.fill.as_ref().unwrap() {
        FillBrush::WinBrush { face_color, alpha, .. } => {
            assert!(face_color.is_some()); // #FFFFFFFF
            assert_eq!(*alpha, 0);
        }
        _ => panic!("Expected WinBrush fill"),
    }

    // 세 번째: SOLID 테두리
    let bf3 = &bfs[2];
    let lb3 = bf3.left_border.as_ref().unwrap();
    assert_eq!(lb3.line_type, LineType3::Solid);
    assert_eq!(lb3.width, "0.12 mm");

    // 네 번째: 단색 배경 #FF7F3F
    let bf4 = &bfs[3];
    match bf4.fill.as_ref().unwrap() {
        FillBrush::WinBrush { face_color, .. } => {
            assert_eq!(*face_color, Some(0xFF7F3F));
        }
        _ => panic!("Expected WinBrush fill"),
    }

    // 다섯 번째: gradation
    let bf5 = &bfs[4];
    match bf5.fill.as_ref().unwrap() {
        FillBrush::Gradation { grad_type, angle, colors, .. } => {
            assert_eq!(*grad_type, GradationType::Linear);
            assert_eq!(*angle, 90);
            assert_eq!(colors.len(), 2);
            assert_eq!(colors[0], Some(0xFF7F3F));
            assert_eq!(colors[1], Some(0x000000));
        }
        _ => panic!("Expected Gradation fill"),
    }
}

#[test]
fn parse_border_fill_slash() {
    let doc = HwpxParser::parse(&fixture("borderfill.hwpx")).unwrap();
    let bf = &doc.resources.border_fills[0];

    let slash = bf.slash.as_ref().unwrap();
    assert_eq!(slash.slash_type, SlashType::None);
    assert!(!slash.crooked);
    assert!(!slash.is_counter);

    let bslash = bf.back_slash.as_ref().unwrap();
    assert_eq!(bslash.slash_type, SlashType::None);
}

#[test]
fn parse_border_fill_image_brush() {
    let doc = HwpxParser::parse(&fixture("borderfill.hwpx")).unwrap();
    // id=7: winBrush + imgBrush (Combined)
    let bf7 = &doc.resources.border_fills[6];
    match bf7.fill.as_ref().unwrap() {
        FillBrush::Combined { win_brush, image_brush, .. } => {
            assert!(win_brush.is_some());
            assert!(image_brush.is_some());
        }
        _ => panic!("Expected Combined fill for bf7"),
    }
}

// ═══════════════════════════════════════════
// 탭 정의 (tabProperties)
// ═══════════════════════════════════════════

#[test]
fn parse_tab_properties() {
    let doc = HwpxParser::parse(&fixture("tabdef.hwpx")).unwrap();
    let tabs = &doc.resources.tab_defs;

    // tabdef.hwpx에는 10개 tabPr
    assert_eq!(tabs.len(), 10);

    // id=0: 자동탭 없음, 항목 없음
    assert_eq!(tabs[0].id, 0);
    assert!(!tabs[0].auto_tab_left);
    assert!(!tabs[0].auto_tab_right);
    assert!(tabs[0].items.is_empty());

    // id=1: 왼쪽 자동탭
    assert!(tabs[1].auto_tab_left);
    assert!(!tabs[1].auto_tab_right);

    // id=2: 오른쪽 자동탭
    assert!(!tabs[2].auto_tab_left);
    assert!(tabs[2].auto_tab_right);

    // id=3: RIGHT 탭 3개
    assert_eq!(tabs[3].items.len(), 3);
    assert_eq!(tabs[3].items[0].pos, 6000);
    assert_eq!(tabs[3].items[0].tab_type, TabType::Right);
    assert_eq!(tabs[3].items[0].leader, LineType2::None);

    // id=4: LEFT 탭 3개
    assert_eq!(tabs[4].items.len(), 3);
    assert_eq!(tabs[4].items[0].pos, 4000);
    assert_eq!(tabs[4].items[0].tab_type, TabType::Left);

    // id=5: CENTER 탭 3개
    assert_eq!(tabs[5].items[0].tab_type, TabType::Center);

    // id=6: DECIMAL 탭 3개
    assert_eq!(tabs[6].items[0].tab_type, TabType::Decimal);

    // id=7: DASH leader
    assert_eq!(tabs[7].items[0].leader, LineType2::Dash);

    // id=9: 양쪽 자동탭
    assert!(tabs[9].auto_tab_left);
    assert!(tabs[9].auto_tab_right);
}

// ═══════════════════════════════════════════
// 문단 모양 (paraProperties)
// ═══════════════════════════════════════════

#[test]
fn parse_para_shapes() {
    let doc = HwpxParser::parse(&fixture("parashape.hwpx")).unwrap();
    let shapes = &doc.resources.para_shapes;

    assert!(shapes.len() >= 2, "Should have multiple para shapes");

    // id=0: 기본 문단
    let ps0 = &shapes[0];
    assert_eq!(ps0.id, 0);
    assert_eq!(ps0.tab_def_id, Some(1));
    assert_eq!(ps0.condense, 0);
    assert!(!ps0.snap_to_grid);

    // align
    assert_eq!(ps0.align.horizontal, HAlign::Justify);
    assert_eq!(ps0.align.vertical, VAlign::Baseline);

    // heading
    let h = ps0.heading.as_ref().unwrap();
    assert_eq!(h.heading_type, HeadingType::None);
    assert_eq!(h.level, 0);

    // breakSetting
    assert_eq!(ps0.break_setting.break_latin_word, BreakLatinWord::KeepWord);
    assert!(!ps0.break_setting.widow_orphan);
    assert_eq!(ps0.break_setting.line_wrap, LineWrap::Break);

    // margin
    assert_eq!(ps0.margin.indent.value, -2620);
    assert_eq!(ps0.margin.indent.unit, ValueUnit::HwpUnit);
    assert_eq!(ps0.margin.left.value, 0);

    // lineSpacing
    assert_eq!(ps0.line_spacing.spacing_type, LineSpacingType::Percent);
    assert_eq!(ps0.line_spacing.value, 130);

    // border
    let b = ps0.border.as_ref().unwrap();
    assert_eq!(b.border_fill_id, 2);
    assert!(!b.connect);
}

#[test]
fn parse_para_shapes_snap_to_grid() {
    let doc = HwpxParser::parse(&fixture("parashape.hwpx")).unwrap();
    let shapes = &doc.resources.para_shapes;

    // id=1은 snapToGrid=1
    let ps1 = &shapes[1];
    assert!(ps1.snap_to_grid);
}

// ═══════════════════════════════════════════
// 스타일 (styles)
// ═══════════════════════════════════════════

#[test]
fn parse_styles() {
    let doc = HwpxParser::parse(&fixture("borderfill.hwpx")).unwrap();
    let styles = &doc.resources.styles;

    assert_eq!(styles.len(), 14);

    // 첫 번째: 바탕글
    let s0 = &styles[0];
    assert_eq!(s0.id, 0);
    assert_eq!(s0.style_type, StyleType::Para);
    assert_eq!(s0.name, "바탕글");
    assert_eq!(s0.eng_name, "Normal");
    assert_eq!(s0.para_shape_id, Some(2));
    assert_eq!(s0.char_shape_id, Some(1));
    assert_eq!(s0.next_style_id, Some(0));
    assert_eq!(s0.lang_id, Some(1042));
    assert_eq!(s0.lock_form, Some(false));

    // 머리말 스타일
    let s10 = &styles[10];
    assert_eq!(s10.name, "머리말");
    assert_eq!(s10.eng_name, "Header");

    // 각주 스타일
    let s11 = &styles[11];
    assert_eq!(s11.name, "각주");
    assert_eq!(s11.eng_name, "Footnote");
}

// ═══════════════════════════════════════════
// 번호 매기기 (numberings)
// ═══════════════════════════════════════════

#[test]
fn parse_numberings() {
    let doc = HwpxParser::parse(&fixture("lists.hwpx")).unwrap();
    let nums = &doc.resources.numberings;

    assert!(nums.len() >= 1, "Should have numberings");

    let n1 = &nums[0];
    assert_eq!(n1.id, 1);
    assert!(n1.levels.len() >= 7, "Should have at least 7 levels");

    // level 1: ROMAN_CAPITAL
    let l1 = &n1.levels[0];
    assert_eq!(l1.level, 1);
    assert_eq!(l1.num_format, NumberType2::RomanCapital);
    assert_eq!(l1.align, HAlign::Left);
    assert!(l1.use_inst_width);
    assert!(l1.auto_indent);
    assert_eq!(l1.text_offset, 50);
    assert_eq!(l1.format_string, "^1.");

    // level 2: LATIN_CAPITAL
    assert_eq!(n1.levels[1].num_format, NumberType2::LatinCapital);
    assert_eq!(n1.levels[1].format_string, "^2.");

    // level 3: DIGIT
    assert_eq!(n1.levels[2].num_format, NumberType2::Digit);

    // level 7: CIRCLED_DIGIT, checkable
    let l7 = &n1.levels[6];
    assert_eq!(l7.num_format, NumberType2::CircledDigit);
    assert!(l7.checkable);
}

// ═══════════════════════════════════════════
// 글머리표 (bullets)
// ═══════════════════════════════════════════

#[test]
fn parse_bullets() {
    let doc = HwpxParser::parse(&fixture("lists.hwpx")).unwrap();
    let bullets = &doc.resources.bullets;

    assert!(bullets.len() >= 2, "Should have at least 2 bullets");

    let b1 = &bullets[0];
    assert_eq!(b1.id, 1);
    assert!(!b1.use_image);
    assert!(b1.para_head.auto_indent);
}

// ═══════════════════════════════════════════
// 문단/텍스트 (body)
// ═══════════════════════════════════════════

#[test]
fn parse_paragraphs_text() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    let paras = &doc.sections[0].paragraphs;

    assert!(!paras.is_empty());

    // 첫 번째 문단에 "삼강오륜" 포함
    let first_text = extract_text(&paras[0]);
    assert!(first_text.contains("삼강오륜"), "got: '{}'", first_text);

    // 문단 속성 참조
    assert_eq!(paras[0].para_shape_id, 0);
    assert_eq!(paras[0].style_id, 0);
    assert!(!paras[0].page_break);
}

#[test]
fn parse_paragraphs_run_char_shape() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    let paras = &doc.sections[0].paragraphs;

    // 여러 run이 있는 문단 확인
    let multi_run = paras.iter().find(|p| p.runs.len() > 1);
    assert!(multi_run.is_some(), "Should have a paragraph with multiple runs");

    let p = multi_run.unwrap();
    // 각 run에 charPrIDRef가 설정되어 있어야 함
    for run in &p.runs {
        // charPrIDRef는 0 이상의 유효한 값
        assert!(run.char_shape_id < 100, "charPrIDRef should be reasonable");
    }
}

#[test]
fn parse_sections_count() {
    let doc = HwpxParser::parse(&fixture("example.hwpx")).unwrap();
    assert_eq!(doc.sections.len(), 1);
}

// ═══════════════════════════════════════════
// 전체 fixture 파싱 성공 테스트
// ═══════════════════════════════════════════

#[test]
fn parse_all_fixtures_no_error() {
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
        "multicolumns-widths.hwpx",
        "outline.hwpx",
        "page.hwpx",
        "pagedefs.hwpx",
        "parashape.hwpx",
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
    ];

    for name in &fixtures {
        let data = fixture(name);
        let result = HwpxParser::parse(&data);
        assert!(
            result.is_ok(),
            "Failed to parse {}: {:?}",
            name,
            result.err()
        );

        let doc = result.unwrap();
        // 최소한의 구조 확인
        assert!(!doc.sections.is_empty(), "{} should have sections", name);
        assert!(
            !doc.resources.fonts.hangul.is_empty(),
            "{} should have hangul fonts",
            name
        );
        assert!(
            !doc.resources.char_shapes.is_empty(),
            "{} should have char shapes",
            name
        );
        assert!(
            !doc.resources.para_shapes.is_empty(),
            "{} should have para shapes",
            name
        );
        assert!(
            !doc.resources.styles.is_empty(),
            "{} should have styles",
            name
        );
    }
}
