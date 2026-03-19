/// Document 기반 문단 → HTML 변환
use hwp_model::document::BinaryStore;
use hwp_model::paragraph::{Paragraph, Run, RunContent, TextContent, TextElement};
use hwp_model::resources::Resources;
use hwp_model::shape::ShapeObject;
use hwp_model::table::Table;
use hwp_model::types::HeadingType;

use super::{render_sublist_paragraphs, DocHtmlOptions, HtmlControlPart};
use crate::viewer::core::outline::{
    format_outline_number, format_with_numbering, OutlineNumberTracker,
};
use crate::viewer::doc_utils;

/// 개요/번호 추적기를 사용하여 문단을 HTML로 렌더링
#[allow(clippy::too_many_arguments)]
pub fn render_paragraph_with_tracker(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
    outline_tracker: &mut OutlineNumberTracker,
    number_tracker: &mut std::collections::HashMap<u16, OutlineNumberTracker>,
) -> (String, Vec<HtmlControlPart>) {
    let pc = render_paragraph_content(
        para,
        resources,
        binaries,
        options,
        footnote_counter,
        endnote_counter,
    );

    if pc.content.is_empty() {
        return (String::new(), pc.controls);
    }

    // 개요/번호/글머리표 적용 (content를 직접 사용, strip_p_tag 불필요)
    if let Some(ps) = resources.para_shapes.get(para.para_shape_id as usize) {
        if let Some(ref heading) = ps.heading {
            match heading.heading_type {
                HeadingType::Outline => {
                    let level = heading.level + 1;
                    let number = outline_tracker.get_and_increment(level);
                    let num_str = format_outline_number(level, number);
                    let tag = if (1..=6).contains(&level) {
                        format!("h{}", level)
                    } else {
                        "p".to_string()
                    };
                    let html = format!(
                        "<{} class=\"{}outline-{}\"><span class=\"{}outline-number\">{}</span> {}</{}>",
                        tag, options.css_class_prefix, level,
                        options.css_class_prefix,
                        html_escape(&num_str), pc.content, tag
                    );
                    return (html, pc.controls);
                }
                HeadingType::Bullet => {
                    let html = format!(
                        "<p class=\"{}bullet\">{}</p>",
                        options.css_class_prefix, pc.content
                    );
                    return (html, pc.controls);
                }
                HeadingType::Number => {
                    let level = heading.level + 1;
                    let tracker = number_tracker.entry(heading.id_ref).or_default();
                    let number = tracker.get_and_increment(level);
                    let num_str =
                        format_with_numbering(heading.id_ref, level, number, resources);
                    let html = format!(
                        "<p class=\"{}number-{}\"><span class=\"{}number\">{}</span> {}</p>",
                        options.css_class_prefix, level,
                        options.css_class_prefix,
                        html_escape(&num_str), pc.content
                    );
                    return (html, pc.controls);
                }
                _ => {}
            }
        }
    }

    // heading 미적용: 일반 문단으로 렌더링
    let body = if pc.has_block {
        pc.content
    } else if pc.para_style.is_empty() {
        format!("<p>{}</p>", pc.content)
    } else {
        format!("<p style=\"{}\">{}</p>", pc.para_style, pc.content)
    };

    (body, pc.controls)
}

/// 문단 내부 콘텐츠와 메타데이터를 반환 (wrapper 태그 없이)
struct ParagraphContent {
    /// 내부 HTML 콘텐츠 (태그 미포함)
    content: String,
    /// 블록 요소 포함 여부
    has_block: bool,
    /// 인라인 스타일 (빈 문자열이면 없음)
    para_style: String,
    /// 추출된 컨트롤 파트
    controls: Vec<HtmlControlPart>,
}

