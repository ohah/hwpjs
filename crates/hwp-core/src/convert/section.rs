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
        .map(|sec| {
            // SectionDefinition에서 outline_shape_id 추출
            let outline_shape_id = extract_section_outline_id(&sec.paragraphs);
            let mut section = Section {
                paragraphs: sec.paragraphs.iter().flat_map(convert_paragraph).collect(),
                ..Default::default()
            };
            if outline_shape_id > 0 {
                section.definition.outline_shape_id = Some(outline_shape_id);
            }
            section
        })
        .collect()
}

/// SectionDefinition CtrlHeader에서 number_para_shape_id(개요 번호 ID) 추출
fn extract_section_outline_id(paragraphs: &[bodytext::Paragraph]) -> u16 {
    for para in paragraphs {
        for record in &para.records {
            if let ParagraphRecord::CtrlHeader { header, .. } = record {
                if let ctrl_header::CtrlHeaderData::SectionDefinition {
                    number_para_shape_id,
                    ..
                } = &header.data
                {
                    return *number_para_shape_id;
                }
            }
        }
    }
    0
}

fn convert_paragraph(para: &bodytext::Paragraph) -> Vec<Paragraph> {
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
    let line_segments: Vec<LineSegmentInfo> = line_segs
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

    // Object(Table/Shape)가 있으면 Text를 Object 뒤로 재배치
    // 기존 viewer: ParaText를 마지막에 결합 (Object 먼저 처리)
    let runs = reorder_text_after_objects(runs);

    // TABLE이 있으면 셀 텍스트와 중복되는 Rectangle(ListHeader) 제거
    let runs = filter_duplicate_rectangles(runs);

    let main_para = Paragraph {
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
        has_char_shapes: !char_shapes.is_empty(),
    };

    vec![main_para]
}

/// Object(Table/Shape)가 있는 Run에서 Text를 Object 뒤로 재배치
/// 기존 viewer: ParaText를 마지막에 결합하므로 Object가 먼저 출력됨
fn reorder_text_after_objects(runs: Vec<Run>) -> Vec<Run> {
    let has_objects = runs.iter().any(|r| {
        r.contents
            .iter()
            .any(|c| matches!(c, RunContent::Object(_)))
    });

    if !has_objects {
        return runs;
    }

    // 모든 Run의 contents를 합쳐서 Object와 Text를 분리
    let mut objects: Vec<RunContent> = Vec::new();
    let mut texts: Vec<(u16, RunContent)> = Vec::new(); // (char_shape_id, content)

    for run in &runs {
        for content in &run.contents {
            match content {
                RunContent::Object(_) | RunContent::Control(_) => {
                    objects.push(content.clone());
                }
                RunContent::Text(_) => {
                    texts.push((run.char_shape_id, content.clone()));
                }
            }
        }
    }

    if texts.is_empty() || objects.is_empty() {
        return runs;
    }

    // Object를 먼저, Text를 나중에 별도 Run으로 배치
    let shape_id = runs.first().map(|r| r.char_shape_id).unwrap_or(0);

    let mut result_runs: Vec<Run> = vec![Run {
        char_shape_id: shape_id,
        contents: objects,
    }];

    // Text RunContent를 원래 char_shape_id별로 그룹화하여 별도 Run으로 추가
    let mut current_cs = texts.first().map(|(cs, _)| *cs).unwrap_or(0);
    let mut current_run = Run {
        char_shape_id: current_cs,
        contents: Vec::new(),
    };
    for (cs, content) in texts {
        if cs != current_cs {
            if !current_run.contents.is_empty() {
                result_runs.push(current_run);
            }
            current_cs = cs;
            current_run = Run {
                char_shape_id: cs,
                contents: Vec::new(),
            };
        }
        current_run.contents.push(content);
    }
    if !current_run.contents.is_empty() {
        result_runs.push(current_run);
    }

    result_runs
}

