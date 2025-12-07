/// BodyText conversion to Markdown
/// 본문 텍스트를 마크다운으로 변환하는 모듈
///
/// HWP 문서의 본문 텍스트(bodytext) 관련 레코드들을 마크다운으로 변환하는 모듈
/// Module for converting BodyText-related records in HWP documents to markdown
mod list_header;
mod para_text;
pub mod paragraph;
mod shape_component;
pub mod shape_component_picture;
pub mod table;

use crate::document::{ColumnDivideType, HwpDocument, ParagraphRecord};
use crate::viewer::markdown::MarkdownOptions;

pub use paragraph::convert_paragraph_to_markdown;
pub use table::convert_table_to_markdown;

/// Convert body text to markdown
/// 본문 텍스트를 마크다운으로 변환
pub fn convert_bodytext_to_markdown(
    document: &HwpDocument,
    options: &MarkdownOptions,
) -> (
    Vec<String>, // headers
    Vec<String>, // body_lines
    Vec<String>, // footers
    Vec<String>, // footnotes
    Vec<String>, // endnotes
) {
    // 머리말, 본문, 꼬리말, 각주, 미주를 분리하여 수집 / Collect headers, body, footers, footnotes, and endnotes separately
    let mut headers = Vec::new();
    let mut body_lines = Vec::new();
    let mut footers = Vec::new();
    let mut footnotes = Vec::new();
    let mut endnotes = Vec::new();

    // 개요 번호 추적기 생성 / Create outline number tracker
    let mut outline_tracker = crate::viewer::markdown::utils::OutlineNumberTracker::new();

    // Convert body text to markdown / 본문 텍스트를 마크다운으로 변환
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // control_mask를 사용하여 빠른 필터링 (최적화) / Use control_mask for quick filtering (optimization)
            let control_mask = &paragraph.para_header.control_mask;

            // control_mask로 머리말/꼬리말/각주/미주가 있는지 빠르게 확인 / Quickly check if header/footer/footnote/endnote exists using control_mask
            // 주의: control_mask는 머리말/꼬리말을 구분하지 못하고, 각주/미주도 구분하지 못함
            // Note: control_mask cannot distinguish header/footer or footnote/endnote
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();

            // 머리말/꼬리말/각주/미주 컨트롤 처리 / Process header/footer/footnote/endnote controls
            // 하나의 문단에 여러 개의 컨트롤이 있을 수 있으므로 break 없이 모두 처리
            // Multiple controls can exist in one paragraph, so process all without break
            // control_mask로 필터링하여 불필요한 순회 방지 / Filter with control_mask to avoid unnecessary iteration
            if has_header_footer || has_footnote_endnote {
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader {
                        header,
                        children,
                        paragraphs: ctrl_paragraphs,
                    } = record
                    {
                        use crate::document::CtrlId;
                        if header.ctrl_id.as_str() == CtrlId::HEADER {
                            // 머리말 문단 처리 / Process header paragraph
                            // 파서에서 이미 ParaText를 제거하고, LIST_HEADER가 있으면 paragraphs는 비어있음
                            // Parser already removed ParaText, and if LIST_HEADER exists, paragraphs is empty
                            // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                            // If LIST_HEADER exists, process from children, otherwise from paragraphs
                            let mut found_list_header = false;
                            for child_record in children {
                                if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record
                                {
                                    found_list_header = true;
                                    // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                    for para in paragraphs {
                                        let para_md = paragraph::convert_paragraph_to_markdown(
                                            para,
                                            document,
                                            options,
                                            &mut outline_tracker,
                                        );
                                        if !para_md.is_empty() {
                                            headers.push(para_md);
                                        }
                                    }
                                }
                            }
                            // LIST_HEADER가 없으면 paragraphs 처리 (각주/미주 등)
                            // If no LIST_HEADER, process paragraphs (for footnotes/endnotes, etc.)
                            if !found_list_header {
                                for para in ctrl_paragraphs {
                                    let para_md = paragraph::convert_paragraph_to_markdown(
                                        para,
                                        document,
                                        options,
                                        &mut outline_tracker,
                                    );
                                    if !para_md.is_empty() {
                                        headers.push(para_md);
                                    }
                                }
                            }
                        } else if header.ctrl_id.as_str() == CtrlId::FOOTER {
                            // 꼬리말 문단 처리 / Process footer paragraph
                            // 파서에서 이미 ParaText를 제거하고, LIST_HEADER가 있으면 paragraphs는 비어있음
                            // Parser already removed ParaText, and if LIST_HEADER exists, paragraphs is empty
                            // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                            // If LIST_HEADER exists, process from children, otherwise from paragraphs
                            let mut found_list_header = false;
                            for child_record in children {
                                if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record
                                {
                                    found_list_header = true;
                                    // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                    for para in paragraphs {
                                        let para_md = paragraph::convert_paragraph_to_markdown(
                                            para,
                                            document,
                                            options,
                                            &mut outline_tracker,
                                        );
                                        if !para_md.is_empty() {
                                            footers.push(para_md);
                                        }
                                    }
                                }
                            }
                            // LIST_HEADER가 없으면 paragraphs 처리 (각주/미주 등)
                            // If no LIST_HEADER, process paragraphs (for footnotes/endnotes, etc.)
                            if !found_list_header {
                                for para in ctrl_paragraphs {
                                    let para_md = paragraph::convert_paragraph_to_markdown(
                                        para,
                                        document,
                                        options,
                                        &mut outline_tracker,
                                    );
                                    if !para_md.is_empty() {
                                        footers.push(para_md);
                                    }
                                }
                            }
                        } else if header.ctrl_id.as_str() == CtrlId::FOOTNOTE {
                            // 각주 문단 처리 / Process footnote paragraph
                            // hwplib 방식: LIST_HEADER는 문단 리스트 헤더 정보만 포함하고,
                            // 실제 텍스트는 ParagraphList(paragraphs)에 있음
                            // hwplib approach: LIST_HEADER only contains paragraph list header info,
                            // actual text is in ParagraphList (paragraphs)
                            for para in ctrl_paragraphs {
                                let para_md = paragraph::convert_paragraph_to_markdown(
                                    para,
                                    document,
                                    options,
                                    &mut outline_tracker,
                                );
                                if !para_md.is_empty() {
                                    footnotes.push(para_md);
                                }
                            }
                            // LIST_HEADER는 건너뜀 (자동 번호 템플릿, 실제 텍스트 아님)
                            // Skip LIST_HEADER (auto-number template, not actual text)
                        } else if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                            // 미주 문단 처리 / Process endnote paragraph
                            // hwplib 방식: LIST_HEADER는 문단 리스트 헤더 정보만 포함하고,
                            // 실제 텍스트는 ParagraphList(paragraphs)에 있음
                            // hwplib approach: LIST_HEADER only contains paragraph list header info,
                            // actual text is in ParagraphList (paragraphs)
                            for para in ctrl_paragraphs {
                                let para_md = paragraph::convert_paragraph_to_markdown(
                                    para,
                                    document,
                                    options,
                                    &mut outline_tracker,
                                );
                                if !para_md.is_empty() {
                                    endnotes.push(para_md);
                                }
                            }
                            // LIST_HEADER는 건너뜀 (자동 번호 템플릿, 실제 텍스트 아님)
                            // Skip LIST_HEADER (auto-number template, not actual text)
                        }
                    }
                }
            }

            // 일반 본문 문단 처리 (컨트롤이 없는 경우) / Process regular body paragraph (when no controls)
            // control_mask로 일반 문단인지 확인 / Check if regular paragraph using control_mask
            if !has_header_footer && !has_footnote_endnote {
                // 일반 본문 문단 처리 / Process regular body paragraph
                // Check if we need to add page break / 페이지 나누기가 필요한지 확인
                let has_page_break = paragraph
                    .para_header
                    .column_divide_type
                    .iter()
                    .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

                if has_page_break && !body_lines.is_empty() {
                    // Only add page break if we have content before / 이전에 내용이 있을 때만 페이지 구분선 추가
                    let last_line = body_lines.last().map(String::as_str).unwrap_or("");
                    if !last_line.is_empty() && last_line != "---" {
                        body_lines.push("---".to_string());
                        body_lines.push(String::new());
                    }
                }

                // Convert paragraph to markdown (includes text and controls) / 문단을 마크다운으로 변환 (텍스트와 컨트롤 포함)
                let markdown = paragraph::convert_paragraph_to_markdown(
                    paragraph,
                    document,
                    options,
                    &mut outline_tracker,
                );
                if !markdown.is_empty() {
                    body_lines.push(markdown);
                }
            }
        }
    }

    (headers, body_lines, footers, footnotes, endnotes)
}
