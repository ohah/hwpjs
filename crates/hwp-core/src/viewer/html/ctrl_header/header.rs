use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use super::CtrlHeaderResult;

/// 머리말 처리 / Process header
pub fn process_header<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    // TODO: 머리말 처리 로직 추가 / Add header processing logic
    CtrlHeaderResult::new()
}

