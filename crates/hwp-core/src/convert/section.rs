//! BodyText → hwp_model Sections 변환
//!
//! HWP 5.0의 평면 레코드(ParagraphRecord) 구조를
//! hwp_model의 트리 구조(Run > RunContent)로 조립한다.

use crate::document::bodytext::ctrl_header::{self as ctrl_header, CtrlId};
use crate::document::bodytext::{self, BodyText, ParaTextRun, ParagraphRecord};
use crate::document::docinfo::DocInfo;
use hwp_model::control::*;
use hwp_model::hints::LineSegmentInfo;
use hwp_model::paragraph::*;
use hwp_model::section::Section;
use hwp_model::shape::*;
use hwp_model::table as model_table;
use hwp_model::types::*;

pub fn convert_sections(body: &BodyText, _doc_info: &DocInfo) -> Vec<Section> {
    body.sections
        .iter()
        .map(|sec| Section {
            paragraphs: sec.paragraphs.iter().map(convert_paragraph).collect(),
            ..Default::default()
        })
        .collect()
}

fn convert_paragraph(para: &bodytext::Paragraph) -> Paragraph {
    let header = &para.para_header;

    // ParaText, ParaCharShape, ParaLineSeg를 수집
    let mut text_runs: Vec<ParaTextRun> = Vec::new();
    let mut char_shapes: Vec<bodytext::CharShapeInfo> = Vec::new();
    let mut line_segs: Vec<bodytext::LineSegmentInfo> = Vec::new();
    let mut ctrl_headers: Vec<&ParagraphRecord> = Vec::new();

    for record in &para.records {
        match record {
            ParagraphRecord::ParaText { runs, .. } => {
                text_runs = runs.clone();
            }
            ParagraphRecord::ParaCharShape { shapes } => {
                char_shapes = shapes.clone();
            }
            ParagraphRecord::ParaLineSeg { segments } => {
                line_segs = segments.clone();
            }
            ParagraphRecord::CtrlHeader { .. } => {
                ctrl_headers.push(record);
            }
            _ => {}
        }
    }

    // ParaText의 runs + ParaCharShape → Run[] 조립
    let runs = assemble_runs(&text_runs, &char_shapes, &ctrl_headers);

    // LineSegmentInfo 변환
    let line_segments = line_segs
        .iter()
        .map(|ls| LineSegmentInfo {
            text_start_pos: ls.text_start_position,
            vertical_pos: ls.vertical_position,
            line_height: ls.line_height,
            text_height: ls.text_height,
            baseline_distance: ls.baseline_distance,
            line_spacing: ls.line_spacing,
            column_start_pos: ls.column_start_position,
            segment_width: ls.segment_width,
            flags: line_seg_tag_to_flags(&ls.tag),
        })
        .collect();

    Paragraph {
        id: header.instance_id as u64,
        para_shape_id: header.para_shape_id,
        style_id: header.para_style_id as u16,
        page_break: header
            .column_divide_type
            .contains(&bodytext::ColumnDivideType::Page),
        column_break: header
            .column_divide_type
            .contains(&bodytext::ColumnDivideType::Column),
        merged: false,
        para_tc_id: None,
        meta_tag: None,
        runs,
        line_segments,
    }
}

/// HWP Paragraph 목록 → hwp_model Paragraph 목록 변환
fn convert_hwp_paragraphs(paras: &[bodytext::Paragraph]) -> Vec<Paragraph> {
    paras.iter().map(convert_paragraph).collect()
}

