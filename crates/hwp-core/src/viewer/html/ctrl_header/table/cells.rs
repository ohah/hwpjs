use crate::document::bodytext::list_header::VerticalAlign;
use crate::document::bodytext::{ParagraphRecord, Table};
use crate::viewer::html::common;
use crate::viewer::html::line_segment::render_line_segments_with_content;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::html::text;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

use super::geometry::{calculate_cell_left, calculate_cell_top, get_cell_height};

pub(crate) fn render_cells(
    table: &Table,
    ctrl_header_height_mm: Option<f64>,
    document: &HwpDocument,
    options: &HtmlOptions,
) -> String {
    let mut cells_html = String::new();
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_top = calculate_cell_top(table, cell, ctrl_header_height_mm);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_cell_height(table, cell, ctrl_header_height_mm);

        // 셀 내부 문단 렌더링 / Render paragraphs inside cell
        let mut cell_content = String::new();
        // hcI의 top 위치 계산을 위한 첫 번째 LineSegment 정보 저장 / Store first LineSegment info for hcI top position calculation
        let mut first_line_segment: Option<&crate::document::bodytext::LineSegmentInfo> = None;

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
                        );
                        if !image_url.is_empty() {
                            let width = (shape_component_picture.border_rectangle_x.right
                                - shape_component_picture.border_rectangle_x.left)
                                as u32;
                            let height = (shape_component_picture.border_rectangle_y.bottom
                                - shape_component_picture.border_rectangle_y.top)
                                as u32;
                            images.push(crate::viewer::html::line_segment::ImageInfo {
                                width,
                                height,
                                url: image_url,
                            });
                        }
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
                    None, // hcd_position 없음 / No hcd_position
                    None, // page_def 없음 / No page_def
                    0, // table_counter_start (셀 내부에서는 테이블 번호 사용 안 함) / table_counter_start (table numbers not used inside cells)
                ));
            } else if !text.is_empty() {
                // LineSegment가 없으면 텍스트만 렌더링 / Render text only if no LineSegment
                let rendered_text =
                    text::render_text(&text, &char_shapes, document, &options.css_class_prefix);
                cell_content.push_str(&format!(
                    r#"<div class="hls {}">{}</div>"#,
                    para_shape_class, rendered_text
                ));
            }
        }

        let left_margin_mm = (cell.cell_attributes.left_margin as f64 / 7200.0) * 25.4;
        let top_margin_mm = (cell.cell_attributes.top_margin as f64 / 7200.0) * 25.4;

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
