//! DocInfo → hwp_model Resources 변환

use crate::document::docinfo;

pub fn convert_resources(doc_info: &docinfo::DocInfo) -> hwp_model::resources::Resources {
    hwp_model::resources::Resources {
        fonts: convert_fonts(&doc_info.face_names),
        border_fills: Vec::new(), // TODO
        char_shapes: convert_char_shapes(&doc_info.char_shapes),
        tab_defs: convert_tab_defs(&doc_info.tab_defs),
        numberings: Vec::new(), // TODO
        bullets: Vec::new(),    // TODO
        para_shapes: convert_para_shapes(&doc_info.para_shapes),
        styles: convert_styles(&doc_info.styles),
        memo_shapes: Vec::new(),
    }
}

fn convert_fonts(face_names: &[docinfo::FaceName]) -> hwp_model::resources::FontFaces {
    use hwp_model::resources::{Font, FontFaces, FontTypeInfo, SubstFont};
    use hwp_model::types::{FontCategory, FontType};

    let mut fonts = FontFaces::default();

    for (i, fn_info) in face_names.iter().enumerate() {
        let font = Font {
            id: i as u16,
            face: fn_info.name.clone(),
            font_type: FontType::Ttf,
            is_embedded: false,
            binary_item_id: None,
            subst_font: fn_info.alternative_font_name.as_ref().map(|name| SubstFont {
                face: name.clone(),
                font_type: FontType::Ttf,
                is_embedded: false,
            }),
            type_info: fn_info.font_type_info.as_ref().map(|ti| FontTypeInfo {
                family_type: match ti.font_family {
                    1 => FontCategory::Myungjo,
                    2 => FontCategory::Gothic,
                    3 => FontCategory::SSerif,
                    4 => FontCategory::BrushScript,
                    5 => FontCategory::NonRectMj,
                    6 => FontCategory::NonRectGt,
                    _ => FontCategory::Unknown,
                },
                weight: ti.bold,
                proportion: ti.proportion,
                contrast: ti.contrast,
                stroke_variation: ti.stroke_variation,
                arm_style: ti.stroke_type,
                letterform: ti.letter_type,
                midline: ti.middle_line,
                x_height: ti.x_height,
            }),
            default_font_name: fn_info.default_font_name.clone(),
        };

        fonts.hangul.push(font.clone());
        fonts.latin.push(font.clone());
        fonts.hanja.push(font.clone());
        fonts.japanese.push(font.clone());
        fonts.other.push(font.clone());
        fonts.symbol.push(font.clone());
        fonts.user.push(font);
    }

    fonts
}

