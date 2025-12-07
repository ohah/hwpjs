/// HEADER CtrlId conversion to HTML
/// HEADER CtrlId를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, HEADER ("head")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, HEADER ("head")
use crate::document::CtrlHeader;

/// Convert HEADER CtrlId to HTML
/// HEADER CtrlId를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub(crate) fn convert_header_ctrl_to_html(_header: &CtrlHeader, css_prefix: &str) -> String {
    // 머리말 제목 / Header title
    // 실제 내용은 자식 레코드에서 처리됨 / Actual content is processed from child records
    format!(r#"<h2 class="{}header-title">머리말</h2>"#, css_prefix)
}

