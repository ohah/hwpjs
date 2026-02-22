/// Common paragraph processing logic
/// 공통 문단 처리 로직
///
/// 모든 뷰어에서 공통으로 사용되는 문단 처리 로직을 제공합니다.
/// 출력 형식은 Renderer 트레이트를 통해 처리됩니다.
///
/// Provides common paragraph processing logic used by all viewers.
/// Output format is handled through the Renderer trait.
use crate::document::bodytext::CharShapeInfo;
use crate::document::{CharShape, HwpDocument, Paragraph, ParagraphRecord};
use crate::viewer::core::outline::{compute_outline_number, OutlineNumberTracker};
use crate::viewer::core::renderer::{Renderer, TextStyles};
use crate::viewer::markdown::collect::collect_text_and_images_from_paragraph;

/// CharShape을 TextStyles로 변환 / Map CharShape to TextStyles
fn char_shape_to_text_styles(cs: &CharShape) -> TextStyles {
    TextStyles {
        bold: cs.attributes.bold,
        italic: cs.attributes.italic,
        underline: cs.attributes.underline_type > 0,
        strikethrough: cs.attributes.strikethrough > 0,
        superscript: cs.attributes.superscript,
        subscript: cs.attributes.subscript,
        font_size: Some(cs.base_size as f32 / 100.0),
        color: Some(format!(
            "rgb({},{},{})",
            cs.text_color.r(),
            cs.text_color.g(),
            cs.text_color.b()
        )),
        ..TextStyles::default()
    }
}

/// Process a paragraph and return rendered content
/// 문단을 처리하고 렌더링된 내용을 반환
/// tracker가 있으면 개요 번호를 계산하여 renderer.render_outline_number로 감싼다.
pub fn process_paragraph<R: Renderer>(
    paragraph: &Paragraph,
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    tracker: &mut Option<&mut OutlineNumberTracker>,
) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();
    let mut text_parts = Vec::new(); // 같은 문단 내의 텍스트 레코드들을 모음
    let mut char_shapes: Vec<CharShapeInfo> = Vec::new();

    // Process all records in order / 모든 레코드를 순서대로 처리
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText {
                text,
                control_char_positions: _,
                ..
            } => {
                text_parts.push(text.to_string());
            }
            ParagraphRecord::ParaCharShape { shapes } => {
                char_shapes.extend(shapes.iter().cloned());
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // 이미지 처리 / Process image
                if let Some(image_content) = renderer.render_image(
                    shape_component_picture.picture_info.bindata_id,
                    document,
                    options,
                ) {
                    parts.push(image_content);
                }
            }
            ParagraphRecord::Table { table } => {
                // 테이블 처리 / Process table
                let table_content = renderer.render_table(table, document, options);
                if !table_content.is_empty() {
                    parts.push(table_content);
                }
            }
            ParagraphRecord::CtrlHeader {
                header,
                children,
                paragraphs: ctrl_paragraphs,
                ..
            } => {
                // 컨트롤 헤더 처리 / Process control header
                process_ctrl_header(
                    header,
                    children,
                    ctrl_paragraphs,
                    document,
                    renderer,
                    options,
                    &mut parts,
                    tracker,
                );
            }
            _ => {
                // 기타 레코드는 무시 / Ignore other records
            }
        }
    }

    // 같은 문단 내의 텍스트를 합침 및 글자 모양 적용 / Combine text and apply character shape
    if !text_parts.is_empty() {
        let combined_text = text_parts.join("");
        let paragraph_content = if char_shapes.is_empty() {
            renderer.render_paragraph(&combined_text)
        } else {
            let styled_text = apply_char_shapes_to_segments(&combined_text, &char_shapes, document, renderer);
            renderer.render_paragraph(&styled_text)
        };
        parts.push(paragraph_content);
    }

    // HTML로 결합 / Combine into output
    if parts.is_empty() {
        return String::new();
    }

    let combined_content = if parts.len() == 1 {
        parts[0].clone()
    } else {
        parts.join("")
    };

    // 개요 번호 처리 / Outline number handling
    if let Some(track) = tracker.as_deref_mut() {
        if let Some((level, number)) =
            compute_outline_number(&paragraph.para_header, document, track)
        {
            return renderer.render_outline_number(level, number, &combined_content);
        }
    }

    combined_content
}

