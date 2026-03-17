/// Document 기반 문단 → Markdown 변환
use hwp_model::document::BinaryStore;
use hwp_model::paragraph::{Paragraph, Run, RunContent, TextContent, TextElement};
use hwp_model::resources::Resources;
use hwp_model::shape::ShapeObject;
use hwp_model::table::Table;
use hwp_model::types::HeadingType;

use super::{extract_control_parts, ControlPart, DocMarkdownOptions};
use crate::viewer::core::outline::{format_outline_number, OutlineNumberTracker};
use crate::viewer::doc_utils;

/// Numbering format_string을 사용하여 번호 포맷
/// 기존 viewer의 compute_outline_marker와 동일한 로직
fn format_with_numbering(id_ref: u16, level: u8, number: u32, resources: &Resources) -> String {
    // id_ref > 0이면 해당 numbering ID 사용 (1-based)
    let numbering_id = if id_ref > 0 {
        (id_ref - 1) as usize
    } else {
        return format_outline_number(level, number);
    };
    if let Some(numbering) = resources.numberings.get(numbering_id) {
        let level_index = (level.saturating_sub(1)) as usize;
        if let Some(level_info) = numbering.levels.get(level_index) {
            let fs = &level_info.format_string;
            // 기존 viewer와 동일한 유효성 검사:
            // - 비어있지 않고
            // - ^N 플레이스홀더가 있고
            // - 제어 문자가 없어야 유효
            if !fs.is_empty()
                && fs.contains('^')
                && !fs.chars().any(|c| c.is_control() && c != '\t')
            {
                let formatted = crate::viewer::core::outline::format_numbering_string(
                    fs,
                    number,
                    convert_num_format(&level_info.num_format),
                );
                return formatted;
            }
        }
    }
    format_outline_number(level, number)
}

/// hwp_model NumberType2 → HwpDocument NumberType 변환
fn convert_num_format(
    nf: &hwp_model::types::NumberType2,
) -> crate::document::docinfo::numbering::NumberType {
    use crate::document::docinfo::numbering::NumberType;
    match nf {
        hwp_model::types::NumberType2::Digit => NumberType::Arabic,
        hwp_model::types::NumberType2::CircledDigit => NumberType::CircledDigits,
        hwp_model::types::NumberType2::RomanCapital => NumberType::UpperRoman,
        hwp_model::types::NumberType2::RomanSmall => NumberType::LowerRoman,
        hwp_model::types::NumberType2::LatinCapital => NumberType::UpperAlpha,
        hwp_model::types::NumberType2::LatinSmall => NumberType::LowerAlpha,
        hwp_model::types::NumberType2::HangulSyllable => NumberType::HangulGa,
        hwp_model::types::NumberType2::HangulJamo => NumberType::HangulGaCycle,
        _ => NumberType::Arabic,
    }
}

/// 문단 하나를 Markdown으로 렌더링.
/// (본문 텍스트, 추출된 컨트롤 파트들, heading 적용 여부) 반환.
pub fn render_paragraph_with_tracker(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
    outline_tracker: &mut OutlineNumberTracker,
    number_tracker: &mut std::collections::HashMap<u16, OutlineNumberTracker>,
    section_outline_id: u16,
) -> (String, Vec<ControlPart>, bool) {
    let (body, ctrl_parts) = render_paragraph(para, resources, binaries, options);

    // 개요 번호 / 글머리표 적용
    if !body.is_empty() {
        if let Some(ps) = resources.para_shapes.get(para.para_shape_id as usize) {
            if let Some(ref heading) = ps.heading {
                let body_trimmed = body.trim_end();
                match heading.heading_type {
                    HeadingType::Outline => {
                        let level = heading.level + 1;
                        let number = outline_tracker.get_and_increment(level);
                        // 기존 Markdown viewer와 동일: Outline은 항상 기본 형식 사용
                        // (format_string은 HTML viewer에서만 사용)
                        let num_str = format_outline_number(level, number);
                        if (1..=6).contains(&level) {
                            let heading_prefix = "#".repeat(level as usize);
                            return (
                                format!("{} {} {}", heading_prefix, num_str, body_trimmed),
                                ctrl_parts,
                                true,
                            );
                        } else {
                            return (
                                format!("{} {}", num_str, body_trimmed),
                                ctrl_parts,
                                true,
                            );
                        }
                    }
                    HeadingType::Bullet => {
                        return (format!("- {}", body_trimmed), ctrl_parts, true);
                    }
                    HeadingType::Number => {
                        let level = heading.level + 1;
                        // Number 타입은 numbering_id별 독립 카운터 사용 (기존 viewer의 NumberTracker와 동일)
                        let tracker = number_tracker
                            .entry(heading.id_ref)
                            .or_insert_with(OutlineNumberTracker::new);
                        let number = tracker.get_and_increment(level);
                        let indent = "  ".repeat(heading.level as usize);
                        let num_str = format_with_numbering(
                            heading.id_ref,
                            level,
                            number,
                            resources,
                        );
                        return (
                            format!("{}{} {}", indent, num_str, body_trimmed),
                            ctrl_parts,
                            true,
                        );
                    }
                    _ => {}
                }
            }
        }
    }

    (body, ctrl_parts, false)
}

/// (본문 텍스트, 추출된 컨트롤 파트들) 반환.
pub fn render_paragraph(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
) -> (String, Vec<ControlPart>) {
    render_paragraph_inner(para, resources, binaries, options, None)
}

