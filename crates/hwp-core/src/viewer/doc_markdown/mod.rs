/// Document(hwp-model) 기반 Markdown viewer
/// HWP/HWPX 양쪽에서 생성된 Document를 Markdown으로 변환
mod paragraph;

use hwp_model::control::Control;
use hwp_model::document::Document;

/// Markdown 변환 옵션
#[derive(Debug, Clone)]
pub struct DocMarkdownOptions {
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    pub image_output_dir: Option<String>,
    /// HTML 태그 사용 여부 (<br> 등)
    pub use_html: bool,
    /// 버전 정보 포함 여부 (None 또는 Some(true)이면 포함)
    pub include_version: Option<bool>,
    /// 페이지 정보 포함 여부
    pub include_page_info: Option<bool>,
}

impl Default for DocMarkdownOptions {
    fn default() -> Self {
        Self {
            image_output_dir: None,
            use_html: false,
            include_version: None,
            include_page_info: None,
        }
    }
}

/// Document를 Markdown으로 변환
pub fn doc_to_markdown(doc: &Document, options: &DocMarkdownOptions) -> String {
    let mut lines: Vec<String> = Vec::new();

    // 문서 헤더
    lines.push("# HWP 문서".to_string());
    lines.push(String::new());

    // 버전 정보
    if options.include_version != Some(false) {
        if let Some(ref hints) = doc.hwp_hints {
            let (a, b, c, d) = hints.version;
            lines.push(format!("**버전**: {}.{:02}.{:02}.{:02}", a, b, c, d));
            lines.push(String::new());
        } else if let Some(ref hints) = doc.hwpx_hints {
            if let Some(ref ver) = hints.app_version {
                lines.push(format!("**버전**: {}", ver));
                lines.push(String::new());
            }
        }
    }

    // 페이지 정보
    if options.include_page_info == Some(true) {
        if let Some(section) = doc.sections.first() {
            let page = &section.definition.page;
            let w_mm = page.width as f64 / 283.465;
            let h_mm = page.height as f64 / 283.465;
            lines.push(format!("**용지 크기**: {:.2}mm x {:.2}mm", w_mm, h_mm));
            lines.push(String::new());
        }
    }

    // 2-pass: 먼저 전체 순회하여 머리글/꼬리글/각주/미주와 본문을 분리 수집
    let mut headers: Vec<String> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();
    let mut outline_tracker = crate::viewer::core::outline::OutlineNumberTracker::new();
    let mut number_tracker: std::collections::HashMap<u16, crate::viewer::core::outline::OutlineNumberTracker> = std::collections::HashMap::new();
    let mut footers: Vec<String> = Vec::new();
    let mut footnotes: Vec<String> = Vec::new();
    let mut endnotes: Vec<String> = Vec::new();

    for (section_idx, section) in doc.sections.iter().enumerate() {
        // 섹션 간 구분선 (기존 viewer의 render_page_break와 동일하게 "---\n")
        if section_idx > 0 && !body_lines.is_empty() {
            let last = body_lines.last().map(String::as_str).unwrap_or("");
            if !last.is_empty() && !last.starts_with("---") {
                body_lines.push("---\n".to_string());
            }
        }

        for para in &section.paragraphs {
            // 페이지 구분선
            if para.page_break && !body_lines.is_empty() {
                let last = body_lines.last().map(String::as_str).unwrap_or("");
                if !last.is_empty() && !last.starts_with("---") {
                    body_lines.push("---\n".to_string());
                }
            }

            let section_outline_id = section.definition.outline_shape_id.unwrap_or(0);
            let (body, ctrl_parts, has_heading) = paragraph::render_paragraph_with_tracker(
                para,
                &doc.resources,
                &doc.binaries,
                options,
                &mut outline_tracker,
                &mut number_tracker,
                section_outline_id,
            );

            let has_header_footer_note = !ctrl_parts.is_empty();

            for part in ctrl_parts {
                match part {
                    ControlPart::Header(text) => {
                        if !text.is_empty() {
                            headers.push(text);
                        }
                    }
                    ControlPart::Footer(text) => {
                        if !text.is_empty() {
                            footers.push(text);
                        }
                    }
                    ControlPart::Footnote { ref_num, text } => {
                        // 본문 마지막 줄에 참조 추가 (기존 viewer와 동일)
                        let ref_str = format!("[^{}]", ref_num);
                        if let Some(last) = body_lines.last_mut() {
                            if !last.is_empty() && !last.starts_with("---") {
                                last.push_str(&format!(" {}", ref_str));
                            } else {
                                body_lines.push(ref_str);
                            }
                        } else {
                            body_lines.push(ref_str);
                        }
                        footnotes.push(format!("[^{}]{}", ref_num, text));
                    }
                    ControlPart::Endnote { ref_num, text } => {
                        let ref_str = format!("[^{}]", ref_num);
                        if let Some(last) = body_lines.last_mut() {
                            if !last.is_empty() && !last.starts_with("---") {
                                last.push_str(&format!(" {}", ref_str));
                            } else {
                                body_lines.push(ref_str);
                            }
                        } else {
                            body_lines.push(ref_str);
                        }
                        endnotes.push(format!("[^{}]{}", ref_num, text));
                    }
                }
            }

            // 기존 viewer와 동일: 머리글/꼬리글/각주/미주가 있는 문단은 body 텍스트 생략
            if !has_header_footer_note && !body.is_empty() {
                let body = if has_heading {
                    body
                } else if body.contains('\n') {
                    // 멀티라인: 표(|로 시작)는 그대로, 나머지는 trailing "  \n" 제거
                    if body.contains('|') {
                        // 표를 포함하면 그대로
                        body
                    } else {
                        let mut b = body;
                        while b.ends_with("  \n") {
                            b = b[..b.len() - 3].to_string();
                        }
                        while b.ends_with('\n') {
                            b.pop();
                        }
                        b
                    }
                } else if para.has_char_shapes {
                    // ParaCharShape가 있는 문단: trim() (기존 viewer와 동일)
                    body.trim().to_string()
                } else {
                    // ParaCharShape가 없는 문단: trailing space 보존, leading만 제거
                    body.trim_start().to_string()
                };
                if !body.is_empty() {
                    body_lines.push(body);
                }
            }
        }
    }

    // 기존 viewer와 동일한 순서로 조합: 머리글 → 본문 → 꼬리글 → 각주 → 미주
    if !headers.is_empty() {
        lines.extend(headers);
        lines.push(String::new());
    }

    lines.extend(body_lines);

    if !footers.is_empty() {
        if !lines.is_empty() {
            let last = lines.last().map(String::as_str).unwrap_or("");
            if !last.is_empty() {
                lines.push(String::new());
            }
        }
        lines.extend(footers);
    }

    if !footnotes.is_empty() {
        if !lines.is_empty() {
            let last = lines.last().map(String::as_str).unwrap_or("");
            if !last.is_empty() {
                lines.push(String::new());
            }
        }
        lines.push("## 각주".to_string());
        lines.push(String::new());
        lines.extend(footnotes);
    }

    if !endnotes.is_empty() {
        if !lines.is_empty() {
            let last = lines.last().map(String::as_str).unwrap_or("");
            if !last.is_empty() {
                lines.push(String::new());
            }
        }
        lines.push("## 미주".to_string());
        lines.push(String::new());
        lines.extend(endnotes);
    }

    lines.join("\n\n")
}

