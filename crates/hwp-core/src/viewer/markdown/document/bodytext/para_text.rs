/// ParaText conversion to Markdown
/// ParaText를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, PARA_TEXT (HWPTAG_BEGIN + 51)
/// Spec mapping: Table 57 - BodyText data records, PARA_TEXT (HWPTAG_BEGIN + 51)
use crate::document::bodytext::{ControlChar, ControlCharPosition};

/// 의미 있는 텍스트인지 확인합니다. / Check if text is meaningful.
///
/// 공백만 있는 텍스트는 의미 없다고 판단합니다.
/// Text containing only whitespace is considered meaningless.
///
/// # Arguments / 매개변수
/// * `text` - 제어 문자가 이미 제거된 텍스트 / Text with control characters already removed
/// * `control_positions` - 제어 문자 위치 정보 (현재는 사용되지 않음) / Control character positions (currently unused)
///
/// # Returns / 반환값
/// 의미 있는 텍스트이면 `true`, 그렇지 않으면 `false` / `true` if meaningful, `false` otherwise
///
/// # Note
/// 제어 문자는 이미 파싱 단계에서 text에서 제거되었으므로,
/// 텍스트가 비어있지 않은지만 확인합니다.
/// Control characters are already removed from text during parsing,
/// so we only check if text is not empty.
pub(crate) fn is_meaningful_text(text: &str, _control_positions: &[ControlCharPosition]) -> bool {
    !text.trim().is_empty()
}

/// Convert ParaText to markdown
/// ParaText를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `text` - 텍스트 내용 / Text content
/// * `control_positions` - 제어 문자 위치 정보 / Control character positions
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
/// Convert character index to byte index in UTF-8 string
/// UTF-8 문자열에서 문자 인덱스를 바이트 인덱스로 변환
fn char_index_to_byte_index(text: &str, char_idx: usize) -> Option<usize> {
    text.char_indices()
        .nth(char_idx)
        .map(|(byte_idx, _)| byte_idx)
}

pub fn convert_para_text_to_markdown(
    text: &str,
    control_positions: &[ControlCharPosition],
) -> Option<String> {
    // PARA_BREAK나 LINE_BREAK가 있는지 확인 / Check for PARA_BREAK or LINE_BREAK
    let has_breaks = control_positions
        .iter()
        .any(|pos| pos.code == ControlChar::PARA_BREAK || pos.code == ControlChar::LINE_BREAK);

    if !has_breaks {
        // 제어 문자가 없으면 기존 로직 사용 / Use existing logic if no control characters
        if is_meaningful_text(text, control_positions) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        return None;
    }

    // PARA_BREAK/LINE_BREAK가 있는 경우 처리 / Process when PARA_BREAK/LINE_BREAK exists
    // 파서에서 \n을 제거했으므로, control_positions의 정보만 사용하여 마크다운 개행으로 변환
    // Parser removed \n, so only use control_positions info to convert to markdown line breaks
    let mut result = String::new();
    let mut last_char_pos = 0;

    // control_positions를 정렬하여 순서대로 처리 / Sort control_positions to process in order
    let mut sorted_positions: Vec<_> = control_positions.iter().collect();
    sorted_positions.sort_by_key(|pos| pos.position);

    for pos in sorted_positions {
        // PARA_BREAK나 LINE_BREAK만 처리 / Only process PARA_BREAK or LINE_BREAK
        if pos.code != ControlChar::PARA_BREAK && pos.code != ControlChar::LINE_BREAK {
            continue;
        }

        // 문자 인덱스를 바이트 인덱스로 변환 / Convert character index to byte index
        let byte_idx = match char_index_to_byte_index(text, pos.position) {
            Some(idx) => idx,
            None => continue, // 유효하지 않은 위치는 건너뜀 / Skip invalid position
        };

        let last_byte_idx = char_index_to_byte_index(text, last_char_pos).unwrap_or(0);

        // 제어 문자 이전의 텍스트 추가 (파서에서 \n이 제거되었으므로 그대로 사용)
        // Add text before control character (parser removed \n, so use as-is)
        if byte_idx > last_byte_idx && byte_idx <= text.len() {
            let text_part = &text[last_byte_idx..byte_idx];
            let trimmed = text_part.trim();
            if !trimmed.is_empty() {
                result.push_str(trimmed);
            }
        }

        // PARA_BREAK나 LINE_BREAK를 마크다운 개행(스페이스 2개 + 개행)으로 변환
        // Convert PARA_BREAK or LINE_BREAK to markdown line break (two spaces + newline)
        result.push_str("  \n");

        // 제어 문자 다음 위치 / Position after control character
        last_char_pos = pos.position + 1;
    }

    // 마지막 부분의 텍스트 추가 / Add remaining text
    let last_byte_idx = char_index_to_byte_index(text, last_char_pos).unwrap_or(0);
    if last_byte_idx < text.len() {
        let text_part = &text[last_byte_idx..];
        let trimmed = text_part.trim();
        if !trimmed.is_empty() {
            result.push_str(trimmed);
        }
    }

    // trim() 대신 trim_start()만 사용하여 줄 끝 공백(마크다운 개행용)은 유지
    // Use trim_start() instead of trim() to preserve trailing spaces (for markdown line breaks)
    let trimmed_result = result.trim_start();
    if !trimmed_result.is_empty() {
        Some(trimmed_result.to_string())
    } else {
        None
    }
}
