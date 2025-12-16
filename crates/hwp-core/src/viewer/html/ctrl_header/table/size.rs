use std::collections::HashMap;

use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::{ParagraphRecord, Table};
use crate::types::Hwpunit16ToMm;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};

/// 셀 마진을 mm 단위로 변환 / Convert cell margin to mm
fn cell_margin_to_mm(margin_hwpunit: i16) -> f64 {
    round_to_2dp(int32_to_mm(margin_hwpunit as i32))
}

/// 크기 데이터 / Size data
#[derive(Clone, Copy)]
pub(crate) struct Size {
    pub width: f64,
    pub height: f64,
}

/// CtrlHeader 기반 htb 컨테이너 크기 계산 / Calculate container size from CtrlHeader
pub(crate) fn htb_size(ctrl_header: Option<&CtrlHeaderData>) -> Size {
    if let Some(CtrlHeaderData::ObjectCommon {
        width,
        height,
        margin,
        ..
    }) = ctrl_header
    {
        let w = width.to_mm() + margin.left.to_mm() + margin.right.to_mm();
        let h = height.to_mm() + margin.top.to_mm() + margin.bottom.to_mm();
        Size {
            width: round_to_2dp(w),
            height: round_to_2dp(h),
        }
    } else {
        Size {
            width: 0.0,
            height: 0.0,
        }
    }
}