/// ParaTextRun + ParaCharShape → Run[] 조립
fn assemble_runs(
    text_runs: &[ParaTextRun],
    char_shapes: &[bodytext::CharShapeInfo],
    ctrl_headers: &[&ParagraphRecord],
) -> Vec<Run> {
    if text_runs.is_empty() && char_shapes.is_empty() && ctrl_headers.is_empty() {
        return Vec::new();
    }

    if text_runs.is_empty() {
        let shape_id = char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0);
        let mut run = Run {
            char_shape_id: shape_id as u16,
            contents: Vec::new(),
        };
        // 텍스트 없이 CtrlHeader만 있는 문단 (secd, cold 등)
        for record in ctrl_headers {
            if let Some(content) = convert_ctrl_header(record) {
                run.contents.push(content);
            }
        }
        return vec![run];
    }

    // 확장 제어 문자 인덱스 (CtrlHeader 소비 카운터)
    let mut ctrl_idx: usize = 0;

    if char_shapes.len() <= 1 {
        let shape_id = char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0);
        let mut run = Run {
            char_shape_id: shape_id as u16,
            contents: Vec::new(),
        };

        for tr in text_runs {
            match tr {
                ParaTextRun::Text { text } => {
                    run.contents.push(RunContent::Text(TextContent {
                        char_shape_id: None,
                        elements: vec![TextElement::Text(text.clone())],
                    }));
                }
                ParaTextRun::Control {
                    code,
                    display_text,
                    size_wchars,
                    ..
                } => {
                    if let Some(content) = convert_control_char(
                        *code,
                        *size_wchars,
                        display_text,
                        ctrl_headers,
                        &mut ctrl_idx,
                    ) {
                        run.contents.push(content);
                    }
                }
            }
        }

        // 미소비 CtrlHeader 추가
        append_remaining_ctrl_headers(&mut run, ctrl_headers, ctrl_idx);
        return vec![run];
    }

    // 일반 케이스: CharShape 변경점에 따라 Run 분할
    let mut runs = Vec::new();
    let mut current_pos: u32 = 0;
    let mut shape_idx = 0;
    let mut current_shape_id = char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0);

    let mut current_run = Run {
        char_shape_id: current_shape_id as u16,
        contents: Vec::new(),
    };

    for tr in text_runs {
        match tr {
            ParaTextRun::Text { text } => {
                let chars: Vec<char> = text.chars().collect();
                let mut text_start = 0;

                for (ci, _ch) in chars.iter().enumerate() {
                    let abs_pos = current_pos + ci as u32;

                    if shape_idx + 1 < char_shapes.len()
                        && abs_pos >= char_shapes[shape_idx + 1].position
                    {
                        if ci > text_start {
                            let chunk: String = chars[text_start..ci].iter().collect();
                            current_run.contents.push(RunContent::Text(TextContent {
                                char_shape_id: None,
                                elements: vec![TextElement::Text(chunk)],
                            }));
                        }

                        runs.push(current_run);
                        shape_idx += 1;
                        current_shape_id = char_shapes[shape_idx].shape_id;
                        current_run = Run {
                            char_shape_id: current_shape_id as u16,
                            contents: Vec::new(),
                        };
                        text_start = ci;
                    }
                }

                if text_start < chars.len() {
                    let chunk: String = chars[text_start..].iter().collect();
                    current_run.contents.push(RunContent::Text(TextContent {
                        char_shape_id: None,
                        elements: vec![TextElement::Text(chunk)],
                    }));
                }

                current_pos += chars.len() as u32;
            }
            ParaTextRun::Control {
                code,
                display_text,
                size_wchars,
                ..
            } => {
                if let Some(content) = convert_control_char(
                    *code,
                    *size_wchars,
                    display_text,
                    ctrl_headers,
                    &mut ctrl_idx,
                ) {
                    current_run.contents.push(content);
                }
                current_pos += *size_wchars as u32;
            }
        }
    }

    // 미소비 CtrlHeader 추가
    append_remaining_ctrl_headers(&mut current_run, ctrl_headers, ctrl_idx);

    if !current_run.contents.is_empty() {
        runs.push(current_run);
    }

    if runs.is_empty() {
        let shape_id = char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0);
        runs.push(Run {
            char_shape_id: shape_id as u16,
            contents: Vec::new(),
        });
    }

    runs
}

