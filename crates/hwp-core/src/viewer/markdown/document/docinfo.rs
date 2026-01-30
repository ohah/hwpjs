/// DocInfo conversion to Markdown
/// 문서 정보를 마크다운으로 변환하는 모듈
use crate::document::{HwpDocument, ParagraphRecord};

/// 문서에서 첫 번째 PageDef 정보 추출 / Extract first PageDef information from document
pub fn extract_page_info(document: &HwpDocument) -> Option<&crate::document::bodytext::PageDef> {
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
