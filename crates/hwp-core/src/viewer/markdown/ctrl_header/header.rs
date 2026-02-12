/// HEADER CtrlId conversion to Markdown
/// HEADER CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, HEADER ("head")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, HEADER ("head")
/// Convert HEADER CtrlId to markdown
/// HEADER CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_header_ctrl_to_markdown(_header: &crate::document::CtrlHeader) -> String {
    // 머리말 제목 / Header title
    // 실제 내용은 자식 레코드에서 처리됨 / Actual content is processed from child records
    "## 머리말".to_string()
}
