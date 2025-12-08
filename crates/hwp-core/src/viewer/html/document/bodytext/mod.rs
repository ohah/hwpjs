/// BodyText conversion to HTML
/// 본문 텍스트를 HTML로 변환하는 모듈
///
/// HWP 문서의 본문 텍스트(bodytext) 관련 레코드들을 HTML로 변환하는 모듈
/// Module for converting BodyText-related records in HWP documents to HTML
mod list_header;
mod para_text;
pub mod paragraph;
mod shape_component;
pub mod shape_component_picture;
pub mod table;

use crate::document::{ColumnDivideType, HwpDocument, ParagraphRecord};
use crate::viewer::html::HtmlOptions;

pub use paragraph::convert_paragraph_to_html;
pub use table::{convert_table_to_html, generate_border_fill_css};

/// Convert body text to HTML
/// 본문 텍스트를 HTML로 변환
pub fn convert_bodytext_to_html(
    document: &HwpDocument,
    options: &HtmlOptions,
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

    // 각주/미주 번호 추적기 / Footnote/endnote number tracker
    let mut footnote_counter = 1u32;
    let mut endnote_counter = 1u32;

    // 개요 번호 추적기 생성 / Create outline number tracker
    let mut outline_tracker = crate::viewer::html::utils::OutlineNumberTracker::new();

    // Convert body text to HTML / 본문 텍스트를 HTML로 변환
    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        for (para_idx, paragraph) in section.paragraphs.iter().enumerate() {
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
                                        let para_html = paragraph::convert_paragraph_to_html(
                                            para,
                                            document,
                                            options,
                                            &mut outline_tracker,
                                        );
                                        if !para_html.is_empty() {
                                            headers.push(para_html);
                                        }
                                    }
                                }
                            }
                            // LIST_HEADER가 없으면 paragraphs 처리 (각주/미주 등)
                            // If no LIST_HEADER, process paragraphs (for footnotes/endnotes, etc.)
                            if !found_list_header {
                                for para in ctrl_paragraphs {
                                    let para_html = paragraph::convert_paragraph_to_html(
                                        para,
                                        document,
                                        options,
                                        &mut outline_tracker,
                                    );
                                    if !para_html.is_empty() {
                                        headers.push(para_html);
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
                                        let para_html = paragraph::convert_paragraph_to_html(
                                            para,
                                            document,
                                            options,
                                            &mut outline_tracker,
                                        );
                                        if !para_html.is_empty() {
                                            footers.push(para_html);
                                        }
                                    }
                                }
                            }
                            // LIST_HEADER가 없으면 paragraphs 처리 (각주/미주 등)
                            // If no LIST_HEADER, process paragraphs (for footnotes/endnotes, etc.)
                            if !found_list_header {
                                for para in ctrl_paragraphs {
                                    let para_html = paragraph::convert_paragraph_to_html(
                                        para,
                                        document,
                                        options,
                                        &mut outline_tracker,
                                    );
                                    if !para_html.is_empty() {
                                        footers.push(para_html);
                                    }
                                }
                            }
                        } else if header.ctrl_id.as_str() == CtrlId::FOOTNOTE {
                            // 각주 문단 처리 / Process footnote paragraph
                            // 본문에 각주 참조 링크 삽입 / Insert footnote reference link in body
                            let footnote_id = footnote_counter;
                            
                            // CtrlHeader의 children에서 FootnoteShape 찾기 / Find FootnoteShape in CtrlHeader's children
                            let footnote_shape = children.iter().find_map(|child| {
                                if let ParagraphRecord::FootnoteShape { footnote_shape } = child {
                                    Some(footnote_shape)
                                } else {
                                    None
                                }
                            });
                            
                            let footnote_number = format_footnote_number(
                                footnote_id,
                                footnote_shape,
                                document,
                                &options.css_class_prefix,
                            );
                            
                            // 본문에 각주 참조 링크 삽입 (이전 문단이 있으면 그 뒤에, 없으면 새 문단으로)
                            // Insert footnote reference link in body (after previous paragraph if exists, otherwise as new paragraph)
                            if !body_lines.is_empty() {
                                // 이전 문단의 끝에 각주 참조 링크 추가 / Add footnote reference link at end of previous paragraph
                                let last_idx = body_lines.len() - 1;
                                let last_line: &mut String = &mut body_lines[last_idx];
                                // <p> 태그 안에 각주 참조 링크 추가 / Add footnote reference link inside <p> tag
                                if last_line.contains("</p>") {
                                    let footnote_ref_id = format!("footnote-{}-ref", footnote_id);
                                    let footnote_href = format!("#footnote-{}", footnote_id);
                                    *last_line = last_line.replace(
                                        "</p>",
                                        &format!(
                                            r#" <sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                            footnote_href, options.css_class_prefix, "footnote-ref", footnote_ref_id, footnote_number
                                        ),
                                    );
                                } else {
                                    // <p> 태그가 없으면 추가 / Add <p> tag if not present
                                    let footnote_ref_id = format!("footnote-{}-ref", footnote_id);
                                    let footnote_href = format!("#footnote-{}", footnote_id);
                                    body_lines.push(format!(
                                        r#"<p class="{}paragraph"><sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                        options.css_class_prefix, footnote_href, options.css_class_prefix, "footnote-ref", footnote_ref_id, footnote_number
                                    ));
                                }
                            } else {
                                // 본문이 비어있으면 새 문단으로 추가 / Add as new paragraph if body is empty
                                let footnote_ref_id = format!("footnote-{}-ref", footnote_id);
                                let footnote_href = format!("#footnote-{}", footnote_id);
                                body_lines.push(format!(
                                    r#"<p class="{}paragraph"><sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                    options.css_class_prefix, footnote_href, options.css_class_prefix, "footnote-ref", footnote_ref_id, footnote_number
                                ));
                            }
                            
                            footnote_counter += 1;

                            // 각주 내용 수집 / Collect footnote content
                            for para in ctrl_paragraphs {
                                let para_html = paragraph::convert_paragraph_to_html(
                                    para,
                                    document,
                                    options,
                                    &mut outline_tracker,
                                );
                                if !para_html.is_empty() {
                                    let footnote_ref_id = format!("footnote-{}-ref", footnote_id);
                                    let footnote_back_href = format!("#{}", footnote_ref_id);
                                    let footnote_id_str = format!("footnote-{}", footnote_id);
                                    footnotes.push(format!(
                                        r#"      <div id="{}" class="{}footnote">"#,
                                        footnote_id_str, options.css_class_prefix
                                    ));
                                    footnotes.push(format!(
                                        r#"        <a href="{}" class="{}{}">↩</a> "#,
                                        footnote_back_href, options.css_class_prefix, "footnote-back"
                                    ));
                                    footnotes.push(para_html);
                                    footnotes.push("      </div>".to_string());
                                }
                            }
                            // LIST_HEADER는 건너뜀 (자동 번호 템플릿, 실제 텍스트 아님)
                            // Skip LIST_HEADER (auto-number template, not actual text)
                        } else if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                            // 미주 문단 처리 / Process endnote paragraph
                            // 본문에 미주 참조 링크 삽입 / Insert endnote reference link in body
                            let endnote_id = endnote_counter;
                            
                            // CtrlHeader의 children에서 FootnoteShape 찾기 / Find FootnoteShape in CtrlHeader's children
                            let footnote_shape = children.iter().find_map(|child| {
                                if let ParagraphRecord::FootnoteShape { footnote_shape } = child {
                                    Some(footnote_shape)
                                } else {
                                    None
                                }
                            });
                            
                            let endnote_number = format_endnote_number(
                                endnote_id,
                                footnote_shape,
                                document,
                                &options.css_class_prefix,
                            );
                            
                            // 본문에 미주 참조 링크 삽입 (이전 문단이 있으면 그 뒤에, 없으면 새 문단으로)
                            // Insert endnote reference link in body (after previous paragraph if exists, otherwise as new paragraph)
                            if !body_lines.is_empty() {
                                // 이전 문단의 끝에 미주 참조 링크 추가 / Add endnote reference link at end of previous paragraph
                                let last_idx = body_lines.len() - 1;
                                let last_line: &mut String = &mut body_lines[last_idx];
                                // <p> 태그 안에 미주 참조 링크 추가 / Add endnote reference link inside <p> tag
                                if last_line.contains("</p>") {
                                    let endnote_ref_id = format!("endnote-{}-ref", endnote_id);
                                    let endnote_href = format!("#endnote-{}", endnote_id);
                                    *last_line = last_line.replace(
                                        "</p>",
                                        &format!(
                                            r#" <sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                            endnote_href, options.css_class_prefix, "endnote-ref", endnote_ref_id, endnote_number
                                        ),
                                    );
                                } else {
                                    // <p> 태그가 없으면 추가 / Add <p> tag if not present
                                    let endnote_ref_id = format!("endnote-{}-ref", endnote_id);
                                    let endnote_href = format!("#endnote-{}", endnote_id);
                                    body_lines.push(format!(
                                        r#"<p class="{}paragraph"><sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                        options.css_class_prefix, endnote_href, options.css_class_prefix, "endnote-ref", endnote_ref_id, endnote_number
                                    ));
                                }
                            } else {
                                // 본문이 비어있으면 새 문단으로 추가 / Add as new paragraph if body is empty
                                let endnote_ref_id = format!("endnote-{}-ref", endnote_id);
                                let endnote_href = format!("#endnote-{}", endnote_id);
                                body_lines.push(format!(
                                    r#"<p class="{}paragraph"><sup><a href="{}" class="{}{}" id="{}">{}</a></sup></p>"#,
                                    options.css_class_prefix, endnote_href, options.css_class_prefix, "endnote-ref", endnote_ref_id, endnote_number
                                ));
                            }
                            
                            endnote_counter += 1;

                            // 미주 내용 수집 / Collect endnote content
                            for para in ctrl_paragraphs {
                                let para_html = paragraph::convert_paragraph_to_html(
                                    para,
                                    document,
                                    options,
                                    &mut outline_tracker,
                                );
                                if !para_html.is_empty() {
                                    let endnote_ref_id = format!("endnote-{}-ref", endnote_id);
                                    let endnote_back_href = format!("#{}", endnote_ref_id);
                                    let endnote_id_str = format!("endnote-{}", endnote_id);
                                    endnotes.push(format!(
                                        r#"      <div id="{}" class="{}endnote">"#,
                                        endnote_id_str, options.css_class_prefix
                                    ));
                                    endnotes.push(format!(
                                        r#"        <a href="{}" class="{}{}">↩</a> "#,
                                        endnote_back_href, options.css_class_prefix, "endnote-back"
                                    ));
                                    endnotes.push(para_html);
                                    endnotes.push("      </div>".to_string());
                                }
                            }
                            // LIST_HEADER는 건너뜀 (자동 번호 템플릿, 실제 텍스트 아님)
                            // Skip LIST_HEADER (auto-number template, not actual text)
                        }
                        // 테이블은 paragraph.rs에서 처리 (마크다운과 동일) / Table is processed in paragraph.rs (same as markdown)
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
                    if !last_line.is_empty() && !last_line.contains("<hr") {
                        body_lines.push(format!(
                            r#"    <hr class="{}page-break" />"#,
                            options.css_class_prefix
                        ));
                    }
                }

                // Convert paragraph to HTML (includes text and controls) / 문단을 HTML로 변환 (텍스트와 컨트롤 포함)
                let html = paragraph::convert_paragraph_to_html_with_indices(
                    paragraph,
                    document,
                    options,
                    &mut outline_tracker,
                    Some(section_idx),
                    Some(para_idx),
                );
                if !html.is_empty() {
                    body_lines.push(html);
                }
            }
        }
    }

    (headers, body_lines, footers, footnotes, endnotes)
}

