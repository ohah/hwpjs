/// FOOTNOTE CtrlId conversion to Markdown
/// FOOTNOTE CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, FOOTNOTE ("foot")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, FOOTNOTE ("foot")
/// Convert FOOTNOTE CtrlId to markdown
/// FOOTNOTE CtrlId를 마크다운으로 변환
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_footnote_ctrl_to_markdown() -> String {
    // 꼬리말 (Footer) / Footer
    String::from("*[꼬리말]*")
}