fn line_seg_tag_to_flags(tag: &bodytext::line_seg::LineSegmentTag) -> u32 {
    let mut flags = 0u32;
    if tag.is_first_line_of_page {
        flags |= 1 << 16;
    }
    if tag.is_first_line_of_column {
        flags |= 1 << 17;
    }
    if tag.is_empty_segment {
        flags |= 1 << 18;
    }
    if tag.is_first_segment_of_line {
        flags |= 1 << 19;
    }
    if tag.is_last_segment_of_line {
        flags |= 1 << 20;
    }
    flags
}

/// 빈 문자열이면 None, 아니면 Some(clone)
fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// 텍스트 제어 문자에 의해 소비되지 않은 CtrlHeader를 마지막 Run에 추가
fn append_remaining_ctrl_headers(
    run: &mut Run,
    ctrl_headers: &[&ParagraphRecord],
    consumed: usize,
) {
    for record in &ctrl_headers[consumed..] {
        if let Some(content) = convert_ctrl_header(record) {
            run.contents.push(content);
        }
    }
}

// ═══════════════════════════════════════════
// 제어 문자 → RunContent 변환
// ═══════════════════════════════════════════

/// 제어 문자 코드 → RunContent 변환
///
/// size_wchars > 1 이면 확장 제어 문자로, 대응하는 CtrlHeader를 소비한다.
fn convert_control_char(
    code: u8,
    size_wchars: usize,
    display_text: &Option<String>,
    ctrl_headers: &[&ParagraphRecord],
    ctrl_idx: &mut usize,
) -> Option<RunContent> {
    // 인라인 제어 문자
    match code {
        0x0A => {
            return Some(RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::LineBreak],
            }))
        }
        0x09 => {
            return Some(RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Tab {
                    width: 0,
                    leader: LineType2::None,
                    tab_type: TabType::Left,
                }],
            }))
        }
        0x18 => {
            return Some(RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Hyphen],
            }))
        }
        0x1E => {
            return Some(RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::NbSpace],
            }))
        }
        0x1F => {
            return Some(RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::FwSpace],
            }))
        }
        _ => {}
    }

    // 확장 제어 문자: CtrlHeader 소비
    if size_wchars > 1 {
        if *ctrl_idx < ctrl_headers.len() {
            let record = ctrl_headers[*ctrl_idx];
            *ctrl_idx += 1;
            return convert_ctrl_header(record);
        }
        // CtrlHeader가 부족하면 display_text 폴백
        return display_text.as_ref().map(|dt| {
            RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Text(dt.clone())],
            })
        });
    }

    // 자동번호 등 표시 텍스트
    if code == 0x12 {
        return display_text.as_ref().map(|dt| {
            RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Text(dt.clone())],
            })
        });
    }

    None
}

// ═══════════════════════════════════════════
// CtrlHeader → RunContent 디스패처
// ═══════════════════════════════════════════

