use crate::document::bodytext::{Table, TableCell};
use crate::types::Hwpunit16ToMm;

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
pub(crate) fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    let mut left = 0.0;
    for col_idx in 0..(cell.cell_attributes.col_address as usize) {
        if let Some(first_row_cell) = table.cells.iter().find(|c| {
            c.cell_attributes.row_address == 0 && c.cell_attributes.col_address == col_idx as u16
        }) {
            left += first_row_cell.cell_attributes.width.to_mm();
        }
    }
    left
}

/// 셀의 위쪽 위치 계산 / Calculate cell top position
pub(crate) fn calculate_cell_top(table: &Table, cell: &TableCell) -> f64 {
    let mut top = 0.0;
    for row_idx in 0..(cell.cell_attributes.row_address as usize) {
        top += get_row_height(table, row_idx);
    }
    top
}

/// 행 높이 가져오기 / Get row height
pub(crate) fn get_row_height(table: &Table, row_index: usize) -> f64 {
    if !table.attributes.row_sizes.is_empty() && row_index < table.attributes.row_sizes.len() {
        if let Some(&row_size) = table.attributes.row_sizes.get(row_index) {
            if row_size < 100 {
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
            }
            return (row_size as f64 / 7200.0) * 25.4;
        }
    }
    0.0
}

/// 셀의 실제 높이 가져오기 (rowspan 고려) / Get cell height considering rowspan
pub(crate) fn get_cell_height(table: &Table, cell: &TableCell) -> f64 {
    let row_address = cell.cell_attributes.row_address as usize;
    let row_span = if cell.cell_attributes.row_span == 0 {
        1
    } else {
        cell.cell_attributes.row_span as usize
    };

    if row_span == 1 {
        let cell_height = cell.cell_attributes.height.to_mm();
        if cell_height > 0.1 {
            return cell_height;
        }
    }

    let mut height = 0.0;
    for i in 0..row_span {
        height += get_row_height(table, row_address + i);
    }

    if height < 0.1 {
        let cell_height = cell.cell_attributes.height.to_mm();
        if cell_height > 0.1 {
            height = cell_height;
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
