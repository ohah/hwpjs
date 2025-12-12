use std::collections::HashMap;

use crate::document::bodytext::{Margin, Table};
use crate::types::{Hwpunit16ToMm, HWPUNIT};
use crate::viewer::html::styles::round_to_2dp;

/// 크기 데이터 / Size data
#[derive(Clone, Copy)]
pub(crate) struct Size {
    pub width: f64,
    pub height: f64,
}

/// CtrlHeader 기반 htb 컨테이너 크기 계산 / Calculate container size from CtrlHeader
pub(crate) fn htb_size(ctrl_header_size: Option<(HWPUNIT, HWPUNIT, Margin)>) -> Size {
    if let Some((width, height, margin)) = &ctrl_header_size {
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
pub(crate) fn content_size(
    table: &Table,
    ctrl_header_size: Option<(HWPUNIT, HWPUNIT, Margin)>,
) -> Size {
    let mut content_width = 0.0;
    let mut content_height = 0.0;

    if table.attributes.row_count > 0 && !table.attributes.row_sizes.is_empty() {
        if let Some((_, height, _)) = &ctrl_header_size {
            content_height = height.to_mm();
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
