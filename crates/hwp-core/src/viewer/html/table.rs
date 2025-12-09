/// 테이블 렌더링 모듈 / Table rendering module
use crate::document::bodytext::{Table, TableCell};
use crate::types::INT32;
use crate::viewer::html::styles::int32_to_mm;

/// 테이블을 HTML로 렌더링 / Render table to HTML
pub fn render_table(
    table: &Table,
    document: &crate::document::HwpDocument,
    left: INT32,
    top: INT32,
    _options: &crate::viewer::html::HtmlOptions,
) -> String {
    let left_mm = int32_to_mm(left);
    let top_mm = int32_to_mm(top);

    // 테이블 크기 계산 / Calculate table size
    let mut total_width = 0.0;
    let mut total_height = 0.0;

    // 행 높이 계산: row_sizes가 작은 경우 셀의 height를 사용 / Calculate row heights: use cell height if row_sizes is too small
    // row_sizes는 HWPUNIT 단위이지만, 실제 행 높이는 셀의 height를 기준으로 계산해야 함
    // row_sizes is in HWPUNIT but actual row height should be calculated based on cell height
    if table.attributes.row_sizes.iter().any(|&rs| rs < 100) {
        // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
        // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
        // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
        let mut max_row_heights: std::collections::HashMap<usize, f64> =
            std::collections::HashMap::new();
        for cell in &table.cells {
            // rowspan=1인 셀만 사용하여 각 행의 높이 계산 / Only use cells with rowspan=1 to calculate each row height
            if cell.cell_attributes.row_span == 1 {
                let row_idx = cell.cell_attributes.row_address as usize;
                let cell_height = cell.cell_attributes.height.to_mm();
                let entry = max_row_heights.entry(row_idx).or_insert(0.0f64);
                *entry = (*entry).max(cell_height);
            }
        }
        for row_idx in 0..table.attributes.row_sizes.len() {
            if let Some(&height) = max_row_heights.get(&row_idx) {
                total_height += height;
            } else {
                // row_sizes를 사용 (fallback) / Use row_sizes as fallback
                total_height += (table.attributes.row_sizes[row_idx] as f64 / 7200.0) * 25.4;
            }
        }
    } else {
        // row_sizes가 정상적인 경우 사용 / Use row_sizes if normal
        for row_size in &table.attributes.row_sizes {
            total_height += (*row_size as f64 / 7200.0) * 25.4;
        }
    }

    // 열 너비 계산 (첫 번째 행의 셀 너비 합계) / Calculate column width (sum of cell widths in first row)
    let first_row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|cell| cell.cell_attributes.row_address == 0)
        .collect();
    for cell in &first_row_cells {
        total_width += cell.cell_attributes.width.to_mm();
    }

    // SVG viewBox 계산 / Calculate SVG viewBox
    let svg_padding = 2.5; // mm
    let view_box_left = -svg_padding;
    let view_box_top = -svg_padding;
    let view_box_width = total_width + (svg_padding * 2.0);
    let view_box_height = total_height + (svg_padding * 2.0);

    // SVG 테두리 경로 생성 / Generate SVG border paths
    let mut svg_paths = String::new();
    let mut pattern_defs = String::new();
    let mut pattern_counter = 0;

    // 배경색 처리 (BorderFill에서) / Handle background color (from BorderFill)
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_top = calculate_cell_top(table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_cell_height(table, cell);

        if cell.cell_attributes.border_fill_id > 0 {
            let border_fill_id = cell.cell_attributes.border_fill_id as usize;
            if border_fill_id <= document.doc_info.border_fill.len() {
                let border_fill = &document.doc_info.border_fill[border_fill_id - 1];
                if let crate::document::FillInfo::Solid(solid) = &border_fill.fill {
                    if solid.background_color.0 != 0 {
                        let pattern_id = format!("w_{:02}", pattern_counter);
                        pattern_counter += 1;
                        let color = &solid.background_color;
                        pattern_defs.push_str(&format!(
                            r#"<pattern id="{}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgb({},{},{})" /></pattern>"#,
                            pattern_id, color.r(), color.g(), color.b()
                        ));
                        svg_paths.push_str(&format!(
                            r#"<path fill="url(#{})" d="M{},{}L{},{}L{},{}L{},{}L{},{}Z "></path>"#,
                            pattern_id,
                            cell_left,
                            cell_top,
                            cell_left + cell_width,
                            cell_top,
                            cell_left + cell_width,
                            cell_top + cell_height,
                            cell_left,
                            cell_top + cell_height,
                            cell_left,
                            cell_top
                        ));
                    }
                }
            }
        }
    }

    // 테두리 선 그리기 (table.html 방식) / Draw border lines (table.html style)
    // table.html을 참고하여 열과 행의 경계선을 그립니다 / Draw column and row boundaries based on table.html
    let border_color = "#000000";
    let border_width = 0.12; // mm
    let border_offset = 0.06; // mm (수평선 확장용) / mm (for horizontal line extension)

    // 모든 열의 경계선 위치 수집 / Collect all column boundary positions
    let mut column_positions = Vec::new();
    column_positions.push(0.0); // 왼쪽 테두리 / Left border

    // 첫 번째 행의 셀들을 기준으로 열 위치 계산 / Calculate column positions based on first row cells
    let mut current_x = 0.0;
    let mut first_row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|cell| cell.cell_attributes.row_address == 0)
        .collect();
    first_row_cells.sort_by_key(|cell| cell.cell_attributes.col_address);

    for cell in &first_row_cells {
        current_x += cell.cell_attributes.width.to_mm();
        column_positions.push(current_x);
    }

    // 각 열 경계선 그리기 (수직선) / Draw each column boundary (vertical lines)
    for &col_x in &column_positions {
        // 이 열 경계선을 가리는 셀들을 찾아서 선분을 나눔 / Find cells covering this column boundary and split line segments
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();
            let cell_top = calculate_cell_top(table, cell);
            let cell_height = get_cell_height(table, cell);

            // 셀이 이 열 경계선을 가리는 경우 / If cell covers this column boundary
            if cell_left < col_x && (cell_left + cell_width) > col_x {
                covered_ranges.push((cell_top, cell_top + cell_height));
            }
        }

        // 가려진 범위를 정렬 / Sort covered ranges
        covered_ranges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        // 가려지지 않은 선분들 계산 / Calculate uncovered line segments
        let mut segments = Vec::new();
        let mut current_y = 0.0;

        for (cover_start, cover_end) in &covered_ranges {
            if current_y < *cover_start {
                // 가려지지 않은 선분 추가 / Add uncovered segment
                segments.push((current_y, *cover_start));
            }
            current_y = current_y.max(*cover_end);
        }

        // 마지막 가려지지 않은 부분 / Last uncovered part
        if current_y < total_height {
            segments.push((current_y, total_height));
        }

        // 선분 그리기 (가려지지 않은 부분만) / Draw segments (only uncovered parts)
        if segments.is_empty() {
            // 모든 부분이 가려진 경우 선을 그리지 않음 / Don't draw line if all parts are covered
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == total_height {
            // 전체 높이로 그리기 / Draw full height
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                col_x, 0.0, col_x, total_height,
                border_color, border_width
            ));
        } else {
            // 여러 선분 그리기 / Draw multiple segments
            for (y_start, y_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    col_x, y_start, col_x, y_end,
                    border_color, border_width
                ));
            }
        }
    }

    // 모든 행의 경계선 위치 수집 / Collect all row boundary positions
    let mut row_positions = Vec::new();
    row_positions.push(0.0); // 위쪽 테두리 / Top border

    // 행 경계선 위치 계산: row_sizes가 작은 경우 셀의 height를 사용 / Calculate row boundary positions: use cell height if row_sizes is too small
    let mut current_y = 0.0;
    if table.attributes.row_sizes.iter().any(|&rs| rs < 100) {
        // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
        // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
        // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
        let mut max_row_heights: std::collections::HashMap<usize, f64> =
            std::collections::HashMap::new();
        for cell in &table.cells {
            // rowspan=1인 셀만 사용하여 각 행의 높이 계산 / Only use cells with rowspan=1 to calculate each row height
            if cell.cell_attributes.row_span == 1 {
                let row_idx = cell.cell_attributes.row_address as usize;
                let cell_height = cell.cell_attributes.height.to_mm();
                let entry = max_row_heights.entry(row_idx).or_insert(0.0f64);
                *entry = (*entry).max(cell_height);
            }
        }
        for row_idx in 0..table.attributes.row_sizes.len() {
            if let Some(&height) = max_row_heights.get(&row_idx) {
                current_y += height;
            } else {
                // row_sizes를 사용 (fallback) / Use row_sizes as fallback
                current_y += (table.attributes.row_sizes[row_idx] as f64 / 7200.0) * 25.4;
            }
            row_positions.push(current_y);
        }
    } else {
        // row_sizes가 정상적인 경우 사용 / Use row_sizes if normal
        for row_size in &table.attributes.row_sizes {
            current_y += (*row_size as f64 / 7200.0) * 25.4;
            row_positions.push(current_y);
        }
    }

    // 각 행 경계선 그리기 (수평선) / Draw each row boundary (horizontal lines)
    for &row_y in &row_positions {
        // 이 행 경계선을 가리는 셀들을 찾아서 선분을 나눔 / Find cells covering this row boundary and split line segments
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let cell_top = calculate_cell_top(table, cell);
            let cell_height = get_cell_height(table, cell);
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();

            // 셀이 이 행 경계선을 가리는 경우 / If cell covers this row boundary
            if cell_top < row_y && (cell_top + cell_height) > row_y {
                covered_ranges.push((cell_left, cell_left + cell_width));
            }
        }

        // 가려진 범위를 정렬 / Sort covered ranges
        covered_ranges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        // 가려지지 않은 선분들 계산 / Calculate uncovered line segments
        let mut segments = Vec::new();
        let mut current_x = 0.0;

        for (cover_start, cover_end) in &covered_ranges {
            if current_x < *cover_start {
                // 가려지지 않은 선분 추가 / Add uncovered segment
                segments.push((current_x, *cover_start));
            }
            current_x = current_x.max(*cover_end);
        }

        // 마지막 가려지지 않은 부분 / Last uncovered part
        if current_x < total_width {
            segments.push((current_x, total_width));
        }

        // 선분 그리기 (가려지지 않은 부분만) / Draw segments (only uncovered parts)
        if segments.is_empty() {
            // 모든 부분이 가려진 경우 선을 그리지 않음 / Don't draw line if all parts are covered
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == total_width {
            // 전체 너비로 그리기 / Draw full width
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                -border_offset, row_y, total_width + border_offset, row_y,
                border_color, border_width
            ));
        } else {
            // 여러 선분 그리기 / Draw multiple segments
            for (x_start, x_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    x_start - border_offset, row_y, x_end + border_offset, row_y,
                    border_color, border_width
                ));
            }
        }
    }

    // SVG 생성 / Generate SVG
    let svg = format!(
        r#"<svg class="hs" viewBox="{} {} {} {}" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><defs>{}</defs>{}</svg>"#,
        view_box_left,
        view_box_top,
        view_box_width,
        view_box_height,
        -svg_padding,
        -svg_padding,
        view_box_width,
        view_box_height,
        pattern_defs,
        svg_paths
    );

    // 셀 렌더링 / Render cells
    let mut cells_html = String::new();
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_top = calculate_cell_top(table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_cell_height(table, cell);

        // 셀 내용 렌더링 / Render cell content
        let cell_content = String::new();
        // TODO: 문단 렌더링 (재귀적으로 처리 필요)
        // for paragraph in &cell.paragraphs {
        //     cell_content.push_str(&render_paragraph(paragraph, document, options));
        // }

        // HWPUNIT16을 mm로 변환 (1/7200인치 단위) / Convert HWPUNIT16 to mm (1/7200 inch unit)
        let left_margin_mm = (cell.cell_attributes.left_margin as f64 / 7200.0) * 25.4;
        let top_margin_mm = (cell.cell_attributes.top_margin as f64 / 7200.0) * 25.4;

        cells_html.push_str(&format!(
            r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI">{}</div></div></div>"#,
            cell_left,
            cell_top,
            cell_width,
            cell_height,
            left_margin_mm,
            top_margin_mm,
            cell_content
        ));
    }

    // 테이블 컨테이너 생성 / Create table container
    // htb 클래스는 CSS에서 position:absolute로 정의되어 있으므로 인라인 스타일에 position을 지정하지 않음
    // htb class is defined as position:absolute in CSS, so don't specify position in inline style
    format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
        left_mm, total_width, top_mm, total_height, svg, cells_html
    )
}

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    let mut left = 0.0;
    for i in 0..(cell.cell_attributes.col_address as usize) {
        // 이 열의 너비 찾기 / Find width of this column
        if let Some(first_row_cell) = table.cells.iter().find(|c| {
            c.cell_attributes.row_address == 0 && c.cell_attributes.col_address == i as u16
        }) {
            left += first_row_cell.cell_attributes.width.to_mm();
        }
    }
    left
}

