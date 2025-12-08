/// 페이지 정의 관련 모듈 / Page definition module
use crate::document::HwpDocument;

/// 재귀적으로 페이지 정의 찾기 / Find page definition recursively
pub fn find_page_def_recursive(
    document: &HwpDocument,
) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
    ) -> Option<&crate::document::bodytext::PageDef> {
        for record in records {
            match record {
                ParagraphRecord::PageDef { page_def } => {
                    return Some(page_def);
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    if let Some(page_def) = search_in_records(children) {
                        return Some(page_def);
                    }
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        if let Some(page_def) = search_in_records(&paragraph.records) {
                            return Some(page_def);
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }

    // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            if let Some(page_def) = search_in_records(&paragraph.records) {
                return Some(page_def);
            }
        }
    }

    None
}

/// 섹션별로 페이지 정의 찾기 / Find page definition for each section
pub fn find_page_def_for_section(
    section: &crate::document::bodytext::Section,
) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
    ) -> Option<&crate::document::bodytext::PageDef> {
        for record in records {
            match record {
                ParagraphRecord::PageDef { page_def } => {
                    return Some(page_def);
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    if let Some(page_def) = search_in_records(children) {
                        return Some(page_def);
                    }
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        if let Some(page_def) = search_in_records(&paragraph.records) {
                            return Some(page_def);
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }

    // 섹션의 문단들을 검색 / Search paragraphs in section
    for paragraph in &section.paragraphs {
        if let Some(page_def) = search_in_records(&paragraph.records) {
            return Some(page_def);
        }
    }

    None
}
