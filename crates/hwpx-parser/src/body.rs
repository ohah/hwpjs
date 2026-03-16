use crate::error::HwpxError;
use crate::utils::*;
use hwp_model::paragraph::*;
use hwp_model::section::*;
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
                    section
                        .paragraphs
                        .push(parse_paragraph(e, &mut reader)?);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(section)
}

/// `<p>` 요소 파싱
fn parse_paragraph(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Paragraph, HwpxError> {
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
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"run" => {
                    para.runs.push(parse_run(e, reader)?);
                }
                b"linesegarray" => {
                    // linesegarray는 레이아웃 캐시 - 스킵 (hints로 보존 가능)
                    skip_element(reader, e.name().as_ref())?;
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

    Ok(para)
}

/// `<run>` 요소 파싱
fn parse_run(
    start: &quick_xml::events::BytesStart,
    reader: &mut Reader<&[u8]>,
) -> Result<Run, HwpxError> {
    let mut run = Run {
        char_shape_id: attr_u16(start, b"charPrIDRef").unwrap_or(0),
        contents: Vec::new(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"t" => {
                    let tc = parse_text_content(e, reader)?;
                    run.contents.push(RunContent::Text(tc));
                }
                b"secPr" => {
                    // secPr는 섹션 정의 - 파싱 후 section.definition에 설정
                    // TODO: secPr 파싱
                    skip_element(reader, e.name().as_ref())?;
                }
                b"ctrl" => {
                    // ctrl 요소 내부의 제어 요소들
                    // TODO: ctrl 파싱
                    skip_element(reader, e.name().as_ref())?;
                }
                b"tbl" => {
                    // TODO: 표 파싱
                    skip_element(reader, e.name().as_ref())?;
                }
                b"pic" => {
                    // TODO: 그림 파싱
                    skip_element(reader, e.name().as_ref())?;
                }
                _ => {
                    // 다른 도형 개체들 (line, rect, ellipse, ...)
                    skip_element(reader, e.name().as_ref())?;
                }
            },
            Event::Empty(ref e) => {
                // 빈 run 요소에서 t가 없는 경우 (빈 텍스트)
                match local_name(e.name().as_ref()) {
                    b"t" => {
                        run.contents.push(RunContent::Text(TextContent::default()));
                    }
                    _ => {}
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

    Ok(run)
}

/// `<t>` 요소 파싱 (텍스트 + 특수 요소 혼합)
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
                        leader: parse_line_type2(
                            &attr_str(e, b"leader").unwrap_or_default(),
                        ),
                        tab_type: parse_tab_type(
                            &attr_str(e, b"type").unwrap_or_default(),
                        ),
                    });
                }
                b"lineBreak" => {
                    tc.elements.push(TextElement::LineBreak);
                }
                b"hyphen" => {
                    tc.elements.push(TextElement::Hyphen);
                }
                b"nbSpace" => {
                    tc.elements.push(TextElement::NbSpace);
                }
                b"fwSpace" => {
                    tc.elements.push(TextElement::FwSpace);
                }
                b"markpenBegin" => {
                    tc.elements.push(TextElement::MarkpenBegin {
                        color: attr_str(e, b"color").and_then(|s| parse_color(&s)),
                    });
                }
                b"markpenEnd" => {
                    tc.elements.push(TextElement::MarkpenEnd);
                }
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

// ── enum 파싱 헬퍼 ──

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
