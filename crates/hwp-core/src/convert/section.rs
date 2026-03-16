//! BodyText → hwp_model Sections 변환

use crate::document::bodytext::BodyText;
use crate::document::docinfo::DocInfo;
use hwp_model::section::Section;

pub fn convert_sections(_body: &BodyText, _doc_info: &DocInfo) -> Vec<Section> {
    // TODO: BodyText의 sections/paragraphs를 hwp_model Section/Paragraph로 변환
    // 이것이 가장 복잡한 변환:
    // - ParagraphRecord (평면) → Run (트리) 조립
    // - ParaText + ParaCharShape → Run[] 분할
    // - CtrlHeader → Control/ShapeObject 변환
    // - ParaLineSeg → line_segments 보존
    Vec::new()
}