/// 셀 기반 콘텐츠 크기 계산 / Calculate content size from cells
pub(crate) fn content_size(table: &Table, ctrl_header: Option<&CtrlHeaderData>) -> Size {
    let mut content_width = 0.0;
    let mut content_height = 0.0;

    if table.attributes.row_count > 0 && !table.attributes.row_sizes.is_empty() {
        if let Some(CtrlHeaderData::ObjectCommon { height, .. }) = ctrl_header {
            let ctrl_header_height_mm = height.to_mm();

            // object_common.height를 행 개수로 나눈 기본 행 높이 계산 / Calculate base row height from object_common.height divided by row count
            let base_row_height_mm = if table.attributes.row_count > 0 {
                ctrl_header_height_mm / table.attributes.row_count as f64
            } else {
                0.0
            };

            // ctrl_header.height가 있어도, shape component가 있는 셀의 실제 높이를 확인하여 더 큰 값을 사용
            // Even if ctrl_header.height exists, check actual cell heights with shape components and use the larger value
            let mut max_row_heights_with_shapes: HashMap<usize, f64> = HashMap::new();
            for cell in &table.cells {
                if cell.cell_attributes.row_span == 1 {
                    let row_idx = cell.cell_attributes.row_address as usize;
                    // 먼저 실제 셀 높이를 가져옴 (cell.cell_attributes.height 우선) / First get actual cell height (cell.cell_attributes.height has priority)
                    let mut cell_height = cell.cell_attributes.height.to_mm();

                    // shape component가 있는 셀의 경우 shape 높이 + 마진을 고려 / For cells with shape components, consider shape height + margin
                    let mut max_shape_height_mm: Option<f64> = None;

                    // 재귀적으로 모든 ShapeComponent의 높이를 찾는 헬퍼 함수 / Helper function to recursively find height of all ShapeComponents
                    fn find_shape_component_height(
                        children: &[ParagraphRecord],
                        shape_component_height: u32,
                    ) -> Option<f64> {
                        let mut max_height_mm: Option<f64> = None;

                        for child in children {
                            match child {
                                // ShapeComponentPicture: shape_component.height 사용
                                ParagraphRecord::ShapeComponentPicture { .. } => {
                                    let height_hwpunit = shape_component_height as i32;
                                    let height_mm = round_to_2dp(int32_to_mm(height_hwpunit));
                                    if max_height_mm.is_none() || height_mm > max_height_mm.unwrap()
                                    {
                                        max_height_mm = Some(height_mm);
                                    }
                                }

                                // 중첩된 ShapeComponent: 재귀적으로 탐색
                                ParagraphRecord::ShapeComponent {
                                    shape_component,
                                    children: nested_children,
                                } => {
                                    if let Some(height) = find_shape_component_height(
                                        nested_children,
                                        shape_component.height,
                                    ) {
                                        if max_height_mm.is_none()
                                            || height > max_height_mm.unwrap()
                                        {
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
                                    let height_mm =
                                        round_to_2dp(int32_to_mm(shape_component_height as i32));
                                    if max_height_mm.is_none() || height_mm > max_height_mm.unwrap()
                                    {
                                        max_height_mm = Some(height_mm);
                                    }
                                }

                                // ParaLineSeg: line_height 합산하여 높이 계산
                                ParagraphRecord::ParaLineSeg { segments } => {
                                    let total_height_hwpunit: i32 =
                                        segments.iter().map(|seg| seg.line_height).sum();
                                    let height_mm = round_to_2dp(int32_to_mm(total_height_hwpunit));
                                    if max_height_mm.is_none() || height_mm > max_height_mm.unwrap()
                                    {
                                        max_height_mm = Some(height_mm);
                                    }
                                }

                                _ => {}
                            }
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
                                    if let Some(shape_height_mm) = find_shape_component_height(
                                        children,
                                        shape_component.height,
                                    ) {
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
                                    if max_shape_height_mm.is_none()
                                        || height_mm > max_shape_height_mm.unwrap()
                                    {
                                        max_shape_height_mm = Some(height_mm);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }

                    // shape component가 있으면 셀 높이 = shape 높이 + 마진 / If shape component exists, cell height = shape height + margin
                    if let Some(shape_height_mm) = max_shape_height_mm {
                        let top_margin_mm = cell_margin_to_mm(cell.cell_attributes.top_margin);
                        let bottom_margin_mm =
                            cell_margin_to_mm(cell.cell_attributes.bottom_margin);
                        let shape_height_with_margin =
                            shape_height_mm + top_margin_mm + bottom_margin_mm;
                        // shape 높이 + 마진이 기존 셀 높이보다 크면 사용 / Use shape height + margin if larger than existing cell height
                        if shape_height_with_margin > cell_height {
                            cell_height = shape_height_with_margin;
                        }
                    }

                    // shape component가 없고 셀 높이가 매우 작으면 object_common.height를 베이스로 사용 (fallback)
                    // If no shape component and cell height is very small, use object_common.height as base (fallback)
                    if max_shape_height_mm.is_none()
                        && cell_height < 0.1
                        && base_row_height_mm > 0.0
                    {
                        cell_height = base_row_height_mm;
                    }

                    let entry = max_row_heights_with_shapes.entry(row_idx).or_insert(0.0f64);
                    *entry = (*entry).max(cell_height);
                }
            }

            // 행 높이 합계 계산 / Calculate sum of row heights
            let mut calculated_height = 0.0;
            for row_idx in 0..table.attributes.row_count as usize {
                if let Some(&height) = max_row_heights_with_shapes.get(&row_idx) {
                    calculated_height += height;
                } else if base_row_height_mm > 0.0 {
                    // max_row_heights_with_shapes에 없으면 object_common.height를 행 개수로 나눈 값 사용 / If not in max_row_heights_with_shapes, use object_common.height divided by row count
                    calculated_height += base_row_height_mm;
                } else if let Some(&row_size) = table.attributes.row_sizes.get(row_idx) {
                    let row_height = (row_size as f64 / 7200.0) * 25.4;
                    calculated_height += row_height;
                }
            }

            // ctrl_header.height가 있으면 우선 사용 (이미 shape component 높이를 포함할 수 있음)
            // If ctrl_header.height exists, use it preferentially (may already include shape component height)
            // 계산된 높이는 참고용으로만 사용 (ctrl_header.height가 없거나 너무 작을 때만 사용)
            // Calculated height is only for reference (use only if ctrl_header.height is missing or too small)
            if calculated_height > ctrl_header_height_mm * 1.1 {
                // 계산된 높이가 ctrl_header.height보다 10% 이상 크면 사용 (shape component가 추가된 경우)
                // Use calculated height if it's more than 10% larger than ctrl_header.height (shape component added case)
                content_height = calculated_height;
            } else {
                // 그렇지 않으면 ctrl_header.height 사용
                // Otherwise use ctrl_header.height
                content_height = ctrl_header_height_mm;
            }
        } else {
            let mut max_row_heights: HashMap<usize, f64> = HashMap::new();
            for cell in &table.cells {
                if cell.cell_attributes.row_span == 1 {
                    let row_idx = cell.cell_attributes.row_address as usize;
                    let cell_height = cell.cell_attributes.height.to_mm();
                    let entry = max_row_heights.entry(row_idx).or_insert(0.0f64);
                    *entry = (*entry).max(cell_height);
                }
            }
            for row_idx in 0..table.attributes.row_count as usize {
                if let Some(&height) = max_row_heights.get(&row_idx) {
                    content_height += height;
                } else if let Some(&row_size) = table.attributes.row_sizes.get(row_idx) {
                    let row_height = (row_size as f64 / 7200.0) * 25.4;
                    content_height += row_height;
                }
            }
        }
    }

    for cell in &table.cells {
        if cell.cell_attributes.row_address == 0 {
            content_width += cell.cell_attributes.width.to_mm();
        }
    }

    Size {
        width: round_to_2dp(content_width),
        height: round_to_2dp(content_height),
    }
}

/// htb 컨테이너와 콘텐츠 크기 결합 / Combine container and content size
pub(crate) fn resolve_container_size(container: Size, content: Size) -> Size {
    if container.width == 0.0 || container.height == 0.0 {
        Size {
            width: content.width,
            height: content.height,
        }
    } else {
        container
    }
}
