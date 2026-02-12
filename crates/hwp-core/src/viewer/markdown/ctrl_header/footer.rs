/// FOOTER CtrlId conversion to Markdown
/// FOOTER CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, FOOTER ("foot")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, FOOTER ("foot")
/// Convert FOOTER CtrlId to markdown
/// FOOTER CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_footer_ctrl_to_markdown(_header: &crate::document::CtrlHeader) -> String {
    // 꼬리말 제목 / Footer title
    // 실제 내용은 자식 레코드에서 처리됨 / Actual content is processed from child records
    "## 꼬리말".to_string()
}