/// TABLE이 있는 Run에서 셀 텍스트와 중복되는 Rectangle을 제거
fn filter_duplicate_rectangles(runs: Vec<Run>) -> Vec<Run> {
    // TABLE 셀의 텍스트를 수집
    let mut table_cell_texts: std::collections::HashSet<String> = std::collections::HashSet::new();
    let has_table = runs.iter().any(|r| {
        r.contents.iter().any(|c| {
            if let RunContent::Object(ShapeObject::Table(table)) = c {
                // 셀 텍스트 수집
                for row in &table.rows {
                    for cell in &row.cells {
                        for para in &cell.content.paragraphs {
                            for run in &para.runs {
                                for content in &run.contents {
                                    if let RunContent::Text(tc) = content {
                                        let text: String = tc
                                            .elements
                                            .iter()
                                            .filter_map(|e| {
                                                if let TextElement::Text(s) = e {
                                                    Some(s.as_str())
                                                } else {
                                                    None
                                                }
                                            })
                                            .collect();
                                        let trimmed = text.trim().to_string();
                                        if !trimmed.is_empty() {
                                            table_cell_texts.insert(trimmed);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                true
            } else {
                false
            }
        })
    });

    if !has_table || table_cell_texts.is_empty() {
        return runs;
    }

    // Rectangle의 draw_text 텍스트가 셀 텍스트와 중복되면 제거
    runs.into_iter()
        .map(|run| {
            let filtered: Vec<RunContent> = run
                .contents
                .into_iter()
                .filter(|c| {
                    if let RunContent::Object(ShapeObject::Rectangle(ref rect)) = c {
                        if let Some(ref sub_list) = rect.draw_text {
                            let rect_text: String = sub_list
                                .paragraphs
                                .iter()
                                .flat_map(|p| p.runs.iter())
                                .flat_map(|r| r.contents.iter())
                                .filter_map(|c| {
                                    if let RunContent::Text(tc) = c {
                                        Some(
                                            tc.elements
                                                .iter()
                                                .filter_map(|e| {
                                                    if let TextElement::Text(s) = e {
                                                        Some(s.as_str())
                                                    } else {
                                                        None
                                                    }
                                                })
                                                .collect::<String>(),
                                        )
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            let trimmed = rect_text.trim();
                            if !trimmed.is_empty() && table_cell_texts.contains(trimmed) {
                                return false; // 중복 → 제거
                            }
                        }
                    }
                    true
                })
                .collect();
            Run {
                char_shape_id: run.char_shape_id,
                contents: filtered,
            }
        })
        .filter(|r| !r.contents.is_empty())
        .collect()
}

/// HWP Paragraph 목록 → hwp_model Paragraph 목록 변환
fn convert_hwp_paragraphs(paras: &[bodytext::Paragraph]) -> Vec<Paragraph> {
    paras.iter().flat_map(convert_paragraph).collect()
}

/// children(ParagraphRecord 목록)에서 ListHeader를 찾아 그 안의 paragraphs를 반환
fn find_list_header_paragraphs(children: &[ParagraphRecord]) -> &[bodytext::Paragraph] {
    for child in children {
        if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
            return paragraphs;
        }
    }
    &[]
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
            run.contents.extend(convert_ctrl_header(record));
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
                    run.contents.extend(convert_control_char(
                        *code,
                        *size_wchars,
                        display_text,
                        ctrl_headers,
                        &mut ctrl_idx,
                    ));
                }
            }
        }

        // 미소비 CtrlHeader 추가
        append_remaining_ctrl_headers(&mut run, ctrl_headers, ctrl_idx);
        return vec![run];
    }

    // 일반 케이스: CharShape 변경점에 따라 Run 분할
    // CharShape position은 원본 WCHAR 위치. Clean text 위치로 변환하여 비교.
    // 먼저 control 문자의 위치 정보를 수집하여 변환에 사용
    let mut ctrl_delta: i32 = 0; // 원본 위치와 clean text 위치의 차이 누적
    let mut ctrl_deltas: Vec<(u32, i32)> = Vec::new(); // (원본 위치, 누적 delta)
    {
        let mut wchar_pos: u32 = 0;
        for tr in text_runs {
            match tr {
                ParaTextRun::Text { text } => {
                    wchar_pos += text.chars().count() as u32;
                }
                ParaTextRun::Control {
                    size_wchars, code, ..
                } => {
                    let original_size = *size_wchars as i32;
                    // 변환 가능한 제어 문자는 clean text에서 1 문자, 아니면 0
                    let clean_size = if bodytext::control_char::ControlChar::is_convertible(*code)
                        && *code != bodytext::control_char::ControlChar::PARA_BREAK
                    {
                        1i32
                    } else {
                        0i32
                    };
                    ctrl_deltas.push((wchar_pos, ctrl_delta));
                    ctrl_delta += clean_size - original_size;
                    wchar_pos += *size_wchars as u32;
                }
            }
        }
    }

    // CharShape position을 clean text 위치로 변환하는 함수
    let to_clean_pos = |original_pos: u32| -> u32 {
        let mut delta = 0i32;
        for &(pos, d) in &ctrl_deltas {
            if pos >= original_pos {
                break;
            }
            delta = d;
        }
        // ctrl_deltas의 마지막보다 큰 위치면 마지막 delta 사용
        if !ctrl_deltas.is_empty() {
            let last = ctrl_deltas.last().unwrap();
            if original_pos > last.0 {
                delta = ctrl_delta;
            }
        }
        (original_pos as i32 + delta).max(0) as u32
    };

    // CharShape position을 clean text 위치로 변환
    let clean_char_shapes: Vec<(u32, u32)> = char_shapes
        .iter()
        .map(|cs| (to_clean_pos(cs.position), cs.shape_id))
        .collect();

    let mut runs = Vec::new();
    let mut current_pos: u32 = 0; // clean text 위치
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

                    // CharShape 변경점 체크 (clean text 위치로 변환된 값 사용)
                    if shape_idx + 1 < clean_char_shapes.len()
                        && abs_pos >= clean_char_shapes[shape_idx + 1].0
                    {
                        if ci > text_start {
                            let chunk: String = chars[text_start..ci].iter().collect();
                            current_run.contents.push(RunContent::Text(TextContent {
                                char_shape_id: None,
                                elements: vec![TextElement::Text(chunk)],
                            }));
                        }

                        runs.push(current_run);

                        // 현재 위치에 해당하는 마지막 CharShape까지 이동
                        while shape_idx + 1 < clean_char_shapes.len()
                            && abs_pos >= clean_char_shapes[shape_idx + 1].0
                        {
                            shape_idx += 1;
                        }

                        current_shape_id = clean_char_shapes[shape_idx].1;
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
                current_run.contents.extend(convert_control_char(
                    *code,
                    *size_wchars,
                    display_text,
                    ctrl_headers,
                    &mut ctrl_idx,
                ));
                // clean text 위치: 변환 가능한 제어 문자는 1, 아니면 0
                let clean_size = if bodytext::control_char::ControlChar::is_convertible(*code)
                    && *code != bodytext::control_char::ControlChar::PARA_BREAK
                {
                    1u32
                } else {
                    0u32
                };
                current_pos += clean_size;
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
        run.contents.extend(convert_ctrl_header(record));
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
) -> Vec<RunContent> {
    // 인라인 제어 문자
    match code {
        0x04 => return vec![RunContent::Control(Control::FieldEnd)],
        0x0A => {
            return vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::LineBreak],
            })]
        }
        0x09 => {
            return vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Tab {
                    width: 0,
                    leader: LineType2::None,
                    tab_type: TabType::Left,
                }],
            })]
        }
        0x18 => {
            return vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Hyphen],
            })]
        }
        0x1E => {
            return vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::NbSpace],
            })]
        }
        0x1F => {
            return vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::FwSpace],
            })]
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
        return display_text
            .as_ref()
            .map(|dt| {
                vec![RunContent::Text(TextContent {
                    char_shape_id: None,
                    elements: vec![TextElement::Text(dt.clone())],
                })]
            })
            .unwrap_or_default();
    }

    // 자동번호 등 표시 텍스트
    if code == 0x12 {
        return display_text
            .as_ref()
            .map(|dt| {
                vec![RunContent::Text(TextContent {
                    char_shape_id: None,
                    elements: vec![TextElement::Text(dt.clone())],
                })]
            })
            .unwrap_or_default();
    }

    vec![]
}

