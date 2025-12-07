/// PAGE_NUMBER CtrlId conversion to HTML
/// PAGE_NUMBER CtrlId를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
use crate::document::CtrlHeader;

/// Convert PAGE_NUMBER or PAGE_NUMBER_POS CtrlId to HTML
/// PAGE_NUMBER 또는 PAGE_NUMBER_POS CtrlId를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub(crate) fn convert_page_number_ctrl_to_html(_header: &CtrlHeader, css_prefix: &str) -> String {
    // 페이지 번호는 JavaScript로 동적으로 표시하거나, 서버 사이드에서 처리해야 함
    // Page numbers should be displayed dynamically with JavaScript or processed server-side
    // 여기서는 플레이스홀더로 표시 / Display as placeholder here
    format!(
        r#"<span class="{}page-number" data-page-number="true">[페이지 번호]</span>"#,
        css_prefix
    )
}

