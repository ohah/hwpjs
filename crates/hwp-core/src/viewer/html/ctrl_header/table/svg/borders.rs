use crate::document::bodytext::{Table, TableCell};
use crate::document::docinfo::border_fill::BorderLine;
use crate::viewer::html::styles::round_to_2dp;
use crate::{BorderFill, HwpDocument};

use crate::viewer::html::ctrl_header::table::geometry::calculate_cell_left;
use crate::viewer::html::ctrl_header::table::size::Size;

/// 테두리 선 두께 코드(0..15)를 mm로 변환. 스펙(한글 문서 파일 형식 5.0) 테두리/선 두께 표 기준.
/// Border width code (0..15) to mm. Per HWP 5.0 spec table for border/line width.
fn border_width_code_to_mm(code: u8) -> f64 {
    match code {
        0 => 0.10,
        1 => 0.12,
        2 => 0.15,
        3 => 0.20,
        4 => 0.25,
        5 => 0.30,
        6 => 0.40,
        7 => 0.50,
        8 => 0.60,
        9 => 0.70,
        10 => 1.00,
        11 => 1.50,
        12 => 2.00,
        13 => 3.00,
        14 => 4.00,
        15 => 5.00,
        _ => 0.12, // 알 수 없는 코드 시 기본값 / default for unknown code
    }
}

fn colorref_to_hex(c: u32) -> String {
    // HWP COLORREF는 보통 0x00BBGGRR 형태
    let r = (c & 0xFF) as u8;
    let g = ((c >> 8) & 0xFF) as u8;
    let b = ((c >> 16) & 0xFF) as u8;
    format!("#{:02X}{:02X}{:02X}", r, g, b)
}

fn borderline_stroke_color(line: &BorderLine) -> String {
    colorref_to_hex(line.color.0)
}

fn borderline_base_width_mm(line: &BorderLine) -> f64 {
    // 사용자 요청: 굵기(stroke-width)는 원 데이터(표 26) 기준 그대로 유지
    border_width_code_to_mm(line.width)
}

fn render_border_paths(
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    is_vertical: bool,
    line: &BorderLine,
) -> String {
    // 레거시(hwpjs.js) 기준: line_type=0은 스타일을 리턴하지 않아 "선 없음" 취급.
    // 따라서 line_type=0 또는 width=0이면 그리지 않는다.
    if line.line_type == 0 || line.width == 0 {
        let _ = (x1, y1, x2, y2, is_vertical);
        return String::new();
    }
    // 사용자 요청: 굵기(stroke-width)는 그대로 유지하고,
    // 색(stroke)과 "그려야 하는 선"만 맞춘다.
    // 따라서 line_type에 따른 2중/3중선(다중 스트로크) 표현은 여기서는 하지 않는다.
    let stroke = borderline_stroke_color(line);
    let w = round_to_2dp(borderline_base_width_mm(line));
    // Note: is_vertical parameter is unused but kept for API compatibility
    // If needed, the else branch can be removed or logic added
    format!(
        r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
        round_to_2dp(x1),
        round_to_2dp(y1),
        round_to_2dp(x2),
        round_to_2dp(y2),
        stroke,
        w
    )
}

fn get_border_fill(document: &HwpDocument, id: u16) -> Option<&BorderFill> {
    if id == 0 {
        return None;
    }
    let idx = (id as usize).checked_sub(1)?;
    document.doc_info.border_fill.get(idx)
}

fn cell_border_fill_id(table: &Table, cell: &TableCell) -> u16 {
    // 우선순위(추가 규칙):
    // 1) TableZone.border_fill_id (있으면 셀 값을 덮어씀)
    // 2) CellAttributes.border_fill_id
    // 3) TableAttributes.border_fill_id
    let row = cell.cell_attributes.row_address;
    let col = cell.cell_attributes.col_address;

    if !table.attributes.zones.is_empty() {
        // 여러 zone이 겹치면 "나중에 나온 zone"이 우선(override)된다고 가정
        for zone in table.attributes.zones.iter().rev() {
            if zone.start_row <= row
                && row <= zone.end_row
                && zone.start_col <= col
                && col <= zone.end_col
                && zone.border_fill_id != 0
            {
                return zone.border_fill_id;
            }
        }
    }

    let id = cell.cell_attributes.border_fill_id;
    if id != 0 {
        id
    } else {
        table.attributes.border_fill_id
    }
}

