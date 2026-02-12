/// ParaText conversion to Markdown
/// ParaText를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, PARA_TEXT (HWPTAG_BEGIN + 51)
/// Spec mapping: Table 57 - BodyText data records, PARA_TEXT (HWPTAG_BEGIN + 51)
use crate::document::bodytext::{CharShapeInfo, ControlChar, ControlCharPosition};
use crate::document::CharShape;

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

/// CharShape 정보를 사용하여 텍스트를 구간별로 나누고 마크다운 스타일을 적용
/// Divide text into segments by CharShape information and apply markdown styles
fn convert_text_with_char_shapes<'a>(
    text: &str,
    control_positions: &[ControlCharPosition],
    char_shapes: &[CharShapeInfo],
    get_char_shape: &'a dyn Fn(u32) -> Option<&'a CharShape>,
) -> Option<String> {
    if text.trim().is_empty() {
        return None;
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();

    // CharShape 정보를 position 기준으로 정렬 / Sort CharShape info by position
    let mut sorted_shapes: Vec<_> = char_shapes.iter().collect();
    sorted_shapes.sort_by_key(|shape| shape.position);

    let mut result = String::new();
    let mut segments: Vec<(usize, usize, Option<&CharShape>)> = Vec::new();

    // 구간 정의 / Define segments
    let mut positions = vec![0];
    for shape_info in &sorted_shapes {
        let pos = shape_info.position as usize;
        if pos <= text_len {
            positions.push(pos);
        }
    }
    positions.push(text_len);
    positions.sort();
    positions.dedup();

    // 각 구간에 대한 CharShape 찾기 / Find CharShape for each segment
    for i in 0..positions.len() - 1 {
        let start = positions[i];
        let end = positions[i + 1];

        // 이 구간에 적용할 CharShape 찾기 / Find CharShape to apply to this segment
        // start 위치에서 시작하는 가장 가까운 CharShape를 찾음 / Find the closest CharShape starting at start position
        let char_shape = sorted_shapes
            .iter()
            .find(|shape| (shape.position as usize) == start)
            .or_else(|| {
                // 정확히 일치하는 것이 없으면, start보다 작은 position 중 가장 큰 것을 찾음
                // If no exact match, find the largest position less than start
                sorted_shapes
                    .iter()
                    .rev()
                    .find(|shape| (shape.position as usize) < start)
            })
            .and_then(|shape| get_char_shape(shape.shape_id));

        segments.push((start, end, char_shape));
    }

    // PARA_BREAK/LINE_BREAK 위치 수집 / Collect PARA_BREAK/LINE_BREAK positions
    let mut break_positions: Vec<usize> = control_positions
        .iter()
        .filter(|pos| pos.code == ControlChar::PARA_BREAK || pos.code == ControlChar::LINE_BREAK)
        .map(|pos| usize::from(pos.position))
        .collect();
    break_positions.sort();

    // 각 구간에 스타일 적용하여 결과 생성 / Generate result by applying styles to each segment
    for (start, end, char_shape) in &segments {
        if *start < *end && *end <= text_len {
            // 이 구간 내에 PARA_BREAK/LINE_BREAK가 있는지 확인 / Check if there are breaks in this segment
            let mut segment_breaks: Vec<usize> = break_positions
                .iter()
                .filter(|&&break_pos| break_pos >= *start && break_pos < *end)
                .copied()
                .collect();

            if segment_breaks.is_empty() {
                // 구간 내에 break가 없으면 전체 구간에 스타일 적용 / No breaks in segment, apply style to entire segment
                let segment_text: String = text_chars[*start..*end].iter().collect();
                if !segment_text.trim().is_empty() {
                    if let Some(shape) = char_shape {
                        let styled = apply_markdown_styles(
                            &segment_text,
                            shape.attributes.bold,
                            shape.attributes.italic,
                            shape.attributes.strikethrough != 0,
                        );
                        result.push_str(&styled);
                    } else {
                        result.push_str(&segment_text);
                    }
                }
            } else {
                // 구간 내에 break가 있으면 break 위치로 나누어 처리 / Split segment by breaks
                segment_breaks.insert(0, *start);
                segment_breaks.push(*end);

                for i in 0..segment_breaks.len() - 1 {
                    let seg_start = segment_breaks[i];
                    let seg_end = segment_breaks[i + 1];

                    if seg_start < seg_end && seg_end <= text_len {
                        let segment_text: String = text_chars[seg_start..seg_end].iter().collect();
                        if !segment_text.trim().is_empty() {
                            if let Some(shape) = char_shape {
                                let styled = apply_markdown_styles(
                                    &segment_text,
                                    shape.attributes.bold,
                                    shape.attributes.italic,
                                    shape.attributes.strikethrough != 0,
                                );
                                result.push_str(&styled);
                            } else {
                                result.push_str(&segment_text);
                            }
                        }
                    }

                    // break 다음이면 마크다운 개행 추가 / Add markdown line break after break
                    if i < segment_breaks.len() - 2 {
                        result.push_str("  \n");
                    }
                }
            }
        }
    }

    let trimmed_result = result.trim();
    if !trimmed_result.is_empty() {
        Some(trimmed_result.to_string())
    } else {
        None
    }
}

/// 텍스트에 마크다운 스타일을 적용합니다. / Apply markdown styles to text.
///
/// # Arguments / 매개변수
/// * `text` - 원본 텍스트 / Original text
/// * `bold` - 진하게 여부 / Bold
/// * `italic` - 기울임 여부 / Italic
/// * `strikethrough` - 가운뎃줄 여부 / Strikethrough
///
/// # Returns / 반환값
/// 마크다운 스타일이 적용된 텍스트 / Text with markdown styles applied
fn apply_markdown_styles(text: &str, bold: bool, italic: bool, strikethrough: bool) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut result = String::from(text);

    // 마크다운 스타일 적용 순서: strikethrough (가장 바깥) -> bold -> italic (가장 안쪽)
    // Markdown style application order: strikethrough (outermost) -> bold -> italic (innermost)

    // 기울임 적용 (가장 안쪽) / Apply italic (innermost)
    if italic {
        result = format!("*{}*", result);
    }

    // 진하게 적용 / Apply bold
    if bold {
        result = format!("**{}**", result);
    }

    // 가운뎃줄 적용 (가장 바깥쪽) / Apply strikethrough (outermost)
    if strikethrough {
        result = format!("~~{}~~", result);
    }

    result
}

