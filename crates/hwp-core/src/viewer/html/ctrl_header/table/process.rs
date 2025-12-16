use crate::document::bodytext::ctrl_header::{CaptionAlign, CtrlHeaderData};
use crate::document::bodytext::{
    ControlChar, ControlCharPosition, LineSegmentInfo, Paragraph, ParagraphRecord,
};
use crate::document::CtrlHeader;

use crate::viewer::html::ctrl_header::CtrlHeaderResult;
use crate::viewer::html::line_segment::TableInfo;

use super::render::{CaptionInfo, CaptionText};

/// 캡션 텍스트를 구조적으로 분해 / Parse caption text into structured components
///
/// 실제 HWP 데이터 구조:
/// - 텍스트: "표  오른쪽"
/// - AUTO_NUMBER 컨트롤 문자가 position 2에 있음
/// - 따라서: label="표", number는 AUTO_NUMBER에서 생성, body="오른쪽"
///
/// Actual HWP data structure:
/// - Text: "표  오른쪽"
/// - AUTO_NUMBER control character at position 2
/// - Therefore: label="표", number generated from AUTO_NUMBER, body="오른쪽"
fn parse_caption_text(
    text: &str,
    control_char_positions: &[ControlCharPosition],
    table_number: Option<u32>,
) -> CaptionText {
    // AUTO_NUMBER 컨트롤 문자 위치 찾기 / Find AUTO_NUMBER control character position
    let auto_number_pos = control_char_positions
        .iter()
        .find(|cp| cp.code == ControlChar::AUTO_NUMBER)
        .map(|cp| cp.position);

    if let Some(auto_pos) = auto_number_pos {
        // AUTO_NUMBER가 있으면 그 위치를 기준으로 분리 / If AUTO_NUMBER exists, split based on its position
        let label = text
            .chars()
            .take(auto_pos)
            .collect::<String>()
            .trim()
            .to_string();
        let body = text
            .chars()
            .skip(auto_pos + 1) // AUTO_NUMBER 컨트롤 문자 건너뛰기 / Skip AUTO_NUMBER control character
            .collect::<String>()
            .trim()
            .to_string();

        CaptionText {
            label: if label.is_empty() {
                "표".to_string()
            } else {
                label
            },
            number: table_number.map(|n| n.to_string()).unwrap_or_default(),
            body,
        }
    } else {
        // AUTO_NUMBER가 없으면 기존 방식으로 파싱 / If no AUTO_NUMBER, parse using existing method
        let trimmed = text.trim();

        // "표"로 시작하는지 확인 / Check if starts with "표"
        if trimmed.starts_with("표") {
            let after_label = &trimmed[3..]; // "표" + 공백 제거 / Remove "표" and space

            // 숫자 추출 / Extract number
            let number_end = after_label
                .char_indices()
                .find(|(_, c)| !c.is_ascii_digit() && !c.is_whitespace())
                .map(|(i, _)| i)
                .unwrap_or(after_label.len());

            let number = if number_end > 0 {
                after_label[..number_end].trim().to_string()
            } else {
                table_number.map(|n| n.to_string()).unwrap_or_default()
            };

            // 본문 추출 / Extract body
            let body = if number_end < after_label.len() {
                after_label[number_end..].trim().to_string()
            } else {
                String::new()
            };

            CaptionText {
                label: "표".to_string(),
                number,
                body,
            }
        } else {
            // "표"로 시작하지 않으면 전체를 본문으로 처리 / If doesn't start with "표", treat entire text as body
            CaptionText {
                label: String::new(),
                number: table_number.map(|n| n.to_string()).unwrap_or_default(),
                body: trimmed.to_string(),
            }
        }
    }
}