/// 스타일 적용을 강제할 수 있는 내부 함수
fn render_paragraph_inner(
    para: &Paragraph,
    resources: &Resources,
    binaries: &BinaryStore,
    options: &DocMarkdownOptions,
    force_apply_styles: Option<bool>,
) -> (String, Vec<ControlPart>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut control_parts: Vec<ControlPart> = Vec::new();
    let mut footnote_counter: u16 = 0;
    let mut endnote_counter: u16 = 0;

    let mut hyperlink_url: Option<String> = None;
    let mut hyperlink_text_parts: Vec<String> = Vec::new();

    // force_apply_styles가 Some(true)이면 스타일 강제 적용
    let skip_styles = match force_apply_styles {
        Some(true) => false,
        Some(false) => true,
        None => !para.has_char_shapes,
    };

    for run in &para.runs {
        let (run_text, mut run_controls) = render_run(
            run,
            resources,
            binaries,
            options,
            skip_styles,
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

    // 하이퍼링크가 FieldEnd 없이 끝난 경우
    if let Some(url) = hyperlink_url.take() {
        let display = hyperlink_text_parts.join("");
        // 필드 경계 오류: 이전 텍스트가 단어 중간에서 시작
        let prev_ends_mid_word = text_parts
            .last()
            .and_then(|s| s.chars().last())
            .is_some_and(|c| c.is_alphanumeric());
        let display_starts_mid_word = display
            .chars()
            .next()
            .is_some_and(|c| c.is_alphanumeric());

        if display.is_empty() {
            text_parts.push(format!("[{}]({})", url, url));
        } else if prev_ends_mid_word && display_starts_mid_word {
            // 단어 중간에서 필드가 시작됨 → plain text
            text_parts.push(display);
        } else {
            text_parts.push(format!("[{}]({})", display, url));
        }
    }

    let body = text_parts.join("");
    // 연속 탭을 단일 탭으로 (convert에서 중복 생성 방지)
    let body = body.replace("\t\t", "\t");
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
    skip_styles: bool,
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
    // skip_styles=true이면 스타일 적용 안 함 (ParaCharShape 없는 문단)
    let char_shape = resources.char_shapes.get(run.char_shape_id as usize);
    let bold = !skip_styles && char_shape.is_some_and(|cs| cs.bold);
    let italic = !skip_styles && char_shape.is_some_and(|cs| cs.italic);
    let strikeout = !skip_styles && char_shape.is_some_and(|cs| {
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
                        // 필드 경계 오류 감지: 이전 텍스트가 단어 중간에서 끊겼으면
                        // 하이퍼링크가 아닌 plain text로 출력
                        let prev_ends_mid_word = text_parts
                            .last()
                            .and_then(|s| s.chars().last())
                            .is_some_and(|c| c.is_alphanumeric());
                        let display_starts_mid_word = display
                            .chars()
                            .next()
                            .is_some_and(|c| c.is_alphanumeric());

                        if prev_ends_mid_word && display_starts_mid_word {
                            // 단어 중간에서 필드가 시작됨 → plain text
                            text_parts.push(display);
                        } else if display.is_empty() {
                            text_parts.push(format!("[{}]({})", url, url));
                        } else {
                            text_parts.push(format!("[{}]({})", display, url));
                        }
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
                    // Object 앞에 텍스트가 있으면 "  \n" 구분자 추가 (기존 viewer의 soft line break)
                    if !text_parts.is_empty() {
                        let last = text_parts.last().unwrap();
                        if !last.ends_with("  \n") && !last.ends_with("\n\n") {
                            text_parts.push("  \n".to_string());
                        }
                    }
                    text_parts.push(obj_text);
                    // Object 뒤에도 구분자 추가 (다음 Object나 텍스트를 위해)
                    text_parts.push("  \n".to_string());
                }
            }
        }
    }

    // 마지막이 "  \n"이면 제거 (trailing 구분자)
    while text_parts.last().is_some_and(|s| s == "  \n") {
        text_parts.pop();
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
            // 기존 viewer와 동일: 스타일 강제 적용 + soft line break
            if let Some(ref sub_list) = rect.draw_text {
                let mut parts = Vec::new();
                for para in &sub_list.paragraphs {
                    let (body, _) =
                        render_paragraph_inner(para, resources, binaries, options, Some(true));
                    if !body.trim().is_empty() {
                        parts.push(body);
                    }
                }
                parts.join("  \n")
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

    for (row_idx, row) in table.rows.iter().enumerate() {
        let mut cells: Vec<String> = Vec::new();
        for cell in &row.cells {
            let cell_text = super::render_sublist_paragraphs_for_cell(
                &cell.content.paragraphs,
                resources,
                binaries,
                options,
            );
            // 셀 내 줄바꿈 → <br> + 공백 (기존 viewer와 동일)
            let cell_text = cell_text.replace("\n\n", "<br> ").replace('\n', "<br> ");
            // 빈 셀은 공백, 일반 셀은 끝에 <br> 추가
            // 셀에 Object(이미지/하이퍼링크 등)가 있었으면 제거 후에도 <br>로 표시
            // 이미지/도형/하이퍼링크가 있던 셀은 제거 후에도 <br>로 표시
            let has_removable_content = cell.content.paragraphs.iter().any(|p| {
                p.runs.iter().any(|r| {
                    r.contents.iter().any(|c| {
                        matches!(c, RunContent::Object(_))
                            || matches!(
                                c,
                                RunContent::Control(
                                    hwp_model::control::Control::FieldBegin(_)
                                )
                            )
                    })
                })
            });
            let cell_text = if cell_text.trim().is_empty() {
                if has_removable_content {
                    "<br>".to_string()
                } else {
                    " ".to_string()
                }
            } else {
                format!("{}<br>", cell_text.trim_end_matches('\n'))
            };
            cells.push(cell_text);
            // col_span > 1이면 병합된 열에 빈 셀 추가 (기존 viewer와 동일)
            for _ in 1..cell.col_span {
                cells.push(" ".to_string());
            }
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

    format!("\n{}\n", lines.join("\n"))
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
