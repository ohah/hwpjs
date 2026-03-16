mod paragraph;
mod shape;
mod styles;
mod table;

use crate::RenderOptions;
use hwp_model::document::Document;
use hwp_model::paragraph::{Paragraph, Run, RunContent};
use hwp_model::section::Section;

/// Document → 완전한 HTML 문자열
pub fn render(document: &Document, options: &RenderOptions) -> String {
    let mut html = String::new();

    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str("<meta charset=\"UTF-8\">\n");
    if let Some(ref title) = document.meta.title {
        html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    }
    html.push_str("<style>\n");
    html.push_str(&styles::generate_base_css());
    html.push_str(&styles::generate_char_shape_css(&document.resources));
    html.push_str(&styles::generate_para_shape_css(&document.resources));
    html.push_str("</style>\n");
    html.push_str("</head>\n<body>\n");

    for section in &document.sections {
        html.push_str(&render_section(section, document, options));
    }

    html.push_str("</body>\n</html>");
    html
}

fn render_section(section: &Section, document: &Document, options: &RenderOptions) -> String {
    let mut html = String::new();
    let page = &section.definition.page;

    html.push_str(&format!(
        "<div class=\"hwp-section\" style=\"width:{}mm;padding:{}mm {}mm {}mm {}mm;\">\n",
        styles::hwpunit_to_mm(page.width),
        styles::hwpunit_to_mm(page.margin.top),
        styles::hwpunit_to_mm(page.margin.right),
        styles::hwpunit_to_mm(page.margin.bottom),
        styles::hwpunit_to_mm(page.margin.left),
    ));

    for para in &section.paragraphs {
        html.push_str(&render_paragraph(para, document, options));
    }

    html.push_str("</div>\n");
    html
}

fn render_paragraph(para: &Paragraph, document: &Document, options: &RenderOptions) -> String {
    let mut html = String::new();
    let ps_class = format!("ps{}", para.para_shape_id);

    html.push_str(&format!("<p class=\"{}\">\n", ps_class));

    for run in &para.runs {
        html.push_str(&render_run(run, document, options));
    }

    // 빈 문단 처리
    if para.runs.is_empty() || para.runs.iter().all(|r| r.contents.is_empty()) {
        html.push_str("<br>");
    }

    html.push_str("</p>\n");
    html
}

fn render_run(run: &Run, document: &Document, options: &RenderOptions) -> String {
    let mut html = String::new();
    let cs_class = format!("cs{}", run.char_shape_id);

    for content in &run.contents {
        match content {
            RunContent::Text(tc) => {
                html.push_str(&format!("<span class=\"{}\">", cs_class));
                html.push_str(&paragraph::render_text_content(tc));
                html.push_str("</span>");
            }
            RunContent::Control(ctrl) => {
                html.push_str(&paragraph::render_control(ctrl, document, options));
            }
            RunContent::Object(obj) => {
                html.push_str(&shape::render_shape_object(obj, document, options));
            }
        }
    }

    html
}

pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
