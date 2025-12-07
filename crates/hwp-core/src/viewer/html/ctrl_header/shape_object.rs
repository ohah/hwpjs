/// SHAPE_OBJECT CtrlId conversion to HTML
/// SHAPE_OBJECT CtrlId를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, SHAPE_OBJECT ("so  ")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, SHAPE_OBJECT ("so  ")
use crate::document::CtrlHeader;

/// Convert SHAPE_OBJECT CtrlId to HTML
/// SHAPE_OBJECT CtrlId를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub(crate) fn convert_shape_object_ctrl_to_html(_header: &CtrlHeader, css_prefix: &str) -> String {
    // 도형 객체는 자식 레코드에서 처리됨 / Shape objects are processed from child records
    format!(
        r#"<div class="{}shape-object"></div>"#,
        css_prefix
    )
}

