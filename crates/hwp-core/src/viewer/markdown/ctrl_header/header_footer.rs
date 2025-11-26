/// HEADER_FOOTER CtrlId conversion to Markdown
/// HEADER_FOOTER CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, HEADER_FOOTER ("head")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, HEADER_FOOTER ("head")
/// Convert HEADER_FOOTER CtrlId to markdown
/// HEADER_FOOTER CtrlId를 마크다운으로 변환
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_header_footer_ctrl_to_markdown() -> String {
    // 머리말 (Header) / Header
    String::from("*[머리말]*")
}
