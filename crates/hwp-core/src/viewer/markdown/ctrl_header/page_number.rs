/// PAGE_NUMBER CtrlId conversion to Markdown
/// PAGE_NUMBER CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
use crate::document::CtrlHeader;

/// Convert PAGE_NUMBER or PAGE_NUMBER_POS CtrlId to markdown
/// PAGE_NUMBER 또는 PAGE_NUMBER_POS CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_page_number_ctrl_to_markdown(_header: &CtrlHeader) -> String {
    // 쪽 번호 위치는 마크다운으로 표현할 수 없으므로 빈 문자열 반환
    // Page number position cannot be expressed in markdown, so return empty string
    String::new()
}