fn default_borderline(
    table: &Table,
    document: &HwpDocument,
    side: usize, // 0:Left,1:Right,2:Top,3:Bottom
) -> Option<BorderLine> {
    if table.attributes.border_fill_id == 0 {
        return None;
    }
    get_border_fill(document, table.attributes.border_fill_id).map(|bf| bf.borders[side].clone())
}

#[allow(clippy::too_many_arguments)]
fn vertical_segment_borderline(
    table: &Table,
    document: &HwpDocument,
    row_positions: &[f64],
    col_x: f64,
    y0: f64,
    y1: f64,
    is_left_edge: bool,
    is_right_edge: bool,
) -> Option<BorderLine> {
    let eps = 0.02;

    let mut table_default_line: Option<BorderLine> = None;
    if is_left_edge {
        table_default_line = default_borderline(table, document, 0);
    }
    if is_right_edge {
        table_default_line = table_default_line.or(default_borderline(table, document, 1));
    }

    let mut from_left_cell_right: Option<BorderLine> = None;
    let mut from_right_cell_left: Option<BorderLine> = None;

    let mut cells: Vec<&TableCell> = table.cells.iter().collect();
    cells.sort_by_key(|c| (c.cell_attributes.row_address, c.cell_attributes.col_address));

    for cell in cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_right = cell_left + cell_width;

        let row = cell.cell_attributes.row_address as usize;
        let row_span = if cell.cell_attributes.row_span == 0 {
            1usize
        } else {
            cell.cell_attributes.row_span as usize
        };
        if row_positions.len() <= row || row_positions.len() <= row + row_span {
            continue;
        }
        let cell_top = row_positions[row];
        let cell_bottom = row_positions[row + row_span];

        let overlaps_y = !(y1 <= cell_top + eps || y0 >= cell_bottom - eps);
        if !overlaps_y {
            continue;
        }

        let bf_id = cell_border_fill_id(table, cell);
        let bf = match get_border_fill(document, bf_id) {
            Some(v) => v,
            None => continue,
        };

        // 왼쪽 셀의 Right: 여러 셀이 매칭되면 "첫 셀" 우선(원본/레거시 동작에 더 근접)
        if (cell_right - col_x).abs() <= eps {
            let cand = bf.borders[1].clone();
            if from_left_cell_right.is_none() {
                from_left_cell_right = Some(cand);
            }
        }

        // 오른쪽 셀의 Left: 여러 셀이 매칭되면 "첫 셀" 우선
        if (cell_left - col_x).abs() <= eps {
            let cand = bf.borders[0].clone();
            if from_right_cell_left.is_none() {
                from_right_cell_left = Some(cand);
            }
        }
    }

    let cell_border = if is_left_edge {
        from_right_cell_left.or(from_left_cell_right)
    } else {
        from_left_cell_right.or(from_right_cell_left)
    };

    // 외곽 테두리 선택 로직: 셀 border와 table default 중 더 두꺼운 것을 사용
    if is_left_edge || is_right_edge {
        match &cell_border {
            Some(cb) if cb.line_type == 0 => None,
            Some(cb) => match &table_default_line {
                Some(td) if td.line_type != 0 && td.width != 0 => {
                    if cb.width >= td.width {
                        cell_border
                    } else {
                        table_default_line
                    }
                }
                _ => cell_border,
            },
            None => table_default_line,
        }
    } else {
        cell_border
    }
}