/// 문단 내부 콘텐츠 추출 (wrapper 없이)
fn render_paragraph_content(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> ParagraphContent {
    let mut content = String::new();
    let mut controls: Vec<HtmlControlPart> = Vec::new();
    let mut has_block = false;

    let mut in_hyperlink = false;
    for run in &para.runs {
        let (run_html, mut run_controls, is_block) = render_run(
            run,
            resources,
            binaries,
            options,
            footnote_counter,
            endnote_counter,
            &mut in_hyperlink,
        );
        if is_block {
            has_block = true;
        }
        if !run_html.is_empty() {
            content.push_str(&run_html);
        }
        controls.append(&mut run_controls);
    }
    // FieldEnd 없이 문단이 끝난 경우 방어적 닫기
    if in_hyperlink {
        content.push_str("</a>");
    }
    let para_style = if has_block || content.is_empty() {
        String::new()
    } else {
        build_para_style(para, resources, options)
    };

    ParagraphContent {
        content,
        has_block,
        para_style,
        controls,
    }
}

/// 문단 하나를 HTML로 렌더링 (<p> 태그 포함)
pub fn render_paragraph(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocHtmlOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> (String, Vec<HtmlControlPart>) {
    let pc = render_paragraph_content(
        para,
        resources,
        binaries,
        options,
        footnote_counter,
        endnote_counter,
    );

    if pc.content.is_empty() {
        return (String::new(), pc.controls);
    }

    let body = if pc.has_block {
        pc.content
    } else if pc.para_style.is_empty() {
        format!("<p>{}</p>", pc.content)
    } else {
        format!("<p style=\"{}\">{}</p>", pc.para_style, pc.content)
    };

    (body, pc.controls)
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

        // 줄 간격 (Percent/Fixed/Between 모두 값을 %로 출력)
        if ps.line_spacing.value != 160
            || ps.line_spacing.spacing_type != hwp_model::types::LineSpacingType::Percent
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
    in_hyperlink: &mut bool,
) -> (String, Vec<HtmlControlPart>, bool) {
    let mut html_buf = String::new();
    let mut control_parts: Vec<HtmlControlPart> = Vec::new();
    let mut is_block = false;

    let char_shape = resources.char_shapes.get(run.char_shape_id as usize);

    // 연속 TextContent를 합쳐서 한 번에 style 적용 (불필요한 span 분리 방지)
    let mut text_accum = String::new();
    let mut flush_text = |buf: &mut String, html: &mut String| {
        if !buf.is_empty() {
            let styled = apply_char_style_html(buf, char_shape, resources);
            html.push_str(&styled);
            buf.clear();
        }
    };

    for content in &run.contents {
        match content {
            RunContent::Text(tc) => {
                let text = render_text_content_html(tc);
                text_accum.push_str(&text);
            }
            RunContent::Control(control) => {
                flush_text(&mut text_accum, &mut html_buf);
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
                            html_buf.push_str("<a href=\"");
                            html_buf.push_str(&html_escape(&url));
                            html_buf.push_str("\">");
                            html_buf.push_str(&display);
                            *in_hyperlink = true;
                        }
                        continue;
                    }
                }
                if let hwp_model::control::Control::FieldEnd = control {
                    if *in_hyperlink {
                        html_buf.push_str("</a>");
                        *in_hyperlink = false;
                    }
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
                flush_text(&mut text_accum, &mut html_buf);
                let (obj_html, obj_block) =
                    render_shape_object_html(shape, resources, binaries, options);
                if obj_block {
                    is_block = true;
                }
                if !obj_html.is_empty() {
                    html_buf.push_str(&obj_html);
                }
            }
        }
    }
    flush_text(&mut text_accum, &mut html_buf);

    (html_buf, control_parts, is_block)
}

/// TextContent를 HTML로 변환
fn render_text_content_html(tc: &TextContent) -> String {
    let mut result = String::new();
    for elem in &tc.elements {
        match elem {
            TextElement::Text(s) => {
                if s.contains('\t') {
                    // Tab 제어 문자 뒤에 literal \t가 중복으로 포함되는 경우 제거
                    let cleaned: String = s.chars().filter(|c| *c != '\t').collect();
                    result.push_str(&html_escape(&cleaned));
                } else {
                    result.push_str(&html_escape(s));
                }
            }
            TextElement::Tab { .. } => result.push_str("&emsp;"),
            TextElement::LineBreak => result.push_str("<br>"),
            TextElement::NbSpace => result.push_str("&nbsp;"),
            TextElement::FwSpace => result.push_str("&ensp;"),
            TextElement::Hyphen => result.push('-'),
            _ => {}
        }
    }
    result
}