/// Format footnote number according to FootnoteShape
/// FootnoteShape에 따라 각주 번호 형식 지정
fn format_footnote_number(
    number: u32,
    footnote_shape: Option<&crate::document::bodytext::FootnoteShape>,
    _document: &HwpDocument,
    _css_prefix: &str,
) -> String {
    let number_shape = footnote_shape
        .map(|fs| &fs.attributes.number_shape)
        .copied()
        .unwrap_or(crate::document::bodytext::NumberShape::Arabic);
    
    format_number_by_shape(number, number_shape, footnote_shape)
}

/// Format endnote number according to FootnoteShape
/// FootnoteShape에 따라 미주 번호 형식 지정
fn format_endnote_number(
    number: u32,
    footnote_shape: Option<&crate::document::bodytext::FootnoteShape>,
    _document: &HwpDocument,
    _css_prefix: &str,
) -> String {
    let number_shape = footnote_shape
        .map(|fs| &fs.attributes.number_shape)
        .copied()
        .unwrap_or(crate::document::bodytext::NumberShape::Arabic);
    
    format_number_by_shape(number, number_shape, footnote_shape)
}

/// NumberShape에 따라 번호 형식 지정 / Format number according to NumberShape
fn format_number_by_shape(
    number: u32,
    number_shape: crate::document::bodytext::NumberShape,
    footnote_shape: Option<&crate::document::bodytext::FootnoteShape>,
) -> String {
    use crate::document::bodytext::NumberShape;
    
    let front_decoration = footnote_shape
        .map(|fs| fs.front_decoration)
        .unwrap_or(0);
    let back_decoration = footnote_shape
        .map(|fs| fs.back_decoration)
        .unwrap_or(0);
    
    let number_str = match number_shape {
        NumberShape::Arabic => format!("{}", number),
        NumberShape::CircledArabic => {
            if number > 0 && number <= 20 {
                let code = 0x2460 + number - 1;
                char::from_u32(code).unwrap_or(' ').to_string()
            } else {
                format!("{}", number)
            }
        }
        NumberShape::RomanUpper => number_to_roman_upper(number),
        NumberShape::RomanLower => number_to_roman_lower(number),
        NumberShape::AlphaUpper => number_to_alpha_upper(number),
        NumberShape::AlphaLower => number_to_alpha_lower(number),
        NumberShape::CircledAlphaUpper => {
            if number > 0 && number <= 26 {
                let code = 0x24B6 + number - 1; // Ⓐ-Ⓩ
                char::from_u32(code).unwrap_or(' ').to_string()
            } else {
                number_to_alpha_upper(number)
            }
        }
        NumberShape::CircledAlphaLower => {
            if number > 0 && number <= 26 {
                let code = 0x24D0 + number - 1; // ⓐ-ⓩ
                char::from_u32(code).unwrap_or(' ').to_string()
            } else {
                number_to_alpha_lower(number)
            }
        }
        NumberShape::Hangul => number_to_hangul(number),
        NumberShape::CircledHangul => {
            if number > 0 && number <= 14 {
                let hangul = number_to_hangul(number);
                format!("({})", hangul)
            } else {
                number_to_hangul(number)
            }
        }
        NumberShape::HangulJamo => number_to_hangul_jamo(number),
        NumberShape::CircledHangulJamo => {
            if number > 0 && number <= 14 {
                let jamo = number_to_hangul_jamo(number);
                format!("({})", jamo)
            } else {
                number_to_hangul_jamo(number)
            }
        }
        NumberShape::HangulNumber => number_to_hangul_number(number),
        NumberShape::ChineseNumber => number_to_chinese_number(number),
        NumberShape::CircledChineseNumber => {
            let chinese = number_to_chinese_number(number);
            format!("({})", chinese)
        }
        NumberShape::HeavenlyStem => number_to_heavenly_stem(number),
        NumberShape::HeavenlyStemChinese => number_to_heavenly_stem_chinese(number),
        NumberShape::FourCharRepeat => {
            const CHARS: [&str; 4] = ["●", "○", "◆", "◇"];
            CHARS[((number - 1) % 4) as usize].to_string()
        }
        NumberShape::CustomCharRepeat => {
            let custom_char = footnote_shape
                .map(|fs| fs.custom_symbol)
                .unwrap_or(0);
            if custom_char != 0 {
                char::from_u32(custom_char as u32).unwrap_or(' ').to_string()
            } else {
    format!("{}", number)
}
        }
    };
    
    // 앞뒤 장식 문자 추가 / Add front and back decoration characters
    let front = if front_decoration != 0 {
        char::from_u32(front_decoration as u32).unwrap_or(' ').to_string()
    } else {
        String::new()
    };
    let back = if back_decoration != 0 {
        char::from_u32(back_decoration as u32).unwrap_or(' ').to_string()
    } else {
        String::new()
    };
    
    format!("{}{}{}", front, number_str, back)
}

