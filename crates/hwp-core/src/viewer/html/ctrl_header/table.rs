/// TABLE CtrlId conversion to HTML
/// TABLE CtrlId를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, TABLE ("tbl ")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, TABLE ("tbl ")
use crate::document::CtrlHeader;

/// Convert TABLE CtrlId to HTML
/// TABLE CtrlId를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub(crate) fn convert_table_ctrl_to_html(
    _header: &CtrlHeader,
    _has_table: bool,
    _css_prefix: &str,
) -> String {
    // 테이블은 이미 bodytext/table.rs에서 처리되므로 여기서는 빈 문자열 반환
    // Tables are already processed in bodytext/table.rs, so return empty string here
    String::new()
}
