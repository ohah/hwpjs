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

    // 하이퍼링크 상태: paragraph 레벨에서 Run을 걸쳐 추적
    let mut hyperlink_url: Option<String> = None;
    let mut hyperlink_text_parts: Vec<String> = Vec::new();

    for run in &para.runs {
        let (run_text, mut run_controls) = render_run(
            run,
            resources,
            binaries,
            options,
            &mut footnote_counter,
            &mut endnote_counter,
            &mut hyperlink_url,
            &mut hyperlink_text_parts,
        );
        if !run_text.is_empty() {
            text_parts.push(run_text);
        }
        control_parts.append(&mut run_controls);
    }

    // 하이퍼링크가 FieldEnd 없이 끝난 경우 (HWP에서 흔함)
    if let Some(url) = hyperlink_url.take() {
        let display = hyperlink_text_parts.join("");
        let display = if display.is_empty() {
            url.clone()
        } else {
            display
        };
        text_parts.push(format!("[{}]({})", display, url));
    }

    let body = text_parts.join("");
    (body, control_parts)
}

/// Run 하나를 Markdown으로 렌더링
/// hyperlink_url/hyperlink_text_parts: paragraph 레벨에서 Run 간 하이퍼링크 상태 공유
#[allow(clippy::too_many_arguments)]
fn render_run(
    run: &Run,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
    footnote_counter: &mut u16,
    endnote_counter: &mut u16,
    hyperlink_url: &mut Option<String>,
    hyperlink_text_parts: &mut Vec<String>,
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
                    if hyperlink_url.is_some() {
                        // 하이퍼링크 범위 내 텍스트 수집 (paragraph 레벨)
                        hyperlink_text_parts.push(text);
                    } else {
                        let styled = apply_styles(&text, bold, italic, strikeout);
                        text_parts.push(styled);
                    }
                }
            }
            RunContent::Control(control) => {
                // 하이퍼링크 시작
                if let hwp_model::control::Control::FieldBegin(field) = control {
                    if field.field_type == hwp_model::types::FieldType::Hyperlink {
                        // 이전 하이퍼링크가 끝나지 않았으면 먼저 출력
                        if let Some(prev_url) = hyperlink_url.take() {
                            let display = hyperlink_text_parts.join("");
                            let display = if display.is_empty() {
                                prev_url.clone()
                            } else {
                                display
                            };
                            text_parts.push(format!("[{}]({})", display, prev_url));
                            hyperlink_text_parts.clear();
                        }
                        let url = doc_utils::extract_hyperlink_url(field);
                        if !url.is_empty() {
                            *hyperlink_url = Some(url);
                            hyperlink_text_parts.clear();
                        }
                        continue;
                    }
                }

                // 하이퍼링크 종료
                if let hwp_model::control::Control::FieldEnd = control {
                    if let Some(url) = hyperlink_url.take() {
                        let display = hyperlink_text_parts.join("");
                        let display = if display.is_empty() {
                            url.clone()
                        } else {
                            display
                        };
                        text_parts.push(format!("[{}]({})", display, url));
                        hyperlink_text_parts.clear();
                    }
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
/// 기존 viewer와 동일한 포맷: 앞뒤 빈 줄, 빈 셀은 공백, 구분선은 |---|
fn render_table(
    table: &Table,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
) -> String {
    let row_count = table.rows.len();
    let col_count = table.col_count as usize;

    if row_count == 0 || col_count == 0 {
        return String::new();
    }

    let mut lines: Vec<String> = Vec::new();
    lines.push(String::new()); // 앞 빈 줄

    for (row_idx, row) in table.rows.iter().enumerate() {
        let mut cells: Vec<String> = Vec::new();
        for cell in &row.cells {
            let cell_text = super::render_sublist_paragraphs(
                &cell.content.paragraphs,
                resources,
                binaries,
                options,
            );
            // 셀 내 줄바꿈 → <br> (기존 viewer와 동일)
            let cell_text = cell_text.replace("\n\n", "<br>").replace('\n', "<br>");
            // 빈 셀은 공백으로
            let cell_text = if cell_text.trim().is_empty() {
                " ".to_string()
            } else {
                format!(" {}<br>", cell_text.trim())
            };
            cells.push(cell_text);
        }
        // 셀 수가 col_count보다 적으면 빈 셀 채우기
        while cells.len() < col_count {
            cells.push(" ".to_string());
        }
        lines.push(format!("| {} |", cells.join(" | ")));

        // 첫 번째 행 다음 구분선 (공백 없이)
        if row_idx == 0 {
            lines.push(format!(
                "|{}|",
                (0..col_count).map(|_| "---").collect::<Vec<_>>().join("|")
            ));
        }
    }

    lines.push(String::new()); // 뒤 빈 줄
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
