/// 테이블 렌더링 모듈 / Table rendering module
use crate::document::bodytext::ctrl_header::ObjectAttribute;
use crate::document::bodytext::{Margin, PageDef, Table, TableCell};
use crate::types::{Hwpunit16ToMm, RoundTo2dp, HWPUNIT, SHWPUNIT};
use crate::viewer::html::styles::round_to_2dp;

/// 테이블을 HTML로 렌더링 / Render table to HTML
pub fn render_table(
    table: &Table,
    document: &crate::document::HwpDocument,
    ctrl_header_size: Option<(HWPUNIT, HWPUNIT, Margin)>,
    attr_info: Option<(&ObjectAttribute, SHWPUNIT, SHWPUNIT)>,
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&PageDef>,
    _options: &crate::viewer::html::HtmlOptions,
    table_number: Option<u32>,
    caption_text: Option<&str>,
    segment_position: Option<(crate::types::INT32, crate::types::INT32)>, // LineSegment 위치 (column_start_position, vertical_position) / LineSegment position
) -> String {
    // table.cells가 유효한지 확인 / Check if table.cells is valid
    // 유효하지 않은 경우 빈 테이블 반환 / Return empty table if invalid
    // 마크다운 렌더러처럼 is_empty()만 체크 / Check is_empty() only like markdown renderer
    if table.cells.is_empty() {
        // 빈 테이블 반환 / Return empty table
        return format!(
            r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
        );
    }

    // row_count=0일 때는 row_sizes에 접근하지 않음 / Don't access row_sizes when row_count=0
    if table.attributes.row_count == 0 {
        // row_sizes를 사용하지 않고 셀의 height만 사용 / Use only cell height without row_sizes
        // 빈 테이블 반환 또는 셀 기반 렌더링 / Return empty table or cell-based rendering
        return format!(
            r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
        );
    }

    // 1. htb 컨테이너 크기 계산 (CtrlHeader + margin) / Calculate htb container size (CtrlHeader + margin)
    let (htb_width, htb_height) = if let Some((width, height, margin)) = &ctrl_header_size {
        let w = width.to_mm() + margin.left.to_mm() + margin.right.to_mm();
        let h = height.to_mm() + margin.top.to_mm() + margin.bottom.to_mm();
        (round_to_2dp(w), round_to_2dp(h))
    } else {
        (0.0, 0.0)
    };

    // 2. 실제 셀 크기 합계 계산 (SVG path 좌표용) / Calculate actual cell size sum (for SVG path coordinates)
    let mut content_width = 0.0;
    let mut content_height = 0.0;

    // 행 높이 계산: row_sizes가 작은 경우 셀의 height를 사용 / Calculate row heights: use cell height if row_sizes is too small
    // row_sizes는 HWPUNIT 단위이지만, 실제 행 높이는 셀의 height를 기준으로 계산해야 함
    // row_sizes is in HWPUNIT but actual row height should be calculated based on cell height
    // table-position의 경우 row_sizes가 [2, 2]로 매우 작지만, 실제 높이는 CtrlHeader의 height를 사용해야 함
    // For table-position, row_sizes is [2, 2] which is very small, but actual height should use CtrlHeader's height
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
    // row_sizes가 비어있거나 유효하지 않으면 0으로 처리 / Treat row_sizes as 0 if empty or invalid
    if table.attributes.row_count > 0 && !table.attributes.row_sizes.is_empty() {
        // parse_table_attributes에서 row_sizes는 항상 row_count와 일치하거나 빈 Vec로 초기화됨
        // parse_table_attributes ensures row_sizes always matches row_count or is empty Vec
        // CtrlHeader의 height가 있으면 직접 사용 (row_sizes가 너무 작을 때) / Use CtrlHeader's height directly if available (when row_sizes is too small)
        if let Some((_, height, _)) = &ctrl_header_size {
            content_height = height.to_mm();
        } else {
            // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
            // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
            // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
            let mut max_row_heights: std::collections::HashMap<usize, f64> =
                std::collections::HashMap::new();
            // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
            for cell in &table.cells {
                // rowspan=1인 셀만 사용하여 각 행의 높이 계산 / Only use cells with rowspan=1 to calculate each row height
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
                    // row_sizes를 사용 (fallback) / Use row_sizes as fallback
                    content_height += (row_size as f64 / 7200.0) * 25.4;
                }
            }
        }
    }
    // row_sizes가 비어있으면 content_height는 0.0으로 유지 / If row_sizes is empty, keep content_height as 0.0

    // 열 너비 계산 (첫 번째 행의 셀 너비 합계) / Calculate column width (sum of cell widths in first row)
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
    for cell in &table.cells {
        if cell.cell_attributes.row_address == 0 {
            content_width += cell.cell_attributes.width.to_mm();
        }
    }

    // htb 컨테이너 크기가 없으면 셀 크기 사용 / Use cell size if htb container size is not available
    let (htb_width, htb_height) = if htb_width == 0.0 || htb_height == 0.0 {
        (round_to_2dp(content_width), round_to_2dp(content_height))
    } else {
        (htb_width, htb_height)
    };

    // content_width/content_height를 2자리로 반올림 / Round content_width/content_height to 2 decimal places
    let content_width = round_to_2dp(content_width);
    let content_height = round_to_2dp(content_height);

    // 3. SVG viewBox 계산 (htb 컨테이너 크기 + padding) / Calculate SVG viewBox (htb container size + padding)
    let svg_padding = 2.5; // mm
    let view_box_left = round_to_2dp(-svg_padding);
    let view_box_top = round_to_2dp(-svg_padding);
    let view_box_width = round_to_2dp(htb_width + (svg_padding * 2.0));
    let view_box_height = round_to_2dp(htb_height + (svg_padding * 2.0));

    // SVG 테두리 경로 생성 / Generate SVG border paths
    let mut svg_paths = String::new();
    let mut pattern_defs = String::new();
    let mut pattern_counter = 0;

    // 배경색 처리 (BorderFill에서) / Handle background color (from BorderFill)
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
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
    // table.cells가 유효한지 확인 / Check if table.cells is valid
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
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
        // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
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
        if current_y < content_height {
            segments.push((current_y, content_height));
        }

        // 선분 그리기 (가려지지 않은 부분만) / Draw segments (only uncovered parts)
        if segments.is_empty() {
            // 모든 부분이 가려진 경우 선을 그리지 않음 / Don't draw line if all parts are covered
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == content_height {
            // 전체 높이로 그리기 / Draw full height
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                round_to_2dp(col_x), 0, round_to_2dp(col_x), round_to_2dp(content_height),
                border_color, border_width
            ));
        } else {
            // 여러 선분 그리기 / Draw multiple segments
            for (y_start, y_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    round_to_2dp(col_x), round_to_2dp(y_start), round_to_2dp(col_x), round_to_2dp(y_end),
                    border_color, border_width
                ));
            }
        }
    }

    // 모든 행의 경계선 위치 수집 / Collect all row boundary positions
    let mut row_positions = Vec::new();
    row_positions.push(0.0); // 위쪽 테두리 / Top border
    let mut current_y = 0.0;

    // 행 경계선 위치 계산: row_sizes가 작은 경우 셀의 height를 사용 / Calculate row boundary positions: use cell height if row_sizes is too small
    // row_sizes가 비어있거나 0 이하면 0으로 처리 / Treat row_sizes as 0 if empty or <= 0
    if table.attributes.row_count > 0 {
        if !table.attributes.row_sizes.is_empty() {
            // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
            // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
            // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
            let mut max_row_heights: std::collections::HashMap<usize, f64> =
                std::collections::HashMap::new();
            // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
            for cell in &table.cells {
                // rowspan=1인 셀만 사용하여 각 행의 높이 계산 / Only use cells with rowspan=1 to calculate each row height
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
                    // row_sizes를 사용 (fallback) / Use row_sizes as fallback
                    current_y += (row_size as f64 / 7200.0) * 25.4;
                }
                row_positions.push(current_y);
            }
        }
    }
    // valid_row_sizes_len이 0이면 row_positions는 [0.0]만 유지 / If valid_row_sizes_len is 0, keep row_positions as [0.0]
    // row_sizes가 비어있으면 row_positions는 [0.0]만 유지 / If row_sizes is empty, keep row_positions as [0.0]

    // 각 행 경계선 그리기 (수평선) / Draw each row boundary (horizontal lines)
    for &row_y in &row_positions {
        // 이 행 경계선을 가리는 셀들을 찾아서 선분을 나눔 / Find cells covering this row boundary and split line segments
        let mut covered_ranges = Vec::new();
        // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
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
        if current_x < content_width {
            segments.push((current_x, content_width));
        }

        // 선분 그리기 (가려지지 않은 부분만) / Draw segments (only uncovered parts)
        if segments.is_empty() {
            // 모든 부분이 가려진 경우 선을 그리지 않음 / Don't draw line if all parts are covered
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == content_width {
            // 전체 너비로 그리기 / Draw full width
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                round_to_2dp(-border_offset), round_to_2dp(row_y), round_to_2dp(content_width + border_offset), round_to_2dp(row_y),
                border_color, border_width
            ));
        } else {
            // 여러 선분 그리기 / Draw multiple segments
            for (x_start, x_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    round_to_2dp(x_start - border_offset), round_to_2dp(row_y), round_to_2dp(x_end + border_offset), round_to_2dp(row_y),
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
        view_box_left,
        view_box_top,
        view_box_width,
        view_box_height,
        pattern_defs,
        svg_paths
    );

    // 셀 렌더링 / Render cells
    let mut cells_html = String::new();
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
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
            round_to_2dp(cell_left),
            round_to_2dp(cell_top),
            round_to_2dp(cell_width),
            round_to_2dp(cell_height),
            round_to_2dp(left_margin_mm),
            round_to_2dp(top_margin_mm),
            cell_content
        ));
    }

    // 테이블 위치 계산 / Calculate table position
    // hcd_position과 LineSegment 위치를 사용하여 절대 위치 계산 / Calculate absolute position using hcd_position and LineSegment position
    // 원본: hcD는 left:30mm, top:35mm이고, htb는 left:31mm, top:35.99mm
    // Original: hcD is left:30mm, top:35mm, and htb is left:31mm, top:35.99mm
    // 따라서 htb의 절대 위치 = hcD 위치 + LineSegment 위치
    // Therefore, htb absolute position = hcD position + LineSegment position

    // hcd_position이 없으면 page_def를 사용하여 계산 / Calculate from page_def if hcd_position not available
    let hcd_pos = if let Some((left, top)) = hcd_position {
        (left.round_to_2dp(), top.round_to_2dp())
    } else if let Some(pd) = page_def {
        // page_def의 여백 정보를 사용하여 hcD 위치 계산 / Calculate hcD position using page_def margin information
        let left = (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp();
        let top = (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp();
        (left, top)
    } else {
        // 기본값 / Default
        (20.0, 24.99)
    };

    let (left_mm, top_mm) = if let Some((segment_col, segment_vert)) = segment_position {
        // hcD 위치 + LineSegment 위치 = 테이블 절대 위치 / hcD position + LineSegment position = table absolute position
        use crate::viewer::html::styles::int32_to_mm;
        let segment_left_mm = int32_to_mm(segment_col);
        let segment_top_mm = int32_to_mm(segment_vert);
        (hcd_pos.0 + segment_left_mm, hcd_pos.1 + segment_top_mm)
    } else {
        // segment_position이 없으면 hcD 위치만 사용 / Use only hcD position if segment_position not available
        hcd_pos
    };

    // 테이블 컨테이너 생성 / Create table container
    // htb 클래스는 CSS에서 position:absolute로 정의되어 있으므로 인라인 스타일에 position을 지정하지 않음
    // htb class is defined as position:absolute in CSS, so don't specify position in inline style
    format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
        round_to_2dp(left_mm),
        htb_width,
        round_to_2dp(top_mm),
        htb_height,
        svg,
        cells_html
    )
}

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    let mut left = 0.0;
    for i in 0..(cell.cell_attributes.col_address as usize) {
        // 이 열의 너비 찾기 / Find width of this column
        // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
        let cells = &table.cells;
        if let Some(first_row_cell) = cells.iter().find(|c| {
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
    // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
    // row_sizes가 비어있거나 0 이하면 0으로 처리 / Treat row_sizes as 0 if empty or <= 0
    // row_sizes가 비어있거나 비정상적으로 크면 0으로 처리 / Treat row_sizes as 0 if empty or abnormally large

    if !table.attributes.row_sizes.is_empty() && row_index < table.attributes.row_sizes.len() {
        if let Some(&row_size) = table.attributes.row_sizes.get(row_index) {
            // row_sizes가 너무 작으면 셀의 height를 사용 / Use cell height if row_sizes is too small
            if row_size < 100 {
                // 해당 행의 셀들 중 최대 height 찾기 (rowspan=1인 셀만) / Find max height among cells in this row (only cells with rowspan=1)
                // 주의: rowspan이 있는 셀의 height는 여러 행의 합이므로, rowspan=1인 셀의 height만 사용해야 함
                // Note: height of cells with rowspan is the sum of multiple rows, so only use height of cells with rowspan=1
                let mut max_height: f64 = 0.0;
                // table.cells가 유효한지 확인 / Check if table.cells is valid
                // 마크다운 렌더러처럼 직접 접근 / Direct access like markdown renderer
                let cells = &table.cells;
                if !cells.is_empty() {
                    for cell in cells {
                        if cell.cell_attributes.row_address as usize == row_index
                            && cell.cell_attributes.row_span == 1
                        {
                            let cell_height = cell.cell_attributes.height.to_mm();
                            max_height = max_height.max(cell_height);
                        }
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
        height += get_row_height(table, row_address + i);
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
