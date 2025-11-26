/// ParaText conversion to Markdown
/// ParaText를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, PARA_TEXT (HWPTAG_BEGIN + 51)
/// Spec mapping: Table 57 - BodyText data records, PARA_TEXT (HWPTAG_BEGIN + 51)
use crate::document::bodytext::ControlCharPosition;

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
pub(crate) fn convert_para_text_to_markdown(
    text: &str,
    control_positions: &[ControlCharPosition],
) -> Option<String> {
    // 의미 있는 텍스트인지 확인 / Check if text is meaningful
    // 제어 문자는 이미 파싱 단계에서 제거되었으므로 텍스트를 그대로 사용 / Control characters are already removed during parsing, so use text as-is
    if is_meaningful_text(text, control_positions) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}