/// 테이블 컨트롤 처리 / Process table control
///
/// CtrlHeader에서 테이블을 추출하고 캡션을 수집합니다.
/// Extracts tables from CtrlHeader and collects captions.
pub fn process_table<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    // CtrlHeader 객체를 직접 전달 / Pass CtrlHeader object directly
    let (ctrl_header, caption_info) = match &header.data {
        CtrlHeaderData::ObjectCommon { caption, .. } => {
            let info = caption.as_ref().map(|cap| {
                CaptionInfo {
                    align: cap.align, // 캡션 정렬 방향 / Caption alignment direction
                    is_above: matches!(cap.align, CaptionAlign::Top),
                    gap: Some(cap.gap), // HWPUNIT16은 i16이므로 직접 사용 / HWPUNIT16 is i16, so use directly
                    height_mm: None, // 캡션 높이는 별도로 계산 필요 / Caption height needs separate calculation
                    width: Some(cap.width.into()), // 캡션 폭 / Caption width
                    include_margin: Some(cap.include_margin), // 마진 포함 여부 / Whether to include margin
                    last_width: Some(cap.last_width.into()), // 텍스트 최대 길이 / Maximum text length
                    vertical_align: cap.vertical_align, // 캡션 수직 정렬 전달 / Pass caption vertical alignment
                }
            });
            (Some(&header.data), info)
        }
        _ => (None, None),
    };

    // 캡션 텍스트 추출: paragraphs 필드에서 모든 캡션 수집 / Extract caption text: collect all captions from paragraphs field
    let mut caption_texts: Vec<CaptionText> = Vec::new();
    let mut caption_char_shape_ids: Vec<Option<usize>> = Vec::new();
    let mut caption_para_shape_ids: Vec<Option<usize>> = Vec::new();
    let mut caption_line_segments: Vec<Option<&LineSegmentInfo>> = Vec::new();

    // paragraphs 필드에서 모든 캡션 수집 / Collect all captions from paragraphs field
    for para in paragraphs {
        let mut caption_text_opt: Option<String> = None;
        let mut caption_control_chars: Vec<ControlCharPosition> = Vec::new();
        let mut caption_char_shape_id_opt: Option<usize> = None;
        let mut caption_line_segment_opt: Option<&LineSegmentInfo> = None;
        // para_shape_id 추출 / Extract para_shape_id
        let para_shape_id = para.para_header.para_shape_id as usize;

        for record in &para.records {
            if let ParagraphRecord::ParaText {
                text,
                control_char_positions,
                ..
            } = record
            {
                if !text.trim().is_empty() {
                    caption_text_opt = Some(text.clone());
                    caption_control_chars = control_char_positions.clone();
                }
            } else if let ParagraphRecord::ParaCharShape { shapes } = record {
                // 첫 번째 char_shape_id 찾기 / Find first char_shape_id
                if let Some(shape_info) = shapes.first() {
                    caption_char_shape_id_opt = Some(shape_info.shape_id as usize);
                }
            } else if let ParagraphRecord::ParaLineSeg { segments } = record {
                // 첫 번째 LineSegmentInfo 찾기 / Find first LineSegmentInfo
                if let Some(segment) = segments.first() {
                    caption_line_segment_opt = Some(segment);
                }
            }
        }

        if let Some(text) = caption_text_opt {
            // 캡션 텍스트를 구조적으로 분해 (control_char_positions 포함) / Parse caption text into structured components (including control_char_positions)
            let parsed = parse_caption_text(&text, &caption_control_chars, None);
            caption_texts.push(parsed);
            caption_char_shape_ids.push(caption_char_shape_id_opt);
            caption_para_shape_ids.push(Some(para_shape_id));
            caption_line_segments.push(caption_line_segment_opt);
        }
    }

    // 먼저 children을 순회하여 필요한 모든 캡션을 caption_texts에 추가
    // First, iterate through children to add all necessary captions to caption_texts
    let mut caption_text: Option<CaptionText> = None;
    let mut found_table = false;

    for child in children.iter() {
        if let ParagraphRecord::Table { .. } = child {
            found_table = true;
            // caption_text가 있으면 caption_texts에 추가 / If caption_text exists, add to caption_texts
            if let Some(caption) = caption_text.take() {
                caption_texts.push(caption);
            }
        } else if found_table {
            // 테이블 다음에 오는 문단에서 텍스트 추출 / Extract text from paragraph after table
            if let ParagraphRecord::ParaText {
                text,
                control_char_positions,
                ..
            } = child
            {
                caption_text = Some(parse_caption_text(text, control_char_positions, None));
                break;
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText {
                            text,
                            control_char_positions,
                            ..
                        } = record
                        {
                            caption_text =
                                Some(parse_caption_text(text, control_char_positions, None));
                            break;
                        }
                    }
                    if caption_text.is_some() {
                        break;
                    }
                }
                if caption_text.is_some() {
                    break;
                }
            }
        } else {
            // 테이블 이전에 오는 문단에서 텍스트 추출 (첫 번째 테이블의 캡션) / Extract text from paragraph before table (caption for first table)
            if let ParagraphRecord::ParaText {
                text,
                control_char_positions,
                ..
            } = child
            {
                caption_text = Some(parse_caption_text(text, control_char_positions, None));
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText {
                            text,
                            control_char_positions,
                            ..
                        } = record
                        {
                            caption_text =
                                Some(parse_caption_text(text, control_char_positions, None));
                            break;
                        }
                    }
                    if caption_text.is_some() {
                        break;
                    }
                }
            }
        }
    }

    // 마지막 caption_text도 추가 / Add last caption_text as well
    if let Some(caption) = caption_text {
        caption_texts.push(caption);
    }

    // 이제 children을 다시 순회하여 테이블에 캡션 할당
    // Now iterate through children again to assign captions to tables
    let mut caption_index = 0;

    for child in children.iter() {
        if let ParagraphRecord::Table { table } = child {
            // 캡션 char_shape_id 찾기 / Find caption char_shape_id
            let current_caption_char_shape_id = if caption_index < caption_char_shape_ids.len() {
                caption_char_shape_ids[caption_index]
            } else {
                None
            };

            // 캡션 para_shape_id 찾기 / Find caption para_shape_id
            let current_caption_para_shape_id = if caption_index < caption_para_shape_ids.len() {
                caption_para_shape_ids[caption_index]
            } else {
                None
            };

            // 캡션 LineSegmentInfo 찾기 / Find caption LineSegmentInfo
            let current_caption_line_segment = if caption_index < caption_line_segments.len() {
                caption_line_segments[caption_index]
            } else {
                None
            };

            // 캡션 텍스트 가져오기 / Get caption text
            let current_caption = if caption_index < caption_texts.len() {
                Some(caption_texts[caption_index].clone())
            } else {
                None
            };

            caption_index += 1;
            result.tables.push(TableInfo {
                table,
                ctrl_header,
                caption_text: current_caption,
                caption_info,
                caption_char_shape_id: current_caption_char_shape_id,
                caption_para_shape_id: current_caption_para_shape_id,
                caption_line_segment: current_caption_line_segment,
            });
        }
    }

    result
}