/// CharShape를 HTML inline style + tags로 적용 (단일 buffer 방식)
fn apply_char_style_html(
    text: &str,
    char_shape: Option<&hwp_model::resources::CharShape>,
    resources: &Resources,
) -> String {
    let cs = match char_shape {
        Some(cs) => cs,
        None => return text.to_string(),
    };

    // 여는 태그 수집 (안쪽 → 바깥쪽 순서로 닫힘)
    let mut open_tags = String::new();
    let mut close_tags = String::new();

    if cs.bold {
        open_tags.push_str("<b>");
        close_tags.insert_str(0, "</b>");
    }
    if cs.italic {
        open_tags.push_str("<i>");
        close_tags.insert_str(0, "</i>");
    }
    if let Some(ref ul) = cs.underline {
        if ul.underline_type == hwp_model::types::UnderlineType::Center {
            // 가운데줄(Center)은 취소선으로 렌더링
            open_tags.push_str("<del>");
            close_tags.insert_str(0, "</del>");
        } else {
            open_tags.push_str("<u>");
            close_tags.insert_str(0, "</u>");
        }
    }
    if cs.strikeout.is_some() {
        open_tags.push_str("<del>");
        close_tags.insert_str(0, "</del>");
    }
    if cs.superscript {
        open_tags.push_str("<sup>");
        close_tags.insert_str(0, "</sup>");
    }
    if cs.subscript {
        open_tags.push_str("<sub>");
        close_tags.insert_str(0, "</sub>");
    }

    // inline style
    let mut style_buf = String::new();

    // font-size (HwpUnit → pt: / 100)
    if cs.height != 0 {
        use std::fmt::Write;
        write!(style_buf, "font-size: {:.1}pt", cs.height as f64 / 100.0).ok();
    }

    // font-family
    let font_id = cs.font_ref.hangul as usize;
    if let Some(font) = resources.fonts.hangul.get(font_id) {
        if !font.face.is_empty() {
            if !style_buf.is_empty() {
                style_buf.push_str("; ");
            }
            style_buf.push_str("font-family: '");
            style_buf.push_str(&doc_utils::escape_css_font_name(&font.face));
            style_buf.push('\'');
        }
    }

    // color
    if let Some(color) = cs.text_color {
        if color != 0 {
            let r = (color >> 16) & 0xFF;
            let g = (color >> 8) & 0xFF;
            let b = color & 0xFF;
            if !style_buf.is_empty() {
                style_buf.push_str("; ");
            }
            use std::fmt::Write;
            write!(style_buf, "color: rgb({},{},{})", r, g, b).ok();
        }
    }

    // 최종 조합: <span style="..."><b><i>text</i></b></span>
    let mut result = String::with_capacity(
        style_buf.len() + open_tags.len() + close_tags.len() + text.len() + 30,
    );
    if !style_buf.is_empty() {
        result.push_str("<span style=\"");
        result.push_str(&style_buf);
        result.push_str("\">");
    }
    result.push_str(&open_tags);
    result.push_str(text);
    result.push_str(&close_tags);
    if !style_buf.is_empty() {
        result.push_str("</span>");
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
        ShapeObject::Picture(pic) => (
            render_picture_html(
                &pic.img.binary_item_id,
                binaries,
                options.image_output_dir.as_deref(),
            ),
            true,
        ),
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

    let table_style = build_cell_style(table.border_fill_id, resources);
    let mut html = if table_style.is_empty() {
        format!(
            "<table class=\"{}table\" style=\"border-collapse: collapse\">\n",
            options.css_class_prefix
        )
    } else {
        format!(
            "<table class=\"{}table\" style=\"border-collapse: collapse; {}\">\n",
            options.css_class_prefix, table_style
        )
    };

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

            // border_fill_id + width로 셀 스타일 적용
            let mut cell_styles = Vec::new();
            let bf_style = build_cell_style(cell.border_fill_id, resources);
            if !bf_style.is_empty() {
                cell_styles.push(bf_style);
            }
            if cell.width > 0 {
                cell_styles.push(format!("width: {:.1}pt", cell.width as f64 / 100.0));
            }
            if !cell_styles.is_empty() {
                attrs.push(format!("style=\"{}\"", cell_styles.join("; ")));
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

    // 캡션 렌더링
    if let Some(ref caption) = table.common.caption {
        let cap_content =
            render_sublist_paragraphs(&caption.content.paragraphs, resources, binaries, options);
        if !cap_content.is_empty() {
            html.push_str(&format!(
                "<div class=\"{}textbox\">{}</div>",
                options.css_class_prefix, cap_content
            ));
        }
    }

    html
}

/// 이미지를 HTML <img>로 변환
fn render_picture_html(
    binary_item_id: &str,
    binaries: &BinaryStore,
    image_output_dir: Option<&str>,
) -> String {
    if let Some(item) = doc_utils::find_binary_item(binary_item_id, binaries) {
        if item.data.is_empty() {
            format!("<img src=\"{}\" alt=\"이미지\">", html_escape(&item.src))
        } else if let Some(dir) = image_output_dir {
            // 이미지를 파일로 저장
            let ext = match doc_utils::image_format_to_mime(&item.format) {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/gif" => "gif",
                "image/bmp" => "bmp",
                "image/tiff" => "tiff",
                "image/wmf" => "wmf",
                "image/emf" => "emf",
                _ => "bin",
            };
            let file_name = format!("{}.{}", binary_item_id, ext);
            let file_path = std::path::Path::new(dir).join(&file_name);
            if std::fs::write(&file_path, &item.data).is_ok() {
                format!(
                    "<img src=\"{}\" alt=\"이미지\">",
                    html_escape(&file_path.display().to_string())
                )
            } else {
                // 파일 저장 실패 시 base64 fallback
                let mime = doc_utils::image_format_to_mime(&item.format);
                let b64 = {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD.encode(&item.data)
                };
                format!("<img src=\"data:{};base64,{}\" alt=\"이미지\">", mime, b64)
            }
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

/// BorderFill로부터 셀 CSS 스타일 생성
fn build_cell_style(border_fill_id: u16, resources: &Resources) -> String {
    if border_fill_id == 0 {
        return String::new();
    }
    // border_fill_id는 1-based
    let bf = match resources.border_fills.get((border_fill_id as usize).wrapping_sub(1)) {
        Some(bf) => bf,
        None => return String::new(),
    };

    let mut styles = Vec::new();

    // 배경색
    if let Some(ref fill) = bf.fill {
        let color = match fill {
            hwp_model::resources::FillBrush::WinBrush { face_color, .. } => *face_color,
            hwp_model::resources::FillBrush::Gradation { colors, .. } => {
                colors.first().copied().flatten()
            }
            _ => None,
        };
        if let Some(c) = color {
            if c != 0xFFFFFF && c != 0 {
                let r = (c >> 16) & 0xFF;
                let g = (c >> 8) & 0xFF;
                let b = c & 0xFF;
                styles.push(format!("background-color: rgb({},{},{})", r, g, b));
            }
        }
    }

    // 테두리
    fn border_css(line: &Option<hwp_model::resources::LineSpec>, side: &str) -> Option<String> {
        let line = line.as_ref()?;
        let color = line.color?;
        if color == 0xFFFFFF {
            return None;
        }
        let r = (color >> 16) & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = color & 0xFF;
        let width = if line.width.is_empty() {
            "1px"
        } else {
            &line.width
        };
        Some(format!(
            "border-{}: {} solid rgb({},{},{})",
            side, width, r, g, b
        ))
    }

    if let Some(s) = border_css(&bf.left_border, "left") {
        styles.push(s);
    }
    if let Some(s) = border_css(&bf.right_border, "right") {
        styles.push(s);
    }
    if let Some(s) = border_css(&bf.top_border, "top") {
        styles.push(s);
    }
    if let Some(s) = border_css(&bf.bottom_border, "bottom") {
        styles.push(s);
    }

    styles.join("; ")
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
