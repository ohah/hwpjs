/// Document(hwp-model) 기반 HTML viewer
/// HWP/HWPX 양쪽에서 생성된 Document를 HTML로 변환
mod paragraph;
mod styles;

use hwp_model::document::Document;

/// HTML 변환 옵션
#[derive(Debug, Clone)]
pub struct DocHtmlOptions {
    /// CSS 클래스 접두사
    pub css_class_prefix: String,
    /// inline style 사용 여부 (false이면 <style> 블록 생성)
    pub inline_style: bool,
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    pub image_output_dir: Option<String>,
}

impl Default for DocHtmlOptions {
    fn default() -> Self {
        Self {
            css_class_prefix: "hwp-".to_string(),
            inline_style: true,
            image_output_dir: None,
        }
    }
}

/// Document를 HTML로 변환
pub fn doc_to_html(doc: &Document, options: &DocHtmlOptions) -> String {
    let mut body_parts: Vec<String> = Vec::new();
    let mut header_parts: Vec<String> = Vec::new();
    let mut footer_parts: Vec<String> = Vec::new();
    let mut footnote_parts: Vec<String> = Vec::new();
    let mut endnote_parts: Vec<String> = Vec::new();
    let mut footnote_counter: u16 = 0;
    let mut endnote_counter: u16 = 0;

    // 개요/번호 추적기
    let mut outline_tracker = crate::viewer::core::outline::OutlineNumberTracker::new();
    let mut number_tracker: std::collections::HashMap<
        u16,
        crate::viewer::core::outline::OutlineNumberTracker,
    > = std::collections::HashMap::new();

    // CSS 스타일 생성
    let css = if !options.inline_style {
        styles::generate_css(doc, &options.css_class_prefix)
    } else {
        String::new()
    };

    for (section_idx, section) in doc.sections.iter().enumerate() {
        // 섹션 간 구분선
        if section_idx > 0 && !body_parts.is_empty() {
            body_parts.push(format!("<hr class=\"{}section-break\">", options.css_class_prefix));
        }

        for para in &section.paragraphs {
            // 페이지 구분선
            if para.page_break && !body_parts.is_empty() {
                body_parts.push(format!(
                    "<hr class=\"{}page-break\">",
                    options.css_class_prefix
                ));
            }

            let (body_html, ctrl_parts) = paragraph::render_paragraph_with_tracker(
                para,
                &doc.resources,
                &doc.binaries,
                options,
                &mut footnote_counter,
                &mut endnote_counter,
                &mut outline_tracker,
                &mut number_tracker,
            );

            for part in ctrl_parts {
                match part {
                    HtmlControlPart::Header(html) => header_parts.push(html),
                    HtmlControlPart::Footer(html) => footer_parts.push(html),
                    HtmlControlPart::Footnote { id, html } => {
                        body_parts.push(format!(
                            "<sup><a href=\"#fn-{}\" id=\"fnref-{}\">[{}]</a></sup>",
                            id, id, id
                        ));
                        footnote_parts.push(format!(
                            "<div id=\"fn-{}\" class=\"{}footnote\"><a href=\"#fnref-{}\">↩</a> {}</div>",
                            id, options.css_class_prefix, id, html
                        ));
                    }
                    HtmlControlPart::Endnote { id, html } => {
                        body_parts.push(format!(
                            "<sup><a href=\"#en-{}\" id=\"enref-{}\">[e{}]</a></sup>",
                            id, id, id
                        ));
                        endnote_parts.push(format!(
                            "<div id=\"en-{}\" class=\"{}endnote\"><a href=\"#enref-{}\">↩</a> {}</div>",
                            id, options.css_class_prefix, id, html
                        ));
                    }
                }
            }

            if !body_html.is_empty() {
                body_parts.push(body_html);
            }
        }
    }

    // HTML 조합
    let mut html = String::new();

    if !css.is_empty() {
        html.push_str(&format!("<style>\n{}</style>\n", css));
    }

    if !header_parts.is_empty() {
        html.push_str(&format!(
            "<header class=\"{}header\">\n{}\n</header>\n",
            options.css_class_prefix,
            header_parts.join("\n")
        ));
    }

    html.push_str("<div class=\"");
    html.push_str(&options.css_class_prefix);
    html.push_str("body\">\n");
    html.push_str(&body_parts.join("\n"));
    html.push_str("\n</div>\n");

    if !footer_parts.is_empty() {
        html.push_str(&format!(
            "<footer class=\"{}footer\">\n{}\n</footer>\n",
            options.css_class_prefix,
            footer_parts.join("\n")
        ));
    }

    if !footnote_parts.is_empty() {
        html.push_str(&format!(
            "<section class=\"{}footnotes\">\n{}\n</section>\n",
            options.css_class_prefix,
            footnote_parts.join("\n")
        ));
    }

    if !endnote_parts.is_empty() {
        html.push_str(&format!(
            "<section class=\"{}endnotes\">\n{}\n</section>\n",
            options.css_class_prefix,
            endnote_parts.join("\n")
        ));
    }

    html
}

/// HTML 컨트롤에서 추출된 문서 부분
pub(crate) enum HtmlControlPart {
    Header(String),
    Footer(String),
    Footnote { id: u16, html: String },
    Endnote { id: u16, html: String },
}

/// SubList 내부의 문단들을 HTML로 렌더링
pub(crate) fn render_sublist_paragraphs(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocHtmlOptions,
) -> String {
    let mut parts = Vec::new();
    let mut fn_ctr: u16 = 0;
    let mut en_ctr: u16 = 0;
    for para in paragraphs {
        let (body, _) = paragraph::render_paragraph(
            para,
            resources,
            binaries,
            options,
            &mut fn_ctr,
            &mut en_ctr,
        );
        if !body.is_empty() {
            parts.push(body);
        }
    }
    parts.join("\n")
}
