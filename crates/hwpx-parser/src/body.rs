use crate::error::HwpxError;
use crate::utils::*;
use hwp_model::control::*;
use hwp_model::hints::LineSegmentInfo;
use hwp_model::paragraph::*;
use hwp_model::resources::ImageRef;
use hwp_model::section::*;
use hwp_model::shape::*;
use hwp_model::table::*;
use hwp_model::types::*;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek};

/// section*.xml → Section
pub fn parse_section<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<Section, HwpxError> {
    let xml = read_zip_entry_string(archive, path)?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut section = Section::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"p" {
                    let (para, sec_def) = parse_paragraph(e, &mut reader)?;
                    if let Some(sd) = sec_def {
                        section.definition = sd;
                    }
                    section.paragraphs.push(para);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(section)
}

/// `<p>` 요소 파싱. secPr이 포함되어 있으면 SectionDef도 반환.
fn parse_paragraph(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<(Paragraph, Option<SectionDef>), HwpxError> {
    let mut para = Paragraph {
        id: attr_u64(start, b"id").unwrap_or(0),
        para_shape_id: attr_u16(start, b"paraPrIDRef").unwrap_or(0),
        style_id: attr_u16(start, b"styleIDRef").unwrap_or(0),
        page_break: attr_bool(start, b"pageBreak").unwrap_or(false),
        column_break: attr_bool(start, b"columnBreak").unwrap_or(false),
        merged: attr_bool(start, b"merged").unwrap_or(false),
        para_tc_id: attr_str(start, b"paraTcId"),
        meta_tag: None,
        runs: Vec::new(),
        line_segments: Vec::new(),
        has_char_shapes: true, // HWPX는 항상 Run별 charPrIDRef가 있으므로 true
    };

    let mut sec_def: Option<SectionDef> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"run" => {
                    let (run, maybe_sec) = parse_run(e, reader)?;
                    para.runs.push(run);
                    if maybe_sec.is_some() {
                        sec_def = maybe_sec;
                    }
                }
                b"linesegarray" => {
                    para.line_segments = parse_linesegarray(reader)?;
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"p" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    // 빈 run 제거: 텍스트/Control/Object가 없는 run 필터
    // 빈 run의 char_shape_id가 필요한 경우 (연속된 빈 run 후 텍스트 run이 오면),
    // HWP와 다르게 빈 run이 생성되어 폰트 매핑이 달라지는 문제 방지
    para.runs.retain(|run| !run.contents.is_empty());

    Ok((para, sec_def))
}

/// `<run>` 요소 파싱
fn parse_run(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<(Run, Option<SectionDef>), HwpxError> {
    let mut run = Run {
        char_shape_id: attr_u16(start, b"charPrIDRef").unwrap_or(0),
        contents: Vec::new(),
    };

    let mut sec_def: Option<SectionDef> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"t" => {
                    run.contents
                        .push(RunContent::Text(parse_text_content(e, reader)?));
                }
                b"secPr" => {
                    sec_def = Some(parse_sec_pr(e, reader)?);
                }
                b"ctrl" => {
                    if let Some(ctrl) = parse_ctrl(reader)? {
                        run.contents.push(RunContent::Control(ctrl));
                    }
                }
                b"tbl" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Table(Box::new(
                            parse_table(e, reader)?,
                        ))));
                }
                b"pic" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Picture(Box::new(
                            parse_picture(e, reader)?,
                        ))));
                }
                b"line" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Line(Box::new(
                            parse_line_object(e, reader)?,
                        ))));
                }
                b"rect" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Rectangle(Box::new(
                            parse_rect_object(e, reader)?,
                        ))));
                }
                b"ellipse" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Ellipse(Box::new(
                            parse_ellipse_object(e, reader)?,
                        ))));
                }
                b"arc" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Arc(Box::new(
                            parse_arc_object(e, reader)?,
                        ))));
                }
                b"polygon" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Polygon(Box::new(
                            parse_polygon_object(e, reader)?,
                        ))));
                }
                b"curve" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Curve(Box::new(
                            parse_curve_object(e, reader)?,
                        ))));
                }
                b"equation" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Equation(Box::new(
                            parse_equation_object(e, reader)?,
                        ))));
                }
                b"container" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Container(Box::new(
                            parse_container_object(e, reader)?,
                        ))));
                }
                b"ole" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Ole(Box::new(
                            parse_ole_object(e, reader)?,
                        ))));
                }
                b"connectLine" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::ConnectLine(Box::new(
                            parse_connect_line(e, reader)?,
                        ))));
                }
                b"textart" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::TextArt(Box::new(
                            parse_textart_object(e, reader)?,
                        ))));
                }
                b"video" => {
                    run.contents
                        .push(RunContent::Object(ShapeObject::Video(Box::new(
                            parse_video_object(e, reader)?,
                        ))));
                }
                _ => {
                    skip_element(reader, e.name().as_ref())?;
                }
            },
            Event::Empty(ref e) => {
                if local_name(e.name().as_ref()) == b"t" {
                    run.contents.push(RunContent::Text(TextContent::default()));
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"run" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok((run, sec_def))
}

// ═══════════════════════════════════════════
// secPr 파싱
// ═══════════════════════════════════════════

fn parse_sec_pr(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<SectionDef, HwpxError> {
    let mut sd = SectionDef {
        text_direction: parse_text_direction(
            &attr_str(start, b"textDirection").unwrap_or_default(),
        ),
        space_columns: attr_i32(start, b"spaceColumns").unwrap_or(0),
        tab_stop: attr_i32(start, b"tabStop").unwrap_or(8000),
        outline_shape_id: attr_u16(start, b"outlineShapeIDRef"),
        memo_shape_id: attr_u16(start, b"memoShapeIDRef"),
        master_page_cnt: attr_u16(start, b"masterPageCnt"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"grid" => {
                    sd.grid = Some(Grid {
                        line_grid: attr_u16(e, b"lineGrid").unwrap_or(0),
                        char_grid: attr_u16(e, b"charGrid").unwrap_or(0),
                        wonggoji_format: attr_bool(e, b"wonggojiFormat").unwrap_or(false),
                    });
                }
                b"startNum" => {
                    sd.start_num = Some(StartNum {
                        page_starts_on: parse_page_starts_on(
                            &attr_str(e, b"pageStartsOn").unwrap_or_default(),
                        ),
                        page: attr_u16(e, b"page").unwrap_or(0),
                        pic: attr_u16(e, b"pic").unwrap_or(0),
                        tbl: attr_u16(e, b"tbl").unwrap_or(0),
                        equation: attr_u16(e, b"equation").unwrap_or(0),
                    });
                }
                b"visibility" => {
                    sd.visibility = Some(Visibility {
                        hide_first_header: attr_bool(e, b"hideFirstHeader").unwrap_or(false),
                        hide_first_footer: attr_bool(e, b"hideFirstFooter").unwrap_or(false),
                        hide_first_master_page: attr_bool(e, b"hideFirstMasterPage")
                            .unwrap_or(false),
                        border: parse_visibility_value(&attr_str(e, b"border").unwrap_or_default()),
                        fill: parse_visibility_value(&attr_str(e, b"fill").unwrap_or_default()),
                        hide_first_page_num: attr_bool(e, b"hideFirstPageNum").unwrap_or(false),
                        hide_first_empty_line: attr_bool(e, b"hideFirstEmptyLine").unwrap_or(false),
                        show_line_number: attr_bool(e, b"showLineNumber").unwrap_or(false),
                    });
                }
                b"lineNumberShape" => {
                    sd.line_number = Some(LineNumberShape {
                        restart_type: parse_line_number_restart(
                            &attr_str(e, b"restartType").unwrap_or_default(),
                        ),
                        count_by: attr_u16(e, b"countBy").unwrap_or(0),
                        distance: attr_i32(e, b"distance").unwrap_or(0),
                        start_number: attr_u16(e, b"startNumber").unwrap_or(0),
                    });
                }
                b"pagePr" => {
                    sd.page = parse_page_pr(e, reader)?;
                }
                b"footNotePr" => {
                    sd.footnote = Some(parse_footnote_pr(reader)?);
                }
                b"endNotePr" => {
                    sd.endnote = Some(parse_endnote_pr(reader)?);
                }
                b"pageBorderFill" => {
                    sd.page_border_fills
                        .push(parse_page_border_fill(e, reader)?);
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"secPr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(sd)
}

fn parse_page_pr(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<PageDef, HwpxError> {
    let mut pd = PageDef {
        landscape: parse_landscape(&attr_str(start, b"landscape").unwrap_or_default()),
        width: attr_i32(start, b"width").unwrap_or(59528),
        height: attr_i32(start, b"height").unwrap_or(84188),
        gutter_type: parse_gutter_type(&attr_str(start, b"gutterType").unwrap_or_default()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"margin" {
                    pd.margin = PageMargin {
                        left: attr_i32(e, b"left").unwrap_or(0),
                        right: attr_i32(e, b"right").unwrap_or(0),
                        top: attr_i32(e, b"top").unwrap_or(0),
                        bottom: attr_i32(e, b"bottom").unwrap_or(0),
                        header: attr_i32(e, b"header").unwrap_or(0),
                        footer: attr_i32(e, b"footer").unwrap_or(0),
                        gutter: attr_i32(e, b"gutter").unwrap_or(0),
                    };
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"pagePr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(pd)
}

fn parse_footnote_pr(reader: &mut Reader<&[u8]>) -> Result<FootNoteDef, HwpxError> {
    let mut def = FootNoteDef::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"autoNumFormat" => {
                    def.number_format =
                        parse_number_type1(&attr_str(e, b"type").unwrap_or_default());
                    def.user_char = attr_str(e, b"userChar").and_then(|s| s.chars().next());
                    def.prefix_char = attr_str(e, b"prefixChar").and_then(|s| s.chars().next());
                    def.suffix_char = attr_str(e, b"suffixChar").and_then(|s| s.chars().next());
                    def.superscript = attr_bool(e, b"supscript").unwrap_or(false);
                }
                b"numbering" => {
                    def.numbering_type =
                        parse_footnote_numbering(&attr_str(e, b"type").unwrap_or_default());
                    def.start_number = attr_u16(e, b"newNum").unwrap_or(1);
                }
                b"placement" => {
                    def.placement =
                        parse_footnote_placement(&attr_str(e, b"place").unwrap_or_default());
                    def.beneath_text = attr_bool(e, b"beneathText").unwrap_or(false);
                }
                b"noteLine" => {
                    def.note_line = Some(NoteLine {
                        length: attr_u16(e, b"length").unwrap_or(0),
                        line_type: parse_line_type3(&attr_str(e, b"type").unwrap_or_default()),
                        width: attr_str(e, b"width").unwrap_or_default(),
                        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                    });
                }
                b"noteSpacing" => {
                    def.note_spacing = Some(NoteSpacing {
                        between_notes: attr_u16(e, b"betweenNotes").unwrap_or(0),
                        below_line: attr_u16(e, b"belowLine").unwrap_or(0),
                        above_line: attr_u16(e, b"aboveLine").unwrap_or(0),
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"footNotePr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(def)
}

fn parse_endnote_pr(reader: &mut Reader<&[u8]>) -> Result<EndNoteDef, HwpxError> {
    let mut def = EndNoteDef::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"autoNumFormat" => {
                    def.number_format =
                        parse_number_type1(&attr_str(e, b"type").unwrap_or_default());
                    def.user_char = attr_str(e, b"userChar").and_then(|s| s.chars().next());
                    def.prefix_char = attr_str(e, b"prefixChar").and_then(|s| s.chars().next());
                    def.suffix_char = attr_str(e, b"suffixChar").and_then(|s| s.chars().next());
                    def.superscript = attr_bool(e, b"supscript").unwrap_or(false);
                }
                b"numbering" => {
                    def.numbering_type =
                        parse_endnote_numbering(&attr_str(e, b"type").unwrap_or_default());
                    def.start_number = attr_u16(e, b"newNum").unwrap_or(1);
                }
                b"placement" => {
                    def.placement =
                        parse_endnote_placement(&attr_str(e, b"place").unwrap_or_default());
                    def.beneath_text = attr_bool(e, b"beneathText").unwrap_or(false);
                }
                b"noteLine" => {
                    def.note_line = Some(NoteLine {
                        length: attr_u16(e, b"length").unwrap_or(0),
                        line_type: parse_line_type3(&attr_str(e, b"type").unwrap_or_default()),
                        width: attr_str(e, b"width").unwrap_or_default(),
                        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                    });
                }
                b"noteSpacing" => {
                    def.note_spacing = Some(NoteSpacing {
                        between_notes: attr_u16(e, b"betweenNotes").unwrap_or(0),
                        below_line: attr_u16(e, b"belowLine").unwrap_or(0),
                        above_line: attr_u16(e, b"aboveLine").unwrap_or(0),
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"endNotePr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(def)
}

fn parse_page_border_fill(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<PageBorderFill, HwpxError> {
    let mut pbf = PageBorderFill {
        border_fill_id: attr_u16(start, b"borderFillIDRef").unwrap_or(0),
        text_border: parse_page_border_ref(&attr_str(start, b"textBorder").unwrap_or_default()),
        header_inside: attr_bool(start, b"headerInside").unwrap_or(false),
        footer_inside: attr_bool(start, b"footerInside").unwrap_or(false),
        fill_area: parse_fill_area(&attr_str(start, b"fillArea").unwrap_or_default()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"offset" {
                    pbf.offset = Margin {
                        left: attr_i32(e, b"left").unwrap_or(0),
                        right: attr_i32(e, b"right").unwrap_or(0),
                        top: attr_i32(e, b"top").unwrap_or(0),
                        bottom: attr_i32(e, b"bottom").unwrap_or(0),
                    };
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"pageBorderFill" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(pbf)
}

// ═══════════════════════════════════════════
// ctrl 파싱
// ═══════════════════════════════════════════

fn parse_ctrl(reader: &mut Reader<&[u8]>) -> Result<Option<Control>, HwpxError> {
    let mut result: Option<Control> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"colPr" => {
                    result = Some(Control::Column(ColumnControl {
                        id: attr_u64(e, b"id").unwrap_or(0),
                        column_type: parse_column_type(&attr_str(e, b"type").unwrap_or_default()),
                        col_count: attr_u16(e, b"colCount").unwrap_or(1),
                        layout: parse_column_layout(&attr_str(e, b"layout").unwrap_or_default()),
                        same_size: attr_bool(e, b"sameSz").unwrap_or(true),
                        same_gap: attr_i32(e, b"sameGap").unwrap_or(0),
                    }));
                }
                b"header" => {
                    result = Some(Control::Header(parse_header_footer(e, reader)?));
                }
                b"footer" => {
                    result = Some(Control::Footer(parse_header_footer(e, reader)?));
                }
                b"footNote" => {
                    result = Some(Control::FootNote(parse_note(e, reader)?));
                }
                b"endNote" => {
                    result = Some(Control::EndNote(parse_note(e, reader)?));
                }
                b"autoNum" => {
                    result = Some(Control::AutoNum(parse_auto_num(e, reader)?));
                }
                b"bookmark" => {
                    result = Some(Control::Bookmark(Bookmark {
                        name: attr_str(e, b"name").unwrap_or_default(),
                    }));
                }
                b"fieldBegin" => {
                    result = Some(Control::FieldBegin(parse_field_begin(e, reader)?));
                }
                b"fieldEnd" => {
                    result = Some(Control::FieldEnd);
                }
                b"compose" => {
                    result = Some(Control::Compose(Compose {
                        circle_type: attr_str(e, b"circleType"),
                        char_sz: attr_u16(e, b"charSz"),
                        compose_type: attr_str(e, b"composeType"),
                        compose_text: attr_str(e, b"composeText"),
                        char_pr_refs: Vec::new(),
                    }));
                }
                b"dutmal" => {
                    result = Some(Control::Dutmal(parse_dutmal(e, reader)?));
                }
                b"newNum" => {
                    result = Some(Control::NewNum(NewNum {
                        num_type: parse_numbering_type(
                            &attr_str(e, b"numType").unwrap_or_default(),
                        ),
                        num: attr_u16(e, b"num").unwrap_or(0),
                    }));
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"ctrl" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(result)
}

fn parse_header_footer(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<HeaderFooter, HwpxError> {
    let tag_name = local_name(start.name().as_ref()).to_vec();
    let mut hf = HeaderFooter {
        id: attr_u64(start, b"id").unwrap_or(0),
        apply_page_type: parse_page_apply_type(
            &attr_str(start, b"applyPageType").unwrap_or_default(),
        ),
        content: SubList::default(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"subList" {
                    hf.content = parse_sublist(e, reader)?;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == tag_name.as_slice() {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(hf)
}

fn parse_note(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Note, HwpxError> {
    let tag_name = local_name(start.name().as_ref()).to_vec();
    let mut note = Note {
        id: attr_u64(start, b"id").unwrap_or(0),
        number: attr_u16(start, b"num"),
        content: SubList::default(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"subList" {
                    note.content = parse_sublist(e, reader)?;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == tag_name.as_slice() {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(note)
}

fn parse_auto_num(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<AutoNum, HwpxError> {
    let mut an = AutoNum {
        num: attr_u16(start, b"num").unwrap_or(0),
        num_type: parse_auto_num_type(&attr_str(start, b"numType").unwrap_or_default()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"autoNumFormat" {
                    an.number_type = parse_number_type1(&attr_str(e, b"type").unwrap_or_default());
                    an.user_char = attr_str(e, b"userChar").filter(|s| !s.is_empty());
                    an.prefix_char = attr_str(e, b"prefixChar").filter(|s| !s.is_empty());
                    an.suffix_char = attr_str(e, b"suffixChar").filter(|s| !s.is_empty());
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"autoNum" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(an)
}

// ═══════════════════════════════════════════
// subList 파싱 (재귀 문단 컨테이너)
// ═══════════════════════════════════════════

fn parse_sublist(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<SubList, HwpxError> {
    let mut sl = SubList {
        id: attr_u64(start, b"id").unwrap_or(0),
        text_direction: parse_text_direction(
            &attr_str(start, b"textDirection").unwrap_or_default(),
        ),
        vert_align: parse_valign(&attr_str(start, b"vertAlign").unwrap_or_default()),
        text_width: attr_i32(start, b"textWidth"),
        text_height: attr_i32(start, b"textHeight"),
        has_text_ref: attr_bool(start, b"hasTextRef").unwrap_or(false),
        has_num_ref: attr_bool(start, b"hasNumRef").unwrap_or(false),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"p" {
                    let (para, _) = parse_paragraph(e, reader)?;
                    sl.paragraphs.push(para);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"subList" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(sl)
}

// ═══════════════════════════════════════════
// tbl 파싱
// ═══════════════════════════════════════════

fn parse_table(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Table, HwpxError> {
    let mut tbl = Table {
        common: parse_shape_common_attrs(start),
        page_break: parse_table_page_break(&attr_str(start, b"pageBreak").unwrap_or_default()),
        repeat_header: attr_bool(start, b"repeatHeader").unwrap_or(false),
        row_count: attr_u16(start, b"rowCnt").unwrap_or(0),
        col_count: attr_u16(start, b"colCnt").unwrap_or(0),
        cell_spacing: attr_i32(start, b"cellSpacing").unwrap_or(0),
        border_fill_id: attr_u16(start, b"borderFillIDRef").unwrap_or(0),
        no_adjust: attr_bool(start, b"noAdjust"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut tbl.common, e),
                b"pos" => parse_shape_pos(&mut tbl.common, e),
                b"outMargin" => {
                    tbl.common.out_margin = Some(parse_margin_attrs(e));
                }
                b"inMargin" => {
                    tbl.in_margin = parse_margin_attrs(e);
                }
                b"cellzone" => {
                    tbl.cell_zones.push(CellZone {
                        start_row: attr_u16(e, b"startRowAddr").unwrap_or(0),
                        start_col: attr_u16(e, b"startColAddr").unwrap_or(0),
                        end_row: attr_u16(e, b"endRowAddr").unwrap_or(0),
                        end_col: attr_u16(e, b"endColAddr").unwrap_or(0),
                        border_fill_id: attr_u16(e, b"borderFillIDRef").unwrap_or(0),
                    });
                }
                b"tr" => {
                    tbl.rows.push(parse_table_row(reader)?);
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"tbl" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(tbl)
}

fn parse_table_row(reader: &mut Reader<&[u8]>) -> Result<TableRow, HwpxError> {
    let mut row = TableRow::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"tc" {
                    row.cells.push(parse_table_cell(e, reader)?);
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"tr" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(row)
}

fn parse_table_cell(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<TableCell, HwpxError> {
    let mut cell = TableCell {
        name: attr_str(start, b"name").filter(|s| !s.is_empty()),
        header: attr_bool(start, b"header").unwrap_or(false),
        has_margin: attr_bool(start, b"hasMargin"),
        protect: attr_bool(start, b"protect").unwrap_or(false),
        editable: attr_bool(start, b"editable").unwrap_or(false),
        dirty: attr_bool(start, b"dirty"),
        border_fill_id: attr_u16(start, b"borderFillIDRef").unwrap_or(0),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"subList" => {
                    cell.content = parse_sublist(e, reader)?;
                }
                b"cellAddr" => {
                    cell.col = attr_u16(e, b"colAddr").unwrap_or(0);
                    cell.row = attr_u16(e, b"rowAddr").unwrap_or(0);
                }
                b"cellSpan" => {
                    cell.col_span = attr_u16(e, b"colSpan").unwrap_or(1);
                    cell.row_span = attr_u16(e, b"rowSpan").unwrap_or(1);
                }
                b"cellSz" => {
                    cell.width = attr_i32(e, b"width").unwrap_or(0);
                    cell.height = attr_i32(e, b"height").unwrap_or(0);
                }
                b"cellMargin" => {
                    cell.cell_margin = parse_margin_attrs(e);
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"tc" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(cell)
}

// ═══════════════════════════════════════════
// pic 파싱
// ═══════════════════════════════════════════

fn parse_picture(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Picture, HwpxError> {
    let mut pic = Picture {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        reverse: attr_bool(start, b"reverse"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) => {
                match local_name(e.name().as_ref()) {
                    b"sz" => parse_shape_size(&mut pic.common, e),
                    b"pos" => parse_shape_pos(&mut pic.common, e),
                    b"outMargin" => pic.common.out_margin = Some(parse_margin_attrs(e)),
                    b"offset" => {
                        pic.component.offset = Some(Point {
                            x: attr_i32(e, b"x").unwrap_or(0),
                            y: attr_i32(e, b"y").unwrap_or(0),
                        })
                    }
                    b"orgSz" => {
                        pic.component.org_size = Some(Size {
                            width: attr_i32(e, b"width").unwrap_or(0),
                            height: attr_i32(e, b"height").unwrap_or(0),
                        })
                    }
                    b"curSz" => {
                        pic.component.cur_size = Some(Size {
                            width: attr_i32(e, b"width").unwrap_or(0),
                            height: attr_i32(e, b"height").unwrap_or(0),
                        })
                    }
                    b"flip" => {
                        pic.component.flip = Some(Flip {
                            horizontal: attr_bool(e, b"horizontal").unwrap_or(false),
                            vertical: attr_bool(e, b"vertical").unwrap_or(false),
                        })
                    }
                    b"rotationInfo" => {
                        pic.component.rotation = Some(Rotation {
                            angle: attr_f32(e, b"angle").unwrap_or(0.0),
                            center_x: attr_i32(e, b"centerX").unwrap_or(0),
                            center_y: attr_i32(e, b"centerY").unwrap_or(0),
                            ..Default::default()
                        })
                    }
                    b"imgClip" => {
                        pic.img_clip = Some(Margin {
                            left: attr_i32(e, b"left").unwrap_or(0),
                            right: attr_i32(e, b"right").unwrap_or(0),
                            top: attr_i32(e, b"top").unwrap_or(0),
                            bottom: attr_i32(e, b"bottom").unwrap_or(0),
                        })
                    }
                    b"inMargin" => pic.in_margin = Some(parse_margin_attrs(e)),
                    b"img" => {
                        pic.img = ImageRef {
                            binary_item_id: attr_str(e, b"binaryItemIDRef").unwrap_or_default(),
                            bright: attr_i8(e, b"bright").unwrap_or(0),
                            contrast: attr_i8(e, b"contrast").unwrap_or(0),
                            effect: parse_image_effect(&attr_str(e, b"effect").unwrap_or_default()),
                            alpha: attr_u8(e, b"alpha").unwrap_or(0),
                        }
                    }
                    b"imgDim" => {
                        pic.img_dim = Some(Size {
                            width: attr_i32(e, b"dimwidth").unwrap_or(0),
                            height: attr_i32(e, b"dimheight").unwrap_or(0),
                        })
                    }
                    b"effects" => { /* empty effects tag, skip */ }
                    _ => {}
                }
            }
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"imgRect" => {
                    pic.img_rect = Some(parse_img_rect(reader)?);
                }
                b"effects" => {
                    pic.effects = Some(parse_picture_effects(reader)?);
                }
                b"caption" => {
                    pic.common.caption = Some(parse_caption(e, reader)?);
                }
                b"renderingInfo" => {
                    skip_element(reader, e.name().as_ref())?;
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"pic" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(pic)
}

// ═══════════════════════════════════════════
// 개체 공통 속성 헬퍼
// ═══════════════════════════════════════════

fn parse_shape_common_attrs(e: &quick_xml::events::BytesStart) -> ShapeCommon {
    ShapeCommon {
        id: attr_u64(e, b"id").unwrap_or(0),
        z_order: attr_i32(e, b"zOrder").unwrap_or(0),
        numbering_type: parse_numbering_type(&attr_str(e, b"numberingType").unwrap_or_default()),
        text_wrap: parse_text_wrap(&attr_str(e, b"textWrap").unwrap_or_default()),
        text_flow: parse_text_flow(&attr_str(e, b"textFlow").unwrap_or_default()),
        lock: attr_bool(e, b"lock").unwrap_or(false),
        dropcap_style: attr_str(e, b"dropcapstyle").map(|s| parse_dropcap_style(&s)),
        ..Default::default()
    }
}

fn parse_shape_component_attrs(e: &quick_xml::events::BytesStart) -> ShapeComponentData {
    ShapeComponentData {
        href: attr_str(e, b"href").filter(|s| !s.is_empty()),
        group_level: attr_u32(e, b"groupLevel").unwrap_or(0),
        inst_id: attr_u64(e, b"instid"),
        ..Default::default()
    }
}

fn parse_shape_size(common: &mut ShapeCommon, e: &quick_xml::events::BytesStart) {
    common.size = ShapeSize {
        width: attr_i32(e, b"width").unwrap_or(0),
        width_rel_to: parse_size_relation(&attr_str(e, b"widthRelTo").unwrap_or_default()),
        height: attr_i32(e, b"height").unwrap_or(0),
        height_rel_to: parse_size_relation(&attr_str(e, b"heightRelTo").unwrap_or_default()),
        protect: attr_bool(e, b"protect").unwrap_or(false),
    };
}

fn parse_shape_pos(common: &mut ShapeCommon, e: &quick_xml::events::BytesStart) {
    common.position = ShapePosition {
        treat_as_char: attr_bool(e, b"treatAsChar").unwrap_or(false),
        affect_line_spacing: attr_bool(e, b"affectLSpacing").unwrap_or(false),
        flow_with_text: attr_bool(e, b"flowWithText").unwrap_or(false),
        allow_overlap: attr_bool(e, b"allowOverlap").unwrap_or(false),
        hold_anchor_and_so: attr_bool(e, b"holdAnchorAndSO").unwrap_or(false),
        vert_rel_to: parse_relative_to(&attr_str(e, b"vertRelTo").unwrap_or_default()),
        horz_rel_to: parse_relative_to(&attr_str(e, b"horzRelTo").unwrap_or_default()),
        vert_align: parse_valign(&attr_str(e, b"vertAlign").unwrap_or_default()),
        horz_align: parse_halign(&attr_str(e, b"horzAlign").unwrap_or_default()),
        vert_offset: attr_i32(e, b"vertOffset").unwrap_or(0),
        horz_offset: attr_i32(e, b"horzOffset").unwrap_or(0),
    };
}

fn parse_margin_attrs(e: &quick_xml::events::BytesStart) -> Margin {
    Margin {
        left: attr_i32(e, b"left").unwrap_or(0),
        right: attr_i32(e, b"right").unwrap_or(0),
        top: attr_i32(e, b"top").unwrap_or(0),
        bottom: attr_i32(e, b"bottom").unwrap_or(0),
    }
}

// ═══════════════════════════════════════════
// `<t>` 텍스트 파싱
// ═══════════════════════════════════════════

fn parse_text_content(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<TextContent, HwpxError> {
    let mut tc = TextContent {
        char_shape_id: attr_u16(start, b"charPrIDRef"),
        elements: Vec::new(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Text(ref t) => {
                let text = t.unescape().unwrap_or_default().to_string();
                if !text.is_empty() {
                    tc.elements.push(TextElement::Text(text));
                }
            }
            Event::Empty(ref e) => match local_name(e.name().as_ref()) {
                b"tab" => {
                    tc.elements.push(TextElement::Tab {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        leader: parse_line_type2(&attr_str(e, b"leader").unwrap_or_default()),
                        tab_type: parse_tab_type(&attr_str(e, b"type").unwrap_or_default()),
                    });
                }
                b"lineBreak" => tc.elements.push(TextElement::LineBreak),
                b"hyphen" => tc.elements.push(TextElement::Hyphen),
                b"nbSpace" => tc.elements.push(TextElement::NbSpace),
                b"fwSpace" => tc.elements.push(TextElement::FwSpace),
                b"markpenBegin" => {
                    tc.elements.push(TextElement::MarkpenBegin {
                        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                    });
                }
                b"markpenEnd" => tc.elements.push(TextElement::MarkpenEnd),
                b"titleMark" => {
                    tc.elements.push(TextElement::TitleMark {
                        ignore: attr_bool(e, b"ignore").unwrap_or(false),
                    });
                }
                b"insertBegin" => {
                    tc.elements.push(TextElement::InsertBegin {
                        id: attr_str(e, b"Id").unwrap_or_default(),
                        tc_id: attr_str(e, b"TcId"),
                        para_end: attr_bool(e, b"paraend").unwrap_or(false),
                    });
                }
                b"insertEnd" => {
                    tc.elements.push(TextElement::InsertEnd {
                        id: attr_str(e, b"Id").unwrap_or_default(),
                        tc_id: attr_str(e, b"TcId"),
                        para_end: attr_bool(e, b"paraend").unwrap_or(false),
                    });
                }
                b"deleteBegin" => {
                    tc.elements.push(TextElement::DeleteBegin {
                        id: attr_str(e, b"Id").unwrap_or_default(),
                        tc_id: attr_str(e, b"TcId"),
                        para_end: attr_bool(e, b"paraend").unwrap_or(false),
                    });
                }
                b"deleteEnd" => {
                    tc.elements.push(TextElement::DeleteEnd {
                        id: attr_str(e, b"Id").unwrap_or_default(),
                        tc_id: attr_str(e, b"TcId"),
                        para_end: attr_bool(e, b"paraend").unwrap_or(false),
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"t" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(tc)
}

// ═══════════════════════════════════════════
// enum 파싱 헬퍼
// ═══════════════════════════════════════════

fn parse_text_direction(s: &str) -> TextDirection {
    match s {
        "VERTICAL" => TextDirection::Vertical,
        "VERTICALALL" => TextDirection::VerticalAll,
        _ => TextDirection::Horizontal,
    }
}

fn parse_landscape(s: &str) -> Landscape {
    match s {
        "LANDSCAPE" => Landscape::Landscape,
        "WIDELY" | "NARROWLY" => Landscape::Widely,
        _ => Landscape::Portrait,
    }
}

fn parse_gutter_type(s: &str) -> GutterType {
    match s {
        "LEFT_RIGHT" => GutterType::LeftRight,
        "TOP_BOTTOM" => GutterType::TopBottom,
        _ => GutterType::LeftOnly,
    }
}

fn parse_page_starts_on(s: &str) -> PageStartsOn {
    match s {
        "EVEN" | "EVENPAGE" => PageStartsOn::Even,
        "ODD" | "ODDPAGE" => PageStartsOn::Odd,
        _ => PageStartsOn::Both,
    }
}

fn parse_visibility_value(s: &str) -> VisibilityValue {
    match s {
        "HIDE_FIRST" => VisibilityValue::HideFirst,
        "SHOW_FIRST" => VisibilityValue::ShowFirst,
        _ => VisibilityValue::ShowAll,
    }
}

fn parse_line_number_restart(s: &str) -> LineNumberRestart {
    match s {
        "1" | "RESTART_BY_PAGE" => LineNumberRestart::RestartByPage,
        "2" | "KEEP_CONTINUE" => LineNumberRestart::KeepContinue,
        _ => LineNumberRestart::RestartBySection,
    }
}

fn parse_number_type1(s: &str) -> NumberType1 {
    match s {
        "CIRCLED_DIGIT" => NumberType1::CircledDigit,
        "ROMAN_CAPITAL" => NumberType1::RomanCapital,
        "ROMAN_SMALL" => NumberType1::RomanSmall,
        "LATIN_CAPITAL" => NumberType1::LatinCapital,
        "LATIN_SMALL" => NumberType1::LatinSmall,
        "CIRCLED_LATIN_CAPITAL" => NumberType1::CircledLatinCapital,
        "CIRCLED_LATIN_SMALL" => NumberType1::CircledLatinSmall,
        "HANGUL_SYLLABLE" => NumberType1::HangulSyllable,
        "CIRCLED_HANGUL_SYLLABLE" => NumberType1::CircledHangulSyllable,
        "HANGUL_JAMO" => NumberType1::HangulJamo,
        "CIRCLED_HANGUL_JAMO" => NumberType1::CircledHangulJamo,
        "HANGUL_PHONETIC" => NumberType1::HangulPhonetic,
        "IDEOGRAPH" => NumberType1::Ideograph,
        "CIRCLED_IDEOGRAPH" => NumberType1::CircledIdeograph,
        _ => NumberType1::Digit,
    }
}

fn parse_footnote_numbering(s: &str) -> FootnoteNumbering {
    match s {
        "ON_SECTION" => FootnoteNumbering::OnSection,
        "ON_PAGE" => FootnoteNumbering::OnPage,
        _ => FootnoteNumbering::Continuous,
    }
}

fn parse_footnote_placement(s: &str) -> FootnotePlacement {
    match s {
        "MERGED_COLUMN" => FootnotePlacement::MergedColumn,
        "RIGHT_MOST_COLUMN" => FootnotePlacement::RightMostColumn,
        _ => FootnotePlacement::EachColumn,
    }
}

fn parse_endnote_numbering(s: &str) -> EndnoteNumbering {
    match s {
        "ON_SECTION" => EndnoteNumbering::OnSection,
        _ => EndnoteNumbering::Continuous,
    }
}

fn parse_endnote_placement(s: &str) -> EndnotePlacement {
    match s {
        "END_OF_SECTION" => EndnotePlacement::EndOfSection,
        _ => EndnotePlacement::EndOfDocument,
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

fn parse_page_border_ref(s: &str) -> PageBorderRef {
    match s {
        "TEXT" => PageBorderRef::Text,
        _ => PageBorderRef::Paper,
    }
}

fn parse_fill_area(s: &str) -> FillArea {
    match s {
        "TEXT" => FillArea::Text,
        "PAPERLINE" => FillArea::PaperLine,
        _ => FillArea::Paper,
    }
}

fn parse_column_type(s: &str) -> ColumnType {
    match s {
        "BALANCED_NEWSPAPER" | "BALANCED" => ColumnType::BalancedNewspaper,
        "PARALLEL" => ColumnType::Parallel,
        _ => ColumnType::Newspaper,
    }
}

fn parse_column_layout(s: &str) -> ColumnLayout {
    match s {
        "RIGHT" => ColumnLayout::Right,
        "MIRROR" => ColumnLayout::Mirror,
        _ => ColumnLayout::Left,
    }
}

fn parse_page_apply_type(s: &str) -> PageApplyType {
    match s {
        "EVEN" => PageApplyType::Even,
        "ODD" => PageApplyType::Odd,
        "FIRST" => PageApplyType::First,
        _ => PageApplyType::Both,
    }
}

fn parse_auto_num_type(s: &str) -> AutoNumType {
    match s {
        "PAGE" => AutoNumType::Page,
        "FOOTNOTE" => AutoNumType::Footnote,
        "ENDNOTE" => AutoNumType::Endnote,
        "TABLE" => AutoNumType::Table,
        "EQUATION" => AutoNumType::Equation,
        "TOTAL_PAGE" => AutoNumType::TotalPage,
        _ => AutoNumType::Picture,
    }
}

fn parse_numbering_type(s: &str) -> NumberingType {
    match s {
        "PICTURE" => NumberingType::Picture,
        "TABLE" => NumberingType::Table,
        "EQUATION" => NumberingType::Equation,
        _ => NumberingType::None,
    }
}

fn parse_text_wrap(s: &str) -> TextWrap {
    match s {
        "SQUARE" => TextWrap::Square,
        "TIGHT" => TextWrap::Tight,
        "THROUGH" => TextWrap::Through,
        "TOP_AND_BOTTOM" => TextWrap::TopAndBottom,
        "BEHIND_TEXT" => TextWrap::BehindText,
        _ => TextWrap::InFrontOfText,
    }
}

fn parse_text_flow(s: &str) -> TextFlow {
    match s {
        "LEFT_ONLY" => TextFlow::LeftOnly,
        "RIGHT_ONLY" => TextFlow::RightOnly,
        "LARGEST_ONLY" => TextFlow::LargestOnly,
        _ => TextFlow::BothSides,
    }
}

fn parse_relative_to(s: &str) -> RelativeTo {
    match s {
        "PAGE" => RelativeTo::Page,
        "COLUMN" => RelativeTo::Column,
        "PARA" => RelativeTo::Para,
        _ => RelativeTo::Paper,
    }
}

fn parse_size_relation(s: &str) -> SizeRelation {
    match s {
        "PAPER" => SizeRelation::Paper,
        "PAGE" => SizeRelation::Page,
        "COLUMN" => SizeRelation::Column,
        "PARA" => SizeRelation::Para,
        "PERCENT" => SizeRelation::Percent,
        _ => SizeRelation::Absolute,
    }
}

fn parse_valign(s: &str) -> VAlign {
    match s {
        "CENTER" => VAlign::Center,
        "BOTTOM" => VAlign::Bottom,
        "BASELINE" => VAlign::Baseline,
        "INSIDE" => VAlign::Inside,
        "OUTSIDE" => VAlign::Outside,
        _ => VAlign::Top,
    }
}

fn parse_halign(s: &str) -> HAlign {
    match s {
        "CENTER" => HAlign::Center,
        "RIGHT" => HAlign::Right,
        "INSIDE" => HAlign::Inside,
        "OUTSIDE" => HAlign::Outside,
        _ => HAlign::Left,
    }
}

fn parse_table_page_break(s: &str) -> TablePageBreak {
    match s {
        "TABLE" => TablePageBreak::Table,
        "CELL" => TablePageBreak::Cell,
        _ => TablePageBreak::None,
    }
}

fn parse_dropcap_style(s: &str) -> DropcapStyle {
    match s {
        "DoubleLine" => DropcapStyle::DoubleLine,
        "TripleLine" => DropcapStyle::TripleLine,
        "Margin" => DropcapStyle::Margin,
        _ => DropcapStyle::None,
    }
}

fn parse_image_effect(s: &str) -> hwp_model::types::ImageEffect {
    match s {
        "GRAY_SCALE" => hwp_model::types::ImageEffect::GrayScale,
        "BLACK_WHITE" => hwp_model::types::ImageEffect::BlackWhite,
        _ => hwp_model::types::ImageEffect::RealPic,
    }
}

fn parse_line_type2(s: &str) -> LineType2 {
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

fn parse_tab_type(s: &str) -> TabType {
    match s {
        "RIGHT" => TabType::Right,
        "CENTER" => TabType::Center,
        "DECIMAL" => TabType::Decimal,
        _ => TabType::Left,
    }
}

// ═══════════════════════════════════════════
// 도형 파서
// ═══════════════════════════════════════════

fn parse_line_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<LineObject, HwpxError> {
    let mut obj = LineObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        is_reverse_hv: attr_bool(start, b"isReverseHV"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"offset" => {
                    obj.component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    obj.component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"curSz" => {
                    obj.component.cur_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"flip" => {
                    obj.component.flip = Some(Flip {
                        horizontal: attr_bool(e, b"horizontal").unwrap_or(false),
                        vertical: attr_bool(e, b"vertical").unwrap_or(false),
                    })
                }
                b"rotationInfo" => {
                    obj.component.rotation = Some(Rotation {
                        angle: attr_f32(e, b"angle").unwrap_or(0.0),
                        ..Default::default()
                    })
                }
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"startPt" => {
                    obj.start_pt = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"endPt" => {
                    obj.end_pt = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"line" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

fn parse_rect_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<RectObject, HwpxError> {
    let mut obj = RectObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        ratio: attr_u8(start, b"ratio").unwrap_or(0),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"offset" => {
                    obj.component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    obj.component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"curSz" => {
                    obj.component.cur_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"flip" => {
                    obj.component.flip = Some(Flip {
                        horizontal: attr_bool(e, b"horizontal").unwrap_or(false),
                        vertical: attr_bool(e, b"vertical").unwrap_or(false),
                    })
                }
                b"rotationInfo" => {
                    obj.component.rotation = Some(Rotation {
                        angle: attr_f32(e, b"angle").unwrap_or(0.0),
                        ..Default::default()
                    })
                }
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"fillBrush" => {
                    obj.fill = parse_fill_brush_body(reader)?;
                }
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"pt0" => {
                    obj.points[0] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt1" => {
                    obj.points[1] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt2" => {
                    obj.points[2] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt3" => {
                    obj.points[3] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"drawText" => {
                    obj.draw_text = Some(parse_draw_text(reader)?);
                }
                b"caption" => {
                    obj.common.caption = Some(parse_caption(e, reader)?);
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"rect" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

fn parse_ellipse_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<EllipseObject, HwpxError> {
    let mut obj = EllipseObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        interval_dirty: attr_bool(start, b"intervalDirty"),
        ..Default::default()
    };
    parse_generic_shape(
        reader,
        b"ellipse",
        &mut obj.common,
        &mut obj.component,
        Some(&mut obj.line_shape),
        &mut obj.fill,
        &mut obj.shadow,
    )?;
    Ok(obj)
}

fn parse_arc_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<ArcObject, HwpxError> {
    let mut obj = ArcObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        arc_type: parse_arc_type(&attr_str(start, b"type").unwrap_or_default()),
        ..Default::default()
    };
    parse_generic_shape(
        reader,
        b"arc",
        &mut obj.common,
        &mut obj.component,
        Some(&mut obj.line_shape),
        &mut obj.fill,
        &mut obj.shadow,
    )?;
    Ok(obj)
}

fn parse_polygon_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<PolygonObject, HwpxError> {
    let mut obj = PolygonObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"offset" => {
                    obj.component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    obj.component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"pt" => obj.points.push(Point {
                    x: attr_i32(e, b"x").unwrap_or(0),
                    y: attr_i32(e, b"y").unwrap_or(0),
                }),
                b"fillBrush" => {
                    obj.fill = parse_fill_brush_body(reader)?;
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"polygon" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

fn parse_curve_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<CurveObject, HwpxError> {
    let mut obj = CurveObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"seg" => {
                    obj.segments.push(CurveSegment {
                        segment_type: parse_curve_segment_type(
                            &attr_str(e, b"type").unwrap_or_default(),
                        ),
                        x1: attr_i32(e, b"x1").unwrap_or(0),
                        y1: attr_i32(e, b"y1").unwrap_or(0),
                        x2: attr_i32(e, b"x2").unwrap_or(0),
                        y2: attr_i32(e, b"y2").unwrap_or(0),
                    });
                }
                b"fillBrush" => {
                    obj.fill = parse_fill_brush_body(reader)?;
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"curve" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

fn parse_equation_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<EquationObject, HwpxError> {
    let mut obj = EquationObject {
        common: parse_shape_common_attrs(start),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                match local_name(e.name().as_ref()) {
                    b"sz" => parse_shape_size(&mut obj.common, e),
                    b"pos" => parse_shape_pos(&mut obj.common, e),
                    b"script" => {
                        // script 텍스트 읽기
                        let mut tbuf = Vec::new();
                        if let Ok(Event::Text(t)) = reader.read_event_into(&mut tbuf) {
                            obj.script = t.unescape().unwrap_or_default().to_string();
                        }
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"equation" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

fn parse_container_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<ContainerObject, HwpxError> {
    let mut obj = ContainerObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        children: Vec::new(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"line" => obj
                    .children
                    .push(ShapeObject::Line(Box::new(parse_line_object(e, reader)?))),
                b"rect" => obj
                    .children
                    .push(ShapeObject::Rectangle(Box::new(parse_rect_object(
                        e, reader,
                    )?))),
                b"ellipse" => {
                    obj.children
                        .push(ShapeObject::Ellipse(Box::new(parse_ellipse_object(
                            e, reader,
                        )?)))
                }
                b"arc" => obj
                    .children
                    .push(ShapeObject::Arc(Box::new(parse_arc_object(e, reader)?))),
                b"polygon" => {
                    obj.children
                        .push(ShapeObject::Polygon(Box::new(parse_polygon_object(
                            e, reader,
                        )?)))
                }
                b"curve" => obj
                    .children
                    .push(ShapeObject::Curve(Box::new(parse_curve_object(e, reader)?))),
                b"pic" => obj
                    .children
                    .push(ShapeObject::Picture(Box::new(parse_picture(e, reader)?))),
                b"container" => {
                    obj.children
                        .push(ShapeObject::Container(Box::new(parse_container_object(
                            e, reader,
                        )?)))
                }
                _ => {
                    skip_element(reader, e.name().as_ref())?;
                }
            },
            Event::Empty(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"container" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

// ═══════════════════════════════════════════
// 도형 공통 파싱 헬퍼
// ═══════════════════════════════════════════

fn parse_shape_line_info(e: &quick_xml::events::BytesStart) -> ShapeLineInfo {
    ShapeLineInfo {
        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
        width: attr_i32(e, b"width").unwrap_or(0),
        style: parse_line_type1(&attr_str(e, b"style").unwrap_or_default()),
        end_cap: parse_line_end_cap(&attr_str(e, b"endCap").unwrap_or_default()),
        head_style: parse_arrow_type(&attr_str(e, b"headStyle").unwrap_or_default()),
        tail_style: parse_arrow_type(&attr_str(e, b"tailStyle").unwrap_or_default()),
        head_fill: attr_bool(e, b"headfill").unwrap_or(false),
        tail_fill: attr_bool(e, b"tailfill").unwrap_or(false),
        head_size: parse_arrow_size(&attr_str(e, b"headSz").unwrap_or_default()),
        tail_size: parse_arrow_size(&attr_str(e, b"tailSz").unwrap_or_default()),
        outline_style: parse_line_outline_style(&attr_str(e, b"outlineStyle").unwrap_or_default()),
        alpha: attr_u8(e, b"alpha").unwrap_or(0),
    }
}

fn parse_shape_shadow(e: &quick_xml::events::BytesStart) -> ShapeShadow {
    ShapeShadow {
        shadow_type: parse_shape_shadow_type(&attr_str(e, b"type").unwrap_or_default()),
        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
        offset_x: attr_i32(e, b"offsetX").unwrap_or(0),
        offset_y: attr_i32(e, b"offsetY").unwrap_or(0),
        alpha: attr_u8(e, b"alpha").unwrap_or(0),
    }
}

fn parse_draw_text(reader: &mut Reader<&[u8]>) -> Result<SubList, HwpxError> {
    let mut sl = SubList::default();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"subList" {
                    sl = parse_sublist(e, reader)?;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"drawText" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(sl)
}

fn parse_caption(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Caption, HwpxError> {
    let mut cap = Caption {
        side: parse_caption_side(&attr_str(start, b"side").unwrap_or_default()),
        full_size: attr_bool(start, b"fullSz").unwrap_or(false),
        width: attr_i32(start, b"width").unwrap_or(0),
        gap: attr_i32(start, b"gap").unwrap_or(0),
        last_width: attr_i32(start, b"lastWidth"),
        content: SubList::default(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"subList" {
                    cap.content = parse_sublist(e, reader)?;
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"caption" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(cap)
}

/// fillBrush 파싱 (body.rs용 — header.rs의 것과 동일 로직)
fn parse_fill_brush_body(
    reader: &mut Reader<&[u8]>,
) -> Result<Option<hwp_model::resources::FillBrush>, HwpxError> {
    use hwp_model::resources::FillBrush;
    let mut result: Option<FillBrush> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"winBrush" {
                    result = Some(FillBrush::WinBrush {
                        face_color: attr_str(e, b"faceColor").and_then(|s| parse_color(&s)),
                        hatch_color: attr_str(e, b"hatchColor").and_then(|s| parse_color(&s)),
                        hatch_style: None,
                        alpha: attr_u8(e, b"alpha").unwrap_or(0),
                    });
                }
            }
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
    Ok(result)
}

/// 범용 도형 내부 파싱 (ellipse, arc 등 공통 구조)
fn parse_generic_shape(
    reader: &mut Reader<&[u8]>,
    tag: &[u8],
    common: &mut ShapeCommon,
    component: &mut ShapeComponentData,
    mut line_shape: Option<&mut ShapeLineInfo>,
    fill: &mut Option<hwp_model::resources::FillBrush>,
    shadow: &mut Option<ShapeShadow>,
) -> Result<(), HwpxError> {
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(common, e),
                b"pos" => parse_shape_pos(common, e),
                b"outMargin" => common.out_margin = Some(parse_margin_attrs(e)),
                b"offset" => {
                    component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"curSz" => {
                    component.cur_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"flip" => {
                    component.flip = Some(Flip {
                        horizontal: attr_bool(e, b"horizontal").unwrap_or(false),
                        vertical: attr_bool(e, b"vertical").unwrap_or(false),
                    })
                }
                b"lineShape" => {
                    if let Some(ls) = line_shape.as_deref_mut() {
                        *ls = parse_shape_line_info(e);
                    }
                }
                b"shadow" => {
                    *shadow = Some(parse_shape_shadow(e));
                }
                b"fillBrush" => {
                    *fill = parse_fill_brush_body(reader)?;
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == tag {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(())
}

// ═══════════════════════════════════════════
// fieldBegin 파서
// ═══════════════════════════════════════════

fn parse_field_begin(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Field, HwpxError> {
    let mut field = Field {
        id: attr_u64(start, b"id").unwrap_or(0),
        field_type: parse_field_type(&attr_str(start, b"type").unwrap_or_default()),
        name: attr_str(start, b"name").filter(|s| !s.is_empty()),
        editable: attr_bool(start, b"editable").unwrap_or(false),
        dirty: attr_bool(start, b"dirty").unwrap_or(false),
        field_id: attr_u32(start, b"fieldid"),
        z_order: attr_i32(start, b"zorder"),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"parameters" => {
                    field.parameters = parse_field_parameters(reader)?;
                }
                b"subList" => {
                    field.sub_list = Some(parse_sublist(e, reader)?);
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"fieldBegin" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(field)
}

fn parse_field_parameters(reader: &mut Reader<&[u8]>) -> Result<Vec<FieldParameter>, HwpxError> {
    let mut params = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"integerParam" => {
                    let name = attr_str(e, b"name").unwrap_or_default();
                    let mut tbuf = Vec::new();
                    let value = if let Ok(Event::Text(t)) = reader.read_event_into(&mut tbuf) {
                        t.unescape().unwrap_or_default().parse::<i64>().unwrap_or(0)
                    } else {
                        0
                    };
                    params.push(FieldParameter::Integer { name, value });
                }
                b"stringParam" => {
                    let name = attr_str(e, b"name").unwrap_or_default();
                    let mut tbuf = Vec::new();
                    let value = if let Ok(Event::Text(t)) = reader.read_event_into(&mut tbuf) {
                        t.unescape().unwrap_or_default().to_string()
                    } else {
                        String::new()
                    };
                    params.push(FieldParameter::String { name, value });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"parameters" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(params)
}

// ═══════════════════════════════════════════
// 추가 enum 헬퍼
// ═══════════════════════════════════════════

fn parse_line_type1(s: &str) -> LineType1 {
    match s {
        "SOLID" => LineType1::Solid,
        "DOT" => LineType1::Dot,
        "THICK" => LineType1::Thick,
        "DASH" => LineType1::Dash,
        "DASH_DOT" => LineType1::DashDot,
        "DASH_DOT_DOT" => LineType1::DashDotDot,
        _ => LineType1::None,
    }
}

fn parse_line_end_cap(s: &str) -> LineEndCap {
    match s {
        "ROUND" => LineEndCap::Round,
        _ => LineEndCap::Flat,
    }
}

fn parse_arrow_type(s: &str) -> ArrowType {
    match s {
        "ARROW" => ArrowType::Arrow,
        "SPEAR" => ArrowType::Spear,
        "CONCAVE_ARROW" => ArrowType::ConcaveArrow,
        "EMPTY_DIAMOND" => ArrowType::EmptyDiamond,
        "EMPTY_CIRCLE" => ArrowType::EmptyCircle,
        "EMPTY_BOX" => ArrowType::EmptyBox,
        "FILLED_DIAMOND" => ArrowType::FilledDiamond,
        "FILLED_CIRCLE" => ArrowType::FilledCircle,
        "FILLED_BOX" => ArrowType::FilledBox,
        _ => ArrowType::Normal,
    }
}

fn parse_arrow_size(s: &str) -> ArrowSize {
    match s {
        "SMALL_SMALL" => ArrowSize::SmallSmall,
        "SMALL_MEDIUM" => ArrowSize::SmallMedium,
        "SMALL_LARGE" => ArrowSize::SmallLarge,
        "MEDIUM_SMALL" => ArrowSize::MediumSmall,
        "MEDIUM_LARGE" => ArrowSize::MediumLarge,
        "LARGE_SMALL" => ArrowSize::LargeSmall,
        "LARGE_MEDIUM" => ArrowSize::LargeMedium,
        "LARGE_LARGE" => ArrowSize::LargeLarge,
        _ => ArrowSize::MediumMedium,
    }
}

fn parse_line_outline_style(s: &str) -> LineOutlineStyle {
    match s {
        "OUTER" => LineOutlineStyle::Outer,
        "INNER" => LineOutlineStyle::Inner,
        _ => LineOutlineStyle::Normal,
    }
}

fn parse_shape_shadow_type(s: &str) -> ShapeShadowType {
    match s {
        "PARELLEL_LEFTTOP" => ShapeShadowType::ParellelLeftTop,
        "PARELLEL_RIGHTTOP" => ShapeShadowType::ParellelRightTop,
        "PARELLEL_LEFTBOTTOM" => ShapeShadowType::ParellelLeftBottom,
        "PARELLEL_RIGHTBOTTOM" => ShapeShadowType::ParellelRightBottom,
        _ => ShapeShadowType::None,
    }
}

fn parse_arc_type(s: &str) -> ArcType {
    match s {
        "PIE" => ArcType::Pie,
        "CHORD" => ArcType::Chord,
        _ => ArcType::Normal,
    }
}

fn parse_curve_segment_type(s: &str) -> CurveSegmentType {
    match s {
        "LINE" => CurveSegmentType::Line,
        _ => CurveSegmentType::Curve,
    }
}

fn parse_caption_side(s: &str) -> CaptionSide {
    match s {
        "LEFT" => CaptionSide::Left,
        "RIGHT" => CaptionSide::Right,
        "TOP" => CaptionSide::Top,
        _ => CaptionSide::Bottom,
    }
}

// ═══════════════════════════════════════════
// OLE 파서
// ═══════════════════════════════════════════

fn parse_ole_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<OleObject, HwpxError> {
    let mut obj = OleObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        object_type: parse_ole_type(&attr_str(start, b"objectType").unwrap_or_default()),
        binary_item_id: attr_str(start, b"binaryItemIDRef"),
        has_moniker: attr_bool(start, b"hasMoniker").unwrap_or(false),
        presentation: parse_ole_presentation(&attr_str(start, b"drawAspect").unwrap_or_default()),
        eq_baseline: attr_str(start, b"eqBaseLine").and_then(|s| s.parse().ok()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"extent" => {
                    obj.extent = Size {
                        width: attr_i32(e, b"x").unwrap_or(0),
                        height: attr_i32(e, b"y").unwrap_or(0),
                    };
                }
                b"lineShape" => obj.line_shape = Some(parse_shape_line_info(e)),
                b"offset" => {
                    obj.component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    obj.component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"ole" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

// ═══════════════════════════════════════════
// 연결선 파서
// ═══════════════════════════════════════════

fn parse_connect_line(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<ConnectLineObject, HwpxError> {
    let mut obj = ConnectLineObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        connect_type: parse_connect_line_type(&attr_str(start, b"type").unwrap_or_default()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"startPt" => {
                    obj.start_pt = ConnectPoint {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                        subject_id: attr_u64(e, b"subjectIDRef"),
                        subject_idx: attr_u16(e, b"subjectIdx"),
                    };
                }
                b"endPt" => {
                    obj.end_pt = ConnectPoint {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                        subject_id: attr_u64(e, b"subjectIDRef"),
                        subject_idx: attr_u16(e, b"subjectIdx"),
                    };
                }
                b"point" => {
                    obj.control_points.push(ControlPoint {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                        point_type: attr_u32(e, b"type").unwrap_or(0),
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"connectLine" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

// ═══════════════════════════════════════════
// 글맵시 파서
// ═══════════════════════════════════════════

fn parse_textart_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<TextArtObject, HwpxError> {
    let mut obj = TextArtObject {
        common: parse_shape_common_attrs(start),
        component: parse_shape_component_attrs(start),
        text: attr_str(start, b"text").unwrap_or_default(),
        ..Default::default()
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                b"offset" => {
                    obj.component.offset = Some(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    })
                }
                b"orgSz" => {
                    obj.component.org_size = Some(Size {
                        width: attr_i32(e, b"width").unwrap_or(0),
                        height: attr_i32(e, b"height").unwrap_or(0),
                    })
                }
                b"lineShape" => obj.line_shape = parse_shape_line_info(e),
                b"fillBrush" => {
                    obj.fill = parse_fill_brush_body(reader)?;
                }
                b"shadow" => obj.shadow = Some(parse_shape_shadow(e)),
                b"textartPr" => {
                    obj.font_name = attr_str(e, b"fontName");
                    obj.font_style = attr_str(e, b"fontStyle");
                    obj.font_type = attr_str(e, b"fontType");
                    obj.text_shape = attr_str(e, b"textShape");
                    obj.line_spacing = attr_i32(e, b"lineSpacing");
                    obj.char_spacing = attr_i32(e, b"charSpacing");
                    obj.align = attr_str(e, b"align").map(|s| parse_halign(&s));
                }
                b"outline" => {
                    obj.outline = parse_outline_points(reader)?;
                }
                b"pt0" => {
                    obj.points[0] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt1" => {
                    obj.points[1] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt2" => {
                    obj.points[2] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt3" => {
                    obj.points[3] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"textart" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

// ═══════════════════════════════════════════
// linesegarray 파싱
// ═══════════════════════════════════════════

fn parse_linesegarray(reader: &mut Reader<&[u8]>) -> Result<Vec<LineSegmentInfo>, HwpxError> {
    let mut segments = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"lineseg" {
                    segments.push(LineSegmentInfo {
                        text_start_pos: attr_u32(e, b"textpos").unwrap_or(0),
                        vertical_pos: attr_i32(e, b"vertpos").unwrap_or(0),
                        line_height: attr_i32(e, b"vertsize").unwrap_or(0),
                        text_height: attr_i32(e, b"textheight").unwrap_or(0),
                        baseline_distance: attr_i32(e, b"baseline").unwrap_or(0),
                        line_spacing: attr_i32(e, b"spacing").unwrap_or(0),
                        column_start_pos: attr_i32(e, b"horzpos").unwrap_or(0),
                        segment_width: attr_i32(e, b"horzsize").unwrap_or(0),
                        flags: attr_u32(e, b"flags").unwrap_or(0),
                    });
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"linesegarray" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(segments)
}

fn parse_img_rect(reader: &mut Reader<&[u8]>) -> Result<[Point; 4], HwpxError> {
    let mut pts = [
        Point::default(),
        Point::default(),
        Point::default(),
        Point::default(),
    ];
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"pt0" => {
                    pts[0] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt1" => {
                    pts[1] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt2" => {
                    pts[2] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                b"pt3" => {
                    pts[3] = Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    }
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"imgRect" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(pts)
}

fn parse_outline_points(reader: &mut Reader<&[u8]>) -> Result<Vec<Point>, HwpxError> {
    let mut points = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"pt" {
                    points.push(Point {
                        x: attr_i32(e, b"x").unwrap_or(0),
                        y: attr_i32(e, b"y").unwrap_or(0),
                    });
                }
            }
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"outline" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(points)
}

// ═══════════════════════════════════════════
// 비디오 파서
// ═══════════════════════════════════════════

fn parse_video_object(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<VideoObject, HwpxError> {
    let mut obj = VideoObject {
        common: parse_shape_common_attrs(start),
        video_type: parse_video_type(&attr_str(start, b"videotype").unwrap_or_default()),
        file_id_ref: attr_str(start, b"fileIDRef"),
        image_id_ref: attr_str(start, b"imageIDRef"),
        tag: attr_str(start, b"tag"),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"sz" => parse_shape_size(&mut obj.common, e),
                b"pos" => parse_shape_pos(&mut obj.common, e),
                b"outMargin" => obj.common.out_margin = Some(parse_margin_attrs(e)),
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"video" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(obj)
}

// ═══════════════════════════════════════════
// 덧말 파서
// ═══════════════════════════════════════════

fn parse_dutmal(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Dutmal, HwpxError> {
    let mut dm = Dutmal {
        position: parse_dutmal_position(&attr_str(start, b"posType").unwrap_or_default()),
        sz_ratio: attr_u16(start, b"szRatio"),
        option: attr_u32(start, b"option"),
        style_id_ref: attr_u16(start, b"styleIDRef"),
        alignment: parse_halign(&attr_str(start, b"align").unwrap_or_default()),
        ..Default::default()
    };

    let mut buf = Vec::new();
    let mut current_tag = String::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => {
                let tag = e.name();
                let name = local_name(tag.as_ref());
                if name == b"mainText" {
                    current_tag = "main".to_string();
                } else if name == b"subText" {
                    current_tag = "sub".to_string();
                }
            }
            Event::Text(ref t) => {
                let text = t.unescape().unwrap_or_default().to_string();
                match current_tag.as_str() {
                    "main" => dm.main_text = text,
                    "sub" => dm.sub_text = text,
                    _ => {}
                }
            }
            Event::End(ref e) => {
                let tag = e.name();
                let name = local_name(tag.as_ref());
                if name == b"mainText" || name == b"subText" {
                    current_tag.clear();
                }
                if name == b"dutmal" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(dm)
}

// ═══════════════════════════════════════════
// 그림 효과 파서
// ═══════════════════════════════════════════

fn parse_picture_effects(reader: &mut Reader<&[u8]>) -> Result<PictureEffects, HwpxError> {
    let mut effects = PictureEffects::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"shadow" => {
                    effects.shadow = Some(PicEffectShadow {
                        style: parse_effect_shadow_style(
                            &attr_str(e, b"style").unwrap_or_default(),
                        ),
                        alpha: attr_f32(e, b"alpha").unwrap_or(0.0),
                        radius: attr_i32(e, b"radius").unwrap_or(0),
                        direction: attr_f32(e, b"direction").unwrap_or(0.0),
                        distance: attr_i32(e, b"distance").unwrap_or(0),
                        ..Default::default()
                    });
                }
                b"glow" => {
                    effects.glow = Some(PicEffectGlow {
                        alpha: attr_f32(e, b"alpha").unwrap_or(0.0),
                        radius: attr_i32(e, b"radius").unwrap_or(0),
                        ..Default::default()
                    });
                }
                b"softEdge" => {
                    effects.soft_edge = Some(PicEffectSoftEdge {
                        radius: attr_i32(e, b"radius").unwrap_or(0),
                    });
                }
                b"reflection" => {
                    effects.reflection = Some(PicEffectReflection {
                        radius: attr_i32(e, b"radius").unwrap_or(0),
                        direction: attr_f32(e, b"direction").unwrap_or(0.0),
                        distance: attr_i32(e, b"distance").unwrap_or(0),
                        ..Default::default()
                    });
                }
                _ => {}
            },
            Event::End(ref e) => {
                if local_name(e.name().as_ref()) == b"effects" {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(effects)
}

// ═══════════════════════════════════════════
// 추가 enum 파싱
// ═══════════════════════════════════════════

fn parse_ole_type(s: &str) -> OleObjectType {
    match s {
        "EMBEDDED" => OleObjectType::Embedded,
        "LINK" => OleObjectType::Link,
        "STATIC" => OleObjectType::Static,
        "EQUATION" => OleObjectType::Equation,
        _ => OleObjectType::Unknown,
    }
}

fn parse_ole_presentation(s: &str) -> OlePresentation {
    match s {
        "THUMB_NAIL" => OlePresentation::ThumbNail,
        "ICON" => OlePresentation::Icon,
        "DOC_PRINT" => OlePresentation::DocPrint,
        _ => OlePresentation::Content,
    }
}

fn parse_connect_line_type(s: &str) -> ConnectLineType {
    match s {
        "STRAIGHT_ONEWAY" => ConnectLineType::StraightOneWay,
        "STRAIGHT_BOTH" => ConnectLineType::StraightBoth,
        "STROKE_NOARROW" => ConnectLineType::StrokeNoArrow,
        "STROKE_ONEWAY" => ConnectLineType::StrokeOneWay,
        "STROKE_BOTH" => ConnectLineType::StrokeBoth,
        "ARC_NOARROW" => ConnectLineType::ArcNoArrow,
        "ARC_ONEWAY" => ConnectLineType::ArcOneWay,
        "ARC_BOTH" => ConnectLineType::ArcBoth,
        _ => ConnectLineType::StraightNoArrow,
    }
}

fn parse_video_type(s: &str) -> VideoType {
    match s {
        "Web" => VideoType::Web,
        _ => VideoType::Local,
    }
}

fn parse_dutmal_position(s: &str) -> DutmalPosition {
    match s {
        "BOTTOM" => DutmalPosition::Bottom,
        "CENTER" => DutmalPosition::Center,
        _ => DutmalPosition::Top,
    }
}

fn parse_effect_shadow_style(s: &str) -> ShadowStyle {
    match s {
        "INSIDE" => ShadowStyle::Inside,
        _ => ShadowStyle::Outside,
    }
}

fn parse_field_type(s: &str) -> FieldType {
    match s {
        "HYPERLINK" => FieldType::Hyperlink,
        "BOOKMARK" => FieldType::Bookmark,
        "FORMULA" => FieldType::Formula,
        "SUMMERY" | "SUMMARY" => FieldType::Summary,
        "USER_INFO" => FieldType::UserInfo,
        "DATE" => FieldType::Date,
        "DOC_DATE" => FieldType::DocDate,
        "PATH" => FieldType::Path,
        "CROSSREF" => FieldType::CrossRef,
        "MAILMERGE" => FieldType::MailMerge,
        "MEMO" => FieldType::Memo,
        "PROOFREADING_MARKS" => FieldType::ProofreadingMarks,
        "PRIVATE_INFO" => FieldType::PrivateInfo,
        "METATAG" => FieldType::MetaTag,
        "OUTLINE" => FieldType::Outline,
        _ => FieldType::ClickHere,
    }
}
