/// SHAPE_OBJECT CtrlId conversion to Markdown
/// SHAPE_OBJECT CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 컨트롤 ID, SHAPE_OBJECT ("gso ")
/// Spec mapping: Table 127 - Object Control IDs, SHAPE_OBJECT ("gso ")
use crate::document::{CtrlHeader, CtrlHeaderData};

/// Convert SHAPE_OBJECT CtrlId to markdown
/// SHAPE_OBJECT CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_shape_object_ctrl_to_markdown(header: &CtrlHeader) -> String {
    // 그리기 개체 (Shape Object) - 글상자, 그림 등
    // Shape Object - text boxes, images, etc.
    let mut md = String::from("**그리기 개체**");
    if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
        if let Some(desc) = description {
            if !desc.trim().is_empty() {
                md.push_str(&format!(": {}", desc.trim()));
            }
        }
    }
    md.push_str("\n\n*[개체 내용은 추출되지 않았습니다]*");
    md
}
