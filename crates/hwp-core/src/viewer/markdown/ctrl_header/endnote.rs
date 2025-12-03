/// ENDNOTE CtrlId conversion to Markdown
/// ENDNOTE CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, ENDNOTE ("en  ")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, ENDNOTE ("en  ")
/// Convert ENDNOTE CtrlId to markdown
/// ENDNOTE CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_endnote_ctrl_to_markdown(
    _header: &crate::document::CtrlHeader,
) -> String {
    // 미주 제목 / Endnote title
    // 실제 내용은 자식 레코드에서 처리됨 / Actual content is processed from child records
    "## 미주".to_string()
}