/// 셀의 위쪽 위치 계산 / Calculate cell top position
fn calculate_cell_top(table: &Table, cell: &TableCell) -> f64 {
    let mut top = 0.0;
    for i in 0..(cell.cell_attributes.row_address as usize) {
        top += get_row_height(table, i);
    }
    top
}

/// 행 높이 가져오기 / Get row height
fn get_row_height(table: &Table, row_index: usize) -> f64 {
    if row_index < table.attributes.row_sizes.len() {
        let row_size = table.attributes.row_sizes[row_index];
        // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
        if row_size < 100 {
            // 해당 행의 셀들 중 최대 height 찾기 (rowspan=1인 셀만) / Find max height among cells in this row (only cells with rowspan=1)
            // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
            // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
            let mut max_height: f64 = 0.0;
            for cell in &table.cells {
                if cell.cell_attributes.row_address as usize == row_index
                    && cell.cell_attributes.row_span == 1
                {
                    let cell_height = cell.cell_attributes.height.to_mm();
                    max_height = max_height.max(cell_height);
                }
            }
            if max_height > 0.0 {
                max_height
            } else {
                (row_size as f64 / 7200.0) * 25.4
            }
        } else {
            (row_size as f64 / 7200.0) * 25.4
        }
    } else {
        0.0
    }
}

