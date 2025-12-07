/// DocInfo conversion utilities
/// DocInfo 변환 유틸리티
use crate::document::HwpDocument;

/// Extract page information from document
/// 문서에서 페이지 정보 추출
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
