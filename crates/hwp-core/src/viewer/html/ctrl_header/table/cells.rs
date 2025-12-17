use std::collections::HashMap;

use crate::document::bodytext::list_header::VerticalAlign;
use crate::document::bodytext::{LineSegmentInfo, ParagraphRecord, Table};
use crate::viewer::html::line_segment::{render_line_segments_with_content, ImageInfo};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::html::{common, ctrl_header};
use crate::viewer::html::{image, text};
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, INT32};

use super::geometry::{calculate_cell_left, get_cell_height, get_row_height};

/// 셀 마진을 mm 단위로 변환 / Convert cell margin to mm
fn cell_margin_to_mm(margin_hwpunit: i16) -> f64 {
    round_to_2dp(int32_to_mm(margin_hwpunit as i32))
}

pub(crate) fn render_cells(
    table: &Table,
    ctrl_header_height_mm: Option<f64>,
    document: &HwpDocument,
    options: &HtmlOptions,
    pattern_counter: &mut usize, // 문서 레벨 pattern_counter (문서 전체에서 패턴 ID 공유) / Document-level pattern_counter (share pattern IDs across document)
    color_to_pattern: &mut HashMap<u32, String>, // 문서 레벨 color_to_pattern (문서 전체에서 패턴 ID 공유) / Document-level color_to_pattern (share pattern IDs across document)
) -> String {
    // 각 행의 최대 셀 높이 계산 (실제 셀 높이만 사용) / Calculate max cell height for each row (use only actual cell height)
    let mut max_row_heights: HashMap<usize, f64> = HashMap::new();

    for cell in &table.cells {
        let row_idx = cell.cell_attributes.row_address as usize;
        let col_idx = cell.cell_attributes.col_address as usize;

        // 실제 셀 높이 가져오기 / Get actual cell height
        let mut cell_height = get_cell_height(table, cell, ctrl_header_height_mm);

        // shape component 높이 찾기 (재귀적으로) / Find shape component height (recursively)
        let mut max_shape_height_mm: Option<f64> = None;

        // 재귀적으로 모든 ShapeComponent의 높이를 찾는 헬퍼 함수 / Helper function to recursively find height of all ShapeComponents
        fn find_shape_component_height(
            children: &[ParagraphRecord],
            shape_component_height: u32,
        ) -> Option<f64> {
            let mut max_height_mm: Option<f64> = None;
            let mut has_paraline_seg = false;
            let mut paraline_seg_height_mm: Option<f64> = None;

            // 먼저 children을 순회하여 ParaLineSeg와 다른 shape component들을 찾기 / First iterate through children to find ParaLineSeg and other shape components
            for child in children {
                match child {
                    // ShapeComponentPicture: shape_component.height 사용
                    ParagraphRecord::ShapeComponentPicture { .. } => {
                        let height_hwpunit = shape_component_height as i32;
                        let height_mm = round_to_2dp(int32_to_mm(height_hwpunit));
                        if max_height_mm.is_none() || height_mm > max_height_mm.unwrap() {
                            max_height_mm = Some(height_mm);
                        }
                    }

                    // 중첩된 ShapeComponent: 재귀적으로 탐색
                    ParagraphRecord::ShapeComponent {
                        shape_component,
                        children: nested_children,
                    } => {
                        if let Some(height) =
                            find_shape_component_height(nested_children, shape_component.height)
                        {
                            if max_height_mm.is_none() || height > max_height_mm.unwrap() {
                                max_height_mm = Some(height);
                            }
                        }
                    }

                    // 다른 shape component 타입들: shape_component.height 사용
                    ParagraphRecord::ShapeComponentLine { .. }
                    | ParagraphRecord::ShapeComponentRectangle { .. }
                    | ParagraphRecord::ShapeComponentEllipse { .. }
                    | ParagraphRecord::ShapeComponentArc { .. }
                    | ParagraphRecord::ShapeComponentPolygon { .. }
                    | ParagraphRecord::ShapeComponentCurve { .. }
                    | ParagraphRecord::ShapeComponentOle { .. }
                    | ParagraphRecord::ShapeComponentContainer { .. }
                    | ParagraphRecord::ShapeComponentTextArt { .. }
                    | ParagraphRecord::ShapeComponentUnknown { .. } => {
                        // shape_component.height 사용 / Use shape_component.height
                        let height_mm = round_to_2dp(int32_to_mm(shape_component_height as i32));
                        if max_height_mm.is_none() || height_mm > max_height_mm.unwrap() {
                            max_height_mm = Some(height_mm);
                        }
                    }

                    // ParaLineSeg: line_height 합산하여 높이 계산 (나중에 shape_component.height와 비교)
                    // ParaLineSeg: calculate height by summing line_height (compare with shape_component.height later)
                    ParagraphRecord::ParaLineSeg { segments } => {
                        has_paraline_seg = true;
                        let total_height_hwpunit: i32 =
                            segments.iter().map(|seg| seg.line_height).sum();
                        let height_mm = round_to_2dp(int32_to_mm(total_height_hwpunit));
                        if paraline_seg_height_mm.is_none()
                            || height_mm > paraline_seg_height_mm.unwrap()
                        {
                            paraline_seg_height_mm = Some(height_mm);
                        }
                    }

                    _ => {}
                }
            }

            // ParaLineSeg가 있으면 shape_component.height와 비교하여 더 큰 값 사용
            // If ParaLineSeg exists, compare with shape_component.height and use the larger value
            if has_paraline_seg {
                let shape_component_height_mm =
                    round_to_2dp(int32_to_mm(shape_component_height as i32));
                let paraline_seg_height = paraline_seg_height_mm.unwrap_or(0.0);
                // shape_component.height와 ParaLineSeg 높이 중 더 큰 값 사용 / Use the larger value between shape_component.height and ParaLineSeg height
                let final_height = shape_component_height_mm.max(paraline_seg_height);
                if max_height_mm.is_none() || final_height > max_height_mm.unwrap() {
                    max_height_mm = Some(final_height);
                }
            } else if max_height_mm.is_none() {
                // ParaLineSeg가 없고 다른 shape component도 없으면 shape_component.height 사용
                // If no ParaLineSeg and no other shape components, use shape_component.height
                let height_mm = round_to_2dp(int32_to_mm(shape_component_height as i32));
                max_height_mm = Some(height_mm);
            }

            max_height_mm
        }

        for para in &cell.paragraphs {
            // ShapeComponent의 children에서 모든 shape 높이 찾기 (재귀적으로) / Find all shape heights in ShapeComponent's children (recursively)
            for record in &para.records {
                match record {
                    ParagraphRecord::ShapeComponent {
                        shape_component,
                        children,
                    } => {
                        if let Some(shape_height_mm) =
                            find_shape_component_height(children, shape_component.height)
                        {
                            if max_shape_height_mm.is_none()
                                || shape_height_mm > max_shape_height_mm.unwrap()
                            {
                                max_shape_height_mm = Some(shape_height_mm);
                            }
                        }
                        break; // ShapeComponent는 하나만 있음 / Only one ShapeComponent per paragraph
                    }
                    // ParaLineSeg가 paragraph records에 직접 있는 경우도 처리 / Also handle ParaLineSeg directly in paragraph records
                    ParagraphRecord::ParaLineSeg { segments } => {
                        let total_height_hwpunit: i32 =
                            segments.iter().map(|seg| seg.line_height).sum();
                        let height_mm = round_to_2dp(int32_to_mm(total_height_hwpunit));
                        if max_shape_height_mm.is_none() || height_mm > max_shape_height_mm.unwrap()
                        {
                            max_shape_height_mm = Some(height_mm);
                        }
                    }
                    _ => {}
                }
            }
        }

        // shape component 높이 + 마진이 셀 높이보다 크면 사용 / Use shape height + margin if larger than cell height
        if let Some(shape_height_mm) = max_shape_height_mm {
            let top_margin_mm = cell_margin_to_mm(cell.cell_attributes.top_margin);
            let bottom_margin_mm = cell_margin_to_mm(cell.cell_attributes.bottom_margin);
            let shape_height_with_margin = shape_height_mm + top_margin_mm + bottom_margin_mm;
            if shape_height_with_margin > cell_height {
                cell_height = shape_height_with_margin;
            }
        }

        let entry = max_row_heights.entry(row_idx).or_insert(0.0f64);
        *entry = (*entry).max(cell_height);
    }

    let mut cells_html = String::new();
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        // max_row_heights를 사용하여 cell_top 계산 (shape 높이 반영) / Calculate cell_top using max_row_heights (reflecting shape height)
        let row_address = cell.cell_attributes.row_address as usize;
        let mut cell_top = 0.0;
        for row_idx in 0..row_address {
            if let Some(&row_height) = max_row_heights.get(&row_idx) {
                cell_top += row_height;
            } else {
                // max_row_heights에 없으면 기존 방식 사용 / Use existing method if not in max_row_heights
                cell_top += get_row_height(table, row_idx, ctrl_header_height_mm);
            }
        }
        let cell_width = cell.cell_attributes.width.to_mm();
        // 같은 행의 모든 셀은 같은 높이를 가져야 함 (행의 최대 높이 사용, shape component 높이 포함) / All cells in the same row should have the same height (use row's max height, including shape component height)
        let row_idx = cell.cell_attributes.row_address as usize;
        let cell_height = if let Some(&row_max_height) = max_row_heights.get(&row_idx) {
            // max_row_heights는 이미 shape component 높이를 포함하여 계산됨 / max_row_heights already includes shape component height
            row_max_height
        } else {
            // max_row_heights가 없으면 실제 셀 높이 사용 (object_common.height는 fallback) / If max_row_heights not available, use actual cell height (object_common.height is fallback)
            get_cell_height(table, cell, ctrl_header_height_mm)
        };

        // 셀 내부 문단 렌더링 / Render paragraphs inside cell
        let mut cell_content = String::new();
        // hcI의 top 위치 계산을 위한 첫 번째 LineSegment 정보 저장 / Store first LineSegment info for hcI top position calculation
        let mut first_line_segment: Option<&LineSegmentInfo> = None;

        for para in &cell.paragraphs {
            // ParaShape 클래스 가져오기 / Get ParaShape class
            let para_shape_id = para.para_header.para_shape_id;
            let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len()
            {
                format!("ps{}", para_shape_id)
            } else {
                String::new()
            };

            // 텍스트와 CharShape 추출 / Extract text and CharShape
            let (text, char_shapes) = text::extract_text_and_shapes(para);

            // LineSegment 찾기 / Find LineSegment
            let mut line_segments = Vec::new();
            for record in &para.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    line_segments = segments.clone();
                    // 첫 번째 LineSegment 저장 (hcI top 계산용) / Store first LineSegment (for hcI top calculation)
                    if first_line_segment.is_none() && !segments.is_empty() {
                        first_line_segment = segments.first();
                    }
                    break;
                }
            }

            // 이미지 수집 (셀 내부에서는 테이블은 렌더링하지 않음) / Collect images (tables are not rendered inside cells)
            let mut images = Vec::new();

            // para.records에서 직접 ShapeComponentPicture 찾기 (CtrlHeader 내부가 아닌 경우만) / Find ShapeComponentPicture directly in para.records (only if not inside CtrlHeader)
            // CtrlHeader가 있는지 먼저 확인 / Check if CtrlHeader exists first
            let has_ctrl_header = para
                .records
                .iter()
                .any(|r| matches!(r, ParagraphRecord::CtrlHeader { .. }));

            if !has_ctrl_header {
                // CtrlHeader가 없을 때만 직접 처리 / Only process directly if no CtrlHeader
                for record in &para.records {
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
                                // ShapeComponentPicture가 직접 올 때는 border_rectangle 사용 (부모 ShapeComponent가 없음)
                                // When ShapeComponentPicture comes directly, use border_rectangle (no parent ShapeComponent)
                                let width_hwpunit =
                                    shape_component_picture.border_rectangle_x.right
                                        - shape_component_picture.border_rectangle_x.left;
                                let mut height_hwpunit =
                                    (shape_component_picture.border_rectangle_y.bottom
                                        - shape_component_picture.border_rectangle_y.top)
                                        as i32;

                                // border_rectangle_y의 top과 bottom이 같으면 crop_rectangle 사용
                                // If border_rectangle_y's top and bottom are the same, use crop_rectangle
                                if height_hwpunit == 0 {
                                    height_hwpunit = (shape_component_picture.crop_rectangle.bottom
                                        - shape_component_picture.crop_rectangle.top)
                                        as i32;
                                }

                                let width = width_hwpunit.max(0) as u32;
                                let height = height_hwpunit.max(0) as u32;

                                if width > 0 && height > 0 {
                                    images.push(ImageInfo {
                                        width,
                                        height,
                                        url: image_url,
                                        like_letters: false, // 셀 내부 이미지는 ctrl_header 정보 없음 / Images inside cells have no ctrl_header info
                                        affect_line_spacing: false,
                                        vert_rel_to: None,
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }

            // 재귀적으로 ShapeComponentPicture를 찾는 헬퍼 함수 / Helper function to recursively find ShapeComponentPicture
            fn collect_images_from_shape_component(
                children: &[ParagraphRecord],
                shape_component_width: u32,
                shape_component_height: u32,
                document: &HwpDocument,
                options: &HtmlOptions,
                images: &mut Vec<ImageInfo>,
            ) {
                for child in children {
                    match child {
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
                                // shape_component.width/height를 직접 사용 / Use shape_component.width/height directly
                                if shape_component_width > 0 && shape_component_height > 0 {
                                    images.push(ImageInfo {
                                        width: shape_component_width,
                                        height: shape_component_height,
                                        url: image_url,
                                        like_letters: false, // 셀 내부 이미지는 ctrl_header 정보 없음 / Images inside cells have no ctrl_header info
                                        affect_line_spacing: false,
                                        vert_rel_to: None,
                                    });
                                }
                            }
                        }
                        ParagraphRecord::ShapeComponent {
                            shape_component,
                            children: nested_children,
                        } => {
                            // 중첩된 ShapeComponent 재귀적으로 탐색 / Recursively search nested ShapeComponent
                            collect_images_from_shape_component(
                                nested_children,
                                shape_component.width,
                                shape_component.height,
                                document,
                                options,
                                images,
                            );
                        }
                        ParagraphRecord::ShapeComponentLine { .. }
                        | ParagraphRecord::ShapeComponentRectangle { .. }
                        | ParagraphRecord::ShapeComponentEllipse { .. }
                        | ParagraphRecord::ShapeComponentArc { .. }
                        | ParagraphRecord::ShapeComponentPolygon { .. }
                        | ParagraphRecord::ShapeComponentCurve { .. }
                        | ParagraphRecord::ShapeComponentOle { .. }
                        | ParagraphRecord::ShapeComponentContainer { .. }
                        | ParagraphRecord::ShapeComponentTextArt { .. } => {
                            // 다른 shape component 타입들은 children이 없으므로 무시 / Other shape component types have no children, so ignore
                        }
                        _ => {}
                    }
                }
            }

            for record in &para.records {
                match record {
                    ParagraphRecord::ShapeComponent {
                        shape_component,
                        children,
                    } => {
                        // ShapeComponent의 children에서 이미지 찾기 (재귀적으로) / Find images in ShapeComponent's children (recursively)
                        collect_images_from_shape_component(
                            children,
                            shape_component.width,
                            shape_component.height,
                            document,
                            options,
                            &mut images,
                        );
                    }
                    ParagraphRecord::CtrlHeader {
                        header,
                        children,
                        paragraphs: ctrl_paragraphs,
                        ..
                    } => {
                        // CtrlHeader 처리 (그림 개체 등) / Process CtrlHeader (shape objects, etc.)
                        // process_ctrl_header를 호출하여 이미지 수집 (paragraph.rs와 동일한 방식) / Call process_ctrl_header to collect images (same way as paragraph.rs)
                        // children이 비어있으면 cell.paragraphs도 확인 / If children is empty, also check cell.paragraphs
                        let paragraphs_to_use =
                            if children.is_empty() && !cell.paragraphs.is_empty() {
                                &cell.paragraphs
                            } else {
                                ctrl_paragraphs
                            };
                        let ctrl_result = ctrl_header::process_ctrl_header(
                            header,
                            children,
                            paragraphs_to_use,
                            document,
                            options,
                        );
                        images.extend(ctrl_result.images);
                    }
                    _ => {}
                }
            }

            // ParaShape indent 값 가져오기 / Get ParaShape indent value
            let para_shape_indent =
                if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
                    Some(document.doc_info.para_shapes[para_shape_id as usize].indent)
                } else {
                    None
                };

            // LineSegment가 있으면 사용 / Use LineSegment if available
            if !line_segments.is_empty() {
                cell_content.push_str(&render_line_segments_with_content(
                    &line_segments,
                    &text,
                    &char_shapes,
                    document,
                    &para_shape_class,
                    &images,
                    &[], // 셀 내부에서는 테이블 없음 / No tables inside cells
                    options,
                    para_shape_indent,
                    None,             // hcd_position 없음 / No hcd_position
                    None,             // page_def 없음 / No page_def
                    0, // table_counter_start (셀 내부에서는 테이블 번호 사용 안 함) / table_counter_start (table numbers not used inside cells)
                    pattern_counter, // 문서 레벨 pattern_counter 전달 / Pass document-level pattern_counter
                    color_to_pattern, // 문서 레벨 color_to_pattern 전달 / Pass document-level color_to_pattern
                ));
            } else if !text.is_empty() {
                // LineSegment가 없으면 텍스트만 렌더링 / Render text only if no LineSegment
                let rendered_text =
                    text::render_text(&text, &char_shapes, document, &options.css_class_prefix);
                cell_content.push_str(&format!(
                    r#"<div class="hls {}">{}</div>"#,
                    para_shape_class, rendered_text
                ));
            } else if !images.is_empty() {
                // LineSegment와 텍스트가 없지만 이미지가 있는 경우 / No LineSegment or text but images exist
                // 이미지만 렌더링 / Render images only
                for image in &images {
                    let image_html = image::render_image_with_style(
                        &image.url,
                        0,
                        0,
                        image.width as INT32,
                        image.height as INT32,
                        0,
                        0,
                    );
                    cell_content.push_str(&image_html);
                }
            }
        }

        let left_margin_mm = cell_margin_to_mm(cell.cell_attributes.left_margin);
        let top_margin_mm = cell_margin_to_mm(cell.cell_attributes.top_margin);
        let bottom_margin_mm = cell_margin_to_mm(cell.cell_attributes.bottom_margin);

        // hcI의 top 위치 계산 / Calculate hcI top position
        // 세로 정렬에 따라 셀 높이와 LineSegment 높이를 고려하여 계산
        // Calculate considering cell height and LineSegment height according to vertical alignment
        let hci_top_mm = if let Some(segment) = first_line_segment {
            let segment_height_mm = round_to_2dp(int32_to_mm(segment.line_height));
            let text_height_mm = round_to_2dp(int32_to_mm(segment.text_height));
            let baseline_distance_mm = round_to_2dp(int32_to_mm(segment.baseline_distance));

            match cell.list_header.attribute.vertical_align {
                VerticalAlign::Top => {
                    // Top 정렬: baseline_offset 계산 (baseline_distance - text_height) / 2
                    // Top alignment: calculate baseline_offset (baseline_distance - text_height) / 2
                    let baseline_offset = (baseline_distance_mm - text_height_mm) / 2.0;
                    round_to_2dp(baseline_offset)
                }
                VerticalAlign::Center => {
                    // Center 정렬: 셀 높이와 LineSegment 높이를 고려하여 중앙 정렬
                    // Center alignment: center align considering cell height and LineSegment height
                    let center_offset = (cell_height - segment_height_mm) / 2.0;
                    round_to_2dp(center_offset)
                }
                VerticalAlign::Bottom => {
                    // Bottom 정렬: 셀 높이와 LineSegment 높이를 고려하여 하단 정렬
                    // Bottom alignment: bottom align considering cell height and LineSegment height
                    let bottom_offset = cell_height - segment_height_mm;
                    round_to_2dp(bottom_offset)
                }
            }
        } else {
            // LineSegment가 없으면 기본값 사용 / Use default value if no LineSegment
            0.0
        };

        // hcI에 top 스타일 추가 (값이 0이 아닌 경우만) / Add top style to hcI (only if value is not 0)
        let hci_style = if hci_top_mm.abs() > 0.01 {
            format!(r#" style="top:{}mm;""#, round_to_2dp(hci_top_mm))
        } else {
            String::new()
        };

        cells_html.push_str(&format!(
            r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI"{}>{}</div></div></div>"#,
            round_to_2dp(cell_left),
            round_to_2dp(cell_top),
            round_to_2dp(cell_width),
            round_to_2dp(cell_height),
            round_to_2dp(left_margin_mm),
            round_to_2dp(top_margin_mm),
            hci_style,
            cell_content
        ));
    }
    cells_html
}