fn convert_char_shapes(
    shapes: &[docinfo::CharShape],
) -> Vec<hwp_model::resources::CharShape> {
    use hwp_model::resources::{CharShadow, Strikeout, Underline};
    use hwp_model::types::*;

    shapes
        .iter()
        .enumerate()
        .map(|(i, cs)| hwp_model::resources::CharShape {
            id: i as u16,
            height: cs.base_size as i32,
            text_color: Some(colorref_to_rgb(cs.text_color)),
            shade_color: if cs.shading_color == 0xFFFFFFFF {
                None
            } else {
                Some(colorref_to_rgb(cs.shading_color))
            },
            use_font_space: cs.use_font_spacing,
            use_kerning: cs.kerning,
            sym_mark: match cs.emphasis_mark {
                1 => SymMark::DotAbove,
                2 => SymMark::RingAbove,
                3 => SymMark::Tilde,
                _ => SymMark::None,
            },
            border_fill_id: cs.border_fill_id,
            font_ref: LangGroup {
                hangul: cs.font_ids.korean,
                latin: cs.font_ids.english,
                hanja: cs.font_ids.chinese,
                japanese: cs.font_ids.japanese,
                other: cs.font_ids.other,
                symbol: cs.font_ids.symbol,
                user: cs.font_ids.user,
            },
            ratio: LangGroup {
                hangul: cs.font_scale.korean,
                latin: cs.font_scale.english,
                hanja: cs.font_scale.chinese,
                japanese: cs.font_scale.japanese,
                other: cs.font_scale.other,
                symbol: cs.font_scale.symbol,
                user: cs.font_scale.user,
            },
            spacing: LangGroup {
                hangul: cs.font_spacing.korean,
                latin: cs.font_spacing.english,
                hanja: cs.font_spacing.chinese,
                japanese: cs.font_spacing.japanese,
                other: cs.font_spacing.other,
                symbol: cs.font_spacing.symbol,
                user: cs.font_spacing.user,
            },
            rel_size: LangGroup {
                hangul: cs.font_relative_size.korean,
                latin: cs.font_relative_size.english,
                hanja: cs.font_relative_size.chinese,
                japanese: cs.font_relative_size.japanese,
                other: cs.font_relative_size.other,
                symbol: cs.font_relative_size.symbol,
                user: cs.font_relative_size.user,
            },
            offset: LangGroup {
                hangul: cs.font_position.korean,
                latin: cs.font_position.english,
                hanja: cs.font_position.chinese,
                japanese: cs.font_position.japanese,
                other: cs.font_position.other,
                symbol: cs.font_position.symbol,
                user: cs.font_position.user,
            },
            bold: cs.bold,
            italic: cs.italic,
            underline: if cs.underline_type != 0 {
                Some(Underline {
                    underline_type: match cs.underline_type {
                        2 => UnderlineType::Center,
                        3 => UnderlineType::Top,
                        _ => UnderlineType::Bottom,
                    },
                    shape: convert_line_type3(cs.underline_style),
                    color: Some(colorref_to_rgb(cs.underline_color)),
                })
            } else {
                None
            },
            strikeout: if cs.strikethrough != 0 {
                Some(Strikeout {
                    shape: convert_line_type3(cs.strikethrough_style),
                    color: cs.strikethrough_color.map(colorref_to_rgb),
                })
            } else {
                None
            },
            outline: if cs.outline_type != 0 {
                Some(match cs.outline_type {
                    1 => OutlineType::Solid,
                    2 => OutlineType::Dot,
                    3 => OutlineType::Thick,
                    4 => OutlineType::Dash,
                    5 => OutlineType::DashDot,
                    6 => OutlineType::DashDotDot,
                    _ => OutlineType::None,
                })
            } else {
                None
            },
            shadow: if cs.shadow_type != 0 {
                Some(CharShadow {
                    shadow_type: match cs.shadow_type {
                        1 => CharShadowType::Drop,
                        2 => CharShadowType::Continuous,
                        _ => CharShadowType::None,
                    },
                    color: Some(colorref_to_rgb(cs.shadow_color)),
                    offset_x: cs.shadow_spacing_x,
                    offset_y: cs.shadow_spacing_y,
                })
            } else {
                None
            },
            emboss: cs.emboss,
            engrave: cs.engrave,
            superscript: cs.superscript,
            subscript: cs.subscript,
        })
        .collect()
}

fn convert_para_shapes(
    shapes: &[docinfo::ParaShape],
) -> Vec<hwp_model::resources::ParaShape> {
    use hwp_model::resources::*;
    use hwp_model::types::*;

    shapes
        .iter()
        .enumerate()
        .map(|(i, ps)| hwp_model::resources::ParaShape {
            id: i as u16,
            tab_def_id: Some(ps.tab_def_id),
            condense: ps.blank_min_value,
            font_line_height: ps.line_height_matches_font,
            snap_to_grid: ps.use_line_grid,
            suppress_line_numbers: None,
            text_dir: None,
            align: ParagraphAlign {
                horizontal: match ps.alignment {
                    0 => HAlign::Justify,
                    1 => HAlign::Left,
                    2 => HAlign::Right,
                    3 => HAlign::Center,
                    4 => HAlign::Distribute,
                    5 => HAlign::DistributeSpace,
                    _ => HAlign::Justify,
                },
                vertical: match ps.vertical_alignment {
                    1 => VAlign::Top,
                    2 => VAlign::Center,
                    3 => VAlign::Bottom,
                    _ => VAlign::Baseline,
                },
            },
            heading: Some(Heading {
                heading_type: match ps.header_shape_type {
                    docinfo::HeaderShapeType::None => HeadingType::None,
                    docinfo::HeaderShapeType::Outline => HeadingType::Outline,
                    docinfo::HeaderShapeType::Number => HeadingType::Number,
                    docinfo::HeaderShapeType::Bullet => HeadingType::Bullet,
                },
                id_ref: ps.numbering_bullet_id,
                level: ps.paragraph_level,
            }),
            break_setting: BreakSetting {
                break_latin_word: if ps.line_divide_english == 0 {
                    BreakLatinWord::KeepWord
                } else {
                    BreakLatinWord::BreakWord
                },
                break_non_latin_word: if ps.line_divide_korean {
                    BreakNonLatinWord::BreakWord
                } else {
                    BreakNonLatinWord::KeepWord
                },
                widow_orphan: ps.protect_orphan_line,
                keep_with_next: ps.with_next_paragraph,
                keep_lines: ps.protect_paragraph,
                page_break_before: ps.always_page_break_before,
                line_wrap: LineWrap::Break,
            },
            auto_spacing: AutoSpacing {
                east_asian_eng: ps.auto_spacing_ko_en,
                east_asian_num: ps.auto_spacing_ko_num,
            },
            margin: ParagraphMargin {
                indent: HwpValue {
                    value: ps.indent,
                    unit: ValueUnit::HwpUnit,
                },
                left: HwpValue {
                    value: ps.left_margin,
                    unit: ValueUnit::HwpUnit,
                },
                right: HwpValue {
                    value: ps.right_margin,
                    unit: ValueUnit::HwpUnit,
                },
                prev: HwpValue {
                    value: ps.top_margin,
                    unit: ValueUnit::HwpUnit,
                },
                next: HwpValue {
                    value: ps.bottom_margin,
                    unit: ValueUnit::HwpUnit,
                },
            },
            line_spacing: LineSpacing {
                spacing_type: match ps.line_spacing_type {
                    1 => LineSpacingType::Fixed,
                    2 => LineSpacingType::Between,
                    3 => LineSpacingType::AtLeast,
                    _ => LineSpacingType::Percent,
                },
                value: ps.line_spacing,
                unit: ValueUnit::HwpUnit,
            },
            border: Some(ParagraphBorder {
                border_fill_id: ps.border_fill_id,
                offset_left: ps.border_spacing_left as i32,
                offset_right: ps.border_spacing_right as i32,
                offset_top: ps.border_spacing_top as i32,
                offset_bottom: ps.border_spacing_bottom as i32,
                connect: ps.connect_border,
                ignore_margin: ps.ignore_margin,
            }),
        })
        .collect()
}