/// Apply character shapes to text by segments
/// 글자 모양을 구간별로 텍스트에 적용
fn apply_char_shapes_to_segments<R: Renderer>(
    text: &str,
    char_shapes: &[CharShapeInfo],
    document: &HwpDocument,
    renderer: &R,
) -> String {
    if char_shapes.is_empty() {
        return text.to_string();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();
    let mut sorted_shapes: Vec<_> = char_shapes.iter().collect();
    sorted_shapes.sort_by_key(|s| s.position);

    let mut positions = vec![0];
    for s in &sorted_shapes {
        let pos = s.position as usize;
        if pos <= text_len {
            positions.push(pos);
        }
    }
    positions.push(text_len);
    positions.sort();
    positions.dedup();

    let mut styled_parts = Vec::new();
    for i in 0..positions.len().saturating_sub(1) {
        let start = positions[i];
        let end = positions[i + 1];
        if start >= end {
            continue;
        }
        let segment_text: String = text_chars[start..end].iter().collect();
        if segment_text.is_empty() {
            continue;
        }

        let shape_id_opt = sorted_shapes
            .iter()
            .rev()
            .find(|s| (s.position as usize) <= start)
            .map(|s| s.shape_id as usize);

        let styles = shape_id_opt
            .and_then(|id| document.doc_info.char_shapes.get(id))
            .map(char_shape_to_text_styles)
            .unwrap_or_default();

        styled_parts.push(renderer.render_text(&segment_text, &styles));
    }

    styled_parts.join("")
}

/// Process CtrlHeader
/// 컨트롤 헤더 처리
#[allow(clippy::too_many_arguments)]
fn process_ctrl_header<R: Renderer>(
    header: &crate::document::CtrlHeader,
    children: &[ParagraphRecord],
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    parts: &mut Vec<String>,
    tracker: &mut Option<&mut OutlineNumberTracker>,
) {
    use crate::document::CtrlId;

    // 표 셀 내부의 텍스트와 이미지를 수집하여 셀 내부 문단인지 확인
    // Collect text and images from paragraphs in Table.cells to check if they are cell content
    let mut table_cell_texts: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut table_cell_image_ids: std::collections::HashSet<u16> = std::collections::HashSet::new();
    let mut table_cell_para_ids: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut table_opt: Option<&crate::document::bodytext::Table> = None;
    let is_table_control = header.ctrl_id.as_str() == CtrlId::TABLE;

    // 먼저 TABLE을 찾아서 table_opt에 저장 / First find TABLE and store in table_opt
    for child in children {
        if let ParagraphRecord::Table { table } = child {
            table_opt = Some(table);
            break;
        }
    }

    if let Some(table) = table_opt {
        for cell in &table.cells {
            for para in &cell.paragraphs {
                if para.para_header.instance_id != 0 {
                    table_cell_para_ids.insert(para.para_header.instance_id);
                }
                collect_text_and_images_from_paragraph(
                    para,
                    &mut table_cell_texts,
                    &mut table_cell_image_ids,
                );
            }
        }
    }

    // 컨트롤 헤더의 자식 레코드들을 순회하며 처리 / Iterate through control header's child records
    for child in children {
        match child {
            ParagraphRecord::Table { table } => {
                // 표 변환 / Convert table
                let table_content = renderer.render_table(table, document, options);
                if !table_content.is_empty() {
                    parts.push(table_content);
                }
            }
            _ => {
                // 기타 레코드는 무시 / Ignore other records
            }
        }
    }

    // CTRL_HEADER 내부의 직접 문단 처리 / Process direct paragraphs inside CTRL_HEADER
    for para in ctrl_paragraphs {
        // 표 셀 내부의 문단인지 확인 / Check if paragraph is inside table cell
        let is_table_cell = if is_table_control && table_opt.is_some() {
            // 먼저 instance_id로 확인 (가장 정확, 0이 아닌 경우만)
            let is_table_cell_by_id = !table_cell_para_ids.is_empty()
                && para.para_header.instance_id != 0
                && table_cell_para_ids.contains(&para.para_header.instance_id);

            if is_table_cell_by_id {
                true
            } else {
                // 재귀적으로 문단에서 텍스트와 이미지를 수집하여 표 셀 내부인지 확인
                let mut para_texts = std::collections::HashSet::new();
                let mut para_image_ids = std::collections::HashSet::new();
                collect_text_and_images_from_paragraph(para, &mut para_texts, &mut para_image_ids);

                (!para_texts.is_empty()
                    && para_texts
                        .iter()
                        .any(|text| table_cell_texts.contains(text)))
                    || (!para_image_ids.is_empty()
                        && para_image_ids
                            .iter()
                            .any(|id| table_cell_image_ids.contains(id)))
            }
        } else {
            false
        };

        // 표 셀 내부가 아닌 경우에만 처리 / Only process if not inside table cell
        if !is_table_cell {
            let para_content = process_paragraph(para, document, renderer, options, tracker);
            if !para_content.is_empty() {
                parts.push(para_content);
            }
        }
    }
}
