use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use super::CtrlHeaderResult;

/// 각주 처리 / Process footnote
pub fn process_footnote<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    // TODO: 각주 처리 로직 추가 / Add footnote processing logic
    CtrlHeaderResult::new()
}

