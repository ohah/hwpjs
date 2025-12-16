use super::CtrlHeaderResult;
use crate::document::bodytext::ctrl_header::VertRelTo;
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, CtrlHeaderData, Paragraph};
use crate::viewer::html::common;
use crate::viewer::html::line_segment::ImageInfo;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// 그리기 개체 처리 / Process shape object
pub fn process_shape_object<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    // object_common 속성 추출 / Extract object_common attributes
    let (like_letters, affect_line_spacing, vert_rel_to) = match &header.data {
        CtrlHeaderData::ObjectCommon { attribute, .. } => (
            attribute.like_letters,
            attribute.affect_line_spacing,
            Some(attribute.vert_rel_to),
        ),
        _ => (false, false, None),
    };

    // children과 paragraphs에서 첫 번째 ShapeComponent 찾기 (크기 정보 추출용) / Find first ShapeComponent in children and paragraphs (for size extraction)
    let mut initial_width = None;
    let mut initial_height = None;

    // children에서 찾기 / Search in children
    for record in children {
        if let ParagraphRecord::ShapeComponent {
            shape_component, ..
        } = record
        {
            initial_width = Some(shape_component.width);
            initial_height = Some(shape_component.height);
            break;
        }
    }

    // children에서 찾지 못했으면 paragraphs에서 찾기 / If not found in children, search in paragraphs
    if initial_width.is_none() {
        for para in paragraphs {
            for record in &para.records {
                match record {
                    ParagraphRecord::ShapeComponent {
                        shape_component, ..
                    } => {
                        initial_width = Some(shape_component.width);
                        initial_height = Some(shape_component.height);
                        break;
                    }
                    ParagraphRecord::CtrlHeader {
                        children: nested_children,
                        ..
                    } => {
                        // 중첩된 CtrlHeader의 children에서도 찾기 / Also search in nested CtrlHeader's children
                        for nested_record in nested_children {
                            if let ParagraphRecord::ShapeComponent {
                                shape_component, ..
                            } = nested_record
                            {
                                initial_width = Some(shape_component.width);
                                initial_height = Some(shape_component.height);
                                break;
                            }
                        }
                        if initial_width.is_some() {
                            break;
                        }
                    }
                    _ => {}
                }
            }
            if initial_width.is_some() {
                break;
            }
        }
    }

    // children과 paragraphs에서 재귀적으로 이미지 수집 / Recursively collect images from children and paragraphs
    // JSON 구조: CtrlHeader의 children에 ShapeComponent가 있고, 그 children에 ShapeComponentPicture가 있음
    // JSON structure: CtrlHeader's children contains ShapeComponent, and its children contains ShapeComponentPicture

    // 1. children이 있으면 children을 먼저 처리 (가장 일반적인 경우) / If children exists, process children first (most common case)
    if !children.is_empty() {
        collect_images_from_records(
            children,
            document,
            options,
            like_letters,
            affect_line_spacing,
            vert_rel_to,
            initial_width,  // parent_shape_component_width
            initial_height, // parent_shape_component_height
            &mut result.images,
        );
    } else if initial_width.is_some() && initial_height.is_some() {
        // 2. children이 비어있고 paragraphs에 ShapeComponent가 있으면, paragraphs의 records에서 ShapeComponent를 찾아서 처리
        // If children is empty and paragraphs has ShapeComponent, find ShapeComponent in paragraphs' records and process
        for para in paragraphs {
            // paragraphs의 records를 재귀적으로 탐색하여 이미지 수집
            // Recursively search paragraphs' records to collect images
            collect_images_from_records(
                &para.records,
                document,
                options,
                like_letters,
                affect_line_spacing,
                vert_rel_to,
                initial_width,
                initial_height,
                &mut result.images,
            );
        }
    }

    result
}

/// ParagraphRecord 배열에서 재귀적으로 이미지 수집 / Recursively collect images from ParagraphRecord array
fn collect_images_from_records(
    records: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
    like_letters: bool,
    affect_line_spacing: bool,
    vert_rel_to: Option<VertRelTo>,
    parent_shape_component_width: Option<u32>,
    parent_shape_component_height: Option<u32>,
    images: &mut Vec<ImageInfo>,
) {
    for record in records {
        match record {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                let image_url = common::get_image_url(
                    document,
                    bindata_id,
                    options.image_output_dir.as_deref(),
                    options.html_output_dir.as_deref(),
                );
                if !image_url.is_empty() {
                    // shape_component.width/height를 우선 사용 / Prioritize shape_component.width/height
                    let width = parent_shape_component_width.unwrap_or(0);
                    let height = parent_shape_component_height.unwrap_or(0);

                    if width > 0 && height > 0 {
                        images.push(ImageInfo {
                            width,
                            height,
                            url: image_url,
                            like_letters,
                            affect_line_spacing,
                            vert_rel_to,
                        });
                    }
                }
            }
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
            } => {
                // 재귀적으로 children에서 이미지 찾기 (shape_component.width/height 전달)
                collect_images_from_records(
                    children,
                    document,
                    options,
                    like_letters,
                    affect_line_spacing,
                    vert_rel_to,
                    Some(shape_component.width),
                    Some(shape_component.height),
                    images,
                );
            }
            ParagraphRecord::CtrlHeader { children, .. } => {
                // 중첩된 CtrlHeader도 처리 (속성은 상위에서 상속, shape_component 크기는 유지)
                // Process nested CtrlHeader (attributes inherited from parent, shape_component size maintained)
                collect_images_from_records(
                    children,
                    document,
                    options,
                    like_letters,
                    affect_line_spacing,
                    vert_rel_to,
                    parent_shape_component_width,
                    parent_shape_component_height,
                    images,
                );
            }
            _ => {}
        }
    }
}
