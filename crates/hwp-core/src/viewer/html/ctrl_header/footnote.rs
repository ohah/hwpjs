/// FOOTNOTE CtrlId conversion to HTML
/// FOOTNOTE CtrlId를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, FOOTNOTE ("fn  ")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, FOOTNOTE ("fn  ")
use crate::document::CtrlHeader;

/// Convert FOOTNOTE CtrlId to HTML
/// FOOTNOTE CtrlId를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub(crate) fn convert_footnote_ctrl_to_html(_header: &CtrlHeader, _css_prefix: &str) -> String {
    // 각주 참조는 본문에서 처리되므로 여기서는 빈 문자열 반환
    // Footnote references are processed in body text, so return empty string here
    // 실제 각주 내용은 bodytext/mod.rs에서 처리됨
    // Actual footnote content is processed in bodytext/mod.rs
    String::new()
}