#[allow(clippy::too_many_arguments)]
fn horizontal_segment_borderline(
    table: &Table,
    document: &HwpDocument,
    row_positions: &[f64],
    row_y: f64,
    x0: f64,
    x1: f64,
    ctrl_header_height_mm: Option<f64>,
    is_top_edge: bool,
    is_bottom_edge: bool,
) -> Option<BorderLine> {
    let eps = 0.02; // 부동소수점 누적 오차를 허용하기 위해 0.02mm 사용
    let _ = ctrl_header_height_mm; // row_positions 기반 계산을 사용

    // 바깥 테두리: table.border_fill_id 기본값을 먼저 수집하되, 셀 border와 비교 후 결정
    let mut table_default_line: Option<BorderLine> = None;
    if is_top_edge {
        table_default_line = default_borderline(table, document, 2);
    }
    if is_bottom_edge {
        table_default_line = table_default_line.or(default_borderline(table, document, 3));
    }

    // 경계선 우선순위(원본 HTML과 일치시키기 위한 규칙):
    // - 내부선: "위쪽 셀의 Bottom"을 우선, 없으면 "아래쪽 셀의 Top"
    // - 위쪽 외곽: "첫 행 셀의 Top"
    // - 아래쪽 외곽: "마지막 행 셀의 Bottom"
    let mut from_upper_cell_bottom: Option<BorderLine> = None;
    let mut from_lower_cell_top: Option<BorderLine> = None;

    // 셀 순서를 고정(행,열 오름차순)해서 "첫 셀 우선" 규칙이 안정적으로 동작하도록 함
    let mut cells: Vec<&TableCell> = table.cells.iter().collect();
    cells.sort_by_key(|c| (c.cell_attributes.row_address, c.cell_attributes.col_address));

    for cell in cells {
        let row = cell.cell_attributes.row_address as usize;
        let row_span = if cell.cell_attributes.row_span == 0 {
            1usize
        } else {
            cell.cell_attributes.row_span as usize
        };
        if row_positions.len() <= row || row_positions.len() <= row + row_span {
            continue;
        }
        let cell_top = row_positions[row];
        let cell_bottom = row_positions[row + row_span];
        let cell_left = calculate_cell_left(table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_right = cell_left + cell_width;

        let overlaps_x = !(x1 <= cell_left + eps || x0 >= cell_right - eps);
        if !overlaps_x {
            continue;
        }

        let bf_id = cell_border_fill_id(table, cell);
        let bf = match get_border_fill(document, bf_id) {
            Some(v) => v,
            None => continue,
        };

        // 위쪽 셀의 Bottom: 여러 셀이 매칭되면 "첫 셀" 우선
        if (cell_bottom - row_y).abs() <= eps {
            let cand = bf.borders[3].clone();
            if from_upper_cell_bottom.is_none() {
                from_upper_cell_bottom = Some(cand);
            }
        }

        // 아래쪽 셀의 Top: 여러 셀이 매칭되면 "첫 셀" 우선
        if (cell_top - row_y).abs() <= eps {
            let cand = bf.borders[2].clone();
            if from_lower_cell_top.is_none() {
                from_lower_cell_top = Some(cand);
            }
        }
    }

    let cell_border = if is_top_edge {
        from_lower_cell_top.or(from_upper_cell_bottom)
    } else {
        from_upper_cell_bottom.or(from_lower_cell_top)
    };

    // 외곽 테두리 선택 로직: 셀 border와 table default 중 더 두꺼운 것을 사용
    if is_top_edge || is_bottom_edge {
        match &cell_border {
            Some(cb) if cb.line_type == 0 => None,
            Some(cb) => match &table_default_line {
                Some(td) if td.line_type != 0 && td.width != 0 => {
                    if cb.width >= td.width {
                        cell_border
                    } else {
                        table_default_line
                    }
                }
                _ => cell_border,
            },
            None => table_default_line,
        }
    } else {
        cell_border
    }
}

/// 수직 경계선 렌더링 / Render vertical borders
pub(crate) fn render_vertical_borders(
    table: &Table,
    document: &HwpDocument,
    column_positions: &[f64],
    row_positions: &[f64],
    content: Size,
    _ctrl_header_height_mm: Option<f64>,
) -> String {
    let mut svg_paths = String::new();
    let epsilon = 0.01;

    for &col_x in column_positions {
        let is_left_edge = (col_x - 0.0).abs() < epsilon;
        let is_right_edge = (col_x - content.width).abs() < epsilon;

        // 좌/우 외곽선은 항상 전체 높이로 그림
        if is_left_edge || is_right_edge {
            if let Some(line) = vertical_segment_borderline(
                table,
                document,
                row_positions,
                col_x,
                0.0,
                content.height,
                is_left_edge,
                is_right_edge,
            ) {
                svg_paths.push_str(&render_border_paths(
                    col_x,
                    0.0,
                    col_x,
                    content.height,
                    true,
                    &line,
                ));
            }
            continue;
        }

        // row_positions를 사용하여 셀 top/height 계산 (content-aware)
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();
            let cell_right = cell_left + cell_width;

            let row = cell.cell_attributes.row_address as usize;
            let row_span = if cell.cell_attributes.row_span == 0 {
                1usize
            } else {
                cell.cell_attributes.row_span as usize
            };
            if row_positions.len() <= row || row_positions.len() <= row + row_span {
                continue;
            }
            let cell_top = row_positions[row];
            let cell_bottom = row_positions[row + row_span];

            // 셀이 열 위치를 가로지르는지 확인 (부동소수점 오차 고려)
            // 셀의 경계가 열 위치와 일치하는 경우는 "가로지르는" 것이 아님
            if cell_left + epsilon < col_x && cell_right - epsilon > col_x {
                covered_ranges.push((cell_top, cell_bottom));
            }
        }

        covered_ranges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut segments = Vec::new();
        let mut current_y = 0.0;

        for (cover_start, cover_end) in &covered_ranges {
            if current_y < *cover_start {
                segments.push((current_y, *cover_start));
            }
            current_y = current_y.max(*cover_end);
        }

        if current_y < content.height {
            segments.push((current_y, content.height));
        }

        // 세그먼트별로 border 렌더링
        for (y_start, y_end) in &segments {
            if let Some(line) = vertical_segment_borderline(
                table,
                document,
                row_positions,
                col_x,
                *y_start,
                *y_end,
                is_left_edge,
                is_right_edge,
            ) {
                svg_paths.push_str(&render_border_paths(
                    col_x, *y_start, col_x, *y_end, true, &line,
                ));
            }
        }
    }

    svg_paths
}

