//! BodyText → hwp_model Sections 변환
//!
//! HWP 5.0의 평면 레코드(ParagraphRecord) 구조를
//! hwp_model의 트리 구조(Run > RunContent)로 조립한다.

use crate::document::bodytext::{self, BodyText, ParaTextRun, ParagraphRecord};
use crate::document::docinfo::DocInfo;
use hwp_model::hints::LineSegmentInfo;
use hwp_model::paragraph::*;
use hwp_model::section::Section;
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
    let mut _text_content = String::new();
    let mut text_runs: Vec<ParaTextRun> = Vec::new();
    let mut char_shapes: Vec<bodytext::CharShapeInfo> = Vec::new();
    let mut line_segs: Vec<bodytext::LineSegmentInfo> = Vec::new();
    let mut ctrl_headers: Vec<(usize, &ParagraphRecord)> = Vec::new();

    for (idx, record) in para.records.iter().enumerate() {
        match record {
            ParagraphRecord::ParaText { text, runs, .. } => {
                _text_content = text.clone();
                text_runs = runs.clone();
            }
            ParagraphRecord::ParaCharShape { shapes } => {
                char_shapes = shapes.clone();
            }
            ParagraphRecord::ParaLineSeg { segments } => {
                line_segs = segments.clone();
            }
            ParagraphRecord::CtrlHeader { .. } => {
                ctrl_headers.push((idx, record));
            }
            _ => {}
        }
    }

    // ParaText의 runs + ParaCharShape → Run[] 조립
    let runs = assemble_runs(&text_runs, &char_shapes, &ctrl_headers, para);

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

/// ParaTextRun + ParaCharShape → Run[] 조립
///
/// HWP의 텍스트는:
/// - ParaTextRun: Text("문자열") | Control(position, code, ...) 시퀀스
/// - ParaCharShape: [{position, shape_id}] (위치별 글자 모양 변경점)
///
/// 이것을 HWPX 스타일의 Run(char_shape_id, contents[]) 트리로 조립한다.
fn assemble_runs(
    text_runs: &[ParaTextRun],
    char_shapes: &[bodytext::CharShapeInfo],
    ctrl_headers: &[(usize, &ParagraphRecord)],
    para: &bodytext::Paragraph,
) -> Vec<Run> {
    if text_runs.is_empty() && char_shapes.is_empty() {
        return Vec::new();
    }

    // 텍스트가 없으면 빈 run
    if text_runs.is_empty() {
        let shape_id = char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0);
        return vec![Run {
            char_shape_id: shape_id as u16,
            contents: Vec::new(),
        }];
    }

    // 단순 케이스: CharShape가 하나뿐이면 전체를 하나의 Run으로
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
                    code, display_text, ..
                } => {
                    if let Some(ctrl) =
                        convert_control_char(*code, display_text, ctrl_headers, para)
                    {
                        run.contents.push(ctrl);
                    }
                }
            }
        }

        return vec![run];
    }

    // 일반 케이스: CharShape 변경점에 따라 Run 분할
    // 현재 위치를 추적하면서 CharShape가 바뀌면 새 Run 시작
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
                // 텍스트를 CharShape 변경점에서 분할
                let chars: Vec<char> = text.chars().collect();
                let mut text_start = 0;

                for (ci, _ch) in chars.iter().enumerate() {
                    let abs_pos = current_pos + ci as u32;

                    // 다음 CharShape 변경점 확인
                    if shape_idx + 1 < char_shapes.len()
                        && abs_pos >= char_shapes[shape_idx + 1].position
                    {
                        // 이전 텍스트를 현재 Run에 추가
                        if ci > text_start {
                            let chunk: String = chars[text_start..ci].iter().collect();
                            current_run.contents.push(RunContent::Text(TextContent {
                                char_shape_id: None,
                                elements: vec![TextElement::Text(chunk)],
                            }));
                        }

                        // 새 Run 시작
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

                // 남은 텍스트
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
                if let Some(ctrl) = convert_control_char(*code, display_text, ctrl_headers, para) {
                    current_run.contents.push(ctrl);
                }
                current_pos += *size_wchars as u32;
            }
        }
    }

    // 마지막 Run 추가
    if !current_run.contents.is_empty() {
        runs.push(current_run);
    }

    // Run이 비어있으면 최소 하나
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

/// 제어 문자 코드 → RunContent 변환
fn convert_control_char(
    code: u8,
    display_text: &Option<String>,
    _ctrl_headers: &[(usize, &ParagraphRecord)],
    _para: &bodytext::Paragraph,
) -> Option<RunContent> {
    match code {
        0x0A => Some(RunContent::Text(TextContent {
            char_shape_id: None,
            elements: vec![TextElement::LineBreak],
        })),
        0x09 => Some(RunContent::Text(TextContent {
            char_shape_id: None,
            elements: vec![TextElement::Tab {
                width: 0,
                leader: LineType2::None,
                tab_type: TabType::Left,
            }],
        })),
        0x18 => Some(RunContent::Text(TextContent {
            char_shape_id: None,
            elements: vec![TextElement::Hyphen],
        })),
        0x1E => Some(RunContent::Text(TextContent {
            char_shape_id: None,
            elements: vec![TextElement::NbSpace],
        })),
        0x1F => Some(RunContent::Text(TextContent {
            char_shape_id: None,
            elements: vec![TextElement::FwSpace],
        })),
        // 자동번호 등의 표시 텍스트
        0x12 => display_text.as_ref().map(|dt| {
            RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Text(dt.clone())],
            })
        }),
        // 표/도형 등 확장 제어 문자 — CtrlHeader에서 변환해야 하지만
        // 지금은 display_text가 있으면 텍스트로 표시
        0x0B => display_text.as_ref().map(|dt| {
            RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Text(dt.clone())],
            })
        }),
        _ => None,
    }
}
