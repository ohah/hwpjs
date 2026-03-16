use crate::error::HwpxError;
use crate::utils::*;
use hwp_model::document::DocumentSettings;
use hwp_model::resources::*;
use hwp_model::types::*;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek};

/// header.xml → Resources
pub fn parse_header<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<Resources, HwpxError> {
    let xml = read_zip_entry_string(archive, path)?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut resources = Resources::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"fontfaces" => {
                    resources.fonts = parse_fontfaces(&mut reader)?;
                }
                b"borderFills" => {
                    resources.border_fills = parse_border_fills(&mut reader)?;
                }
                b"charProperties" => {
                    resources.char_shapes = parse_char_properties(&mut reader)?;
                }
                b"tabProperties" => {
                    resources.tab_defs = parse_tab_properties(&mut reader)?;
                }
                b"numberings" => {
                    resources.numberings = parse_numberings(&mut reader)?;
                }
                b"bullets" => {
                    resources.bullets = parse_bullets(&mut reader)?;
                }
                b"paraProperties" => {
                    resources.para_shapes = parse_para_properties(&mut reader)?;
                }
                b"styles" => {
                    resources.styles = parse_styles(&mut reader)?;
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(resources)
}

/// header.xml에서 beginNum → DocumentSettings
pub fn parse_settings<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<DocumentSettings, HwpxError> {
    let xml = read_zip_entry_string(archive, path)?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut settings = DocumentSettings::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"beginNum" {
                    settings.page_start = attr_u16(e, b"page").unwrap_or(1);
                    settings.footnote_start = attr_u16(e, b"footnote").unwrap_or(1);
                    settings.endnote_start = attr_u16(e, b"endnote").unwrap_or(1);
                    settings.picture_start = attr_u16(e, b"pic").unwrap_or(1);
                    settings.table_start = attr_u16(e, b"tbl").unwrap_or(1);
                    settings.equation_start = attr_u16(e, b"equation").unwrap_or(1);
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(settings)
}

// ── fontfaces ──

fn parse_fontfaces(reader: &mut Reader<&[u8]>) -> Result<FontFaces, HwpxError> {
    let mut fonts = FontFaces::default();
    let mut buf = Vec::new();
    let mut current_lang: Option<LangType> = None;

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"fontface" => {
                    current_lang = attr_str(e, b"lang").map(|s| parse_lang_type(&s));
                }
                b"font" => {
                    let font = parse_font(e, reader)?;
                    if let Some(ref lang) = current_lang {
                        match lang {
                            LangType::Hangul => fonts.hangul.push(font),
                            LangType::Latin => fonts.latin.push(font),
                            LangType::Hanja => fonts.hanja.push(font),
                            LangType::Japanese => fonts.japanese.push(font),
                            LangType::Other => fonts.other.push(font),
                            LangType::Symbol => fonts.symbol.push(font),
                            LangType::User => fonts.user.push(font),
                        }
                    }
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"fontfaces" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(fonts)
}

fn parse_font(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Font, HwpxError> {
    let mut font = Font {
        id: attr_u16(start, b"id").unwrap_or(0),
        face: attr_str(start, b"face").unwrap_or_default(),
        font_type: parse_font_type(&attr_str(start, b"type").unwrap_or_default()),
        is_embedded: attr_bool(start, b"isEmbedded").unwrap_or(false),
        binary_item_id: attr_str(start, b"binaryItemIDRef"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                match local_name(e.name().as_ref()) {
                    b"typeInfo" => {
                        font.type_info = Some(FontTypeInfo {
                            family_type: parse_font_category(
                                &attr_str(e, b"familyType").unwrap_or_default(),
                            ),
                            weight: attr_u8(e, b"weight").unwrap_or(0),
                            proportion: attr_u8(e, b"proportion").unwrap_or(0),
                            contrast: attr_u8(e, b"contrast").unwrap_or(0),
                            stroke_variation: attr_u8(e, b"strokeVariation").unwrap_or(0),
                            arm_style: attr_u8(e, b"armStyle").unwrap_or(0),
                            letterform: attr_u8(e, b"letterform").unwrap_or(0),
                            midline: attr_u8(e, b"midline").unwrap_or(0),
                            x_height: attr_u8(e, b"xHeight").unwrap_or(0),
                        });
                    }
                    b"substFont" => {
                        font.subst_font = Some(SubstFont {
                            face: attr_str(e, b"face").unwrap_or_default(),
                            font_type: parse_font_type(
                                &attr_str(e, b"type").unwrap_or_default(),
                            ),
                            is_embedded: attr_bool(e, b"isEmbedded").unwrap_or(false),
                        });
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"font" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(font)
}

// ── charProperties ──

fn parse_char_properties(reader: &mut Reader<&[u8]>) -> Result<Vec<CharShape>, HwpxError> {
    let mut shapes = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"charPr" {
                    shapes.push(parse_char_shape(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"charProperties" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(shapes)
}

fn parse_char_shape(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<CharShape, HwpxError> {
    let mut cs = CharShape {
        id: attr_u16(start, b"id").unwrap_or(0),
        height: attr_i32(start, b"height").unwrap_or(1000),
        text_color: attr_str(start, b"textColor").map(|s| parse_color(&s)).unwrap_or(Some(0)),
        shade_color: attr_str(start, b"shadeColor")
            .and_then(|s| parse_color(&s)),
        use_font_space: attr_bool(start, b"useFontSpace").unwrap_or(false),
        use_kerning: attr_bool(start, b"useKerning").unwrap_or(false),
        sym_mark: attr_str(start, b"symMark")
            .map(|s| parse_sym_mark(&s))
            .unwrap_or_default(),
        border_fill_id: attr_u16(start, b"borderFillIDRef"),
        ratio: LangGroup::all(100),
        rel_size: LangGroup::all(100),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                match local_name(e.name().as_ref()) {
                    b"fontRef" => {
                        cs.font_ref = LangGroup {
                            hangul: attr_u16(e, b"hangul").unwrap_or(0),
                            latin: attr_u16(e, b"latin").unwrap_or(0),
                            hanja: attr_u16(e, b"hanja").unwrap_or(0),
                            japanese: attr_u16(e, b"japanese").unwrap_or(0),
                            other: attr_u16(e, b"other").unwrap_or(0),
                            symbol: attr_u16(e, b"symbol").unwrap_or(0),
                            user: attr_u16(e, b"user").unwrap_or(0),
                        };
                    }
                    b"ratio" => {
                        cs.ratio = LangGroup {
                            hangul: attr_u8(e, b"hangul").unwrap_or(100),
                            latin: attr_u8(e, b"latin").unwrap_or(100),
                            hanja: attr_u8(e, b"hanja").unwrap_or(100),
                            japanese: attr_u8(e, b"japanese").unwrap_or(100),
                            other: attr_u8(e, b"other").unwrap_or(100),
                            symbol: attr_u8(e, b"symbol").unwrap_or(100),
                            user: attr_u8(e, b"user").unwrap_or(100),
                        };
                    }
                    b"spacing" => {
                        cs.spacing = LangGroup {
                            hangul: attr_i8(e, b"hangul").unwrap_or(0),
                            latin: attr_i8(e, b"latin").unwrap_or(0),
                            hanja: attr_i8(e, b"hanja").unwrap_or(0),
                            japanese: attr_i8(e, b"japanese").unwrap_or(0),
                            other: attr_i8(e, b"other").unwrap_or(0),
                            symbol: attr_i8(e, b"symbol").unwrap_or(0),
                            user: attr_i8(e, b"user").unwrap_or(0),
                        };
                    }
                    b"relSz" => {
                        cs.rel_size = LangGroup {
                            hangul: attr_u8(e, b"hangul").unwrap_or(100),
                            latin: attr_u8(e, b"latin").unwrap_or(100),
                            hanja: attr_u8(e, b"hanja").unwrap_or(100),
                            japanese: attr_u8(e, b"japanese").unwrap_or(100),
                            other: attr_u8(e, b"other").unwrap_or(100),
                            symbol: attr_u8(e, b"symbol").unwrap_or(100),
                            user: attr_u8(e, b"user").unwrap_or(100),
                        };
                    }
                    b"offset" => {
                        cs.offset = LangGroup {
                            hangul: attr_i8(e, b"hangul").unwrap_or(0),
                            latin: attr_i8(e, b"latin").unwrap_or(0),
                            hanja: attr_i8(e, b"hanja").unwrap_or(0),
                            japanese: attr_i8(e, b"japanese").unwrap_or(0),
                            other: attr_i8(e, b"other").unwrap_or(0),
                            symbol: attr_i8(e, b"symbol").unwrap_or(0),
                            user: attr_i8(e, b"user").unwrap_or(0),
                        };
                    }
                    b"bold" => cs.bold = true,
                    b"italic" => cs.italic = true,
                    b"emboss" => cs.emboss = true,
                    b"engrave" => cs.engrave = true,
                    b"supscript" => cs.superscript = true,
                    b"subscript" => cs.subscript = true,
                    b"underline" => {
                        cs.underline = Some(Underline {
                            underline_type: attr_str(e, b"type")
                                .map(|s| parse_underline_type(&s))
                                .unwrap_or_default(),
                            shape: attr_str(e, b"shape")
                                .map(|s| parse_line_type3(&s))
                                .unwrap_or_default(),
                            color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                        });
                    }
                    b"strikeout" => {
                        cs.strikeout = Some(Strikeout {
                            shape: attr_str(e, b"shape")
                                .map(|s| parse_line_type3(&s))
                                .unwrap_or_default(),
                            color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                        });
                    }
                    b"outline" => {
                        cs.outline = Some(
                            attr_str(e, b"type")
                                .map(|s| parse_outline_type(&s))
                                .unwrap_or_default(),
                        );
                    }
                    b"shadow" => {
                        cs.shadow = Some(CharShadow {
                            shadow_type: attr_str(e, b"type")
                                .map(|s| parse_char_shadow_type(&s))
                                .unwrap_or_default(),
                            color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                            offset_x: attr_i8(e, b"offsetX").unwrap_or(0),
                            offset_y: attr_i8(e, b"offsetY").unwrap_or(0),
                        });
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"charPr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(cs)
}

// ── Stub parsers (TODO: 이후 구현) ──

fn parse_border_fills(_reader: &mut Reader<&[u8]>) -> Result<Vec<BorderFill>, HwpxError> {
    // TODO: borderFills 파싱
    skip_to_end(_reader, b"borderFills")?;
    Ok(Vec::new())
}

fn parse_tab_properties(_reader: &mut Reader<&[u8]>) -> Result<Vec<TabDef>, HwpxError> {
    skip_to_end(_reader, b"tabProperties")?;
    Ok(Vec::new())
}

fn parse_numberings(_reader: &mut Reader<&[u8]>) -> Result<Vec<Numbering>, HwpxError> {
    skip_to_end(_reader, b"numberings")?;
    Ok(Vec::new())
}

fn parse_bullets(_reader: &mut Reader<&[u8]>) -> Result<Vec<Bullet>, HwpxError> {
    skip_to_end(_reader, b"bullets")?;
    Ok(Vec::new())
}

fn parse_para_properties(_reader: &mut Reader<&[u8]>) -> Result<Vec<ParaShape>, HwpxError> {
    skip_to_end(_reader, b"paraProperties")?;
    Ok(Vec::new())
}

fn parse_styles(_reader: &mut Reader<&[u8]>) -> Result<Vec<Style>, HwpxError> {
    skip_to_end(_reader, b"styles")?;
    Ok(Vec::new())
}

fn skip_to_end(reader: &mut Reader<&[u8]>, tag: &[u8]) -> Result<(), HwpxError> {
    let mut depth = 1u32;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == tag {
                    depth += 1;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == tag {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(())
}

// ── 파싱 헬퍼 (enum 변환) ──

fn parse_lang_type(s: &str) -> LangType {
    match s {
        "HANGUL" => LangType::Hangul,
        "LATIN" => LangType::Latin,
        "HANJA" => LangType::Hanja,
        "JAPANESE" => LangType::Japanese,
        "OTHER" => LangType::Other,
        "SYMBOL" => LangType::Symbol,
        "USER" => LangType::User,
        _ => LangType::Other,
    }
}

fn parse_font_type(s: &str) -> FontType {
    match s {
        "TTF" => FontType::Ttf,
        "TTC" => FontType::Ttc,
        "HFT" => FontType::Hft,
        "REP" => FontType::Rep,
        _ => FontType::Ttf,
    }
}

fn parse_font_category(s: &str) -> FontCategory {
    match s {
        "FCAT_MYUNGJO" => FontCategory::Myungjo,
        "FCAT_GOTHIC" => FontCategory::Gothic,
        "FCAT_SSERIF" => FontCategory::SSerif,
        "FCAT_BRUSHSCRIPT" => FontCategory::BrushScript,
        "FCAT_NONRECTMJ" => FontCategory::NonRectMj,
        "FCAT_NONRECTGT" => FontCategory::NonRectGt,
        _ => FontCategory::Unknown,
    }
}

fn parse_sym_mark(s: &str) -> SymMark {
    match s {
        "DOT_ABOVE" => SymMark::DotAbove,
        "RING_ABOVE" => SymMark::RingAbove,
        "TILDE" => SymMark::Tilde,
        "CARON" => SymMark::Caron,
        "SIDE" => SymMark::Side,
        "COLON" => SymMark::Colon,
        "GRAVE_ACCENT" => SymMark::GraveAccent,
        "ACUTE_ACCENT" => SymMark::AcuteAccent,
        "CIRCUMFLEX" => SymMark::Circumflex,
        "MACRON" => SymMark::Macron,
        "HOOK_ABOVE" => SymMark::HookAbove,
        "DOT_BELOW" => SymMark::DotBelow,
        _ => SymMark::None,
    }
}

fn parse_underline_type(s: &str) -> UnderlineType {
    match s {
        "CENTER" => UnderlineType::Center,
        "TOP" => UnderlineType::Top,
        _ => UnderlineType::Bottom,
    }
}

fn parse_line_type3(s: &str) -> LineType3 {
    match s {
        "SOLID" => LineType3::Solid,
        "DOT" => LineType3::Dot,
        "DASH" => LineType3::Dash,
        "DASH_DOT" => LineType3::DashDot,
        "DASH_DOT_DOT" => LineType3::DashDotDot,
        "LONG_DASH" => LineType3::LongDash,
        "CIRCLE" => LineType3::Circle,
        "DOUBLE_SLIM" => LineType3::DoubleSlim,
        "SLIM_THICK" => LineType3::SlimThick,
        "THICK_SLIM" => LineType3::ThickSlim,
        "SLIM_THICK_SLIM" => LineType3::SlimThickSlim,
        "WAVE" => LineType3::Wave,
        "DOUBLEWAVE" => LineType3::DoubleWave,
        _ => LineType3::None,
    }
}

fn parse_outline_type(s: &str) -> OutlineType {
    match s {
        "SOLID" => OutlineType::Solid,
        "DOT" => OutlineType::Dot,
        "THICK" => OutlineType::Thick,
        "DASH" => OutlineType::Dash,
        "DASH_DOT" => OutlineType::DashDot,
        "DASH_DOT_DOT" => OutlineType::DashDotDot,
        _ => OutlineType::None,
    }
}

fn parse_char_shadow_type(s: &str) -> CharShadowType {
    match s {
        "DROP" => CharShadowType::Drop,
        "CONTINUOUS" => CharShadowType::Continuous,
        _ => CharShadowType::None,
    }
}