// ═══════════════════════════════════════════
// CtrlHeader → RunContent 디스패처
// ═══════════════════════════════════════════

fn convert_ctrl_header(record: &ParagraphRecord) -> Vec<RunContent> {
    let ParagraphRecord::CtrlHeader {
        header,
        children,
        paragraphs,
    } = record
    else {
        return vec![];
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
                CtrlId::TABLE => convert_table_object(common, children, paragraphs),
                _ => convert_shape_object(common, children, paragraphs),
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
            let source_paras = if paragraphs.is_empty() {
                find_list_header_paragraphs(children)
            } else {
                paragraphs.as_slice()
            };
            let paras = convert_hwp_paragraphs(source_paras);
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
            vec![RunContent::Control(ctrl)]
        }

        ctrl_header::CtrlHeaderData::FootnoteEndnote { number, .. } => {
            let source_paras = if paragraphs.is_empty() {
                find_list_header_paragraphs(children)
            } else {
                paragraphs.as_slice()
            };
            let paras = convert_hwp_paragraphs(source_paras);
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
            vec![RunContent::Control(ctrl)]
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
            vec![RunContent::Control(ctrl)]
        }

        ctrl_header::CtrlHeaderData::ColumnDefinition {
            attribute,
            column_spacing,
            ..
        } => {
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
            vec![RunContent::Control(ctrl)]
        }

        ctrl_header::CtrlHeaderData::AutoNumber {
            attribute,
            number,
            user_symbol,
            prefix,
            suffix,
        } => {
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
            vec![RunContent::Control(ctrl)]
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
            vec![RunContent::Control(ctrl)]
        }

        ctrl_header::CtrlHeaderData::PageNumberPosition { flags, .. } => {
            let ctrl = Control::PageNumCtrl(PageNumCtrl {
                page_starts_on: None,
                visible: Some(true),
            });
            let _ = flags;
            vec![RunContent::Control(ctrl)]
        }

        ctrl_header::CtrlHeaderData::BookmarkMarker { keyword1, .. } => {
            vec![RunContent::Control(Control::Bookmark(Bookmark {
                name: keyword1.clone(),
            }))]
        }

        ctrl_header::CtrlHeaderData::Hide { attribute } => {
            vec![RunContent::Control(Control::PageHiding(PageHiding {
                hide_header: (*attribute & 0x01) != 0,
                hide_footer: (*attribute & 0x02) != 0,
                hide_master_page: (*attribute & 0x04) != 0,
                hide_border: (*attribute & 0x08) != 0,
                hide_fill: (*attribute & 0x10) != 0,
                hide_page_num: (*attribute & 0x20) != 0,
            }))]
        }

        ctrl_header::CtrlHeaderData::Overlap {
            text,
            char_shape_ids,
            ..
        } => {
            vec![RunContent::Control(Control::Compose(Compose {
                compose_text: Some(text.clone()),
                char_pr_refs: char_shape_ids.clone(),
                ..Default::default()
            }))]
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
            vec![RunContent::Control(Control::Dutmal(Dutmal {
                main_text: main_text.clone(),
                sub_text: sub_text.clone(),
                position: pos,
                alignment: align,
                sz_ratio: Some(*fsize_ratio as u16),
                option: Some(*option),
                style_id_ref: Some(*style_number as u16),
            }))]
        }

        ctrl_header::CtrlHeaderData::HiddenDescription => {
            let paras = convert_hwp_paragraphs(paragraphs);
            vec![RunContent::Control(Control::HiddenDesc(HiddenDesc {
                paragraphs: paras,
            }))]
        }

        // SectionDefinition, PageAdjust, Other → 무시
        _ => vec![],
    }
}

