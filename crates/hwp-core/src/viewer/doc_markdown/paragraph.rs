/// Document 기반 문단 → Markdown 변환
use hwp_model::document::BinaryStore;
use hwp_model::paragraph::{Paragraph, Run, RunContent, TextContent, TextElement};
use hwp_model::resources::Resources;
use hwp_model::shape::ShapeObject;
use hwp_model::table::Table;

use super::{extract_control_parts, ControlPart, DocMarkdownOptions};
use crate::viewer::doc_utils;

/// 문단 하나를 Markdown으로 렌더링.
/// (본문 텍스트, 추출된 컨트롤 파트들) 반환.
pub fn render_paragraph(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
) -> (String, Vec<ControlPart>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut control_parts: Vec<ControlPart> = Vec::new();
    let mut footnote_counter: u16 = 0;
    let mut endnote_counter: u16 = 0;

    for run in &para.runs {
        let (run_text, mut run_controls) = render_run(
            run,
            resources,
            binaries,
            options,
            &mut footnote_counter,
            &mut endnote_counter,
        );
        if !run_text.is_empty() {
            text_parts.push(run_text);
        }
        control_parts.append(&mut run_controls);
    }

    let body = text_parts.join("");
    (body, control_parts)
}

/// Run 하나를 Markdown으로 렌더링
fn render_run(
    run: &Run,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
) -> (String, Vec<ControlPart>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut control_parts: Vec<ControlPart> = Vec::new();

    // CharShape에서 스타일 정보 가져오기
    // 기존 viewer와 동일: bold, italic, strikethrough만 적용 (underline 미적용)
    // underline_type == Center(2)는 취소선으로 처리
    let char_shape = resources.char_shapes.get(run.char_shape_id as usize);
    let bold = char_shape.is_some_and(|cs| cs.bold);
    let italic = char_shape.is_some_and(|cs| cs.italic);
    let strikeout = char_shape.is_some_and(|cs| {
        cs.strikeout.is_some()
            || cs
                .underline
                .as_ref()
                .is_some_and(|u| u.underline_type == hwp_model::types::UnderlineType::Center)
    });

    for content in &run.contents {
        match content {
            RunContent::Text(text_content) => {
                let text = render_text_content(text_content);
                if !text.is_empty() {
                    let styled = apply_styles(&text, bold, italic, strikeout);
                    text_parts.push(styled);
                }
            }
            RunContent::Control(control) => {
                // 하이퍼링크 필드 등은 inline 텍스트로 처리
                if let hwp_model::control::Control::FieldBegin(field) = control {
                    if field.field_type == hwp_model::types::FieldType::Hyperlink {
                        let url = doc_utils::extract_hyperlink_url(field);
                        let display = field
                            .sub_list
                            .as_ref()
                            .map(|sl| {
                                super::render_sublist_paragraphs(
                                    &sl.paragraphs,
                                    resources,
                                    binaries,
                                    options,
                                )
                            })
                            .unwrap_or_default();
                        let display = if display.is_empty() {
                            url.clone()
                        } else {
                            display
                        };
                        if !url.is_empty() {
                            text_parts.push(format!("[{}]({})", display, url));
                        }
                        continue;
                    }
                }

                // FieldEnd는 Markdown에서는 무시 (하이퍼링크는 FieldBegin에서 완결)
                if let hwp_model::control::Control::FieldEnd = control {
                    continue;
                }

                // 머리글/꼬리글/각주/미주 추출
                if let Some(part) = extract_control_parts(
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
                let obj_text = render_shape_object(shape, resources, binaries, options);
                if !obj_text.is_empty() {
                    text_parts.push(obj_text);
                }
            }
        }
    }

    (text_parts.join(""), control_parts)
}

/// TextContent를 Markdown 텍스트로 변환
fn render_text_content(tc: &TextContent) -> String {
    let mut parts = Vec::new();
    for elem in &tc.elements {
        match elem {
            TextElement::Text(s) => parts.push(s.clone()),
            TextElement::Tab { .. } => parts.push("\t".to_string()),
            TextElement::LineBreak => parts.push("  \n".to_string()),
            TextElement::NbSpace => parts.push("\u{00a0}".to_string()),
            TextElement::FwSpace => parts.push(" ".to_string()),
            TextElement::Hyphen => parts.push("-".to_string()),
            _ => {} // MarkpenBegin/End, TitleMark, InsertBegin/End 등 무시
        }
    }
    parts.join("")
}

/// ShapeObject를 Markdown으로 변환
fn render_shape_object(
    shape: &ShapeObject,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
) -> String {
    match shape {
        ShapeObject::Table(table) => render_table(table, resources, binaries, options),
        ShapeObject::Picture(pic) => render_picture(&pic.img.binary_item_id, binaries),
        ShapeObject::Rectangle(rect) => {
            // 텍스트 박스 (draw_text가 있는 경우)
            if let Some(ref sub_list) = rect.draw_text {
                super::render_sublist_paragraphs(&sub_list.paragraphs, resources, binaries, options)
            } else {
                String::new()
            }
        }
        ShapeObject::Container(container) => {
            let mut parts = Vec::new();
            for child in &container.children {
                let text = render_shape_object(child, resources, binaries, options);
                if !text.is_empty() {
                    parts.push(text);
                }
            }
            parts.join("\n\n")
        }
        ShapeObject::Equation(eq) => {
            if eq.script.is_empty() {
                String::new()
            } else {
                format!("`{}`", eq.script)
            }
        }
        _ => String::new(),
    }
}

/// Table을 Markdown 표로 변환
fn render_table(
    table: &Table,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
) -> String {
    if table.rows.is_empty() {
        return String::new();
    }

    let mut lines: Vec<String> = Vec::new();

    for (row_idx, row) in table.rows.iter().enumerate() {
        let mut cells: Vec<String> = Vec::new();
        for cell in &row.cells {
            let cell_text = super::render_sublist_paragraphs(
                &cell.content.paragraphs,
                resources,
                binaries,
                options,
            );
            // Markdown 표에서는 줄바꿈을 <br>이나 공백으로 대체
            let cell_text = cell_text.replace("\n\n", " ").replace('\n', " ");
            cells.push(cell_text);
        }
        lines.push(format!("| {} |", cells.join(" | ")));

        // 첫 번째 행 이후 구분선 추가
        if row_idx == 0 {
            let sep: Vec<&str> = cells.iter().map(|_| "---").collect();
            lines.push(format!("| {} |", sep.join(" | ")));
        }
    }

    lines.join("\n")
}

/// 이미지를 Markdown으로 변환
fn render_picture(binary_item_id: &str, binaries: &BinaryStore) -> String {
    if let Some(item) = doc_utils::find_binary_item(binary_item_id, binaries) {
        if item.data.is_empty() {
            format!("![이미지]({})", item.src)
        } else {
            let mime = doc_utils::image_format_to_mime(&item.format);
            let b64 = base64_encode(&item.data);
            format!("![이미지](data:{};base64,{})", mime, b64)
        }
    } else if !binary_item_id.is_empty() {
        format!("![이미지]({})", binary_item_id)
    } else {
        String::new()
    }
}

/// 텍스트에 Markdown 스타일 적용
/// 기존 viewer와 동일: italic(안쪽) → bold → strikethrough(바깥쪽). underline 미적용.
fn apply_styles(text: &str, bold: bool, italic: bool, strikeout: bool) -> String {
    if text.is_empty() || text.chars().all(|c| c.is_whitespace()) {
        return text.to_string();
    }
    let mut result = text.to_string();
    if italic {
        result = format!("*{}*", result);
    }
    if bold {
        result = format!("**{}**", result);
    }
    if strikeout {
        result = format!("~~{}~~", result);
    }
    result
}

/// 간단한 base64 인코딩 (base64 crate 사용)
fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}
