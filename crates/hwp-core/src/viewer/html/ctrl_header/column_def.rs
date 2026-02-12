use super::CtrlHeaderResult;
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};

/// 단 정의 처리 / Process column definition
pub fn process_column_def<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    // TODO: 단 정의 처리 로직 추가 / Add column definition processing logic
    CtrlHeaderResult::new()
}
