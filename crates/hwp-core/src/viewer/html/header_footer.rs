/// 머리말/꼬리말 렌더링 모듈 / Header/Footer rendering module
use crate::document::HwpDocument;
use crate::viewer::html::HtmlOptions;

/// 섹션에서 머리말 찾아서 HTML로 렌더링 / Find and render header from section as HTML
pub fn render_header_for_section(
    section: &crate::document::bodytext::Section,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> String {
    use crate::document::{CtrlId, ParagraphRecord};
    use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

    let mut header_html = String::new();

    for paragraph in &section.paragraphs {
        let control_mask = &paragraph.para_header.control_mask;
        if control_mask.has_header_footer() {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader {
                    header,
                    children,
                    paragraphs: ctrl_paragraphs,
                } = record
                {
                    if header.ctrl_id.as_str() == CtrlId::HEADER {
                        // 머리말 문단 처리 / Process header paragraph
                        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                        // If LIST_HEADER exists, process from children, otherwise from paragraphs
                        let mut found_list_header = false;
                        for child_record in children {
                            if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record {
                                found_list_header = true;
                                // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                for para in paragraphs {
                                    let para_html =
                                        convert_paragraph_to_html(para, document, options, tracker);
                                    if !para_html.is_empty() {
                                        header_html.push_str(&para_html);
                                        header_html.push('\n');
                                    }
                                }
                            }
                        }
                        // LIST_HEADER가 없으면 paragraphs 처리 / If no LIST_HEADER, process paragraphs
                        if !found_list_header {
                            for para in ctrl_paragraphs {
                                let para_html =
                                    convert_paragraph_to_html(para, document, options, tracker);
                                if !para_html.is_empty() {
                                    header_html.push_str(&para_html);
                                    header_html.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    header_html
}

/// 섹션에서 꼬리말 찾아서 HTML로 렌더링 / Find and render footer from section as HTML
pub fn render_footer_for_section(
    section: &crate::document::bodytext::Section,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> String {
    use crate::document::{CtrlId, ParagraphRecord};
    use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

    let mut footer_html = String::new();

    for paragraph in &section.paragraphs {
        let control_mask = &paragraph.para_header.control_mask;
        if control_mask.has_header_footer() {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader {
                    header,
                    children,
                    paragraphs: ctrl_paragraphs,
                } = record
                {
                    if header.ctrl_id.as_str() == CtrlId::FOOTER {
                        // 꼬리말 문단 처리 / Process footer paragraph
                        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                        // If LIST_HEADER exists, process from children, otherwise from paragraphs
                        let mut found_list_header = false;
                        for child_record in children {
                            if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record {
                                found_list_header = true;
                                // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                for para in paragraphs {
                                    let para_html =
                                        convert_paragraph_to_html(para, document, options, tracker);
                                    if !para_html.is_empty() {
                                        footer_html.push_str(&para_html);
                                        footer_html.push('\n');
                                    }
                                }
                            }
                        }
                        // LIST_HEADER가 없으면 paragraphs 처리 / If no LIST_HEADER, process paragraphs
                        if !found_list_header {
                            for para in ctrl_paragraphs {
                                let para_html =
                                    convert_paragraph_to_html(para, document, options, tracker);
                                if !para_html.is_empty() {
                                    footer_html.push_str(&para_html);
                                    footer_html.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    footer_html
}
