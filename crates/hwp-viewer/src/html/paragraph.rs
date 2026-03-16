use super::escape_html;
use crate::RenderOptions;
use hwp_model::control::*;
use hwp_model::document::Document;
use hwp_model::paragraph::*;

/// TextContent → HTML
pub fn render_text_content(tc: &TextContent) -> String {
    let mut html = String::new();

    for elem in &tc.elements {
        match elem {
            TextElement::Text(s) => {
                html.push_str(&escape_html(s));
            }
            TextElement::Tab { .. } => {
                html.push_str("&emsp;");
            }
            TextElement::LineBreak => {
                html.push_str("<br>");
            }
            TextElement::Hyphen => {
                html.push('-');
            }
            TextElement::NbSpace => {
                html.push_str("&nbsp;");
            }
            TextElement::FwSpace => {
                html.push_str("&ensp;");
            }
            TextElement::MarkpenBegin { color } => {
                let color_str = color
                    .map(|c| format!("#{:06x}", c))
                    .unwrap_or_else(|| "#ffff00".to_string());
                html.push_str(&format!("<span style=\"background-color:{};\">", color_str));
            }
            TextElement::MarkpenEnd => {
                html.push_str("</span>");
            }
            TextElement::TitleMark { .. } => {
                // 목차 표시 마커 — 렌더링 시 무시
            }
            TextElement::InsertBegin { .. } => {
                html.push_str("<ins>");
            }
            TextElement::InsertEnd { .. } => {
                html.push_str("</ins>");
            }
            TextElement::DeleteBegin { .. } => {
                html.push_str("<del>");
            }
            TextElement::DeleteEnd { .. } => {
                html.push_str("</del>");
            }
        }
    }

    html
}

/// Control → HTML
pub fn render_control(ctrl: &Control, document: &Document, options: &RenderOptions) -> String {
    match ctrl {
        Control::Header(hf) => render_header_footer(hf, "hwp-header", document, options),
        Control::Footer(hf) => render_header_footer(hf, "hwp-footer", document, options),
        Control::FootNote(note) => render_note(note, "footnote", document, options),
        Control::EndNote(note) => render_note(note, "endnote", document, options),
        Control::AutoNum(an) => render_auto_num(an),
        Control::FieldBegin(field) => render_field_begin(field),
        Control::FieldEnd => String::new(),
        Control::Bookmark(_) => String::new(),
        Control::Column(_) => String::new(),
        Control::NewNum(_) => String::new(),
        Control::PageNumCtrl(_) => String::new(),
        Control::PageHiding(_) => String::new(),
        Control::Compose(c) => render_compose(c),
        Control::Dutmal(d) => render_dutmal(d),
        Control::HiddenDesc(_) => String::new(),
    }
}

fn render_header_footer(
    hf: &HeaderFooter,
    class: &str,
    document: &Document,
    options: &RenderOptions,
) -> String {
    let mut html = format!("<div class=\"{}\">\n", class);
    for para in &hf.content.paragraphs {
        html.push_str(&super::render_paragraph(para, document, options));
    }
    html.push_str("</div>\n");
    html
}

fn render_note(note: &Note, kind: &str, document: &Document, options: &RenderOptions) -> String {
    let num = note.number.unwrap_or(0);
    let mut html = format!("<sup class=\"hwp-footnote-ref\">{}</sup>", num);

    // 각주/미주 본문은 페이지 하단에 모아야 하지만, 일단 인라인으로 표시
    html.push_str(&format!(
        "<div class=\"hwp-footnote-body\" data-type=\"{}\" data-num=\"{}\">",
        kind, num
    ));
    for para in &note.content.paragraphs {
        html.push_str(&super::render_paragraph(para, document, options));
    }
    html.push_str("</div>\n");
    html
}

fn render_auto_num(an: &AutoNum) -> String {
    format!("{}", an.num)
}

fn render_field_begin(field: &Field) -> String {
    match field.field_type {
        hwp_model::types::FieldType::Hyperlink => {
            let url = field
                .parameters
                .iter()
                .find_map(|p| {
                    if let FieldParameter::String { name, value } = p {
                        if name == "Path" {
                            return Some(value.clone());
                        }
                    }
                    None
                })
                .unwrap_or_default();

            if url.is_empty() {
                String::new()
            } else {
                format!("<a href=\"{}\" target=\"_blank\">", escape_html(&url))
            }
        }
        _ => String::new(),
    }
}

fn render_compose(c: &Compose) -> String {
    c.compose_text.as_deref().unwrap_or("").to_string()
}

fn render_dutmal(d: &Dutmal) -> String {
    format!(
        "<ruby>{}<rp>(</rp><rt>{}</rt><rp>)</rp></ruby>",
        escape_html(&d.main_text),
        escape_html(&d.sub_text)
    )
}
