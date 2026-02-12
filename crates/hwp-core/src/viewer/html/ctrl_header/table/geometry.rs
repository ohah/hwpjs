use crate::document::bodytext::{ParagraphRecord, Table, TableCell};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::HwpDocument;

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
pub(crate) fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    // 해당 행의 셀들을 사용하여 정확한 열 위치 계산 / Use cells from the same row to calculate accurate column positions
    // 이렇게 하면 각 행의 실제 열 구조를 반영할 수 있음 / This way we can reflect the actual column structure of each row
    let row_address = cell.cell_attributes.row_address;
    let target_col = cell.cell_attributes.col_address;

    // 같은 행의 셀들을 찾아서 정렬 / Find and sort cells from the same row
    let mut row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|c| c.cell_attributes.row_address == row_address)
        .collect();
    row_cells.sort_by_key(|c| c.cell_attributes.col_address);

    let mut left = 0.0;
    // target_col 이전의 모든 열 너비를 누적 / Accumulate width of all columns before target_col
    for row_cell in &row_cells {
        if row_cell.cell_attributes.col_address < target_col {
            left += row_cell.cell_attributes.width.to_mm();
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
    // 먼저 해당 행의 셀 height 속성을 확인 (가장 정확한 방법) / First check cell height attributes for this row (most accurate method)
    let mut max_cell_height: f64 = 0.0;
    if !table.cells.is_empty() {
        for cell in &table.cells {
            if cell.cell_attributes.row_address as usize == row_index
                && cell.cell_attributes.row_span == 1
            {
                let cell_height = cell.cell_attributes.height.to_mm();
                max_cell_height = max_cell_height.max(cell_height);
            }
        }
    }

    // row_sizes가 있으면 사용 (셀 height보다 우선순위 낮음) / Use row_sizes if available (lower priority than cell height)
    if !table.attributes.row_sizes.is_empty() && row_index < table.attributes.row_sizes.len() {
        if let Some(&row_size) = table.attributes.row_sizes.get(row_index) {
            // row_size가 0이거나 매우 작은 값(< 100)일 때는 셀 height 사용
            // When row_size is 0 or very small (< 100), use cell height
            if row_size >= 100 {
                let row_height = (row_size as f64 / 7200.0) * 25.4;
                // row_size와 셀 height 중 더 큰 값 사용 / Use larger of row_size and cell height
                return max_cell_height.max(row_height);
            }
        }
    }

    // 셀 height가 있으면 사용 / Use cell height if available
    if max_cell_height > 0.0 {
        return max_cell_height;
    }

    // 셀 height도 없으면 CtrlHeader height를 행 개수로 나눈 값 사용 (fallback)
    // If no cell height, use CtrlHeader height divided by row count (fallback)
    if let Some(ctrl_height) = ctrl_header_height_mm {
        if table.attributes.row_count > 0 {
            return ctrl_height / table.attributes.row_count as f64;
        }
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
    // 모든 행의 셀들을 고려하여 모든 열 경계선 위치 계산 / Calculate all column boundary positions considering cells from all rows
    // 각 셀의 왼쪽과 오른쪽 경계를 수집하여 고유한 위치만 추출 / Collect left and right boundaries of each cell and extract unique positions
    // f64는 Hash와 Ord를 구현하지 않으므로 Vec을 사용하고 수동으로 중복 제거 / Use Vec and manually remove duplicates since f64 doesn't implement Hash or Ord
    let mut boundary_positions = Vec::new();
    boundary_positions.push(0.0); // 항상 0부터 시작 / Always start from 0

    // 모든 셀의 왼쪽과 오른쪽 경계를 수집 / Collect left and right boundaries of all cells
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_right = cell_left + cell_width;

        boundary_positions.push(cell_left);
        boundary_positions.push(cell_right);
    }

    // 정렬 / Sort
    boundary_positions.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // 중복 제거 (부동소수점 비교는 작은 오차를 허용) / Remove duplicates (floating point comparison allows small errors)
    let mut unique_positions = Vec::new();
    let epsilon = 0.01; // 0.01mm 이내는 같은 위치로 간주 / Positions within 0.01mm are considered the same

    for &pos in &boundary_positions {
        if unique_positions.is_empty() {
            unique_positions.push(pos);
        } else {
            let last_pos = unique_positions.last().unwrap();
            if (pos - *last_pos).abs() > epsilon {
                unique_positions.push(pos);
            }
        }
    }

    unique_positions
}

/// 셀 마진을 mm 단위로 변환 / Convert cell margin to mm
fn cell_margin_to_mm(margin_hwpunit: i16) -> f64 {
    round_to_2dp(int32_to_mm(margin_hwpunit as i32))
}

/// 행 경계선 위치 계산 (shape component 높이 고려) / Calculate row boundary positions (considering shape component height)
pub(crate) fn row_positions(
    table: &Table,
    _content_height: f64,
    _document: &HwpDocument,
    ctrl_header_height_mm: Option<f64>,
) -> Vec<f64> {
    let mut positions = vec![0.0];
    let mut current_y = 0.0;

    if table.attributes.row_count > 0 {
        // object_common.height를 행 개수로 나눈 기본 행 높이 계산 / Calculate base row height from object_common.height divided by row count
        let base_row_height_mm = if let Some(ctrl_height) = ctrl_header_height_mm {
            if table.attributes.row_count > 0 {
                ctrl_height / table.attributes.row_count as f64
            } else {
                0.0
            }
        } else {
            0.0
        };

        let mut max_row_heights_with_shapes: std::collections::HashMap<usize, f64> =
            std::collections::HashMap::new();

        // 재귀적으로 모든 ShapeComponent의 높이를 찾는 헬퍼 함수 / Helper function to recursively find height of all ShapeComponents
        fn find_shape_component_height(
            children: &[ParagraphRecord],
            shape_component_height: u32,
        ) -> Option<f64> {
            let mut max_height_mm: Option<f64> = None;
            let mut has_paraline_seg = false;
            let mut paraline_seg_height_mm: Option<f64> = None;
            let _ = shape_component_height;

            // 먼저 children을 순회하여 ParaLineSeg와 다른 shape component들을 찾기 / First iterate through children to find ParaLineSeg and other shape components
            for child in children {
                match child {
                    // ShapeComponentPicture: shape_component.height 사용
                    ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } => {
                        let _ = shape_component_picture;
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

        for cell in &table.cells {
            if cell.cell_attributes.row_span == 1 {
                let row_idx = cell.cell_attributes.row_address as usize;
                // 먼저 실제 셀 높이를 가져옴 (cell.cell_attributes.height 우선) / First get actual cell height (cell.cell_attributes.height has priority)
                let mut cell_height = cell.cell_attributes.height.to_mm();

                // shape component가 있는 셀의 경우 shape 높이 + 마진을 고려 / For cells with shape components, consider shape height + margin
                let mut max_shape_height_mm: Option<f64> = None;

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
                    let bottom_margin_mm = cell_margin_to_mm(cell.cell_attributes.bottom_margin);
                    let shape_height_with_margin =
                        shape_height_mm + top_margin_mm + bottom_margin_mm;
                    // shape 높이 + 마진이 기존 셀 높이보다 크면 사용 / Use shape height + margin if larger than existing cell height
                    if shape_height_with_margin > cell_height {
                        cell_height = shape_height_with_margin;
                    }
                }

                // shape component가 없고 셀 높이가 매우 작으면 object_common.height를 베이스로 사용 (fallback)
                // If no shape component and cell height is very small, use object_common.height as base (fallback)
                if max_shape_height_mm.is_none() && cell_height < 0.1 && base_row_height_mm > 0.0 {
                    cell_height = base_row_height_mm;
                }

                let entry = max_row_heights_with_shapes.entry(row_idx).or_insert(0.0f64);
                *entry = (*entry).max(cell_height);
            }
        }

        for row_idx in 0..table.attributes.row_count as usize {
            if let Some(&height) = max_row_heights_with_shapes.get(&row_idx) {
                current_y += height;
            } else if base_row_height_mm > 0.0 {
                // max_row_heights_with_shapes에 없으면 object_common.height를 행 개수로 나눈 값 사용 / If not in max_row_heights_with_shapes, use object_common.height divided by row count
                current_y += base_row_height_mm;
            } else if let Some(&row_size) = table.attributes.row_sizes.get(row_idx) {
                current_y += (row_size as f64 / 7200.0) * 25.4;
            }
            positions.push(current_y);
        }
    }

    positions
}