/// 컨트롤에서 추출된 문서 부분
pub(crate) enum ControlPart {
    Header(String),
    Footer(String),
    Footnote { ref_num: u16, text: String },
    Endnote { ref_num: u16, text: String },
}

/// SubList 내부의 문단들을 렌더링
pub(crate) fn render_sublist_paragraphs(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocMarkdownOptions,
) -> String {
    render_sublist_paragraphs_inner(paragraphs, resources, binaries, options, true)
}

/// 표 셀 전용: leading space 보존
pub(crate) fn render_sublist_paragraphs_for_cell(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocMarkdownOptions,
) -> String {
    render_sublist_paragraphs_inner(paragraphs, resources, binaries, options, false)
}

fn render_sublist_paragraphs_inner(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocMarkdownOptions,
    trim_leading: bool,
) -> String {
    let mut parts = Vec::new();
    for para in paragraphs {
        let (body, _) = paragraph::render_paragraph(para, resources, binaries, options);
        let raw_body_not_empty = !body.trim().is_empty();
        let body = body
            .replace('\t', "")
            .replace("**", "")
            .replace("*", "")
            .replace("~~", "");
        let body = remove_image_markdown(&body);
        let body = remove_hyperlink_markdown(&body);
        let body = if trim_leading {
            body.trim().to_string()
        } else {
            // 표 셀: trailing space 보존 (기존 viewer 동일), trailing \n만 제거
            body.trim_end_matches('\n').to_string()
        };
        if !body.is_empty() {
            parts.push(body);
        }
    }
    parts.join("\n\n")
}

/// Control에서 ControlPart 추출
pub(crate) fn extract_control_parts(
    control: &Control,
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocMarkdownOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> Option<ControlPart> {
    match control {
        Control::Header(hf) => {
            let text =
                render_sublist_paragraphs(&hf.content.paragraphs, resources, binaries, options);
            Some(ControlPart::Header(text))
        }
        Control::Footer(hf) => {
            let text =
                render_sublist_paragraphs(&hf.content.paragraphs, resources, binaries, options);
            Some(ControlPart::Footer(text))
        }
        Control::FootNote(note) => {
            *footnote_counter += 1;
            let ref_num = note.number.unwrap_or(*footnote_counter);
            let text =
                render_sublist_paragraphs(&note.content.paragraphs, resources, binaries, options);
            Some(ControlPart::Footnote { ref_num, text })
        }
        Control::EndNote(note) => {
            *endnote_counter += 1;
            let ref_num = note.number.unwrap_or(*endnote_counter);
            let text =
                render_sublist_paragraphs(&note.content.paragraphs, resources, binaries, options);
            Some(ControlPart::Endnote { ref_num, text })
        }
        _ => None,
    }
}

/// Markdown 이미지 구문 `![...](...)` 제거
fn remove_image_markdown(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '!' && chars[i + 1] == '[' {
            // ![...](...)  패턴 스킵
            if let Some(bracket_end) = chars[i + 2..].iter().position(|&c| c == ']') {
                let after_bracket = i + 2 + bracket_end + 1;
                if after_bracket < chars.len() && chars[after_bracket] == '(' {
                    if let Some(paren_end) = chars[after_bracket + 1..]
                        .iter()
                        .position(|&c| c == ')')
                    {
                        i = after_bracket + 1 + paren_end + 1;
                        continue;
                    }
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }
    result
}

/// Markdown 하이퍼링크 `[text](url)` 완전 제거 (기존 viewer는 표 셀 내 하이퍼링크를 표시하지 않음)
fn remove_hyperlink_markdown(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' && (i == 0 || chars[i - 1] != '!') {
            if let Some(bracket_end) = chars[i + 1..].iter().position(|&c| c == ']') {
                let after_bracket = i + 1 + bracket_end + 1;
                if after_bracket < chars.len() && chars[after_bracket] == '(' {
                    if let Some(paren_end) =
                        chars[after_bracket + 1..].iter().position(|&c| c == ')')
                    {
                        // [text](url) 전체 제거
                        i = after_bracket + 1 + paren_end + 1;
                        continue;
                    }
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }
    result
}
