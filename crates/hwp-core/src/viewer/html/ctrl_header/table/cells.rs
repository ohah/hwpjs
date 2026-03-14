use std::collections::HashMap;

use crate::document::bodytext::list_header::VerticalAlign;
use crate::document::bodytext::{LineSegmentInfo, ParagraphRecord, Table};
use crate::document::CtrlHeaderData;
use crate::viewer::core::outline::{
    compute_paragraph_marker_with_char_shape, MarkerInfo, NumberTracker, OutlineNumberTracker,
};
use crate::viewer::html::line_segment::{
    render_line_segments_with_content, DocumentRenderState, ImageInfo, LineSegmentContent,
    LineSegmentRenderContext,
};
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
        // rowspan>1인 셀은 개별 행 높이에 포함하지 않음 (행 높이는 rowspan=1인 셀로만 결정)
        // Skip cells with rowspan>1 for row height calculation (row height is determined by rowspan=1 cells only)
        let row_span = cell.cell_attributes.row_span;
        if row_span != 1 {
            continue;
        }

        let row_idx = cell.cell_attributes.row_address as usize;
        let _col_idx = cell.cell_attributes.col_address as usize;

        // 셀 다단 감지 / Detect multi-column in cell
        let mut cell_mc_count = 1u8;
        for para in &cell.paragraphs {
            for record in &para.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    if let CtrlHeaderData::ColumnDefinition { attribute, .. } = &header.data {
                        if attribute.column_count > 1 {
                            cell_mc_count = attribute.column_count;
                        }
                    }
                }
            }
        }

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
                        ..
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

                    // ParaLineSeg: 마지막 segment의 vertical_position + line_height로 높이 계산
                    // ParaLineSeg: calculate height from last segment's vertical_position + line_height
                    ParagraphRecord::ParaLineSeg { segments } => {
                        has_paraline_seg = true;
                        if let Some(last) = segments.last() {
                            let height_mm = round_to_2dp(int32_to_mm(
                                last.vertical_position + last.line_height,
                            ));
                            paraline_seg_height_mm =
                                Some(paraline_seg_height_mm.unwrap_or(0.0).max(height_mm));
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
                        ..
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
                        if let Some(last) =
                            if cell_mc_count > 1 && segments.len() >= cell_mc_count as usize {
                                // 다단: 한 단의 마지막 세그먼트 사용 / Multi-column: use last segment of one column
                                let segs_per_col = segments.len() / cell_mc_count as usize;
                                segments[..segs_per_col].last()
                            } else {
                                segments.last()
                            }
                        {
                            // vertical_position + line_height가 콘텐츠 높이 (줄 간격/문단 간격 포함)
                            // vertical_position + line_height is content height (includes line/paragraph spacing)
                            let height_mm = round_to_2dp(int32_to_mm(
                                last.vertical_position + last.line_height,
                            ));
                            max_shape_height_mm =
                                Some(max_shape_height_mm.unwrap_or(0.0).max(height_mm));
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
        // rowspan을 고려하여 셀 높이 계산 (해당 행들의 높이 합산)
        // Calculate cell height considering rowspan (sum of spanned row heights)
        let row_idx = cell.cell_attributes.row_address as usize;
        let row_span = if cell.cell_attributes.row_span == 0 {
            1usize
        } else {
            cell.cell_attributes.row_span as usize
        };
        let mut cell_height = 0.0;
        for ri in row_idx..(row_idx + row_span) {
            if let Some(&row_h) = max_row_heights.get(&ri) {
                cell_height += row_h;
            } else {
                cell_height += get_row_height(table, ri, ctrl_header_height_mm);
            }
        }

        // 셀 마진(mm) 계산은 렌더링 전반(특히 special-case)에서 필요하므로 먼저 계산합니다.
        let left_margin_mm = cell_margin_to_mm(cell.cell_attributes.left_margin);
        let _right_margin_mm = cell_margin_to_mm(cell.cell_attributes.right_margin);
        let top_margin_mm = cell_margin_to_mm(cell.cell_attributes.top_margin);

        // 셀 내부 문단 렌더링 / Render paragraphs inside cell
        let mut cell_content = String::new();
        // fixture처럼 hce 바로 아래에 추가로 붙일 HTML(예: 이미지 hsR)을 모읍니다.
        let mut cell_outside_html = String::new();
        // 이미지-only 셀 보정용: 이미지가 크고(셀 높이에 근접) 텍스트가 없으면 hcI를 아래로 밀지 않음
        let mut cell_has_text = false;
        let mut image_only_max_height_mm: Option<f64> = None;
        // hcI의 top 위치 계산을 위한 첫 번째 LineSegment 정보 저장 / Store first LineSegment info for hcI top position calculation
        let mut first_line_segment: Option<&LineSegmentInfo> = None;

        // 다단 감지 / Detect multi-column
        let mut multicolumn_info: Option<(u8, i16, u8, u32)> = None;
        for para in &cell.paragraphs {
            for record in &para.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    if let CtrlHeaderData::ColumnDefinition {
                        attribute,
                        column_spacing,
                        divider_line_type,
                        divider_line_color,
                        ..
                    } = &header.data
                    {
                        if attribute.column_count > 1 {
                            multicolumn_info = Some((
                                attribute.column_count,
                                *column_spacing,
                                *divider_line_type,
                                *divider_line_color,
                            ));
                        }
                    }
                }
            }
        }
        let mut multicolumn_html: Option<String> = None;
        let mut cell_outline_tracker = OutlineNumberTracker::new();
        let mut cell_number_tracker = NumberTracker::new();

        // LineSegment가 없는 paragraph의 top 위치 추정을 위해
        // 이전 paragraph의 마지막 line segment bottom 위치를 추적
        let mut last_seg_bottom_hwpunit: i32 = 0;

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

            // 마커 정보 계산 (Bullet/Number/Outline)
            // char_shape_id == -1인 bullet은 문단의 첫 번째 CharShape를 fallback으로 사용
            let fallback_cs_id = char_shapes.first().map(|cs| cs.shape_id);
            let cell_marker_info: Option<MarkerInfo> = compute_paragraph_marker_with_char_shape(
                &para.para_header,
                document,
                &mut cell_outline_tracker,
                &mut cell_number_tracker,
                0,
                fallback_cs_id,
            );

            // LineSegment 찾기 / Find LineSegment
            let mut line_segments = Vec::new();
            for record in &para.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    line_segments = segments.clone();
                    // 첫 번째 LineSegment 저장 (hcI top 계산용) / Store first LineSegment (for hcI top calculation)
                    if first_line_segment.is_none() && !segments.is_empty() {
                        first_line_segment = segments.first();
                    }
                    // 마지막 segment의 bottom 위치 업데이트
                    if let Some(last) = segments.last() {
                        last_seg_bottom_hwpunit = last.vertical_position + last.line_height;
                    }
                    break;
                }
            }

            // 이미지 및 중첩 테이블 수집 / Collect images and nested tables
            let mut images = Vec::new();
            let mut nested_tables: Vec<super::super::super::line_segment::TableInfo> = Vec::new();

            // 셀 안의 중첩 테이블 수집 (CtrlHeader(tbl) → process_ctrl_header)
            // SHAPE_OBJECT 앵커 위치 수집
            let shape_anchors: Vec<usize> = {
                let mut anchors = Vec::new();
                for record in &para.records {
                    if let ParagraphRecord::ParaText {
                        control_char_positions,
                        ..
                    } = record
                    {
                        for pos in control_char_positions {
                            if pos.code == 11 {
                                // SHAPE_OBJECT
                                anchors.push(pos.position);
                            }
                        }
                    }
                }
                anchors
            };
            let mut shape_anchor_idx = 0usize;
            for record in &para.records {
                if let ParagraphRecord::CtrlHeader {
                    header, children, ..
                } = record
                {
                    if header.ctrl_id == "tbl " && !children.is_empty() {
                        let anchor = shape_anchors.get(shape_anchor_idx).copied();
                        shape_anchor_idx += 1;
                        for child_rec in children {
                            if let ParagraphRecord::Table { table: nested_tbl } = child_rec {
                                use super::super::super::line_segment::TableInfo;
                                nested_tables.push(TableInfo {
                                    table: nested_tbl,
                                    ctrl_header: Some(&header.data),
                                    anchor_char_pos: anchor,
                                    caption: None,
                                });
                            }
                        }
                    }
                }
            }
            let _ = &shape_anchor_idx; // suppress unused warning

            // para.records에서 직접 ShapeComponentPicture 찾기 (CtrlHeader 내부가 아닌 경우만) / Find ShapeComponentPicture directly in para.records (only if not inside CtrlHeader)
            // CtrlHeader가 있는지 먼저 확인 / Check if CtrlHeader exists first
            let has_ctrl_header = para
                .records
                .iter()
                .any(|r| matches!(r, ParagraphRecord::CtrlHeader { .. }));

            if !has_ctrl_header {
                // CtrlHeader가 없을 때만 직접 처리 / Only process directly if no CtrlHeader
                for record in &para.records {
                    if let ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } = record
                    {
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
                            let width_hwpunit = shape_component_picture.border_rectangle_x.right
                                - shape_component_picture.border_rectangle_x.left;
                            let mut height_hwpunit =
                                shape_component_picture.border_rectangle_y.bottom
                                    - shape_component_picture.border_rectangle_y.top;

                            // border_rectangle_y의 top과 bottom이 같으면 crop_rectangle 사용
                            // If border_rectangle_y's top and bottom are the same, use crop_rectangle
                            if height_hwpunit == 0 {
                                height_hwpunit = shape_component_picture.crop_rectangle.bottom
                                    - shape_component_picture.crop_rectangle.top;
                            }

                            let width = width_hwpunit.max(0) as u32;
                            let height = height_hwpunit.max(0) as u32;

                            if width > 0 && height > 0 {
                                images.push(ImageInfo {
                                    width,
                                    height,
                                    url: image_url,
                                    like_letters: false, // 셀 내부 이미지는 ctrl_header 정보 없음 / Images inside cells have no ctrl_header info
                                    vert_rel_to: None,
                                });
                            }
                        }
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
                                // border_rectangle가 유효하면 사용, 아니면 shape_component 사용
                                let br_width = (shape_component_picture.border_rectangle_x.right
                                    - shape_component_picture.border_rectangle_x.left)
                                    .max(0) as u32;
                                let br_height = (shape_component_picture.border_rectangle_y.bottom
                                    - shape_component_picture.border_rectangle_y.top)
                                    .max(0) as u32;
                                let (w, h) = if br_width > 0 && br_height > 0 {
                                    (br_width, br_height)
                                } else {
                                    (shape_component_width, shape_component_height)
                                };
                                if w > 0 && h > 0 {
                                    images.push(ImageInfo {
                                        width: w,
                                        height: h,
                                        url: image_url,
                                        like_letters: false,
                                        vert_rel_to: None,
                                    });
                                }
                            }
                        }
                        ParagraphRecord::ShapeComponent {
                            shape_component,
                            children: nested_children,
                            ..
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
                        ..
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
                            None,
                            None,
                        );
                        images.extend(ctrl_result.images);
                    }
                    _ => {}
                }
            }

            // 이미지-only 셀 판단을 위해, 이 문단에서 수집된 이미지의 최대 높이를 기록합니다.
            // (LineSegment 경로로 렌더링되는 경우에도 images는 존재할 수 있으므로 여기서 누적)
            if !images.is_empty() {
                for image in &images {
                    let h_mm = round_to_2dp(int32_to_mm(image.height as INT32));
                    image_only_max_height_mm = Some(
                        image_only_max_height_mm
                            .map(|cur| cur.max(h_mm))
                            .unwrap_or(h_mm),
                    );
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
                // SPECIAL CASE (noori BIN0002 등):
                // 텍스트가 없고 이미지가 있는데, LineSegment.segment_width가 0에 가까우면 hls width가 0으로 출력되어
                // 이미지 정렬이 깨집니다. 이 경우에도 hce>hcD>hcI>hls 구조는 유지하되,
                // hls 박스 width를 '셀의 콘텐츠 폭'으로 강제하고 이미지(hsR)를 그 안에서 가운데 배치합니다.
                let has_only_images = text.trim().is_empty() && !images.is_empty();
                let seg_width_mm = line_segments
                    .first()
                    .map(|s| round_to_2dp(int32_to_mm(s.segment_width)))
                    .unwrap_or(0.0);
                if has_only_images && seg_width_mm.abs() < 0.01 {
                    // FIXTURE(noori.html) 구조 재현:
                    // - hcI에는 "빈 문단(hls width=0)"만 남김
                    // - 실제 이미지는 hce 바로 아래에 hsR로 배치(top/left는 cell margin + ObjectCommon offset)
                    //
                    // fixture 예:
                    //   <div class="hcI"><div class="hls ... width:0mm;"></div></div>
                    //   <div class="hsR" style="top:0.50mm;left:24.42mm;... background-image:url(...);"></div>
                    let image = &images[0];

                    // 기본값: margin만 (offset 못 찾으면 0으로)
                    let mut obj_off_x_mm = 0.0;
                    let mut obj_off_y_mm = 0.0;
                    for record in &para.records {
                        if let ParagraphRecord::CtrlHeader { header, .. } = record {
                            if let CtrlHeaderData::ObjectCommon {
                                offset_x, offset_y, ..
                            } = &header.data
                            {
                                obj_off_x_mm = round_to_2dp(int32_to_mm((*offset_x).into()));
                                obj_off_y_mm = round_to_2dp(int32_to_mm((*offset_y).into()));
                                break;
                            }
                        }
                    }

                    // 1) hcI 안에는 빈 hls만. line_height/top/height는 첫 LineSegment 또는 문서 CharShape 기반
                    let (line_height_mm, top_mm, height_mm) = line_segments
                        .first()
                        .map(|seg| {
                            let lh = round_to_2dp(int32_to_mm(seg.line_height));
                            let th = round_to_2dp(int32_to_mm(seg.text_height));
                            let top = round_to_2dp((lh - th) / 2.0);
                            (lh, top, lh)
                        })
                        .unwrap_or_else(|| {
                            let font_mm = document
                                .doc_info
                                .char_shapes
                                .first()
                                .map(|cs| (cs.base_size as f64 / 100.0) * 0.352778)
                                .unwrap_or(2.79);
                            let lh = round_to_2dp(font_mm * 1.2);
                            (lh, round_to_2dp((lh - font_mm) / 2.0), lh)
                        });
                    cell_content.push_str(&format!(
                        r#"<div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:0mm;top:{:.2}mm;height:{:.2}mm;width:0mm;"></div>"#,
                        para_shape_class, line_height_mm, top_mm, height_mm
                    ));

                    // 2) 실제 이미지는 cell_outside_html로 (hce 바로 아래)
                    // 좌표는 fixture처럼: top = top_margin_mm + offset_y, left = left_margin_mm + offset_x
                    let abs_left_mm = round_to_2dp(left_margin_mm + obj_off_x_mm);
                    let abs_top_mm = round_to_2dp(top_margin_mm + obj_off_y_mm);
                    cell_outside_html.push_str(&format!(
                        r#"<div class="hsR" style="top:{:.2}mm;left:{:.2}mm;width:{:.2}mm;height:{:.2}mm;background-repeat:no-repeat;background-image:url('{}');"></div>"#,
                        abs_top_mm,
                        abs_left_mm,
                        round_to_2dp(int32_to_mm(image.width as INT32)),
                        round_to_2dp(int32_to_mm(image.height as INT32)),
                        image.url
                    ));
                } else {
                    // ParaText의 control_char_positions 수집 (원본 WCHAR 인덱스 기준)
                    let mut control_char_positions = Vec::new();
                    for record in &para.records {
                        if let ParagraphRecord::ParaText {
                            control_char_positions: ccp,
                            ..
                        } = record
                        {
                            control_char_positions = ccp.clone();
                            break;
                        }
                    }

                    if let Some((col_count, col_spacing, div_line_type, div_line_color)) =
                        multicolumn_info
                    {
                        // 다단 렌더링: cold 문단부터 연속 문단까지 집계 / Multi-column rendering: aggregate from cold paragraph to continuation
                        let col_count_usize = col_count as usize;

                        // cold 문단(column_divide_type 비어있지 않은)부터 끝까지 모든 문단의
                        // line segments, text, char_shapes를 집계
                        // Aggregate all paragraphs from cold to end
                        use crate::document::bodytext::LineSegmentInfo as CellLineSegInfo;
                        let mut all_segs: Vec<CellLineSegInfo> = Vec::new();
                        let mut all_mc_text = String::new();
                        let mut all_mc_char_shapes: Vec<crate::document::bodytext::CharShapeInfo> =
                            Vec::new();
                        let mut all_mc_ccp = Vec::new();
                        let mut mc_collecting = false;
                        let mut mc_wchar_offset: usize = 0; // 원본 WCHAR 단위 오프셋

                        for mc_para in &cell.paragraphs {
                            if !mc_para.para_header.column_divide_type.is_empty() {
                                if mc_collecting {
                                    break;
                                }
                                mc_collecting = true;
                            }
                            if !mc_collecting {
                                continue;
                            }

                            let (mc_text, mc_cs) = text::extract_text_and_shapes(mc_para);
                            let text_offset = mc_wchar_offset;

                            for rec in &mc_para.records {
                                match rec {
                                    ParagraphRecord::ParaLineSeg { segments } => {
                                        for seg in segments {
                                            let mut adjusted = seg.clone();
                                            adjusted.text_start_position += text_offset as u32;
                                            all_segs.push(adjusted);
                                        }
                                    }
                                    ParagraphRecord::ParaText {
                                        control_char_positions: ccp,
                                        ..
                                    } => {
                                        for cp in ccp {
                                            let mut adjusted = cp.clone();
                                            adjusted.position += text_offset;
                                            all_mc_ccp.push(adjusted);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            mc_wchar_offset += mc_para.para_header.text_char_count as usize;
                            all_mc_text.push_str(&mc_text);
                            // char_shapes 위치도 WCHAR 오프셋으로 보정
                            for mut cs in mc_cs {
                                cs.position += text_offset as u32;
                                all_mc_char_shapes.push(cs);
                            }
                        }

                        // split_into_column_groups로 컬럼 경계 감지
                        let col_groups =
                            crate::viewer::html::document::split_into_column_groups(&all_segs);

                        if col_groups.len() >= col_count_usize && !all_segs.is_empty() {
                            let seg_width_mm_raw = int32_to_mm(all_segs[0].segment_width);
                            let col_spacing_mm_raw = int32_to_mm(col_spacing as i32);
                            let mut mc_html = String::new();

                            // hcS 구분선 / hcS separator
                            if div_line_type > 0 {
                                let sep_left = round_to_2dp(
                                    seg_width_mm_raw + (col_spacing_mm_raw - 0.11) / 2.0,
                                );
                                let (first_start, first_end) = col_groups[0];
                                let first_col_segs = &all_segs[first_start..first_end];
                                let content_height_mm = first_col_segs
                                    .last()
                                    .map(|last| {
                                        round_to_2dp(int32_to_mm(
                                            last.vertical_position + last.line_height,
                                        ))
                                    })
                                    .unwrap_or(0.0);
                                let stroke_color = format!("#{:06x}", div_line_color & 0x00FFFFFF);
                                mc_html.push_str(&format!(
                                    r#"<div class="hcS" style="left:{:.2}mm;top:0mm;width:0.11mm;height:{:.2}mm;"><svg class="hs" viewBox="-0.12 -0.12 0.35 {:.2}" style="left:-0.12mm;top:-0.12mm;width:0.35mm;height:{:.2}mm;left:0;top:0;"><path d="M0.06,0 L0.06,{:.2}" style="stroke:{};stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
                                    sep_left,
                                    content_height_mm,
                                    content_height_mm + 0.23,
                                    content_height_mm + 0.23,
                                    content_height_mm,
                                    stroke_color
                                ));
                            }

                            let all_mc_text_len = mc_wchar_offset;

                            // 각 단 렌더링 / Render each column
                            for (col_idx, &(start, end)) in
                                col_groups.iter().enumerate().take(col_count_usize)
                            {
                                let col_segs = &all_segs[start..end];
                                if col_segs.is_empty() {
                                    continue;
                                }
                                let col_original_text_len = if end < all_segs.len() {
                                    all_segs[end].text_start_position as usize
                                } else {
                                    all_mc_text_len
                                };

                                let content = LineSegmentContent {
                                    segments: col_segs,
                                    text: &all_mc_text,
                                    char_shapes: &all_mc_char_shapes,
                                    control_char_positions: &all_mc_ccp,
                                    original_text_len: col_original_text_len,
                                    images: &[],
                                    tables: &[],
                                    shape_htmls: &[],
                                    marker_info: None,
                                    paragraph_markers: &[],
                                    footnote_refs: &[],
                                    endnote_refs: &[],
                                    auto_numbers: &[],
                                    hyperlinks: &[],
                                };
                                let context = LineSegmentRenderContext {
                                    document,
                                    para_shape_class: &para_shape_class,
                                    options,
                                    para_shape_indent,
                                    hcd_position: None,
                                    page_def: None,
                                    body_default_hls: Some((2.79, -0.18)),
                                };
                                let mut state = DocumentRenderState {
                                    table_counter_start: 0,
                                    pattern_counter,
                                    color_to_pattern,
                                };

                                let col_content = render_line_segments_with_content(
                                    &content, &context, &mut state,
                                );
                                if col_idx == 0 {
                                    mc_html.push_str(&format!(
                                        r#"<div class="hcI">{}</div>"#,
                                        col_content
                                    ));
                                } else {
                                    let col_left = round_to_2dp(
                                        seg_width_mm_raw + col_spacing_mm_raw * col_idx as f64,
                                    );
                                    mc_html.push_str(&format!(
                                        r#"<div class="hcI" style="left:{:.2}mm;">{}</div>"#,
                                        col_left, col_content
                                    ));
                                }
                            }
                            multicolumn_html = Some(mc_html);
                        }
                    }

                    if multicolumn_html.is_none() {
                        // 일반 단일 단 렌더링 / Normal single-column rendering
                        let content = LineSegmentContent {
                            segments: &line_segments,
                            text: &text,
                            char_shapes: &char_shapes,
                            control_char_positions: &control_char_positions,
                            original_text_len: para.para_header.text_char_count as usize,
                            images: &images,
                            tables: &nested_tables,
                            shape_htmls: &[],
                            marker_info: cell_marker_info.as_ref(),
                            paragraph_markers: &[],
                            footnote_refs: &[],
                            endnote_refs: &[],
                            auto_numbers: &[],
                            hyperlinks: &[],
                        };
                        let context = LineSegmentRenderContext {
                            document,
                            para_shape_class: &para_shape_class,
                            options,
                            para_shape_indent,
                            hcd_position: None,
                            page_def: None,
                            body_default_hls: None,
                        };
                        let mut state = DocumentRenderState {
                            table_counter_start: 0,
                            pattern_counter,
                            color_to_pattern,
                        };
                        cell_content.push_str(&render_line_segments_with_content(
                            &content, &context, &mut state,
                        ));
                        if !text.is_empty() {
                            cell_has_text = true;
                        }
                    }
                }
            } else if !text.is_empty() {
                // LineSegment가 없으면 텍스트만 렌더링 / Render text only if no LineSegment
                // 이전 paragraph의 line segment에서 다음 위치를 추정하여 top 설정
                // (LineSegment가 없는 paragraph는 이전 paragraph 바로 다음에 배치)
                let rendered_text =
                    text::render_text(&text, &char_shapes, document, &options.css_class_prefix);

                // LineSegment가 없는 paragraph의 top 위치:
                // 이전 paragraph의 마지막 line segment bottom에서 이어감
                let top_mm = round_to_2dp(int32_to_mm(last_seg_bottom_hwpunit));

                // 기본 line-height: CharShape에서 가져오거나 fallback
                let default_lh = char_shapes
                    .first()
                    .and_then(|cs| {
                        document
                            .doc_info
                            .char_shapes
                            .get(cs.shape_id as usize)
                            .map(|shape| round_to_2dp((shape.base_size as f64 / 100.0) * 0.352778))
                    })
                    .unwrap_or(2.79);

                let text_height_mm = default_lh;
                let offset_mm = round_to_2dp((default_lh - text_height_mm) / 2.0);
                let hls_top_mm = round_to_2dp(top_mm + offset_mm);

                // 문단 번호 마커 렌더링 (hhe div)
                let marker_html = if let Some(ref marker) = cell_marker_info {
                    let font_style = marker
                        .font_size_pt
                        .map(|pt| format!(r#" style="font-size:{pt}pt;""#))
                        .unwrap_or_default();
                    let cs_class = if !marker.char_shape_class.is_empty() {
                        format!(" {}", marker.char_shape_class)
                    } else {
                        String::new()
                    };
                    format!(
                        r#"<div class="hhe" style="display:inline-block;margin-left:{:.2}mm;width:{:.2}mm;height:{:.2}mm;"><span class="hrt{}"{}>{}</span></div>"#,
                        marker.margin_left_mm,
                        marker.width_mm,
                        default_lh,
                        cs_class,
                        font_style,
                        marker.marker_text
                    )
                } else {
                    String::new()
                };

                cell_content.push_str(&format!(
                    r#"<div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:0.00mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;">{}{}</div>"#,
                    para_shape_class,
                    default_lh,
                    hls_top_mm,
                    default_lh,
                    round_to_2dp(cell_width - left_margin_mm - _right_margin_mm),
                    marker_html,
                    rendered_text
                ));

                // last_seg_bottom 업데이트 (line-height + bottom_spacing)
                let bottom_spacing =
                    if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
                        document.doc_info.para_shapes[para_shape_id as usize].bottom_spacing as i32
                    } else {
                        0
                    };
                last_seg_bottom_hwpunit += (default_lh * 7200.0 / 25.4) as i32 + bottom_spacing;
                cell_has_text = true;
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
                    let h_mm = round_to_2dp(int32_to_mm(image.height as INT32));
                    image_only_max_height_mm = Some(
                        image_only_max_height_mm
                            .map(|cur| cur.max(h_mm))
                            .unwrap_or(h_mm),
                    );
                }
            }
        }

        // (마진 값은 위에서 이미 계산됨)
        let _bottom_margin_mm = cell_margin_to_mm(cell.cell_attributes.bottom_margin);

        // hcI의 top 위치 계산 / Calculate hcI top position
        // NOTE: hcI는 "셀 안에서 컨텐츠 블록을 어디에 둘지"만 담당합니다(Top/Center/Bottom).
        // 글자 baseline/line-height 보정은 LineSegment(hls) 쪽에서 처리합니다.
        //
        // IMPORTANT (fixture 기준):
        // 셀 안에 줄이 여러 개(여러 para_line_seg)인 경우, 첫 줄 높이만으로 center를 계산하면
        // fixture보다 과하게 내려가므로(예: 6.44mm), 전체 라인 블록 높이(첫 라인 시작~마지막 라인 끝)를 사용합니다.
        let hci_top_mm = if let Some(segment) = first_line_segment {
            // 기본: 단일 라인 높이 / Default: single line height
            let mut content_height_mm = round_to_2dp(int32_to_mm(segment.line_height));

            // 셀 내부 모든 para_line_seg를 스캔하여 전체 콘텐츠 높이 계산
            // (min vertical_position ~ max(vertical_position + line_height))
            let mut min_vp: Option<i32> = None;
            let mut max_bottom: Option<i32> = None;
            for para in &cell.paragraphs {
                for record in &para.records {
                    if let ParagraphRecord::ParaLineSeg { segments } = record {
                        for seg in segments {
                            let vp = seg.vertical_position;
                            let bottom = seg.vertical_position + seg.line_height;
                            min_vp = Some(min_vp.map(|x| x.min(vp)).unwrap_or(vp));
                            max_bottom = Some(max_bottom.map(|x| x.max(bottom)).unwrap_or(bottom));
                        }
                    }
                }
            }
            if let (Some(min_vp), Some(max_bottom)) = (min_vp, max_bottom) {
                if max_bottom > min_vp {
                    content_height_mm = round_to_2dp(int32_to_mm(max_bottom - min_vp));
                }
            }

            // 이미지-only 셀(특히 큰 이미지) 보정:
            // 텍스트가 없고 이미지가 셀 높이에 근접하면, fixture처럼 hcI를 아래로 밀지 않고 top=0으로 둡니다.
            if !cell_has_text {
                if let Some(img_h) = image_only_max_height_mm {
                    if img_h >= cell_height - 1.0 {
                        0.0
                    } else {
                        // 이미지가 컨텐츠 높이보다 크면 컨텐츠 높이를 이미지 기준으로
                        if img_h > content_height_mm {
                            content_height_mm = img_h;
                        }
                        match cell.list_header.attribute.vertical_align {
                            VerticalAlign::Top => 0.0,
                            VerticalAlign::Center => {
                                round_to_2dp((cell_height - content_height_mm) / 2.0)
                            }
                            VerticalAlign::Bottom => round_to_2dp(cell_height - content_height_mm),
                        }
                    }
                } else {
                    match cell.list_header.attribute.vertical_align {
                        VerticalAlign::Top => 0.0,
                        VerticalAlign::Center => {
                            round_to_2dp((cell_height - content_height_mm) / 2.0)
                        }
                        VerticalAlign::Bottom => round_to_2dp(cell_height - content_height_mm),
                    }
                }
            } else {
                match cell.list_header.attribute.vertical_align {
                    VerticalAlign::Top => 0.0,
                    VerticalAlign::Center => round_to_2dp((cell_height - content_height_mm) / 2.0),
                    VerticalAlign::Bottom => round_to_2dp(cell_height - content_height_mm),
                }
            }
        } else {
            0.0
        };

        // hcI에 top 스타일 추가 (값이 0이 아닌 경우만) / Add top style to hcI (only if value is not 0)
        let hci_style = if hci_top_mm.abs() > 0.01 {
            format!(r#" style="top:{}mm;""#, round_to_2dp(hci_top_mm))
        } else {
            String::new()
        };

        if let Some(ref mc_html) = multicolumn_html {
            cells_html.push_str(&format!(
                r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;">{}</div>{}</div>"#,
                round_to_2dp(cell_left),
                round_to_2dp(cell_top),
                round_to_2dp(cell_width),
                round_to_2dp(cell_height),
                round_to_2dp(left_margin_mm),
                round_to_2dp(top_margin_mm),
                mc_html,
                cell_outside_html
            ));
        } else {
            cells_html.push_str(&format!(
                r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI"{}>{}</div></div>{}</div>"#,
                round_to_2dp(cell_left),
                round_to_2dp(cell_top),
                round_to_2dp(cell_width),
                round_to_2dp(cell_height),
                round_to_2dp(left_margin_mm),
                round_to_2dp(top_margin_mm),
                hci_style,
                cell_content,
                cell_outside_html
            ));
        }
    }
    cells_html
}