fn convert_ctrl_header(record: &ParagraphRecord) -> Option<RunContent> {
    let ParagraphRecord::CtrlHeader {
        header,
        children,
        paragraphs,
    } = record
    else {
        return None;
    };

    match &header.data {
        ctrl_header::CtrlHeaderData::ObjectCommon {
            attribute,
            offset_y,
            offset_x,
            width,
            height,
            z_order,
            margin,
            instance_id,
            description,
            caption,
            ..
        } => {
            let common = build_shape_common(
                attribute,
                *offset_y,
                *offset_x,
                *width,
                *height,
                *z_order,
                margin,
                *instance_id,
                description,
                caption,
            );

            match header.ctrl_id.as_str() {
                CtrlId::TABLE => convert_table_object(common, children),
                _ => None, // 도형/그림 등은 추후 구현
            }
        }

        ctrl_header::CtrlHeaderData::HeaderFooter {
            attribute,
            text_width,
            text_height,
            text_ref,
            number_ref,
        } => {
            let apply_page = match attribute.apply_page {
                ctrl_header::ApplyPage::Both => PageApplyType::Both,
                ctrl_header::ApplyPage::EvenOnly => PageApplyType::Even,
                ctrl_header::ApplyPage::OddOnly => PageApplyType::Odd,
            };
            let paras = convert_hwp_paragraphs(paragraphs);
            let content = SubList {
                text_width: Some((*text_width).into()),
                text_height: Some((*text_height).into()),
                has_text_ref: *text_ref != 0,
                has_num_ref: *number_ref != 0,
                paragraphs: paras,
                ..Default::default()
            };

            let ctrl = if header.ctrl_id == CtrlId::HEADER {
                Control::Header(HeaderFooter {
                    id: 0,
                    apply_page_type: apply_page,
                    content,
                })
            } else {
                Control::Footer(HeaderFooter {
                    id: 0,
                    apply_page_type: apply_page,
                    content,
                })
            };
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::FootnoteEndnote { number, .. } => {
            let paras = convert_hwp_paragraphs(paragraphs);
            let note = Note {
                id: 0,
                number: Some(*number as u16),
                content: SubList {
                    paragraphs: paras,
                    ..Default::default()
                },
            };
            let ctrl = if header.ctrl_id == CtrlId::FOOTNOTE {
                Control::FootNote(note)
            } else {
                Control::EndNote(note)
            };
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::Field {
            field_type,
            command,
            id,
            attribute,
            ..
        } => {
            let ft = match field_type.as_str() {
                CtrlId::FIELD_START => FieldType::ClickHere,
                CtrlId::FIELD_HYPERLINK => FieldType::Hyperlink,
                CtrlId::FIELD_BOOKMARK => FieldType::Bookmark,
                CtrlId::FIELD_FORMULA => FieldType::Formula,
                CtrlId::FIELD_DOCSUMMARY => FieldType::Summary,
                CtrlId::FIELD_USER => FieldType::UserInfo,
                CtrlId::FIELD_DATE => FieldType::Date,
                CtrlId::FIELD_DOC_DATE => FieldType::DocDate,
                CtrlId::FIELD_PATH => FieldType::Path,
                CtrlId::FIELD_CROSS_REF => FieldType::CrossRef,
                CtrlId::FIELD_MAIL_MERGE => FieldType::MailMerge,
                CtrlId::FIELD_OUTLINE => FieldType::Outline,
                CtrlId::FIELD_PRIVATE_INFO_SECURITY => FieldType::PrivateInfo,
                _ => FieldType::ClickHere,
            };
            let ctrl = Control::FieldBegin(Field {
                id: *id as u64,
                field_type: ft,
                name: non_empty(command),
                editable: (*attribute & 0x01) != 0,
                dirty: (*attribute & 0x02) != 0,
                field_id: Some(*id),
                ..Default::default()
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::ColumnDefinition { attribute, column_spacing, .. } => {
            let ctrl = Control::Column(ColumnControl {
                id: 0,
                column_type: match attribute.column_type {
                    ctrl_header::ColumnType::Normal => ColumnType::Newspaper,
                    ctrl_header::ColumnType::Distributed => ColumnType::BalancedNewspaper,
                    ctrl_header::ColumnType::Parallel => ColumnType::Parallel,
                },
                col_count: attribute.column_count as u16,
                layout: match attribute.column_direction {
                    ctrl_header::ColumnDirection::Left => ColumnLayout::Left,
                    ctrl_header::ColumnDirection::Right => ColumnLayout::Right,
                    ctrl_header::ColumnDirection::Both => ColumnLayout::Mirror,
                },
                same_size: attribute.equal_width,
                same_gap: *column_spacing as i32,
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::AutoNumber {
            attribute,
            number,
            user_symbol,
            prefix,
            suffix,
        } => {
            // attribute bits 0-11: number type, bits 12-15: auto num type
            let num_type = match (*attribute >> 12) & 0x0F {
                1 => AutoNumType::Picture,
                2 => AutoNumType::Table,
                3 => AutoNumType::Equation,
                _ => AutoNumType::Page,
            };
            let number_format = match *attribute & 0x0F {
                1 => NumberType1::CircledDigit,
                2 => NumberType1::RomanCapital,
                3 => NumberType1::RomanSmall,
                4 => NumberType1::LatinCapital,
                5 => NumberType1::LatinSmall,
                _ => NumberType1::Digit,
            };
            let ctrl = Control::AutoNum(AutoNum {
                num_type,
                number_type: number_format,
                num: *number,
                user_char: non_empty(user_symbol),
                prefix_char: non_empty(prefix),
                suffix_char: non_empty(suffix),
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::NewNumber { attribute, number } => {
            let num_type = match (*attribute >> 12) & 0x0F {
                1 => NumberingType::Picture,
                2 => NumberingType::Table,
                3 => NumberingType::Equation,
                _ => NumberingType::None,
            };
            let ctrl = Control::NewNum(NewNum {
                num_type,
                num: *number,
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::PageNumberPosition { flags, .. } => {
            let ctrl = Control::PageNumCtrl(PageNumCtrl {
                page_starts_on: None,
                visible: Some(true),
            });
            let _ = flags; // 위치 정보는 hints로 처리
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::BookmarkMarker {
            keyword1, ..
        } => {
            let ctrl = Control::Bookmark(Bookmark {
                name: keyword1.clone(),
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::Hide { attribute } => {
            let ctrl = Control::PageHiding(PageHiding {
                hide_header: (*attribute & 0x01) != 0,
                hide_footer: (*attribute & 0x02) != 0,
                hide_master_page: (*attribute & 0x04) != 0,
                hide_border: (*attribute & 0x08) != 0,
                hide_fill: (*attribute & 0x10) != 0,
                hide_page_num: (*attribute & 0x20) != 0,
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::Overlap {
            text,
            char_shape_ids,
            ..
        } => {
            let ctrl = Control::Compose(Compose {
                compose_text: Some(text.clone()),
                char_pr_refs: char_shape_ids.clone(),
                ..Default::default()
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::Comment {
            main_text,
            sub_text,
            position,
            fsize_ratio,
            option,
            style_number,
            alignment,
        } => {
            let pos = match *position {
                1 => DutmalPosition::Bottom,
                2 => DutmalPosition::Center,
                _ => DutmalPosition::Top,
            };
            let align = match *alignment {
                1 => HAlign::Center,
                2 => HAlign::Right,
                _ => HAlign::Left,
            };
            let ctrl = Control::Dutmal(Dutmal {
                main_text: main_text.clone(),
                sub_text: sub_text.clone(),
                position: pos,
                alignment: align,
                sz_ratio: Some(*fsize_ratio as u16),
                option: Some(*option),
                style_id_ref: Some(*style_number as u16),
            });
            Some(RunContent::Control(ctrl))
        }

        ctrl_header::CtrlHeaderData::HiddenDescription => {
            let paras = convert_hwp_paragraphs(paragraphs);
            let ctrl = Control::HiddenDesc(HiddenDesc { paragraphs: paras });
            Some(RunContent::Control(ctrl))
        }

        // SectionDefinition, PageAdjust, Other → 무시
        _ => None,
    }
}

// ═══════════════════════════════════════════
// 표 변환
// ═══════════════════════════════════════════

fn convert_table_object(
    common: ShapeCommon,
    children: &[ParagraphRecord],
) -> Option<RunContent> {
    // children에서 Table 레코드 찾기
    let table_data = children.iter().find_map(|c| {
        if let ParagraphRecord::Table { table } = c {
            Some(table)
        } else {
            None
        }
    })?;

    let ta = &table_data.attributes;

    // 셀을 행별로 정리
    let mut rows_map: std::collections::BTreeMap<u16, Vec<&bodytext::table::TableCell>> =
        std::collections::BTreeMap::new();

    for cell in &table_data.cells {
        rows_map
            .entry(cell.cell_attributes.row_address)
            .or_default()
            .push(cell);
    }

    let rows: Vec<model_table::TableRow> = rows_map
        .into_values()
        .map(|cells| {
            let mut sorted = cells;
            sorted.sort_by_key(|c| c.cell_attributes.col_address);
            model_table::TableRow {
                cells: sorted.iter().map(|c| convert_table_cell(c)).collect(),
            }
        })
        .collect();

    let page_break = match ta.attribute.page_break {
        bodytext::table::PageBreakBehavior::BreakByCell => TablePageBreak::Cell,
        bodytext::table::PageBreakBehavior::NoBreak => TablePageBreak::None,
        bodytext::table::PageBreakBehavior::NoBreakOther => TablePageBreak::None,
    };

    let table = model_table::Table {
        common,
        page_break,
        repeat_header: ta.attribute.header_row_repeat,
        row_count: ta.row_count,
        col_count: ta.col_count,
        cell_spacing: ta.cell_spacing as i32,
        border_fill_id: ta.border_fill_id,
        no_adjust: None,
        in_margin: Margin {
            left: ta.padding.left as i32,
            right: ta.padding.right as i32,
            top: ta.padding.top as i32,
            bottom: ta.padding.bottom as i32,
        },
        cell_zones: ta
            .zones
            .iter()
            .map(|z| model_table::CellZone {
                start_row: z.start_row,
                start_col: z.start_col,
                end_row: z.end_row,
                end_col: z.end_col,
                border_fill_id: z.border_fill_id,
            })
            .collect(),
        rows,
    };

    Some(RunContent::Object(ShapeObject::Table(Box::new(table))))
}

fn convert_table_cell(cell: &bodytext::table::TableCell) -> model_table::TableCell {
    let ca = &cell.cell_attributes;
    let lh = &cell.list_header;

    let paragraphs = convert_hwp_paragraphs(&cell.paragraphs);

    let vert_align = match lh.attribute.vertical_align {
        bodytext::list_header::VerticalAlign::Top => VAlign::Top,
        bodytext::list_header::VerticalAlign::Center => VAlign::Center,
        bodytext::list_header::VerticalAlign::Bottom => VAlign::Bottom,
    };

    model_table::TableCell {
        name: None,
        header: false,
        has_margin: Some(true),
        protect: false,
        editable: true,
        dirty: None,
        border_fill_id: ca.border_fill_id,
        col: ca.col_address,
        row: ca.row_address,
        col_span: ca.col_span,
        row_span: ca.row_span,
        width: ca.width.into(),
        height: ca.height.into(),
        cell_margin: Margin {
            left: ca.left_margin as i32,
            right: ca.right_margin as i32,
            top: ca.top_margin as i32,
            bottom: ca.bottom_margin as i32,
        },
        content: SubList {
            vert_align,
            paragraphs,
            ..Default::default()
        },
    }
}

// ═══════════════════════════════════════════
// ShapeCommon 빌더
// ═══════════════════════════════════════════

fn build_shape_common(
    attr: &ctrl_header::ObjectAttribute,
    offset_y: crate::types::SHWPUNIT,
    offset_x: crate::types::SHWPUNIT,
    width: crate::types::HWPUNIT,
    height: crate::types::HWPUNIT,
    z_order: i32,
    margin: &ctrl_header::Margin,
    instance_id: u32,
    description: &Option<String>,
    caption: &Option<ctrl_header::Caption>,
) -> ShapeCommon {
    let text_wrap = match attr.object_text_option {
        ctrl_header::ObjectTextOption::Square => TextWrap::Square,
        ctrl_header::ObjectTextOption::Tight => TextWrap::Tight,
        ctrl_header::ObjectTextOption::Through => TextWrap::Through,
        ctrl_header::ObjectTextOption::TopAndBottom => TextWrap::TopAndBottom,
        ctrl_header::ObjectTextOption::BehindText => TextWrap::BehindText,
        ctrl_header::ObjectTextOption::InFrontOfText => TextWrap::InFrontOfText,
    };

    let text_flow = match attr.object_text_position_option {
        ctrl_header::ObjectTextPositionOption::BothSides => TextFlow::BothSides,
        ctrl_header::ObjectTextPositionOption::LeftOnly => TextFlow::LeftOnly,
        ctrl_header::ObjectTextPositionOption::RightOnly => TextFlow::RightOnly,
        ctrl_header::ObjectTextPositionOption::LargestOnly => TextFlow::LargestOnly,
    };

    let numbering_type = match attr.object_category {
        ctrl_header::ObjectCategory::Figure => NumberingType::Picture,
        ctrl_header::ObjectCategory::Table => NumberingType::Table,
        ctrl_header::ObjectCategory::Equation => NumberingType::Equation,
        ctrl_header::ObjectCategory::None => NumberingType::None,
    };

    let vert_rel_to = match attr.vert_rel_to {
        ctrl_header::VertRelTo::Paper => RelativeTo::Paper,
        ctrl_header::VertRelTo::Page => RelativeTo::Page,
        ctrl_header::VertRelTo::Para => RelativeTo::Para,
    };

    let horz_rel_to = match attr.horz_rel_to {
        ctrl_header::HorzRelTo::Paper => RelativeTo::Paper,
        ctrl_header::HorzRelTo::Page => RelativeTo::Page,
        ctrl_header::HorzRelTo::Column => RelativeTo::Column,
        ctrl_header::HorzRelTo::Para => RelativeTo::Para,
    };

    let width_rel_to = match attr.object_width_standard {
        ctrl_header::ObjectWidthStandard::Paper => SizeRelation::Paper,
        ctrl_header::ObjectWidthStandard::Page => SizeRelation::Page,
        ctrl_header::ObjectWidthStandard::Column => SizeRelation::Column,
        ctrl_header::ObjectWidthStandard::Para => SizeRelation::Para,
        ctrl_header::ObjectWidthStandard::Absolute => SizeRelation::Absolute,
    };

    let height_rel_to = match attr.object_height_standard {
        ctrl_header::ObjectHeightStandard::Paper => SizeRelation::Paper,
        ctrl_header::ObjectHeightStandard::Page => SizeRelation::Page,
        ctrl_header::ObjectHeightStandard::Absolute => SizeRelation::Absolute,
    };

    let model_caption = caption.as_ref().map(|cap| {
        let side = match cap.align {
            ctrl_header::CaptionAlign::Left => CaptionSide::Left,
            ctrl_header::CaptionAlign::Right => CaptionSide::Right,
            ctrl_header::CaptionAlign::Top => CaptionSide::Top,
            ctrl_header::CaptionAlign::Bottom => CaptionSide::Bottom,
        };
        Caption {
            side,
            full_size: cap.include_margin,
            width: cap.width.into(),
            gap: cap.gap as i32,
            last_width: Some(cap.last_width.into()),
            content: SubList::default(),
        }
    });

    ShapeCommon {
        id: instance_id as u64,
        z_order,
        numbering_type,
        text_wrap,
        text_flow,
        lock: attr.size_protect,
        dropcap_style: None,
        size: ShapeSize {
            width: width.0 as i32,
            width_rel_to,
            height: height.0 as i32,
            height_rel_to,
            protect: attr.size_protect,
        },
        position: ShapePosition {
            treat_as_char: attr.like_letters,
            affect_line_spacing: attr.affect_line_spacing,
            flow_with_text: false,
            allow_overlap: attr.overlap,
            hold_anchor_and_so: false,
            vert_rel_to,
            horz_rel_to,
            vert_align: VAlign::Top,
            horz_align: HAlign::Left,
            vert_offset: offset_y.into(),
            horz_offset: offset_x.into(),
        },
        out_margin: Some(Margin {
            left: margin.left as i32,
            right: margin.right as i32,
            top: margin.top as i32,
            bottom: margin.bottom as i32,
        }),
        caption: model_caption,
        comment: description.clone(),
        meta_tag: None,
    }
}
