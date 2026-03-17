/// Document 기반 문단 → HTML 변환
use hwp_model::document::BinaryStore;
use hwp_model::paragraph::{Paragraph, Run, RunContent, TextContent, TextElement};
use hwp_model::resources::Resources;
use hwp_model::shape::ShapeObject;
use hwp_model::table::Table;

use super::{render_sublist_paragraphs, DocHtmlOptions, HtmlControlPart};
use crate::viewer::doc_utils;

/// 문단 하나를 HTML로 렌더링
pub fn render_paragraph(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> (String, Vec<HtmlControlPart>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut control_parts: Vec<HtmlControlPart> = Vec::new();
    let mut has_block_element = false;

    for run in &para.runs {
        let (run_html, mut run_controls, is_block) = render_run(
            run,
            resources,
            binaries,
            options,
            footnote_counter,
            endnote_counter,
        );
        if is_block {
            has_block_element = true;
        }
        if !run_html.is_empty() {
            text_parts.push(run_html);
        }
        control_parts.append(&mut run_controls);
    }

    if text_parts.is_empty() {
        return (String::new(), control_parts);
    }

    let content = text_parts.join("");

    // 블록 요소(표, 이미지)가 있으면 <p>로 감싸지 않음
    let body = if has_block_element {
        content
    } else {
        // 인라인 스타일 적용
        let style = build_para_style(para, resources, options);
        if style.is_empty() {
            format!("<p>{}</p>", content)
        } else {
            format!("<p style=\"{}\">{}</p>", style, content)
        }
    };

    (body, control_parts)
}

/// 문단 스타일 생성
fn build_para_style(para: &Paragraph, resources: &Resources, _options: &DocHtmlOptions) -> String {
    let mut styles = Vec::new();

    if let Some(ps) = resources.para_shapes.get(para.para_shape_id as usize) {
        // 정렬
        let align = match ps.align.horizontal {
            hwp_model::types::HAlign::Left => "left",
            hwp_model::types::HAlign::Center => "center",
            hwp_model::types::HAlign::Right => "right",
            hwp_model::types::HAlign::Justify => "justify",
            _ => "",
        };
        if !align.is_empty() && align != "justify" {
            styles.push(format!("text-align: {}", align));
        }

        // 줄 간격
        if ps.line_spacing.spacing_type == hwp_model::types::LineSpacingType::Percent
            && ps.line_spacing.value != 160
        {
            styles.push(format!("line-height: {}%", ps.line_spacing.value));
        }

        // 여백
        let indent_hwp = ps.margin.indent.value;
        if indent_hwp != 0 {
            let indent_pt = indent_hwp as f64 / 100.0;
            styles.push(format!("text-indent: {:.1}pt", indent_pt));
        }
        let left_hwp = ps.margin.left.value;
        if left_hwp != 0 {
            let left_pt = left_hwp as f64 / 100.0;
            styles.push(format!("margin-left: {:.1}pt", left_pt));
        }
    }

    styles.join("; ")
}

/// Run 하나를 HTML로 렌더링. (html, controls, is_block)
fn render_run(
    run: &Run,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> (String, Vec<HtmlControlPart>, bool) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut control_parts: Vec<HtmlControlPart> = Vec::new();
    let mut is_block = false;

    let char_shape = resources.char_shapes.get(run.char_shape_id as usize);

    for content in &run.contents {
        match content {
            RunContent::Text(tc) => {
                let text = render_text_content_html(tc);
                if !text.is_empty() {
                    let styled = apply_char_style_html(&text, char_shape, resources);
                    text_parts.push(styled);
                }
            }
            RunContent::Control(control) => {
                // 하이퍼링크
                if let hwp_model::control::Control::FieldBegin(field) = control {
                    if field.field_type == hwp_model::types::FieldType::Hyperlink {
                        let url = doc_utils::extract_hyperlink_url(field);
                        let display = field
                            .sub_list
                            .as_ref()
                            .map(|sl| {
                                render_sublist_paragraphs(
                                    &sl.paragraphs,
                                    resources,
                                    binaries,
                                    options,
                                )
                            })
                            .unwrap_or_default();
                        let display = if display.is_empty() {
                            html_escape(&url)
                        } else {
                            display
                        };
                        if !url.is_empty() {
                            text_parts.push(format!(
                                "<a href=\"{}\">{}",
                                html_escape(&url),
                                display
                            ));
                            // FieldEnd에서 </a> 닫힘
                        }
                        continue;
                    }
                }
                if let hwp_model::control::Control::FieldEnd = control {
                    text_parts.push("</a>".to_string());
                    continue;
                }

                // 머리글/꼬리글/각주/미주
                if let Some(part) = extract_html_control_part(
                    control,
                    resources,
                    binaries,
                    options,
                    footnote_counter,
                    endnote_counter,
                ) {
                    control_parts.push(part);
                }
            }
            RunContent::Object(shape) => {
                let (obj_html, obj_block) =
                    render_shape_object_html(shape, resources, binaries, options);
                if obj_block {
                    is_block = true;
                }
                if !obj_html.is_empty() {
                    text_parts.push(obj_html);
                }
            }
        }
    }

    (text_parts.join(""), control_parts, is_block)
}

/// TextContent를 HTML로 변환
fn render_text_content_html(tc: &TextContent) -> String {
    let mut parts = Vec::new();
    for elem in &tc.elements {
        match elem {
            TextElement::Text(s) => parts.push(html_escape(s)),
            TextElement::Tab { .. } => parts.push("&emsp;".to_string()),
            TextElement::LineBreak => parts.push("<br>".to_string()),
            TextElement::NbSpace => parts.push("&nbsp;".to_string()),
            TextElement::FwSpace => parts.push("&ensp;".to_string()),
            TextElement::Hyphen => parts.push("-".to_string()),
            _ => {}
        }
    }
    parts.join("")
}

/// CharShape를 HTML inline style + tags로 적용
fn apply_char_style_html(
    text: &str,
    char_shape: Option<&hwp_model::resources::CharShape>,
    resources: &Resources,
) -> String {
    let cs = match char_shape {
        Some(cs) => cs,
        None => return text.to_string(),
    };

    let mut result = text.to_string();

    if cs.bold {
        result = format!("<b>{}</b>", result);
    }
    if cs.italic {
        result = format!("<i>{}</i>", result);
    }
    if cs.underline.is_some() {
        result = format!("<u>{}</u>", result);
    }
    if cs.strikeout.is_some() {
        result = format!("<del>{}</del>", result);
    }
    if cs.superscript {
        result = format!("<sup>{}</sup>", result);
    }
    if cs.subscript {
        result = format!("<sub>{}</sub>", result);
    }

    // inline style
    let mut styles = Vec::new();

    // font-size (HwpUnit → pt: / 100)
    if cs.height != 0 {
        let pt = cs.height as f64 / 100.0;
        styles.push(format!("font-size: {:.1}pt", pt));
    }

    // font-family
    let font_id = cs.font_ref.hangul as usize;
    if let Some(font) = resources.fonts.hangul.get(font_id) {
        if !font.face.is_empty() {
            styles.push(format!(
                "font-family: '{}'",
                doc_utils::escape_css_font_name(&font.face)
            ));
        }
    }

    // color
    if let Some(color) = cs.text_color {
        let r = (color >> 16) & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = color & 0xFF;
        if color != 0 {
            styles.push(format!("color: rgb({},{},{})", r, g, b));
        }
    }

    if !styles.is_empty() {
        result = format!("<span style=\"{}\">{}</span>", styles.join("; "), result);
    }

    result
}

/// ShapeObject를 HTML로 변환. (html, is_block)
fn render_shape_object_html(
    shape: &ShapeObject,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
) -> (String, bool) {
    match shape {
        ShapeObject::Table(table) => (render_table_html(table, resources, binaries, options), true),
        ShapeObject::Picture(pic) => (render_picture_html(&pic.img.binary_item_id, binaries), true),
        ShapeObject::Rectangle(rect) => {
            if let Some(ref sub_list) = rect.draw_text {
                let content =
                    render_sublist_paragraphs(&sub_list.paragraphs, resources, binaries, options);
                (
                    format!(
                        "<div class=\"{}textbox\">{}</div>",
                        options.css_class_prefix, content
                    ),
                    true,
                )
            } else {
                (String::new(), false)
            }
        }
        ShapeObject::Container(container) => {
            let mut parts = Vec::new();
            for child in &container.children {
                let (html, _) = render_shape_object_html(child, resources, binaries, options);
                if !html.is_empty() {
                    parts.push(html);
                }
            }
            (parts.join("\n"), true)
        }
        ShapeObject::Equation(eq) => {
            if eq.script.is_empty() {
                (String::new(), false)
            } else {
                (
                    format!(
                        "<span class=\"{}equation\">{}</span>",
                        options.css_class_prefix,
                        html_escape(&eq.script)
                    ),
                    false,
                )
            }
        }
        _ => (String::new(), false),
    }
}

/// Table을 HTML <table>로 변환
fn render_table_html(
    table: &Table,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
) -> String {
    if table.rows.is_empty() {
        return String::new();
    }

    let mut html = format!("<table class=\"{}table\">\n", options.css_class_prefix);

    for row in &table.rows {
        html.push_str("<tr>\n");
        for cell in &row.cells {
            let tag = if cell.header { "th" } else { "td" };
            let mut attrs = Vec::new();
            if cell.col_span > 1 {
                attrs.push(format!("colspan=\"{}\"", cell.col_span));
            }
            if cell.row_span > 1 {
                attrs.push(format!("rowspan=\"{}\"", cell.row_span));
            }
            let attrs_str = if attrs.is_empty() {
                String::new()
            } else {
                format!(" {}", attrs.join(" "))
            };

            let cell_content =
                render_sublist_paragraphs(&cell.content.paragraphs, resources, binaries, options);
            html.push_str(&format!(
                "<{}{}>{}  </{}>\n",
                tag, attrs_str, cell_content, tag
            ));
        }
        html.push_str("</tr>\n");
    }

    html.push_str("</table>");
    html
}

/// 이미지를 HTML <img>로 변환
fn render_picture_html(binary_item_id: &str, binaries: &BinaryStore) -> String {
    if let Some(item) = doc_utils::find_binary_item(binary_item_id, binaries) {
        if item.data.is_empty() {
            format!("<img src=\"{}\" alt=\"이미지\">", html_escape(&item.src))
        } else {
            let mime = doc_utils::image_format_to_mime(&item.format);
            let b64 = {
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.encode(&item.data)
            };
            format!("<img src=\"data:{};base64,{}\" alt=\"이미지\">", mime, b64)
        }
    } else if !binary_item_id.is_empty() {
        format!(
            "<img src=\"{}\" alt=\"이미지\">",
            html_escape(binary_item_id)
        )
    } else {
        String::new()
    }
}

/// 컨트롤에서 HtmlControlPart 추출
fn extract_html_control_part(
    control: &hwp_model::control::Control,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> Option<HtmlControlPart> {
    match control {
        hwp_model::control::Control::Header(hf) => {
            let html =
                render_sublist_paragraphs(&hf.content.paragraphs, resources, binaries, options);
            Some(HtmlControlPart::Header(html))
        }
        hwp_model::control::Control::Footer(hf) => {
            let html =
                render_sublist_paragraphs(&hf.content.paragraphs, resources, binaries, options);
            Some(HtmlControlPart::Footer(html))
        }
        hwp_model::control::Control::FootNote(note) => {
            *footnote_counter += 1;
            let id = note.number.unwrap_or(*footnote_counter);
            let html =
                render_sublist_paragraphs(&note.content.paragraphs, resources, binaries, options);
            Some(HtmlControlPart::Footnote { id, html })
        }
        hwp_model::control::Control::EndNote(note) => {
            *endnote_counter += 1;
            let id = note.number.unwrap_or(*endnote_counter);
            let html =
                render_sublist_paragraphs(&note.content.paragraphs, resources, binaries, options);
            Some(HtmlControlPart::Endnote { id, html })
        }
        _ => None,
    }
}

/// HTML 이스케이프
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