/// 수평 경계선 렌더링 / Render horizontal borders
pub(crate) fn render_horizontal_borders(
    table: &Table,
    document: &HwpDocument,
    row_positions: &[f64],
    content: Size,
    border_offset: f64,
    ctrl_header_height_mm: Option<f64>,
) -> String {
    let mut svg_paths = String::new();
    let _ = ctrl_header_height_mm; // row_positions 기반 계산을 사용

    for &row_y in row_positions {
        let is_top_edge = (row_y - 0.0).abs() < 0.01;
        let is_bottom_edge = (row_y - content.height).abs() < 0.01;
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let row = cell.cell_attributes.row_address as usize;
            let row_span = if cell.cell_attributes.row_span == 0 {
                1usize
            } else {
                cell.cell_attributes.row_span as usize
            };
            if row_positions.len() <= row || row_positions.len() <= row + row_span {
                continue;
            }
            let cell_top = row_positions[row];
            let cell_bottom = row_positions[row + row_span];
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();

            if cell_top < row_y && cell_bottom > row_y {
                covered_ranges.push((cell_left, cell_left + cell_width));
            }
        }

        covered_ranges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut segments = Vec::new();
        let mut current_x = 0.0;

        for (cover_start, cover_end) in &covered_ranges {
            if current_x < *cover_start {
                segments.push((current_x, *cover_start));
            }
            current_x = current_x.max(*cover_end);
        }

        if current_x < content.width {
            segments.push((current_x, content.width));
        }

        if segments.is_empty() {
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == content.width {
            let line_opt = horizontal_segment_borderline(
                table,
                document,
                row_positions,
                row_y,
                0.0,
                content.width,
                ctrl_header_height_mm,
                is_top_edge,
                is_bottom_edge,
            );
            if let Some(line) = line_opt {
                svg_paths.push_str(&render_border_paths(
                    -border_offset,
                    row_y,
                    content.width + border_offset,
                    row_y,
                    false,
                    &line,
                ));
            }
        } else {
            for (x_start, x_end) in segments {
                let line_opt = horizontal_segment_borderline(
                    table,
                    document,
                    row_positions,
                    row_y,
                    x_start,
                    x_end,
                    ctrl_header_height_mm,
                    is_top_edge,
                    is_bottom_edge,
                );
                if let Some(line) = line_opt {
                    svg_paths.push_str(&render_border_paths(
                        x_start - border_offset,
                        row_y,
                        x_end + border_offset,
                        row_y,
                        false,
                        &line,
                    ));
                }
            }
        }
    }

    svg_paths
}
