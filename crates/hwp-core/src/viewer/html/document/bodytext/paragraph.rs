/// Paragraph conversion to HTML
/// 문단을 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드
/// Spec mapping: Table 57 - BodyText data records
use crate::document::bodytext::CharShapeInfo;
use crate::document::CharShape;
use crate::document::{HwpDocument, Paragraph, ParagraphRecord};
use crate::viewer::html::utils::{convert_to_outline_with_number, OutlineNumberTracker};
use crate::viewer::html::HtmlOptions;

// 모듈들이 이미 구현되어 있으므로 필요시 직접 호출하여 사용
// Modules are already implemented, so call them directly when needed

/// Convert a paragraph to HTML
/// 문단을 HTML로 변환
pub fn convert_paragraph_to_html(
    paragraph: &Paragraph,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut OutlineNumberTracker,
) -> String {
    convert_paragraph_to_html_with_indices(paragraph, document, options, tracker, None, None)
}

/// Convert a paragraph to HTML with section and paragraph indices
/// 섹션 및 문단 인덱스를 포함하여 문단을 HTML로 변환
pub fn convert_paragraph_to_html_with_indices(
    paragraph: &Paragraph,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut OutlineNumberTracker,
    section_idx: Option<usize>,
    para_idx: Option<usize>,
) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();
    let mut text_parts = Vec::new(); // 같은 문단 내의 텍스트 레코드들을 모음 / Collect text records in the same paragraph
    let mut char_shapes: Vec<CharShapeInfo> = Vec::new(); // 문단의 글자 모양 정보 수집 / Collect character shape information for paragraph
    let mut line_segments: Option<&[crate::document::bodytext::LineSegmentInfo]> = None; // ParaLineSeg 세그먼트 정보 / ParaLineSeg segment information

    // 먼저 ParaCharShape와 ParaLineSeg 레코드를 수집 / First collect ParaCharShape and ParaLineSeg records
    for record in &paragraph.records {
        if let ParagraphRecord::ParaCharShape { shapes } = record {
            char_shapes.extend(shapes.clone());
        }
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            line_segments = Some(segments);
        }
    }

    // CharShape를 가져오는 클로저 / Closure to get CharShape
    let get_char_shape = |shape_id: u32| -> Option<&CharShape> {
        document.doc_info.char_shapes.get(shape_id as usize)
    };

    // Process all records in order / 모든 레코드를 순서대로 처리
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText {
                text,
                control_char_positions,
                inline_control_params: _,
            } => {
                // ParaText 변환 / Convert ParaText
                if let Some(text_html) =
                    crate::viewer::html::document::bodytext::para_text::convert_para_text_to_html(
                        text,
                        control_char_positions,
                        &char_shapes,
                        Some(&get_char_shape),
                        &options.css_class_prefix,
                        Some(document),
                        line_segments,
                    )
                {
                    text_parts.push(text_html);
                }
            }
            ParagraphRecord::ShapeComponent {
                shape_component: _,
                children,
            } => {
                // SHAPE_COMPONENT의 children을 재귀적으로 처리 / Recursively process SHAPE_COMPONENT's children
                let shape_parts = crate::viewer::html::document::bodytext::shape_component::convert_shape_component_children_to_html(
                    children,
                    document,
                    options,
                    tracker,
                );
                parts.extend(shape_parts);
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // ShapeComponentPicture 변환 / Convert ShapeComponentPicture
                if let Some(image_html) = crate::viewer::html::document::bodytext::shape_component_picture::convert_shape_component_picture_to_html(
                    shape_component_picture,
                    document,
                    options,
                ) {
                    parts.push(image_html);
                }
            }
            ParagraphRecord::Table { table } => {
                // 테이블 변환 / Convert table
                let table_html =
                    crate::viewer::html::document::bodytext::table::convert_table_to_html(
                        table, document, options, tracker,
                    );
                if !table_html.is_empty() {
                    parts.push(table_html);
                }
            }
            ParagraphRecord::CtrlHeader {
                header,
                children,
                paragraphs: ctrl_paragraphs,
                ..
            } => {
                // 컨트롤 헤더 처리 / Process control header
                use crate::document::CtrlId;

                // 표 셀 내부의 텍스트와 이미지를 수집하여 셀 내부 문단인지 확인
                // Collect text and images from paragraphs in Table.cells to check if they are cell content
                let mut table_cell_texts: std::collections::HashSet<String> =
                    std::collections::HashSet::new();
                let mut table_cell_image_ids: std::collections::HashSet<u16> =
                    std::collections::HashSet::new();
                let mut table_cell_para_ids: std::collections::HashSet<u32> =
                    std::collections::HashSet::new(); // 표 셀 내부 문단의 instance_id 수집
                let mut table_opt: Option<&crate::document::bodytext::Table> = None;
                let mut table_index: Option<usize> = None;
                let is_table_control = header.ctrl_id.as_str() == CtrlId::TABLE;

                // 먼저 TABLE을 찾아서 table_opt에 저장 / First find TABLE and store in table_opt
                let children_slice: &[ParagraphRecord] = children;
                for (idx, child) in children_slice.iter().enumerate() {
                    if let ParagraphRecord::Table { table } = child {
                        table_opt = Some(table);
                        table_index = Some(idx);
                        break;
                    }
                }

                if let Some(table) = table_opt {
                    for cell in &table.cells {
                        for para in &cell.paragraphs {
                            // 문단의 instance_id 수집 (0이 아닌 경우만) / Collect paragraph instance_id (only if not 0)
                            if para.para_header.instance_id != 0 {
                                table_cell_para_ids.insert(para.para_header.instance_id);
                            }
                            // ParaText의 텍스트를 수집 / Collect text from ParaText
                            // 재귀적으로 모든 레코드를 확인하여 이미지 ID 수집 / Recursively check all records to collect image IDs
                            crate::viewer::markdown::collect::collect_text_and_images_from_paragraph(
                                para,
                                &mut table_cell_texts,
                                &mut table_cell_image_ids,
                            );
                        }
                    }
                }

                // 컨트롤 헤더의 자식 레코드들을 순회하며 처리 / Iterate through control header's child records and process them
                let mut index = 0;
                while index < children_slice.len() {
                    let child = &children_slice[index];
                    match child {
                        ParagraphRecord::Table { table } => {
                            // 표 변환 / Convert table
                            let table_html = crate::viewer::html::document::bodytext::table::convert_table_to_html(
                                table,
                                document,
                                options,
                                tracker,
                            );
                            if !table_html.is_empty() {
                                parts.push(table_html);
                            }
                            index += 1;
                        }
                        ParagraphRecord::ShapeComponent {
                            shape_component: _,
                            children: sc_children,
                        } => {
                            // SHAPE_COMPONENT의 children 처리 / Process SHAPE_COMPONENT's children
                            let shape_parts = crate::viewer::html::document::bodytext::shape_component::convert_shape_component_children_to_html(
                                sc_children,
                                document,
                                options,
                                tracker,
                            );
                            parts.extend(shape_parts);
                            index += 1;
                        }
                        _ => {
                            // 기타 레코드는 무시 / Ignore other records
                            index += 1;
                        }
                    }
                }

                // CTRL_HEADER 내부의 직접 문단 처리 / Process direct paragraphs inside CTRL_HEADER
                for para in ctrl_paragraphs {
                    // 표 셀 내부의 문단인지 확인 / Check if paragraph is inside table cell
                    let is_table_cell = if is_table_control && table_opt.is_some() {
                        // 먼저 instance_id로 확인 (가장 정확, 0이 아닌 경우만) / First check by instance_id (most accurate, only if not 0)
                        let is_table_cell_by_id = !table_cell_para_ids.is_empty()
                            && para.para_header.instance_id != 0
                            && table_cell_para_ids.contains(&para.para_header.instance_id);

                        // instance_id로 확인되지 않으면 텍스트와 이미지로 확인 / If not found by instance_id, check by text and images
                        if is_table_cell_by_id {
                            true
                        } else {
                            // 재귀적으로 문단에서 텍스트와 이미지를 수집하여 표 셀 내부인지 확인
                            // Recursively collect text and images from paragraph to check if inside table cell
                            let mut para_texts = std::collections::HashSet::new();
                            let mut para_image_ids = std::collections::HashSet::new();
                            crate::viewer::markdown::collect::collect_text_and_images_from_paragraph(
                                para,
                                &mut para_texts,
                                &mut para_image_ids,
                            );

                            // 수집한 텍스트나 이미지가 표 셀 내부에 포함되어 있는지 확인
                            // Check if collected text or images are included in table cells
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
                        let para_html = convert_paragraph_to_html(para, document, options, tracker);
                        if !para_html.is_empty() {
                            parts.push(para_html);
                        }
                    }
                }
            }
            _ => {
                // 기타 레코드는 무시 / Ignore other records
            }
        }
    }

    // 같은 문단 내의 텍스트를 합침 / Combine text in the same paragraph
    if !text_parts.is_empty() {
        let combined_text = text_parts.join("");
        // 개요 레벨 확인 및 개요 번호 추가 / Check outline level and add outline number
        let outline_html = convert_to_outline_with_number(
            &combined_text,
            &paragraph.para_header,
            document,
            tracker,
            &options.css_class_prefix,
        );

        // 문단을 <p> 태그로 감싸기 / Wrap paragraph in <p> tag
        let css_prefix = &options.css_class_prefix;

        // ParaShape 클래스 추가 / Add ParaShape class
        let para_shape_id = paragraph.para_header.para_shape_id as usize;
        let para_shape_class = if para_shape_id < document.doc_info.para_shapes.len() {
            format!(" {}parashape-{}", css_prefix, para_shape_id)
        } else {
            String::new()
        };

        if outline_html.contains(&format!("class=\"{}\"", format!("{}outline", css_prefix))) {
            // 개요 번호가 있는 경우 / If outline number exists
            // 개요는 이미 span으로 감싸져 있으므로 p 태그로 감싸지 않음 / Outline is already wrapped in span, so don't wrap in p tag
            parts.push(outline_html);
        } else {
            // 일반 문단 / Regular paragraph
            let mut paragraph_classes = vec![format!("{}paragraph", css_prefix)];
            if !para_shape_class.is_empty() {
                paragraph_classes.push(para_shape_class.trim().to_string());
            }
            let paragraph_class = paragraph_classes.join(" ");
            parts.push(format!(
                r#"<p class="{}">{}</p>"#,
                paragraph_class, outline_html
            ));
        }
    }

    // HTML로 결합 / Combine into HTML
    if parts.is_empty() {
        return String::new();
    }

    if parts.len() == 1 {
        return parts[0].clone();
    }

    parts.join("\n")
}