pub fn convert_para_text_to_markdown(
    text: &str,
    control_positions: &[ControlCharPosition],
) -> Option<String> {
    convert_para_text_to_markdown_with_char_shapes(text, control_positions, &[], None)
}

/// CharShape 정보를 사용하여 ParaText를 마크다운으로 변환
/// Convert ParaText to markdown using CharShape information
///
/// # Arguments / 매개변수
/// * `text` - 텍스트 내용 / Text content
/// * `control_positions` - 제어 문자 위치 정보 / Control character positions
/// * `char_shapes` - 글자 모양 정보 리스트 / Character shape information list
/// * `get_char_shape` - shape_id로 CharShape를 가져오는 함수 / Function to get CharShape by shape_id
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub fn convert_para_text_to_markdown_with_char_shapes<'a>(
    text: &str,
    control_positions: &[ControlCharPosition],
    char_shapes: &[CharShapeInfo],
    get_char_shape: Option<&'a dyn Fn(u32) -> Option<&'a CharShape>>,
) -> Option<String> {
    // CharShape 정보가 있으면 텍스트를 구간별로 나누어 스타일 적용 / If CharShape info exists, divide text into segments and apply styles
    if !char_shapes.is_empty() && get_char_shape.is_some() {
        return convert_text_with_char_shapes(
            text,
            control_positions,
            char_shapes,
            get_char_shape.unwrap(),
        );
    }

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
