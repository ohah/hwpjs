/// Functions for collecting text and images from paragraphs
/// 문단에서 텍스트와 이미지를 수집하는 함수들
use crate::document::ParagraphRecord;

/// 재귀적으로 paragraph에서 텍스트와 이미지 ID를 수집
/// Recursively collect text and image IDs from paragraph
pub fn collect_text_and_images_from_paragraph(
    para: &crate::document::bodytext::Paragraph,
    table_cell_texts: &mut std::collections::HashSet<String>,
    table_cell_image_ids: &mut std::collections::HashSet<u16>,
) {
    for record in &para.records {
        match record {
            ParagraphRecord::ParaText { text, .. } => {
                if !text.trim().is_empty() {
                    table_cell_texts.insert(text.trim().to_string());
                }
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // 이미지 ID 수집 / Collect image ID
                table_cell_image_ids.insert(shape_component_picture.picture_info.bindata_id);
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs: ctrl_paragraphs,
                ..
            } => {
                // CTRL_HEADER 내부의 paragraphs도 재귀적으로 확인 / Recursively check paragraphs inside CTRL_HEADER
                for ctrl_para in ctrl_paragraphs {
                    collect_text_and_images_from_paragraph(
                        ctrl_para,
                        table_cell_texts,
                        table_cell_image_ids,
                    );
                }
                // CTRL_HEADER의 children도 재귀적으로 확인 / Recursively check children of CTRL_HEADER
                for child in children {
                    match child {
                        ParagraphRecord::ShapeComponent { children, .. } => {
                            // SHAPE_COMPONENT의 children 확인 / Check SHAPE_COMPONENT's children
                            for shape_child in children {
                                match shape_child {
                                    ParagraphRecord::ShapeComponentPicture {
                                        shape_component_picture,
                                    } => {
                                        table_cell_image_ids.insert(
                                            shape_component_picture.picture_info.bindata_id,
                                        );
                                    }
                                    ParagraphRecord::ListHeader { paragraphs, .. } => {
                                        // LIST_HEADER의 paragraphs도 확인 / Check LIST_HEADER's paragraphs
                                        for list_para in paragraphs {
                                            collect_text_and_images_from_paragraph(
                                                list_para,
                                                table_cell_texts,
                                                table_cell_image_ids,
                                            );
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        ParagraphRecord::ShapeComponentPicture {
                            shape_component_picture,
                        } => {
                            table_cell_image_ids
                                .insert(shape_component_picture.picture_info.bindata_id);
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}
