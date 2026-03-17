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
}

impl Default for DocMarkdownOptions {
    fn default() -> Self {
        Self {
            image_output_dir: None,
            use_html: false,
        }
    }
}

/// Document를 Markdown으로 변환
pub fn doc_to_markdown(doc: &Document, options: &DocMarkdownOptions) -> String {
    let mut lines: Vec<String> = Vec::new();

    // 머리글/꼬리글/각주/미주 수집
    let mut headers: Vec<String> = Vec::new();
    let mut footers: Vec<String> = Vec::new();
    let mut footnotes: Vec<String> = Vec::new();
    let mut endnotes: Vec<String> = Vec::new();

    for section in &doc.sections {
        for para in &section.paragraphs {
            let (body, ctrl_parts) =
                paragraph::render_paragraph(para, &doc.resources, &doc.binaries, options);

            // 컨트롤에서 추출된 머리글/꼬리글/각주/미주 분배
            for part in ctrl_parts {
                match part {
                    ControlPart::Header(text) => headers.push(text),
                    ControlPart::Footer(text) => footers.push(text),
                    ControlPart::Footnote { ref_num, text } => {
                        // 본문에 각주 참조 추가
                        if let Some(last) = lines.last_mut() {
                            last.push_str(&format!("[^{}]", ref_num));
                        }
                        footnotes.push(format!("[^{}]: {}", ref_num, text));
                    }
                    ControlPart::Endnote { ref_num, text } => {
                        if let Some(last) = lines.last_mut() {
                            last.push_str(&format!("[^e{}]", ref_num));
                        }
                        endnotes.push(format!("[^e{}]: {}", ref_num, text));
                    }
                }
            }

            if !body.is_empty() {
                lines.push(body);
            }
        }
    }

    // 조합: 머리글 → 본문 → 꼬리글 → 각주 → 미주
    let mut result = Vec::new();

    if !headers.is_empty() {
        result.extend(headers);
        result.push(String::new());
    }

    result.extend(lines);

    if !footers.is_empty() {
        result.push(String::new());
        result.extend(footers);
    }

    if !footnotes.is_empty() {
        result.push(String::new());
        result.push("## 각주".to_string());
        result.push(String::new());
        result.extend(footnotes);
    }

    if !endnotes.is_empty() {
        result.push(String::new());
        result.push("## 미주".to_string());
        result.push(String::new());
        result.extend(endnotes);
    }

    result.join("\n\n")
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
    let mut parts = Vec::new();
    for para in paragraphs {
        let (body, _) = paragraph::render_paragraph(para, resources, binaries, options);
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