// ═══════════════════════════════════════════
// 표 변환
// ═══════════════════════════════════════════

/// 도형/그림 → ShapeObject 변환 (텍스트박스, 그림 등)
/// 기존 viewer와 동일하게 children과 paragraphs를 모두 순회하여 콘텐츠 수집
/// 각 도형을 별도 RunContent로 반환 (기존 viewer처럼 paragraph 내 개별 parts로 처리)
fn convert_shape_object(
    common: ShapeCommon,
    children: &[ParagraphRecord],
    paragraphs: &[bodytext::Paragraph],
) -> Vec<RunContent> {
    let mut results: Vec<RunContent> = Vec::new();
    let treat_as_char = common.position.treat_as_char;

    // 기존 viewer 순서: ShapeComponent(Picture) → 직접 Picture → ListHeader → ShapeComponent(ListHeader)
    // 2-pass: 먼저 모든 Picture를 수집, 그 다음 모든 ListHeader(텍스트) 수집

    // Pass 1: Picture 수집 (직접 + ShapeComponent 내부)
    for child in children {
        match child {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bin_id = shape_component_picture.picture_info.bindata_id;
                let picture = Picture {
                    common: common.clone(),
                    img: hwp_model::resources::ImageRef {
                        binary_item_id: format!("BIN{:04X}", bin_id),
                        ..Default::default()
                    },
                    ..Default::default()
                };
                results.push(RunContent::Object(ShapeObject::Picture(Box::new(picture))));
            }
            ParagraphRecord::ShapeComponent {
                children: sc_children,
                ..
            } => {
                for sc_child in sc_children {
                    if let ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } = sc_child
                    {
                        let bin_id = shape_component_picture.picture_info.bindata_id;
                        let picture = Picture {
                            common: common.clone(),
                            img: hwp_model::resources::ImageRef {
                                binary_item_id: format!("BIN{:04X}", bin_id),
                                ..Default::default()
                            },
                            ..Default::default()
                        };
                        results.push(RunContent::Object(ShapeObject::Picture(Box::new(picture))));
                    }
                }
            }
            _ => {}
        }
    }

    // Pass 2: ListHeader(텍스트박스/캡션) 수집 (직접 + ShapeComponent 내부)
    // treat_as_char=true 도형: ListHeader를 건너뜀
    // (기존 viewer에서 글자처럼 취급 도형은 본문에 인라인 삽입됨)
    if treat_as_char {
        // 글자처럼 취급 도형: ListHeader와 ctrl_paragraphs 모두 건너뜀
        // (기존 viewer: 본문에 인라인으로 삽입 — Picture만 유지)
        return results;
    }

    for child in children {
        match child {
            ParagraphRecord::ListHeader {
                paragraphs: lh_paras,
                ..
            } => {
                let paras = convert_hwp_paragraphs(lh_paras);
                if !paras.is_empty() {
                    let rect = RectObject {
                        common: common.clone(),
                        draw_text: Some(SubList {
                            paragraphs: paras,
                            ..Default::default()
                        }),
                        ..Default::default()
                    };
                    results.push(RunContent::Object(ShapeObject::Rectangle(Box::new(rect))));
                }
            }
            ParagraphRecord::ShapeComponent {
                children: sc_children,
                ..
            } => {
                for sc_child in sc_children {
                    if let ParagraphRecord::ListHeader {
                        paragraphs: lh_paras,
                        ..
                    } = sc_child
                    {
                        let paras = convert_hwp_paragraphs(lh_paras);
                        if !paras.is_empty() {
                            let rect = RectObject {
                                common: common.clone(),
                                draw_text: Some(SubList {
                                    paragraphs: paras,
                                    ..Default::default()
                                }),
                                ..Default::default()
                            };
                            results
                                .push(RunContent::Object(ShapeObject::Rectangle(Box::new(rect))));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // ctrl_paragraphs 처리
    if !paragraphs.is_empty() {
        let paras = convert_hwp_paragraphs(paragraphs);
        if !paras.is_empty() {
            let rect = RectObject {
                common: common.clone(),
                draw_text: Some(SubList {
                    paragraphs: paras,
                    ..Default::default()
                }),
                ..Default::default()
            };
            results.push(RunContent::Object(ShapeObject::Rectangle(Box::new(rect))));
        }
    }

    results
}

/// ShapeComponent children에서 ListHeader paragraphs 찾기
fn find_list_header_in_shape_components(records: &[ParagraphRecord]) -> &[bodytext::Paragraph] {
    for record in records {
        if let ParagraphRecord::ShapeComponent {
            children: sc_children,
            ..
        } = record
        {
            let found = find_list_header_paragraphs(sc_children);
            if !found.is_empty() {
                return found;
            }
        }
    }
    &[]
}

fn convert_table_object(
    common: ShapeCommon,
    children: &[ParagraphRecord],
    ctrl_paragraphs: &[bodytext::Paragraph],
) -> Vec<RunContent> {
    // children에서 Table 레코드 위치 찾기
    let table_index = children
        .iter()
        .position(|c| matches!(c, ParagraphRecord::Table { .. }));
    let table_data = match table_index {
        Some(idx) => {
            if let ParagraphRecord::Table { table } = &children[idx] {
                table
            } else {
                return vec![];
            }
        }
        None => return vec![],
    };

    let mut results: Vec<RunContent> = Vec::new();

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
        common: common.clone(),
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

    results.push(RunContent::Object(ShapeObject::Table(Box::new(table))));

    // ctrl_paragraphs 중 표 셀에 속하지 않는 문단 = 캡션
    // 기존 viewer: instance_id로 표 셀 내 문단을 판별하여 건너뜀
    if !ctrl_paragraphs.is_empty() {
        let mut cell_instance_ids: std::collections::HashSet<u32> =
            std::collections::HashSet::new();
        for cell in &table_data.cells {
            for para in &cell.paragraphs {
                if para.para_header.instance_id != 0 {
                    cell_instance_ids.insert(para.para_header.instance_id);
                }
            }
        }

        for para in ctrl_paragraphs {
            // instance_id가 있고 표 셀에 속하면 건너뜀
            let is_cell_para = if para.para_header.instance_id != 0 {
                cell_instance_ids.contains(&para.para_header.instance_id)
            } else {
                // instance_id == 0이면 텍스트로 비교
                let para_text: String = para
                    .records
                    .iter()
                    .filter_map(|r| {
                        if let ParagraphRecord::ParaText { text, .. } = r {
                            Some(text.as_str())
                        } else {
                            None
                        }
                    })
                    .collect();
                let trimmed = para_text.trim();
                // 표 셀에 동일한 텍스트가 있으면 셀 내부로 판단
                if trimmed.is_empty() {
                    true // 빈 문단은 건너뜀
                } else {
                    table_data.cells.iter().any(|cell| {
                        cell.paragraphs.iter().any(|cp| {
                            cp.records.iter().any(|r| {
                                if let ParagraphRecord::ParaText { text, .. } = r {
                                    text.trim() == trimmed
                                } else {
                                    false
                                }
                            })
                        })
                    })
                }
            };

            if !is_cell_para {
                // 빈 문단은 건너뜀
                let has_text = para.records.iter().any(|r| {
                    if let ParagraphRecord::ParaText { text, .. } = r {
                        !text.trim().is_empty()
                    } else {
                        false
                    }
                });
                if !has_text {
                    continue;
                }
                let paras = convert_hwp_paragraphs(std::slice::from_ref(para));
                if !paras.is_empty() {
                    let mut rect = RectObject {
                        common: common.clone(),
                        draw_text: Some(SubList {
                            paragraphs: paras,
                            ..Default::default()
                        }),
                        ..Default::default()
                    };
                    rect.is_caption = true; // TABLE ctrl_paragraphs의 캡션
                    results.push(RunContent::Object(ShapeObject::Rectangle(Box::new(rect))));
                }
            }
        }
    }

    results
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