/// 숫자를 로마 숫자(대문자)로 변환 / Convert number to uppercase Roman numeral
fn number_to_roman_upper(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const VALUES: [u32; 13] = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const SYMBOLS: [&str; 13] = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    
    let mut result = String::new();
    let mut num = n;
    for (value, symbol) in VALUES.iter().zip(SYMBOLS.iter()) {
        while num >= *value {
            result.push_str(symbol);
            num -= value;
        }
    }
    result
}

/// 숫자를 로마 숫자(소문자)로 변환 / Convert number to lowercase Roman numeral
fn number_to_roman_lower(n: u32) -> String {
    number_to_roman_upper(n).to_lowercase()
}

/// 숫자를 알파벳(대문자)로 변환 / Convert number to uppercase alphabet
fn number_to_alpha_upper(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    let mut num = n - 1;
    let mut result = String::new();
    loop {
        result.push((b'A' + (num % 26) as u8) as char);
        if num < 26 {
            break;
        }
        num = num / 26 - 1;
    }
    result.chars().rev().collect()
}

/// 숫자를 알파벳(소문자)로 변환 / Convert number to lowercase alphabet
fn number_to_alpha_lower(n: u32) -> String {
    number_to_alpha_upper(n).to_lowercase()
}

/// 숫자를 한글로 변환 / Convert number to Korean
fn number_to_hangul(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const HANGUL: [char; 14] = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    let index = ((n - 1) % 14) as usize;
    HANGUL[index].to_string()
}