/// 셀의 실제 높이 가져오기 (rowspan 고려) / Get cell actual height (considering rowspan)
fn get_cell_height(table: &Table, cell: &TableCell) -> f64 {
    let row_address = cell.cell_attributes.row_address as usize;
    let row_span = if cell.cell_attributes.row_span == 0 {
        1 // row_span이 0이면 기본값 1 / Default to 1 if row_span is 0
    } else {
        cell.cell_attributes.row_span as usize
    };

    // row_span이 1이고 row_sizes가 작으면 셀의 height를 직접 사용 / Use cell height directly if row_span is 1 and row_sizes is small
    if row_span == 1 {
        let cell_height = cell.cell_attributes.height.to_mm();
        if cell_height > 0.1 {
            // 셀의 height가 유효하면 사용 / Use cell height if valid
            return cell_height;
        }
    }

    // row_span이 1보다 크거나 셀의 height가 유효하지 않으면 행 높이를 합산 / Sum row heights if row_span > 1 or cell height is invalid
    let mut height = 0.0;
    for i in 0..row_span {
        if row_address + i < table.attributes.row_sizes.len() {
            height += get_row_height(table, row_address + i);
        }
    }

    // 여전히 높이가 0이면 셀의 height 사용 (fallback) / Use cell height as fallback if still 0
    if height < 0.1 {
        let cell_height = cell.cell_attributes.height.to_mm();
        if cell_height > 0.1 {
            height = cell_height;
        }
    }

    height
}
