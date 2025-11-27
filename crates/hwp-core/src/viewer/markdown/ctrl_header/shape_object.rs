/// SHAPE_OBJECT CtrlId conversion to Markdown
/// SHAPE_OBJECT CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 컨트롤 ID, SHAPE_OBJECT ("gso ")
/// Spec mapping: Table 127 - Object Control IDs, SHAPE_OBJECT ("gso ")
use crate::document::CtrlHeader;

/// Convert SHAPE_OBJECT CtrlId to markdown
/// SHAPE_OBJECT CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_shape_object_ctrl_to_markdown(_header: &CtrlHeader) -> String {
    // 그리기 개체 메타데이터는 마크다운 뷰어에서 불필요하므로 빈 문자열 반환
    // 실제 이미지나 내용은 자식 레코드에서 처리됨
    // Shape object metadata is not needed in markdown viewer, so return empty string
    // Actual images or content are processed from child records
    String::new()
}
