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
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
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
                        font_type: parse_font_type(&attr_str(e, b"type").unwrap_or_default()),
                        is_embedded: attr_bool(e, b"isEmbedded").unwrap_or(false),
                    });
                }
                _ => {}
            },
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
        text_color: attr_str(start, b"textColor")
            .map(|s| parse_color(&s))
            .unwrap_or(Some(0)),
        shade_color: attr_str(start, b"shadeColor").and_then(|s| parse_color(&s)),
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
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
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
            },
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

// ── borderFills ──

fn parse_border_fills(reader: &mut Reader<&[u8]>) -> Result<Vec<BorderFill>, HwpxError> {
    let mut fills = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"borderFill" {
                    fills.push(parse_border_fill(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"borderFills" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(fills)
}

fn parse_border_fill(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<BorderFill, HwpxError> {
    let mut bf = BorderFill {
        id: attr_u16(start, b"id").unwrap_or(0),
        three_d: attr_bool(start, b"threeD").unwrap_or(false),
        shadow: attr_bool(start, b"shadow").unwrap_or(false),
        center_line: parse_center_line_type(&attr_str(start, b"centerLine").unwrap_or_default()),
        break_cell_separate_line: attr_bool(start, b"breakCellSeparateLine"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) => match local_name(e.name().as_ref()) {
                b"slash" => {
                    bf.slash = Some(SlashInfo {
                        slash_type: parse_slash_type(&attr_str(e, b"type").unwrap_or_default()),
                        crooked: attr_bool(e, b"Crooked").unwrap_or(false),
                        is_counter: attr_bool(e, b"isCounter").unwrap_or(false),
                    });
                }
                b"backSlash" => {
                    bf.back_slash = Some(SlashInfo {
                        slash_type: parse_slash_type(&attr_str(e, b"type").unwrap_or_default()),
                        crooked: attr_bool(e, b"Crooked").unwrap_or(false),
                        is_counter: attr_bool(e, b"isCounter").unwrap_or(false),
                    });
                }
                b"leftBorder" => bf.left_border = Some(parse_line_spec(e)),
                b"rightBorder" => bf.right_border = Some(parse_line_spec(e)),
                b"topBorder" => bf.top_border = Some(parse_line_spec(e)),
                b"bottomBorder" => bf.bottom_border = Some(parse_line_spec(e)),
                b"diagonal" => bf.diagonal = Some(parse_line_spec(e)),
                _ => {}
            },
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"fillBrush" {
                    bf.fill = parse_fill_brush(reader)?;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"borderFill" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(bf)
}

fn parse_line_spec(e: &quick_xml::events::BytesStart) -> LineSpec {
    LineSpec {
        line_type: parse_line_type3(&attr_str(e, b"type").unwrap_or_default()),
        width: attr_str(e, b"width")
            .map(|s| s.replace(' ', ""))
            .unwrap_or_default(),
        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
    }
}

fn parse_fill_brush(reader: &mut Reader<&[u8]>) -> Result<Option<FillBrush>, HwpxError> {
    let mut win_brush: Option<FillBrush> = None;
    let mut gradation: Option<FillBrush> = None;
    let mut image_brush: Option<FillBrush> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"winBrush" => {
                    win_brush = Some(FillBrush::WinBrush {
                        face_color: attr_str(e, b"faceColor").and_then(|s| parse_color(&s)),
                        hatch_color: attr_str(e, b"hatchColor").and_then(|s| parse_color(&s)),
                        hatch_style: attr_str(e, b"hatchStyle").map(|s| parse_hatch_style(&s)),
                        alpha: attr_u8(e, b"alpha").unwrap_or(0),
                    });
                }
                b"gradation" => {
                    let grad_type = parse_gradation_type(&attr_str(e, b"type").unwrap_or_default());
                    let angle = attr_u16(e, b"angle").unwrap_or(0);
                    let center_x = attr_u8(e, b"centerX").unwrap_or(0);
                    let center_y = attr_u8(e, b"centerY").unwrap_or(0);
                    let step = attr_u8(e, b"step").unwrap_or(0);
                    let color_num = attr_u16(e, b"colorNum").unwrap_or(2);
                    let step_center = attr_u8(e, b"stepCenter").unwrap_or(50);
                    let alpha = attr_u8(e, b"alpha").unwrap_or(0);

                    let mut colors = Vec::new();
                    let mut gbuf = Vec::new();
                    loop {
                        match reader.read_event_into(&mut gbuf)? {
                            Event::Empty(ref ce) | Event::Start(ref ce) => {
                                if local_name(ce.name().as_ref()) == b"color" {
                                    colors
                                        .push(attr_str(ce, b"value").and_then(|s| parse_color(&s)));
                                }
                            }
                            Event::End(ref ce) => {
                                if local_name(ce.name().as_ref()) == b"gradation" {
                                    break;
                                }
                            }
                            Event::Eof => break,
                            _ => {}
                        }
                        gbuf.clear();
                    }

                    gradation = Some(FillBrush::Gradation {
                        grad_type,
                        angle,
                        center_x,
                        center_y,
                        step,
                        color_num,
                        step_center,
                        colors,
                        alpha,
                    });
                }
                b"imgBrush" => {
                    let mode = parse_image_brush_mode(&attr_str(e, b"mode").unwrap_or_default());
                    let mut img = ImageRef::default();
                    let mut ibuf = Vec::new();
                    loop {
                        match reader.read_event_into(&mut ibuf)? {
                            Event::Empty(ref ie) | Event::Start(ref ie) => {
                                if local_name(ie.name().as_ref()) == b"img" {
                                    img = ImageRef {
                                        binary_item_id: attr_str(ie, b"binaryItemIDRef")
                                            .unwrap_or_default(),
                                        bright: attr_i8(ie, b"bright").unwrap_or(0),
                                        contrast: attr_i8(ie, b"contrast").unwrap_or(0),
                                        effect: parse_image_effect(
                                            &attr_str(ie, b"effect").unwrap_or_default(),
                                        ),
                                        alpha: attr_u8(ie, b"alpha").unwrap_or(0),
                                    };
                                }
                            }
                            Event::End(ref ie) => {
                                if local_name(ie.name().as_ref()) == b"imgBrush" {
                                    break;
                                }
                            }
                            Event::Eof => break,
                            _ => {}
                        }
                        ibuf.clear();
                    }
                    image_brush = Some(FillBrush::ImageBrush { mode, img });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"fillBrush" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    let count = win_brush.is_some() as u8 + gradation.is_some() as u8 + image_brush.is_some() as u8;
    if count == 0 {
        Ok(None)
    } else if count == 1 {
        Ok(win_brush.or(gradation).or(image_brush))
    } else {
        Ok(Some(FillBrush::Combined {
            win_brush: win_brush.map(Box::new),
            gradation: gradation.map(Box::new),
            image_brush: image_brush.map(Box::new),
        }))
    }
}

// ── tabProperties ──

fn parse_tab_properties(reader: &mut Reader<&[u8]>) -> Result<Vec<TabDef>, HwpxError> {
    let mut defs = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) => {
                if local_name(e.name().as_ref()) == b"tabPr" {
                    defs.push(parse_tab_def(e, reader, true)?);
                }
            }
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"tabPr" {
                    defs.push(parse_tab_def(e, reader, false)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"tabProperties" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(defs)
}

fn parse_tab_def(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
    is_empty: bool,
) -> Result<TabDef, HwpxError> {
    let mut td = TabDef {
        id: attr_u16(start, b"id").unwrap_or(0),
        auto_tab_left: attr_bool(start, b"autoTabLeft").unwrap_or(false),
        auto_tab_right: attr_bool(start, b"autoTabRight").unwrap_or(false),
        items: Vec::new(),
    };

    if is_empty {
        return Ok(td);
    }

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"tabItem" {
                    td.items.push(TabItem {
                        pos: attr_i32(e, b"pos").unwrap_or(0),
                        tab_type: parse_tab_type_res(&attr_str(e, b"type").unwrap_or_default()),
                        leader: parse_line_type2_str(&attr_str(e, b"leader").unwrap_or_default()),
                    });
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"tabPr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(td)
}

// ── numberings ──

fn parse_numberings(reader: &mut Reader<&[u8]>) -> Result<Vec<Numbering>, HwpxError> {
    let mut nums = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"numbering" {
                    nums.push(parse_numbering(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"numberings" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(nums)
}

fn parse_numbering(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Numbering, HwpxError> {
    let mut num = Numbering {
        id: attr_u16(start, b"id").unwrap_or(0),
        start: attr_u16(start, b"start").unwrap_or(0),
        levels: Vec::new(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) => {
                if local_name(e.name().as_ref()) == b"paraHead" {
                    num.levels.push(NumberingLevel {
                        level: attr_u8(e, b"level").unwrap_or(1),
                        start: attr_u16(e, b"start").unwrap_or(1),
                        align: parse_halign(&attr_str(e, b"align").unwrap_or_default()),
                        use_inst_width: attr_bool(e, b"useInstWidth").unwrap_or(false),
                        auto_indent: attr_bool(e, b"autoIndent").unwrap_or(false),
                        width_adjust: attr_i32(e, b"widthAdjust").unwrap_or(0),
                        text_offset_type: parse_value_unit(
                            &attr_str(e, b"textOffsetType").unwrap_or_default(),
                        ),
                        text_offset: attr_i32(e, b"textOffset").unwrap_or(0),
                        num_format: parse_number_type2(
                            &attr_str(e, b"numFormat").unwrap_or_default(),
                        ),
                        char_shape_id: attr_u32(e, b"charPrIDRef"),
                        checkable: attr_bool(e, b"checkable").unwrap_or(false),
                        format_string: String::new(),
                    });
                }
            }
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"paraHead" {
                    let mut level = NumberingLevel {
                        level: attr_u8(e, b"level").unwrap_or(1),
                        start: attr_u16(e, b"start").unwrap_or(1),
                        align: parse_halign(&attr_str(e, b"align").unwrap_or_default()),
                        use_inst_width: attr_bool(e, b"useInstWidth").unwrap_or(false),
                        auto_indent: attr_bool(e, b"autoIndent").unwrap_or(false),
                        width_adjust: attr_i32(e, b"widthAdjust").unwrap_or(0),
                        text_offset_type: parse_value_unit(
                            &attr_str(e, b"textOffsetType").unwrap_or_default(),
                        ),
                        text_offset: attr_i32(e, b"textOffset").unwrap_or(0),
                        num_format: parse_number_type2(
                            &attr_str(e, b"numFormat").unwrap_or_default(),
                        ),
                        char_shape_id: attr_u32(e, b"charPrIDRef"),
                        checkable: attr_bool(e, b"checkable").unwrap_or(false),
                        format_string: String::new(),
                    };

                    // paraHead의 텍스트 내용 읽기
                    let mut tbuf = Vec::new();
                    loop {
                        match reader.read_event_into(&mut tbuf)? {
                            Event::Text(ref t) => {
                                level.format_string = t.unescape().unwrap_or_default().to_string();
                            }
                            Event::End(ref end) => {
                                if local_name(end.name().as_ref()) == b"paraHead" {
                                    break;
                                }
                            }
                            Event::Eof => break,
                            _ => {}
                        }
                        tbuf.clear();
                    }

                    num.levels.push(level);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"numbering" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(num)
}

// ── bullets ──

fn parse_bullets(reader: &mut Reader<&[u8]>) -> Result<Vec<Bullet>, HwpxError> {
    let mut bullets = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"bullet" {
                    bullets.push(parse_bullet(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"bullets" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(bullets)
}

fn parse_bullet(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Bullet, HwpxError> {
    let char_str = attr_str(start, b"char").unwrap_or_default();
    let checked_str = attr_str(start, b"checkedChar");

    let mut bullet = Bullet {
        id: attr_u16(start, b"id").unwrap_or(0),
        bullet_char: char_str.chars().next().unwrap_or('\0'),
        checked_char: checked_str.and_then(|s| s.chars().next()),
        use_image: attr_bool(start, b"useImg").unwrap_or(false),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"paraHead" => {
                    bullet.para_head = BulletParaHead {
                        level: attr_u8(e, b"level").unwrap_or(0),
                        align: parse_halign(&attr_str(e, b"align").unwrap_or_default()),
                        use_inst_width: attr_bool(e, b"useInstWidth").unwrap_or(false),
                        auto_indent: attr_bool(e, b"autoIndent").unwrap_or(false),
                        width_adjust: attr_i32(e, b"widthAdjust").unwrap_or(0),
                        text_offset_type: parse_value_unit(
                            &attr_str(e, b"textOffsetType").unwrap_or_default(),
                        ),
                        text_offset: attr_i32(e, b"textOffset").unwrap_or(0),
                        char_shape_id: attr_u32(e, b"charPrIDRef"),
                    };
                }
                b"img" => {
                    bullet.image = Some(BulletImage {
                        binary_item_id: attr_str(e, b"binaryItemIDRef").unwrap_or_default(),
                        bright: attr_i8(e, b"bright").unwrap_or(0),
                        contrast: attr_i8(e, b"contrast").unwrap_or(0),
                        effect: parse_image_effect(&attr_str(e, b"effect").unwrap_or_default()),
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"bullet" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(bullet)
}

// ── paraProperties ──

fn parse_para_properties(reader: &mut Reader<&[u8]>) -> Result<Vec<ParaShape>, HwpxError> {
    let mut shapes = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"paraPr" {
                    shapes.push(parse_para_shape(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"paraProperties" {
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

fn parse_para_shape(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<ParaShape, HwpxError> {
    let mut ps = ParaShape {
        id: attr_u16(start, b"id").unwrap_or(0),
        tab_def_id: attr_u16(start, b"tabPrIDRef"),
        condense: attr_u8(start, b"condense").unwrap_or(0),
        font_line_height: attr_bool(start, b"fontLineHeight").unwrap_or(false),
        snap_to_grid: attr_bool(start, b"snapToGrid").unwrap_or(false),
        suppress_line_numbers: attr_bool(start, b"suppressLineNumbers"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                match local_name(e.name().as_ref()) {
                    b"align" => {
                        ps.align = ParagraphAlign {
                            horizontal: parse_halign(
                                &attr_str(e, b"horizontal").unwrap_or_default(),
                            ),
                            vertical: parse_valign(&attr_str(e, b"vertical").unwrap_or_default()),
                        };
                    }
                    b"heading" => {
                        ps.heading = Some(Heading {
                            heading_type: parse_heading_type(
                                &attr_str(e, b"type").unwrap_or_default(),
                            ),
                            id_ref: attr_u16(e, b"idRef").unwrap_or(0),
                            level: attr_u8(e, b"level").unwrap_or(0),
                        });
                    }
                    b"breakSetting" => {
                        ps.break_setting = BreakSetting {
                            break_latin_word: parse_break_latin_word(
                                &attr_str(e, b"breakLatinWord").unwrap_or_default(),
                            ),
                            break_non_latin_word: parse_break_non_latin_word(
                                &attr_str(e, b"breakNonLatinWord").unwrap_or_default(),
                            ),
                            widow_orphan: attr_bool(e, b"widowOrphan").unwrap_or(false),
                            keep_with_next: attr_bool(e, b"keepWithNext").unwrap_or(false),
                            keep_lines: attr_bool(e, b"keepLines").unwrap_or(false),
                            page_break_before: attr_bool(e, b"pageBreakBefore").unwrap_or(false),
                            line_wrap: parse_line_wrap(
                                &attr_str(e, b"lineWrap").unwrap_or_default(),
                            ),
                        };
                    }
                    b"autoSpacing" => {
                        ps.auto_spacing = AutoSpacing {
                            east_asian_eng: attr_bool(e, b"eAsianEng").unwrap_or(false),
                            east_asian_num: attr_bool(e, b"eAsianNum").unwrap_or(false),
                        };
                    }
                    b"margin" => {
                        ps.margin = parse_para_margin(reader)?;
                    }
                    b"intent" | b"left" | b"right" | b"prev" | b"next" => {
                        // margin 하위 요소 — margin Start 이벤트 안에서 처리됨
                    }
                    b"lineSpacing" => {
                        ps.line_spacing = LineSpacing {
                            spacing_type: parse_line_spacing_type(
                                &attr_str(e, b"type").unwrap_or_default(),
                            ),
                            value: attr_i32(e, b"value").unwrap_or(160) as i32,
                            unit: parse_value_unit(&attr_str(e, b"unit").unwrap_or_default()),
                        };
                    }
                    b"border" => {
                        ps.border = Some(ParagraphBorder {
                            border_fill_id: attr_u16(e, b"borderFillIDRef").unwrap_or(0),
                            offset_left: attr_i32(e, b"offsetLeft").unwrap_or(0),
                            offset_right: attr_i32(e, b"offsetRight").unwrap_or(0),
                            offset_top: attr_i32(e, b"offsetTop").unwrap_or(0),
                            offset_bottom: attr_i32(e, b"offsetBottom").unwrap_or(0),
                            connect: attr_bool(e, b"connect").unwrap_or(false),
                            ignore_margin: attr_bool(e, b"ignoreMargin").unwrap_or(false),
                        });
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"paraPr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(ps)
}

fn parse_para_margin(reader: &mut Reader<&[u8]>) -> Result<ParagraphMargin, HwpxError> {
    let mut margin = ParagraphMargin::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                let val = HwpValue {
                    value: attr_i32(e, b"value").unwrap_or(0),
                    unit: parse_value_unit(&attr_str(e, b"unit").unwrap_or_default()),
                };
                match local_name(e.name().as_ref()) {
                    b"intent" => margin.indent = val,
                    b"left" => margin.left = val,
                    b"right" => margin.right = val,
                    b"prev" => margin.prev = val,
                    b"next" => margin.next = val,
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"margin" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(margin)
}

// ── styles ──

fn parse_styles(reader: &mut Reader<&[u8]>) -> Result<Vec<Style>, HwpxError> {
    let mut styles = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"style" {
                    styles.push(Style {
                        id: attr_u16(e, b"id").unwrap_or(0),
                        style_type: parse_style_type(&attr_str(e, b"type").unwrap_or_default()),
                        name: attr_str(e, b"name").unwrap_or_default(),
                        eng_name: attr_str(e, b"engName").unwrap_or_default(),
                        para_shape_id: attr_u16(e, b"paraPrIDRef"),
                        char_shape_id: attr_u16(e, b"charPrIDRef"),
                        next_style_id: attr_u16(e, b"nextStyleIDRef"),
                        lang_id: attr_u16(e, b"langID"),
                        lock_form: attr_bool(e, b"lockForm"),
                    });
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"styles" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(styles)
}

#[allow(dead_code)]
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

fn parse_center_line_type(s: &str) -> CenterLineType {
    match s {
        "LEFT" => CenterLineType::Left,
        "RIGHT" => CenterLineType::Right,
        "BOTH" => CenterLineType::Both,
        _ => CenterLineType::None,
    }
}

fn parse_slash_type(s: &str) -> SlashType {
    match s {
        "CENTER" => SlashType::Center,
        "CENTER_BELOW" => SlashType::CenterBelow,
        "CENTER_ABOVE" => SlashType::CenterAbove,
        "ALL" => SlashType::All,
        _ => SlashType::None,
    }
}

fn parse_hatch_style(s: &str) -> HatchStyle {
    match s {
        "VERTICAL" => HatchStyle::Vertical,
        "BACK_SLASH" => HatchStyle::BackSlash,
        "SLASH" => HatchStyle::Slash,
        "CROSS" => HatchStyle::Cross,
        "CROSS_DIAGONAL" => HatchStyle::CrossDiagonal,
        _ => HatchStyle::Horizontal,
    }
}

fn parse_gradation_type(s: &str) -> GradationType {
    match s {
        "RADIAL" => GradationType::Radial,
        "CONICAL" => GradationType::Conical,
        "SQUARE" => GradationType::Square,
        _ => GradationType::Linear,
    }
}

fn parse_image_brush_mode(s: &str) -> ImageBrushMode {
    match s {
        "TILE" => ImageBrushMode::Tile,
        "TILE_HORZ_TOP" => ImageBrushMode::TileHorzTop,
        "TILE_HORZ_BOTTOM" => ImageBrushMode::TileHorzBottom,
        "TILE_VERT_LEFT" => ImageBrushMode::TileVertLeft,
        "TILE_VERT_RIGHT" => ImageBrushMode::TileVertRight,
        "CENTER" => ImageBrushMode::Center,
        "CENTER_TOP" => ImageBrushMode::CenterTop,
        "CENTER_BOTTOM" => ImageBrushMode::CenterBottom,
        "LEFT_CENTER" => ImageBrushMode::LeftCenter,
        "LEFT_TOP" => ImageBrushMode::LeftTop,
        "LEFT_BOTTOM" => ImageBrushMode::LeftBottom,
        "RIGHT_CENTER" => ImageBrushMode::RightCenter,
        "RIGHT_TOP" => ImageBrushMode::RightTop,
        "RIGHT_BOTTOM" => ImageBrushMode::RightBottom,
        "ZOOM" => ImageBrushMode::Zoom,
        _ => ImageBrushMode::Total,
    }
}

fn parse_image_effect(s: &str) -> ImageEffect {
    match s {
        "GRAY_SCALE" => ImageEffect::GrayScale,
        "BLACK_WHITE" => ImageEffect::BlackWhite,
        _ => ImageEffect::RealPic,
    }
}

fn parse_tab_type_res(s: &str) -> TabType {
    match s {
        "RIGHT" => TabType::Right,
        "CENTER" => TabType::Center,
        "DECIMAL" => TabType::Decimal,
        _ => TabType::Left,
    }
}

fn parse_line_type2_str(s: &str) -> LineType2 {
    match s {
        "SOLID" => LineType2::Solid,
        "DOT" => LineType2::Dot,
        "DASH" => LineType2::Dash,
        "DASH_DOT" => LineType2::DashDot,
        "DASH_DOT_DOT" => LineType2::DashDotDot,
        "LONG_DASH" => LineType2::LongDash,
        "CIRCLE" => LineType2::Circle,
        "DOUBLE_SLIM" => LineType2::DoubleSlim,
        "SLIM_THICK" => LineType2::SlimThick,
        "THICK_SLIM" => LineType2::ThickSlim,
        "SLIM_THICK_SLIM" => LineType2::SlimThickSlim,
        _ => LineType2::None,
    }
}

fn parse_halign(s: &str) -> HAlign {
    match s {
        "LEFT" => HAlign::Left,
        "RIGHT" => HAlign::Right,
        "CENTER" => HAlign::Center,
        "DISTRIBUTE" => HAlign::Distribute,
        "DISTRIBUTE_SPACE" => HAlign::DistributeSpace,
        _ => HAlign::Justify,
    }
}

fn parse_valign(s: &str) -> VAlign {
    match s {
        "CENTER" => VAlign::Center,
        "BOTTOM" => VAlign::Bottom,
        _ => VAlign::Baseline,
    }
}

fn parse_heading_type(s: &str) -> HeadingType {
    match s {
        "OUTLINE" => HeadingType::Outline,
        "NUMBER" => HeadingType::Number,
        "BULLET" => HeadingType::Bullet,
        _ => HeadingType::None,
    }
}

fn parse_break_latin_word(s: &str) -> BreakLatinWord {
    match s {
        "HYPHENATION" => BreakLatinWord::Hyphenation,
        "BREAK_WORD" => BreakLatinWord::BreakWord,
        _ => BreakLatinWord::KeepWord,
    }
}

fn parse_break_non_latin_word(s: &str) -> BreakNonLatinWord {
    match s {
        "BREAK_WORD" => BreakNonLatinWord::BreakWord,
        _ => BreakNonLatinWord::KeepWord,
    }
}

fn parse_line_wrap(s: &str) -> LineWrap {
    match s {
        "SQUEEZE" => LineWrap::Squeeze,
        "KEEP" => LineWrap::Keep,
        _ => LineWrap::Break,
    }
}

fn parse_line_spacing_type(s: &str) -> LineSpacingType {
    match s {
        "FIXED" => LineSpacingType::Fixed,
        "AT_LEAST" => LineSpacingType::AtLeast,
        "BETWEEN" | "BETWEEN_LINES" => LineSpacingType::Between,
        _ => LineSpacingType::Percent,
    }
}

fn parse_value_unit(s: &str) -> ValueUnit {
    match s {
        "CHAR" => ValueUnit::Char,
        "PERCENT" => ValueUnit::HwpUnit, // PERCENT은 별도 처리 불필요
        _ => ValueUnit::HwpUnit,
    }
}

fn parse_style_type(s: &str) -> StyleType {
    match s {
        "CHAR" => StyleType::Char,
        _ => StyleType::Para,
    }
}

fn parse_number_type2(s: &str) -> NumberType2 {
    match s {
        "CIRCLED_DIGIT" => NumberType2::CircledDigit,
        "ROMAN_CAPITAL" => NumberType2::RomanCapital,
        "ROMAN_SMALL" => NumberType2::RomanSmall,
        "LATIN_CAPITAL" => NumberType2::LatinCapital,
        "LATIN_SMALL" => NumberType2::LatinSmall,
        "CIRCLED_LATIN_CAPITAL" => NumberType2::CircledLatinCapital,
        "CIRCLED_LATIN_SMALL" => NumberType2::CircledLatinSmall,
        "HANGUL_SYLLABLE" => NumberType2::HangulSyllable,
        "CIRCLED_HANGUL_SYLLABLE" => NumberType2::CircledHangulSyllable,
        "HANGUL_JAMO" => NumberType2::HangulJamo,
        "CIRCLED_HANGUL_JAMO" => NumberType2::CircledHangulJamo,
        "HANGUL_PHONETIC" => NumberType2::HangulPhonetic,
        "IDEOGRAPH" => NumberType2::Ideograph,
        "CIRCLED_IDEOGRAPH" => NumberType2::CircledIdeograph,
        "DECAGON_CIRCLE" => NumberType2::DecagonCircle,
        "DECAGON_CIRCLE_HANJA" => NumberType2::DecagonCircleHanja,
        "SYMBOL" => NumberType2::Symbol,
        "USER_CHAR" => NumberType2::UserChar,
        _ => NumberType2::Digit,
    }
}
