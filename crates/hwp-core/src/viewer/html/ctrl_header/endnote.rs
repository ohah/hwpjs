use super::CtrlHeaderResult;
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};

/// HTML 뷰어용 미주 처리 플레이스홀더
///
/// # Status / 상태
/// 이 모듈은 향후 구현 예정이며 현재는 빈 결과를 반환합니다.
/// This module is planned for future implementation and currently returns empty results.
pub fn process_endnote<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    _paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    CtrlHeaderResult::new()
}
