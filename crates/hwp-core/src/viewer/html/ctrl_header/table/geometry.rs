use crate::document::bodytext::{Table, TableCell};
use crate::types::Hwpunit16ToMm;

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
pub(crate) fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    // column_positions와 동일한 방식으로 계산 / Calculate using same method as column_positions
    // 첫 번째 행의 셀들을 정렬하여 누적 / Sort first row cells and accumulate
    let mut first_row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|c| c.cell_attributes.row_address == 0)
        .collect();
    first_row_cells.sort_by_key(|c| c.cell_attributes.col_address);

    let mut left = 0.0;
    let target_col = cell.cell_attributes.col_address;
    
    // target_col 이전의 모든 열 너비를 누적 / Accumulate width of all columns before target_col
    for first_row_cell in &first_row_cells {
        if first_row_cell.cell_attributes.col_address < target_col {
            left += first_row_cell.cell_attributes.width.to_mm();
        } else {
            break;
        }
    }
    
    left
}

/// 셀의 위쪽 위치 계산 / Calculate cell top position
pub(crate) fn calculate_cell_top(
    table: &Table,
    cell: &TableCell,
    ctrl_header_height_mm: Option<f64>,
) -> f64 {
    let mut top = 0.0;
    for row_idx in 0..(cell.cell_attributes.row_address as usize) {
        top += get_row_height(table, row_idx, ctrl_header_height_mm);
    }
    top
}

/// 행 높이 가져오기 / Get row height
pub(crate) fn get_row_height(
    table: &Table,
    row_index: usize,
    ctrl_header_height_mm: Option<f64>,
) -> f64 {
    if !table.attributes.row_sizes.is_empty() && row_index < table.attributes.row_sizes.len() {
        if let Some(&row_size) = table.attributes.row_sizes.get(row_index) {
            // row_size가 0이거나 매우 작은 값(< 100)일 때는 fallback 로직 사용
            // When row_size is 0 or very small (< 100), use fallback logic
            if row_size < 100 {
                // CtrlHeader height가 있으면 행 개수로 나눈 값을 사용
                // If CtrlHeader height exists, use it divided by row count
                if let Some(ctrl_height) = ctrl_header_height_mm {
                    if table.attributes.row_count > 0 {
                        let row_height = ctrl_height / table.attributes.row_count as f64;
                        return row_height;
                    }
                }
                // CtrlHeader height가 없으면 해당 행의 셀 height 속성 사용 (fallback)
                // If CtrlHeader height doesn't exist, use cell's height attribute for this row (fallback)
                let mut max_height: f64 = 0.0;
                if !table.cells.is_empty() {
                    for cell in &table.cells {
                        if cell.cell_attributes.row_address as usize == row_index
                            && cell.cell_attributes.row_span == 1
                        {
                            let cell_height = cell.cell_attributes.height.to_mm();
                            max_height = max_height.max(cell_height);
                        }
                    }
                }
                if max_height > 0.0 {
                    return max_height;
                }
                // 셀 height도 없으면 0 반환
                // If no cell height, return 0
                return 0.0;
            }
            // row_size가 유효한 값이면 직접 사용
            // If row_size is valid, use it directly
            let row_height = (row_size as f64 / 7200.0) * 25.4;
            return row_height;
        }
    }
    // row_sizes가 없거나 인덱스가 범위를 벗어나면 셀 height 속성 사용 (fallback)
    // If row_sizes is empty or index out of range, use cell height attribute (fallback)
    let mut max_height: f64 = 0.0;
    if !table.cells.is_empty() {
        for cell in &table.cells {
            if cell.cell_attributes.row_address as usize == row_index
                && cell.cell_attributes.row_span == 1
            {
                let cell_height = cell.cell_attributes.height.to_mm();
                max_height = max_height.max(cell_height);
            }
        }
    }
    if max_height > 0.0 {
        return max_height;
    }
    0.0
}

/// 셀의 실제 높이 가져오기 (rowspan 고려) / Get cell height considering rowspan
pub(crate) fn get_cell_height(
    table: &Table,
    cell: &TableCell,
    ctrl_header_height_mm: Option<f64>,
) -> f64 {
    let row_address = cell.cell_attributes.row_address as usize;
    let row_span = if cell.cell_attributes.row_span == 0 {
        1
    } else {
        cell.cell_attributes.row_span as usize
    };

    // 셀의 height 속성은 실제 셀 높이가 아니라 내부 여백이나 다른 의미일 수 있음
    // 실제 셀 높이는 행 높이를 사용해야 함
    // Cell's height attribute may not be the actual cell height but internal margin or other meaning
    // Actual cell height should use row height
    let mut height = 0.0;
    for i in 0..row_span {
        let row_h = get_row_height(table, row_address + i, ctrl_header_height_mm);
        height += row_h;
    }

    // 행 높이가 0이면 셀 속성의 높이를 사용 (fallback)
    // Use cell attribute height if row height is 0 (fallback)
    if height < 0.1 {
        let cell_height_attr = cell.cell_attributes.height.to_mm();
        if cell_height_attr > 0.1 {
            height = cell_height_attr;
        }
    }

    height
}

/// 열 경계선 위치 계산 / Calculate column boundary positions
pub(crate) fn column_positions(table: &Table) -> Vec<f64> {
    let mut positions = vec![0.0];
    let mut current_x = 0.0;

    let mut first_row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|cell| cell.cell_attributes.row_address == 0)
        .collect();
    first_row_cells.sort_by_key(|cell| cell.cell_attributes.col_address);

    for cell in &first_row_cells {
        current_x += cell.cell_attributes.width.to_mm();
        positions.push(current_x);
    }

    positions
}

/// 행 경계선 위치 계산 / Calculate row boundary positions
pub(crate) fn row_positions(table: &Table, _content_height: f64) -> Vec<f64> {
    let mut positions = vec![0.0];
    let mut current_y = 0.0;

    if table.attributes.row_count > 0 && !table.attributes.row_sizes.is_empty() {
        let mut max_row_heights: std::collections::HashMap<usize, f64> =
            std::collections::HashMap::new();
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
                current_y += height;
            } else if let Some(&row_size) = table.attributes.row_sizes.get(row_idx) {
                current_y += (row_size as f64 / 7200.0) * 25.4;
            }
            positions.push(current_y);
        }
    }

    positions
}
