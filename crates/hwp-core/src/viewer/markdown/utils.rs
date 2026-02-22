/// Utility functions for Markdown conversion
/// 마크다운 변환을 위한 유틸리티 함수들
use crate::document::HwpDocument;
use crate::viewer::core::outline::{compute_outline_number, format_outline_number};

/// Re-export for callers that use markdown::utils::OutlineNumberTracker
pub use crate::viewer::core::outline::OutlineNumberTracker;

/// Check if a part is a text part (not a block element)
/// part가 텍스트인지 확인 (블록 요소가 아님)
pub(crate) fn is_text_part(part: &str) -> bool {
    !is_block_element(part)
}

/// Check if a part is a block element (image, table, etc.)
/// part가 블록 요소인지 확인 (이미지, 표 등)
pub(crate) fn is_block_element(part: &str) -> bool {
    part.starts_with("![이미지]")
        || part.starts_with("|") // 테이블 / table
        || part.starts_with("---") // 페이지 구분선 / page break
                                   // 개요 번호는 블록 요소가 아님 / Outline numbers are not block elements
}

/// Check if control header should be processed for markdown
/// 컨트롤 헤더가 마크다운 변환에서 처리되어야 하는지 확인
pub(crate) fn should_process_control_header(header: &crate::document::CtrlHeader) -> bool {
    use crate::document::CtrlId;
    match header.ctrl_id.as_str() {
        // 마크다운으로 표현 가능한 컨트롤만 처리 / Only process controls that can be expressed in markdown
        CtrlId::TABLE => true,
        CtrlId::SHAPE_OBJECT => true, // 이미지는 자식 레코드에서 처리 / Images are processed from child records
        CtrlId::HEADER => true,       // 머리말 처리 / Process header
        CtrlId::FOOTER => true,       // 꼬리말 처리 / Process footer
        CtrlId::FOOTNOTE => false, // 각주는 convert_bodytext_to_markdown에서 처리 / Footnotes are processed in convert_bodytext_to_markdown
        CtrlId::ENDNOTE => false, // 미주는 convert_bodytext_to_markdown에서 처리 / Endnotes are processed in convert_bodytext_to_markdown
        CtrlId::COLUMN_DEF => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        _ => false, // 기타 컨트롤도 마크다운으로 표현 불가 / Other controls also cannot be expressed in markdown
    }
}

/// 개요 레벨이면 텍스트 앞에 개요 번호를 추가
/// Add outline number prefix to text if it's an outline level
pub(crate) fn convert_to_outline_with_number(
    text: &str,
    para_header: &crate::document::bodytext::ParaHeader,
    document: &HwpDocument,
    tracker: &mut OutlineNumberTracker,
) -> String {
    if let Some((level, number)) = compute_outline_number(para_header, document, tracker) {
        let outline_number = format_outline_number(level, number);
        return format!("{} {}", outline_number, text);
    }
    text.to_string()
}
