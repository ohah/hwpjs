use std::collections::HashMap;

use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::{ParagraphRecord, Table};
use crate::types::Hwpunit16ToMm;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};

/// 셀 마진을 mm 단위로 변환 / Convert cell margin to mm
pub(crate) fn cell_margin_to_mm(margin_hwpunit: i16) -> f64 {
    round_to_2dp(int32_to_mm(margin_hwpunit as i32))
}

/// 모든 ShapeComponent 중 최대 높이 찾기 / Find maximum height among all ShapeComponents
pub(crate) fn find_max_shape_height(
    children: &[ParagraphRecord],
    shape_height: u32,
) -> Option<f64> {
    let mut max_height_mm: Option<f64> = None;

    for child in children {
        match child {
            ParagraphRecord::ShapeComponentPicture { .. } => {
                let height_hwpunit = shape_height as i32;
                let height_mm = round_to_2dp(int32_to_mm(height_hwpunit));
                max_height_mm = Some(max_height_mm.unwrap_or(0.0).max(height_mm));
            }

            ParagraphRecord::ShapeComponent {
                shape_component,
                children: nested_children,
            } => {
                if let Some(height) = find_max_shape_height(nested_children, shape_component.height)
                {
                    max_height_mm = Some(max_height_mm.unwrap_or(0.0).max(height));
                }
            }

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
                let height_mm = round_to_2dp(int32_to_mm(shape_height as i32));
                max_height_mm = Some(max_height_mm.unwrap_or(0.0).max(height_mm));
            }

            ParagraphRecord::ParaLineSeg { segments } => {
                let total_height_hwpunit: i32 = segments.iter().map(|seg| seg.line_height).sum();
                let height_mm = round_to_2dp(int32_to_mm(total_height_hwpunit));
                max_height_mm = Some(max_height_mm.unwrap_or(0.0).max(height_mm));
            }

            _ => {}
        }
    }

    max_height_mm
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

/// row_sizes 합을 mm로 변환 (HWPUNIT16: 1/7200 inch) / Convert row_sizes sum to mm (HWPUNIT16: 1/7200 inch)
fn row_sizes_sum_mm(row_sizes: &[crate::types::HWPUNIT16]) -> f64 {
    row_sizes.iter().map(|s| (*s as f64 / 7200.0) * 25.4).sum()
}

/// 셀 기반 콘텐츠 크기 계산 / Calculate content size from cells
/// content_height: row_sizes 합 또는 셀 높이 합 우선, ctrl_header.height는 보조/폴백만 사용
pub(crate) fn content_size(table: &Table, ctrl_header: Option<&CtrlHeaderData>) -> Size {
    let mut content_width = 0.0;
    let mut content_height = 0.0;

    if table.attributes.row_count > 0 {
        // 1) row_sizes가 있으면 합을 content_height로 사용 (fixture: 25mm+25mm 등)
        // When row_sizes exists, use its sum as content_height (e.g. fixture 25mm+25mm)
        if !table.attributes.row_sizes.is_empty()
            && table.attributes.row_sizes.len() >= table.attributes.row_count as usize
        {
            let from_row_sizes = row_sizes_sum_mm(
                &table.attributes.row_sizes[..table.attributes.row_count as usize],
            );
            content_height = round_to_2dp(from_row_sizes);
        }

        // row_sizes 합이 극소(예: [2,2] HWPUNIT → ~0.01mm)인 경우 셀/ctrl_header 기반으로 재계산
        // When row_sizes sum is negligible (e.g. [2,2] HWPUNIT → ~0.01mm), recompute from cells or ctrl_header
        if content_height < 0.1 {
            if let Some(CtrlHeaderData::ObjectCommon { height, .. }) = ctrl_header {
                let ctrl_header_height_mm = height.to_mm();
                let base_row_height_mm = ctrl_header_height_mm / table.attributes.row_count as f64;

                let mut max_row_heights_with_shapes: HashMap<usize, f64> = HashMap::new();
                for cell in &table.cells {
                    if cell.cell_attributes.row_span == 1 {
                        let row_idx = cell.cell_attributes.row_address as usize;
                        let mut cell_height = cell.cell_attributes.height.to_mm();
                        let mut max_shape_height_mm: Option<f64> = None;

                        for para in &cell.paragraphs {
                            for record in &para.records {
                                if let ParagraphRecord::ShapeComponent {
                                    shape_component,
                                    children,
                                } = record
                                {
                                    if let Some(new_max_height) =
                                        find_max_shape_height(children, shape_component.height)
                                    {
                                        max_shape_height_mm = Some(
                                            max_shape_height_mm.unwrap_or(0.0).max(new_max_height),
                                        );
                                    }
                                    break;
                                }
                                if let ParagraphRecord::ParaLineSeg { segments } = record {
                                    let total_height_hwpunit: i32 =
                                        segments.iter().map(|seg| seg.line_height).sum();
                                    let height_mm = round_to_2dp(int32_to_mm(total_height_hwpunit));
                                    max_shape_height_mm =
                                        Some(max_shape_height_mm.unwrap_or(0.0).max(height_mm));
                                }
                            }
                        }

                        if let Some(shape_height_mm) = max_shape_height_mm {
                            let top_margin_mm = cell_margin_to_mm(cell.cell_attributes.top_margin);
                            let bottom_margin_mm =
                                cell_margin_to_mm(cell.cell_attributes.bottom_margin);
                            let shape_height_with_margin =
                                shape_height_mm + top_margin_mm + bottom_margin_mm;
                            if shape_height_with_margin > cell_height {
                                cell_height = shape_height_with_margin;
                            }
                        }
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

                // 행별 높이 합산 (총 content_height) / Sum row heights for total content_height
                let calculated_sum: f64 = (0..table.attributes.row_count as usize)
                    .map(|row_idx| {
                        max_row_heights_with_shapes
                            .get(&row_idx)
                            .copied()
                            .unwrap_or(0.0)
                    })
                    .sum();
                content_height = if calculated_sum > 0.0 {
                    round_to_2dp(calculated_sum)
                } else {
                    ctrl_header_height_mm
                };
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
                        content_height += (row_size as f64 / 7200.0) * 25.4;
                    }
                }
                content_height = round_to_2dp(content_height);
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
