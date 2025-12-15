use crate::document::bodytext::ctrl_header::{CaptionAlign, CtrlHeaderData};
use crate::document::bodytext::{Paragraph, ParagraphRecord};
use crate::document::CtrlHeader;

use crate::viewer::html::ctrl_header::CtrlHeaderResult;

use super::render::CaptionInfo;

/// 테이블 컨트롤 처리 / Process table control
///
/// CtrlHeader에서 테이블을 추출하고 캡션을 수집합니다.
/// Extracts tables from CtrlHeader and collects captions.
pub fn process_table<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &[Paragraph],
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
                }
            });
            (Some(&header.data), info)
        }
        _ => (None, None),
    };

    // 캡션 텍스트 추출: paragraphs 필드에서 모든 캡션 수집 / Extract caption text: collect all captions from paragraphs field
    let mut caption_texts: Vec<String> = Vec::new();
    let mut caption_char_shape_ids: Vec<Option<usize>> = Vec::new();
    let mut caption_para_shape_ids: Vec<Option<usize>> = Vec::new();

    // paragraphs 필드에서 모든 캡션 수집 / Collect all captions from paragraphs field
    for para in paragraphs {
        let mut caption_text_opt: Option<String> = None;
        let mut caption_char_shape_id_opt: Option<usize> = None;
        // para_shape_id 추출 / Extract para_shape_id
        let para_shape_id = para.para_header.para_shape_id as usize;

        for record in &para.records {
            if let ParagraphRecord::ParaText { text, .. } = record {
                if !text.trim().is_empty() {
                    caption_text_opt = Some(text.clone());
                }
            } else if let ParagraphRecord::ParaCharShape { shapes } = record {
                // 첫 번째 char_shape_id 찾기 / Find first char_shape_id
                if let Some(shape_info) = shapes.first() {
                    caption_char_shape_id_opt = Some(shape_info.shape_id as usize);
                }
            }
        }

        if let Some(text) = caption_text_opt {
            caption_texts.push(text);
            caption_char_shape_ids.push(caption_char_shape_id_opt);
            caption_para_shape_ids.push(Some(para_shape_id));
        }
    }

    let mut caption_index = 0;
    let mut caption_text: Option<String> = None;
    let mut found_table = false;

    for child in children.iter() {
        if let ParagraphRecord::Table { table } = child {
            found_table = true;
            // paragraphs 필드에서 캡션 사용 (순서대로) / Use caption from paragraphs field (in order)
            let current_caption = if caption_index < caption_texts.len() {
                Some(caption_texts[caption_index].clone())
            } else {
                caption_text.clone()
            };

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

            caption_index += 1;
            result.tables.push((
                table,
                ctrl_header,
                current_caption,
                caption_info,
                current_caption_char_shape_id,
                current_caption_para_shape_id,
            ));
            caption_text = None; // 다음 테이블을 위해 초기화 / Reset for next table
        } else if found_table {
            // 테이블 다음에 오는 문단에서 텍스트 추출 / Extract text from paragraph after table
            if let ParagraphRecord::ParaText { text, .. } = child {
                caption_text = Some(text.clone());
                break;
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText { text, .. } = record {
                            caption_text = Some(text.clone());
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
            if let ParagraphRecord::ParaText { text, .. } = child {
                caption_text = Some(text.clone());
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText { text, .. } = record {
                            caption_text = Some(text.clone());
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

    result
}
