/// Utility functions for Markdown conversion
/// 마크다운 변환을 위한 유틸리티 함수들
use crate::document::{HeaderShapeType, HwpDocument};

/// 버전 번호를 읽기 쉬운 문자열로 변환
/// Convert version number to readable string
pub(crate) fn format_version(document: &HwpDocument) -> String {
    let version = document.file_header.version;
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let build = version & 0xFF;

    format!("{}.{:02}.{:02}.{:02}", major, minor, patch, build)
}

/// 문서에서 첫 번째 PageDef 정보 추출 / Extract first PageDef information from document
pub(crate) fn extract_page_info(
    document: &HwpDocument,
) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                if let ParagraphRecord::PageDef { page_def } = record {
                    return Some(page_def);
                }
            }
        }
    }
    None
}

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
        || part.starts_with("#") // 헤딩 / heading
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

/// Convert text to heading if it's an outline level
/// 개요 레벨이면 텍스트를 헤딩으로 변환
pub(crate) fn convert_to_heading_if_outline(
    text: &str,
    para_header: &crate::document::bodytext::ParaHeader,
    document: &HwpDocument,
) -> String {
    // ParaShape 찾기 (para_shape_id는 인덱스) / Find ParaShape (para_shape_id is index)
    let para_shape_id = para_header.para_shape_id as usize;
    if let Some(para_shape) = document.doc_info.para_shapes.get(para_shape_id) {
        // 개요 타입이고 레벨이 1 이상이면 헤딩으로 변환
        // If outline type and level >= 1, convert to heading
        if para_shape.attributes1.header_shape_type == HeaderShapeType::Outline
            && para_shape.attributes1.paragraph_level >= 1
        {
            let level = para_shape.attributes1.paragraph_level.min(6) as usize; // 최대 6레벨 / max 6 levels
            let hashes = "#".repeat(level);
            return format!("{} {}", hashes, text);
        }
    }
    text.to_string()
}