/// 숫자를 한글 자모로 변환 / Convert number to Korean jamo
fn number_to_hangul_jamo(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const JAMO: [char; 14] = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    let index = ((n - 1) % 14) as usize;
    JAMO[index].to_string()
}

/// 숫자를 한글 숫자로 변환 / Convert number to Korean number
fn number_to_hangul_number(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const HANGUL_NUMBERS: [&str; 10] = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
    const HANGUL_UNITS: [&str; 4] = ["", "십", "백", "천"];
    
    if n < 10 {
        return HANGUL_NUMBERS[n as usize].to_string();
    }
    
    let mut result = String::new();
    let mut num = n;
    let mut unit_index = 0;
    
    while num > 0 {
        let digit = num % 10;
        if digit > 0 {
            if digit > 1 || unit_index == 0 {
                result.insert_str(0, HANGUL_NUMBERS[digit as usize]);
            }
            if unit_index > 0 {
                result.insert_str(result.len(), HANGUL_UNITS[unit_index]);
            }
        }
        num /= 10;
        unit_index += 1;
    }
    
    result
}

/// 숫자를 한자 숫자로 변환 / Convert number to Chinese number
fn number_to_chinese_number(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const CHINESE: [char; 10] = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const UNITS: [char; 4] = ['十', '百', '千', '万'];
    
    if n < 10 {
        return CHINESE[n as usize].to_string();
    }
    
    let mut result = String::new();
    let mut num = n;
    let mut unit_index = 0;
    
    while num > 0 {
        let digit = num % 10;
        if digit > 0 {
            if digit > 1 || unit_index == 0 {
                result.insert(0, CHINESE[digit as usize]);
            }
            if unit_index > 0 && unit_index <= 3 {
                result.insert(result.len(), UNITS[unit_index - 1]);
            }
        }
        num /= 10;
        unit_index += 1;
    }
    
    result
}

/// 숫자를 천간으로 변환 / Convert number to heavenly stem
fn number_to_heavenly_stem(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const STEMS: [char; 10] = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
    let index = ((n - 1) % 10) as usize;
    STEMS[index].to_string()
}

/// 숫자를 천간(한자)로 변환 / Convert number to heavenly stem (Chinese)
fn number_to_heavenly_stem_chinese(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    const STEMS: [char; 10] = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    let index = ((n - 1) % 10) as usize;
    STEMS[index].to_string()
}

