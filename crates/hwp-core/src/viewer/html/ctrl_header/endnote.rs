use super::CtrlHeaderResult;
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};

/// 미주 처리 / Process endnote
pub fn process_endnote<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    // TODO: 미주 처리 로직 추가 / Add endnote processing logic
    CtrlHeaderResult::new()
}
