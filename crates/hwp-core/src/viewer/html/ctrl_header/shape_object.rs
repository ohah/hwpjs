use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use super::CtrlHeaderResult;

/// 그리기 개체 처리 / Process shape object
pub fn process_shape_object<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    // TODO: 그리기 개체 처리 로직 추가 / Add shape object processing logic
    CtrlHeaderResult::new()
}