fn convert_tab_defs(tabs: &[docinfo::TabDef]) -> Vec<hwp_model::resources::TabDef> {
    tabs.iter()
        .enumerate()
        .map(|(i, td)| hwp_model::resources::TabDef {
            id: i as u16,
            auto_tab_left: td.has_left_auto_tab,
            auto_tab_right: td.has_right_auto_tab,
            items: td
                .tab_items
                .iter()
                .map(|ti| hwp_model::resources::TabItem {
                    pos: ti.position as i32,
                    tab_type: match ti.tab_type {
                        1 => hwp_model::resources::TabType::Right,
                        2 => hwp_model::resources::TabType::Center,
                        3 => hwp_model::resources::TabType::Decimal,
                        _ => hwp_model::resources::TabType::Left,
                    },
                    leader: convert_line_type2(ti.fill_type),
                })
                .collect(),
        })
        .collect()
}

fn convert_styles(styles: &[docinfo::Style]) -> Vec<hwp_model::resources::Style> {
    styles
        .iter()
        .enumerate()
        .map(|(i, s)| hwp_model::resources::Style {
            id: i as u16,
            style_type: if s.style_type == 0 {
                hwp_model::types::StyleType::Para
            } else {
                hwp_model::types::StyleType::Char
            },
            name: s.local_name.clone(),
            eng_name: s.english_name.clone(),
            para_shape_id: s.para_shape_id,
            char_shape_id: s.char_shape_id,
            next_style_id: Some(s.next_style_id as u16),
            lang_id: Some(s.lang_id as u16),
            lock_form: None,
        })
        .collect()
}

// ── 유틸 ──

fn colorref_to_rgb(c: u32) -> u32 {
    let r = c & 0xFF;
    let g = (c >> 8) & 0xFF;
    let b = (c >> 16) & 0xFF;
    (r << 16) | (g << 8) | b
}

fn convert_line_type3(v: u8) -> hwp_model::types::LineType3 {
    use hwp_model::types::LineType3;
    match v {
        0 => LineType3::Solid,
        1 => LineType3::Dash,
        2 => LineType3::Dot,
        3 => LineType3::DashDot,
        4 => LineType3::DashDotDot,
        5 => LineType3::LongDash,
        6 => LineType3::Circle,
        7 => LineType3::DoubleSlim,
        8 => LineType3::SlimThick,
        9 => LineType3::ThickSlim,
        10 => LineType3::SlimThickSlim,
        _ => LineType3::None,
    }
}

fn convert_line_type2(v: u8) -> hwp_model::types::LineType2 {
    use hwp_model::types::LineType2;
    match v {
        1 => LineType2::Solid,
        2 => LineType2::Dot,
        3 => LineType2::Dash,
        4 => LineType2::DashDot,
        5 => LineType2::DashDotDot,
        6 => LineType2::LongDash,
        _ => LineType2::None,
    }
}
