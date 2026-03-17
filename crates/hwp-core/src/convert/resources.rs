//! DocInfo → hwp_model Resources 변환

use crate::document::docinfo;
use crate::document::docinfo::para_shape;

pub fn convert_resources(doc_info: &docinfo::DocInfo) -> hwp_model::resources::Resources {
    hwp_model::resources::Resources {
        fonts: convert_fonts(&doc_info.face_names),
        border_fills: convert_border_fills(&doc_info.border_fill),
        char_shapes: convert_char_shapes(&doc_info.char_shapes),
        tab_defs: convert_tab_defs(&doc_info.tab_defs),
        numberings: convert_numberings(&doc_info.numbering),
        bullets: convert_bullets(&doc_info.bullets),
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
            subst_font: fn_info
                .alternative_font_name
                .as_ref()
                .map(|name| SubstFont {
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

fn convert_char_shapes(shapes: &[docinfo::CharShape]) -> Vec<hwp_model::resources::CharShape> {
    use hwp_model::resources::{CharShadow, Strikeout, Underline};
    use hwp_model::types::*;

    shapes
        .iter()
        .enumerate()
        .map(|(i, cs)| {
            let a = &cs.attributes;
            hwp_model::resources::CharShape {
                id: i as u16,
                height: cs.base_size,
                text_color: Some(cs.text_color.to_rgb()),
                shade_color: if cs.shading_color.value() == 0xFFFFFFFF {
                    None
                } else {
                    Some(cs.shading_color.to_rgb())
                },
                use_font_space: a.use_font_spacing,
                use_kerning: a.kerning,
                sym_mark: match a.emphasis_mark {
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
                    hangul: cs.font_stretch.korean,
                    latin: cs.font_stretch.english,
                    hanja: cs.font_stretch.chinese,
                    japanese: cs.font_stretch.japanese,
                    other: cs.font_stretch.other,
                    symbol: cs.font_stretch.symbol,
                    user: cs.font_stretch.user,
                },
                spacing: LangGroup {
                    hangul: cs.letter_spacing.korean,
                    latin: cs.letter_spacing.english,
                    hanja: cs.letter_spacing.chinese,
                    japanese: cs.letter_spacing.japanese,
                    other: cs.letter_spacing.other,
                    symbol: cs.letter_spacing.symbol,
                    user: cs.letter_spacing.user,
                },
                rel_size: LangGroup {
                    hangul: cs.relative_size.korean,
                    latin: cs.relative_size.english,
                    hanja: cs.relative_size.chinese,
                    japanese: cs.relative_size.japanese,
                    other: cs.relative_size.other,
                    symbol: cs.relative_size.symbol,
                    user: cs.relative_size.user,
                },
                offset: LangGroup {
                    hangul: cs.text_position.korean,
                    latin: cs.text_position.english,
                    hanja: cs.text_position.chinese,
                    japanese: cs.text_position.japanese,
                    other: cs.text_position.other,
                    symbol: cs.text_position.symbol,
                    user: cs.text_position.user,
                },
                bold: a.bold,
                italic: a.italic,
                underline: if a.underline_type != 0 {
                    Some(Underline {
                        underline_type: match a.underline_type {
                            2 => UnderlineType::Center,
                            3 => UnderlineType::Top,
                            _ => UnderlineType::Bottom,
                        },
                        shape: convert_line_type3(a.underline_style),
                        color: Some(cs.underline_color.to_rgb()),
                    })
                } else {
                    None
                },
                strikeout: if a.strikethrough != 0 {
                    Some(Strikeout {
                        shape: convert_line_type3(a.strikethrough_style),
                        color: cs.strikethrough_color.map(|c| c.to_rgb()),
                    })
                } else {
                    None
                },
                outline: if a.outline_type != 0 {
                    Some(match a.outline_type {
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
                shadow: if a.shadow_type != 0 {
                    Some(CharShadow {
                        shadow_type: match a.shadow_type {
                            1 => CharShadowType::Drop,
                            2 => CharShadowType::Continuous,
                            _ => CharShadowType::None,
                        },
                        color: Some(cs.shadow_color.to_rgb()),
                        offset_x: cs.shadow_spacing_x,
                        offset_y: cs.shadow_spacing_y,
                    })
                } else {
                    None
                },
                emboss: a.emboss,
                engrave: a.engrave,
                superscript: a.superscript,
                subscript: a.subscript,
            }
        })
        .collect()
}

fn convert_para_shapes(shapes: &[docinfo::ParaShape]) -> Vec<hwp_model::resources::ParaShape> {
    use hwp_model::resources::*;
    use hwp_model::types::*;

    shapes
        .iter()
        .enumerate()
        .map(|(i, ps)| {
            let a1 = &ps.attributes1;
            let a2 = ps.attributes2.as_ref();
            let a3 = ps.attributes3.as_ref();

            let line_spacing_type = a3
                .map(|a| match a.line_spacing_type {
                    para_shape::LineSpacingType::ByCharacter => LineSpacingType::Percent,
                    para_shape::LineSpacingType::Fixed => LineSpacingType::Fixed,
                    para_shape::LineSpacingType::MarginOnly => LineSpacingType::Between,
                    para_shape::LineSpacingType::Minimum => LineSpacingType::AtLeast,
                })
                .unwrap_or(LineSpacingType::Percent);

            let line_spacing_value = ps.line_spacing.unwrap_or(ps.line_spacing_old);

            hwp_model::resources::ParaShape {
                id: i as u16,
                tab_def_id: Some(ps.tab_def_id),
                condense: a1.blank_min_value,
                font_line_height: a1.line_height_matches_font,
                snap_to_grid: a1.use_line_grid,
                suppress_line_numbers: None,
                text_dir: None,
                align: ParagraphAlign {
                    horizontal: match a1.align {
                        para_shape::ParagraphAlignment::Justify => HAlign::Justify,
                        para_shape::ParagraphAlignment::Left => HAlign::Left,
                        para_shape::ParagraphAlignment::Right => HAlign::Right,
                        para_shape::ParagraphAlignment::Center => HAlign::Center,
                        para_shape::ParagraphAlignment::Distribute => HAlign::Distribute,
                        para_shape::ParagraphAlignment::Divide => HAlign::DistributeSpace,
                    },
                    vertical: match a1.vertical_align {
                        para_shape::VerticalAlignment::Baseline => VAlign::Baseline,
                        para_shape::VerticalAlignment::Top => VAlign::Top,
                        para_shape::VerticalAlignment::Center => VAlign::Center,
                        para_shape::VerticalAlignment::Bottom => VAlign::Bottom,
                    },
                },
                heading: Some(Heading {
                    heading_type: match a1.header_shape_type {
                        para_shape::HeaderShapeType::None => HeadingType::None,
                        para_shape::HeaderShapeType::Outline => HeadingType::Outline,
                        para_shape::HeaderShapeType::Number => HeadingType::Number,
                        para_shape::HeaderShapeType::Bullet => HeadingType::Bullet,
                    },
                    id_ref: ps.number_bullet_id,
                    level: a1.paragraph_level,
                }),
                break_setting: BreakSetting {
                    break_latin_word: match a1.line_divide_en {
                        para_shape::LineDivideUnit::Word => BreakLatinWord::KeepWord,
                        para_shape::LineDivideUnit::Hyphen => BreakLatinWord::Hyphenation,
                        para_shape::LineDivideUnit::Character => BreakLatinWord::BreakWord,
                    },
                    break_non_latin_word: match a1.line_divide_ko {
                        para_shape::LineDivideUnit::Character => BreakNonLatinWord::BreakWord,
                        _ => BreakNonLatinWord::KeepWord,
                    },
                    widow_orphan: a1.protect_orphan_line,
                    keep_with_next: a1.with_next_paragraph,
                    keep_lines: a1.protect_paragraph,
                    page_break_before: a1.always_page_break_before,
                    line_wrap: a2
                        .map(|a| match a.single_line_input {
                            1 => LineWrap::Squeeze,
                            2 => LineWrap::Keep,
                            _ => LineWrap::Break,
                        })
                        .unwrap_or(LineWrap::Break),
                },
                auto_spacing: a2
                    .map(|a| AutoSpacing {
                        east_asian_eng: a.auto_spacing_ko_en,
                        east_asian_num: a.auto_spacing_ko_num,
                    })
                    .unwrap_or_default(),
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
                        value: ps.top_spacing,
                        unit: ValueUnit::HwpUnit,
                    },
                    next: HwpValue {
                        value: ps.bottom_spacing,
                        unit: ValueUnit::HwpUnit,
                    },
                },
                line_spacing: LineSpacing {
                    spacing_type: line_spacing_type,
                    value: line_spacing_value,
                    unit: ValueUnit::HwpUnit,
                },
                border: Some(ParagraphBorder {
                    border_fill_id: ps.border_fill_id,
                    offset_left: ps.border_spacing_left as i32,
                    offset_right: ps.border_spacing_right as i32,
                    offset_top: ps.border_spacing_top as i32,
                    offset_bottom: ps.border_spacing_bottom as i32,
                    connect: a1.connect_border,
                    ignore_margin: a1.ignore_margin,
                }),
            }
        })
        .collect()
}

fn convert_tab_defs(tabs: &[docinfo::TabDef]) -> Vec<hwp_model::resources::TabDef> {
    tabs.iter()
        .enumerate()
        .map(|(i, td)| hwp_model::resources::TabDef {
            id: i as u16,
            auto_tab_left: td.attributes.has_left_auto_tab,
            auto_tab_right: td.attributes.has_right_auto_tab,
            items: td
                .tabs
                .iter()
                .map(|ti| hwp_model::resources::TabItem {
                    pos: ti.position.value() as i32,
                    tab_type: match ti.tab_type {
                        docinfo::tab_def::TabType::Left => hwp_model::resources::TabType::Left,
                        docinfo::tab_def::TabType::Right => hwp_model::resources::TabType::Right,
                        docinfo::tab_def::TabType::Center => hwp_model::resources::TabType::Center,
                        docinfo::tab_def::TabType::Decimal => {
                            hwp_model::resources::TabType::Decimal
                        }
                    },
                    leader: convert_line_type2(ti.fill_type),
                })
                .collect(),
        })
        .collect()
}

fn convert_border_fills(
    fills: &[docinfo::border_fill::BorderFill],
) -> Vec<hwp_model::resources::BorderFill> {
    use hwp_model::resources::*;
    use hwp_model::types::*;

    fills
        .iter()
        .enumerate()
        .map(|(i, bf)| {
            let attrs = &bf.attributes;

            let slash = if attrs.slash_shape != 0 {
                Some(SlashInfo {
                    slash_type: match attrs.slash_shape {
                        1 => SlashType::Center,
                        2 => SlashType::CenterBelow,
                        3 => SlashType::CenterAbove,
                        4 => SlashType::All,
                        _ => SlashType::None,
                    },
                    crooked: attrs.slash_broken_line != 0,
                    is_counter: attrs.slash_rotated_180,
                })
            } else {
                None
            };

            let back_slash = if attrs.backslash_shape != 0 {
                Some(SlashInfo {
                    slash_type: match attrs.backslash_shape {
                        1 => SlashType::Center,
                        2 => SlashType::CenterBelow,
                        3 => SlashType::CenterAbove,
                        4 => SlashType::All,
                        _ => SlashType::None,
                    },
                    crooked: attrs.backslash_broken_line,
                    is_counter: attrs.backslash_rotated_180,
                })
            } else {
                None
            };

            let convert_border =
                |bl: &docinfo::border_fill::BorderLine| -> Option<LineSpec> {
                    if bl.line_type == 0 && bl.width == 0 {
                        None
                    } else {
                        Some(LineSpec {
                            line_type: convert_line_type3(bl.line_type),
                            width: convert_border_width(bl.width),
                            color: Some(bl.color.to_rgb()),
                        })
                    }
                };

            let diagonal = {
                let d = &bf.diagonal;
                if d.line_type == 0 && d.thickness == 0 {
                    None
                } else {
                    Some(LineSpec {
                        line_type: convert_line_type3(d.line_type),
                        width: convert_border_width(d.thickness),
                        color: Some(d.color.to_rgb()),
                    })
                }
            };

            let fill = convert_fill_info(&bf.fill);

            BorderFill {
                id: i as u16,
                three_d: attrs.has_3d_effect,
                shadow: attrs.has_shadow,
                center_line: if attrs.has_center_line {
                    CenterLineType::Both
                } else {
                    CenterLineType::None
                },
                break_cell_separate_line: None,
                slash,
                back_slash,
                left_border: convert_border(&bf.borders[0]),
                right_border: convert_border(&bf.borders[1]),
                top_border: convert_border(&bf.borders[2]),
                bottom_border: convert_border(&bf.borders[3]),
                diagonal,
                fill,
            }
        })
        .collect()
}

fn convert_fill_info(
    fill: &docinfo::border_fill::FillInfo,
) -> Option<hwp_model::resources::FillBrush> {
    use hwp_model::resources::FillBrush;
    use hwp_model::types::*;

    match fill {
        docinfo::border_fill::FillInfo::None => None,
        docinfo::border_fill::FillInfo::Solid(s) => {
            let hatch_style = if s.pattern_type > 0 {
                Some(match s.pattern_type {
                    1 => HatchStyle::Vertical,
                    2 => HatchStyle::BackSlash,
                    3 => HatchStyle::Slash,
                    4 => HatchStyle::Cross,
                    5 => HatchStyle::CrossDiagonal,
                    _ => HatchStyle::Horizontal,
                })
            } else {
                None
            };
            Some(FillBrush::WinBrush {
                face_color: Some(s.background_color.to_rgb()),
                hatch_color: Some(s.pattern_color.to_rgb()),
                hatch_style,
                alpha: 255,
            })
        }
        docinfo::border_fill::FillInfo::Gradient(g) => Some(FillBrush::Gradation {
            grad_type: match g.gradient_type {
                1 => GradationType::Radial,
                2 => GradationType::Conical,
                3 => GradationType::Square,
                _ => GradationType::Linear,
            },
            angle: g.angle as u16,
            center_x: g.horizontal_center as u8,
            center_y: g.vertical_center as u8,
            step: g.spread as u8,
            color_num: g.color_count as u16,
            step_center: 50,
            colors: g.colors.iter().map(|c| Some(c.to_rgb())).collect(),
            alpha: 255,
        }),
        docinfo::border_fill::FillInfo::Image(img) => {
            let mode = match img.image_fill_type {
                0 => ImageBrushMode::Tile,
                1 => ImageBrushMode::TileHorzTop,
                2 => ImageBrushMode::TileHorzBottom,
                3 => ImageBrushMode::TileVertLeft,
                4 => ImageBrushMode::TileVertRight,
                5 => ImageBrushMode::Total,
                6 => ImageBrushMode::Center,
                7 => ImageBrushMode::CenterTop,
                8 => ImageBrushMode::CenterBottom,
                9 => ImageBrushMode::LeftCenter,
                10 => ImageBrushMode::LeftTop,
                11 => ImageBrushMode::LeftBottom,
                12 => ImageBrushMode::RightCenter,
                13 => ImageBrushMode::RightTop,
                14 => ImageBrushMode::RightBottom,
                15 => ImageBrushMode::Zoom,
                _ => ImageBrushMode::Total,
            };
            let (bright, contrast, effect, bin_id) = if img.image_info.len() >= 5 {
                let id = u16::from_le_bytes([img.image_info[3], img.image_info[4]]);
                (
                    img.image_info[0] as i8,
                    img.image_info[1] as i8,
                    match img.image_info[2] {
                        1 => ImageEffect::GrayScale,
                        2 => ImageEffect::BlackWhite,
                        _ => ImageEffect::RealPic,
                    },
                    id.to_string(),
                )
            } else {
                (0, 0, ImageEffect::RealPic, String::new())
            };
            Some(FillBrush::ImageBrush {
                mode,
                img: hwp_model::resources::ImageRef {
                    binary_item_id: bin_id,
                    bright,
                    contrast,
                    effect,
                    alpha: 255,
                },
            })
        }
    }
}

fn convert_numberings(
    numberings: &[docinfo::numbering::Numbering],
) -> Vec<hwp_model::resources::Numbering> {
    use hwp_model::resources::*;
    use hwp_model::types::*;

    numberings
        .iter()
        .enumerate()
        .map(|(i, n)| {
            let levels: Vec<NumberingLevel> = n
                .levels
                .iter()
                .enumerate()
                .map(|(lvl, info)| {
                    let a = &info.attributes;
                    NumberingLevel {
                        level: lvl as u8,
                        start: info.start_number,
                        align: match a.align_type {
                            docinfo::numbering::ParagraphAlignType::Center => HAlign::Center,
                            docinfo::numbering::ParagraphAlignType::Right => HAlign::Right,
                            _ => HAlign::Left,
                        },
                        use_inst_width: a.instance_like,
                        auto_indent: a.auto_outdent,
                        width_adjust: info.width as i32,
                        text_offset_type: match a.distance_type {
                            docinfo::numbering::DistanceType::Value => ValueUnit::HwpUnit,
                            docinfo::numbering::DistanceType::Ratio => ValueUnit::Char,
                        },
                        text_offset: info.distance as i32,
                        num_format: match a.number_type {
                            docinfo::numbering::NumberType::Arabic => NumberType2::Digit,
                            docinfo::numbering::NumberType::CircledDigits => {
                                NumberType2::CircledDigit
                            }
                            docinfo::numbering::NumberType::UpperRoman => {
                                NumberType2::RomanCapital
                            }
                            docinfo::numbering::NumberType::LowerRoman => NumberType2::RomanSmall,
                            docinfo::numbering::NumberType::UpperAlpha => {
                                NumberType2::LatinCapital
                            }
                            docinfo::numbering::NumberType::LowerAlpha => NumberType2::LatinSmall,
                            docinfo::numbering::NumberType::HangulGa => {
                                NumberType2::HangulSyllable
                            }
                            docinfo::numbering::NumberType::HangulGaCycle => {
                                NumberType2::CircledHangulSyllable
                            }
                        },
                        char_shape_id: if info.char_shape_id > 0 {
                            Some(info.char_shape_id)
                        } else {
                            None
                        },
                        checkable: false,
                        format_string: info.format_string.clone(),
                    }
                })
                .collect();

            let start = levels.first().map(|l| l.start).unwrap_or(1);

            Numbering {
                id: i as u16,
                start,
                levels,
            }
        })
        .collect()
}

fn convert_bullets(bullets: &[docinfo::bullet::Bullet]) -> Vec<hwp_model::resources::Bullet> {
    use hwp_model::resources::*;
    use hwp_model::types::*;

    bullets
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let a = &b.attributes;
            let use_image = b.image_bullet_id > 0;

            let image = if use_image {
                b.image_bullet_attributes.as_ref().map(|ia| BulletImage {
                    binary_item_id: ia.id.to_string(),
                    bright: ia.brightness as i8,
                    contrast: ia.contrast as i8,
                    effect: match ia.effect {
                        1 => ImageEffect::GrayScale,
                        2 => ImageEffect::BlackWhite,
                        _ => ImageEffect::RealPic,
                    },
                })
            } else {
                None
            };

            Bullet {
                id: i as u16,
                bullet_char: char::from_u32(b.bullet_char as u32).unwrap_or('●'),
                checked_char: if b.check_bullet_char != 0 {
                    char::from_u32(b.check_bullet_char as u32)
                } else {
                    None
                },
                use_image,
                para_head: BulletParaHead {
                    level: 0,
                    align: match a.align_type {
                        docinfo::bullet::BulletAlignType::Center => HAlign::Center,
                        docinfo::bullet::BulletAlignType::Right => HAlign::Right,
                        _ => HAlign::Left,
                    },
                    use_inst_width: a.instance_like,
                    auto_indent: a.auto_outdent,
                    width_adjust: b.width as i32,
                    text_offset_type: match a.distance_type {
                        docinfo::bullet::BulletDistanceType::Value => ValueUnit::HwpUnit,
                        docinfo::bullet::BulletDistanceType::Ratio => ValueUnit::Char,
                    },
                    text_offset: b.space as i32,
                    char_shape_id: if b.char_shape_id > 0 {
                        Some(b.char_shape_id as u32)
                    } else {
                        None
                    },
                },
                image,
            }
        })
        .collect()
}

fn convert_styles(styles: &[docinfo::Style]) -> Vec<hwp_model::resources::Style> {
    styles
        .iter()
        .enumerate()
        .map(|(i, s)| hwp_model::resources::Style {
            id: i as u16,
            style_type: match s.style_type {
                docinfo::style::StyleType::Paragraph => hwp_model::types::StyleType::Para,
                docinfo::style::StyleType::Character => hwp_model::types::StyleType::Char,
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

/// HWP 5.0 Table 26 테두리선 굵기 → 문자열 (mm)
fn convert_border_width(v: u8) -> String {
    match v {
        0 => "0.1mm",
        1 => "0.12mm",
        2 => "0.15mm",
        3 => "0.2mm",
        4 => "0.25mm",
        5 => "0.3mm",
        6 => "0.4mm",
        7 => "0.5mm",
        8 => "0.6mm",
        9 => "0.7mm",
        10 => "1.0mm",
        11 => "1.5mm",
        12 => "2.0mm",
        13 => "3.0mm",
        14 => "4.0mm",
        15 => "5.0mm",
        _ => "0.1mm",
    }
    .to_string()
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
