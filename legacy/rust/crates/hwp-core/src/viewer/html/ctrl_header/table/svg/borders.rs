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

/// 한컴 원본 동작: 인접 셀 border 중 더 두꺼운(visible) 것을 선택.
/// line_type=0인 border는 건너뛰고 반대쪽을 시도.
fn pick_thicker_border(a: Option<BorderLine>, b: Option<BorderLine>) -> Option<BorderLine> {
    match (&a, &b) {
        (Some(al), Some(bl)) => {
            if al.line_type == 0 && bl.line_type == 0 {
                a // 둘 다 선 없음
            } else if al.line_type == 0 {
                b
            } else if bl.line_type == 0 {
                a
            } else if bl.width > al.width {
                b
            } else {
                a
            }
        }
        (Some(_), None) => a,
        (None, Some(_)) => b,
        (None, None) => None,
    }
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

    let table_default_line: Option<BorderLine> = if is_left_edge {
        default_borderline(table, document, 0)
    } else if is_right_edge {
        default_borderline(table, document, 1)
    } else {
        default_borderline(table, document, 0).or_else(|| default_borderline(table, document, 1))
    };

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

    // 한컴 원본 동작: 인접 셀 border 중 더 두꺼운 것을 사용.
    // line_type=0(선 없음)인 border는 건너뛰고 반대쪽을 시도.
    let cell_border = pick_thicker_border(from_left_cell_right, from_right_cell_left);

    // 외곽 테두리: 셀 border와 table default 중 더 두꺼운 것을 사용.
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
        // 내부 열 경계: 셀 border가 w=0이면 table default를 fallback으로 사용
        match &cell_border {
            Some(cb) if cb.line_type == 0 => None,
            Some(cb) if cb.width == 0 => table_default_line.or(cell_border),
            Some(_) => cell_border,
            None => table_default_line,
        }
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

    let table_default_line: Option<BorderLine> = if is_top_edge {
        default_borderline(table, document, 2)
    } else if is_bottom_edge {
        default_borderline(table, document, 3)
    } else {
        default_borderline(table, document, 2).or_else(|| default_borderline(table, document, 3))
    };

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

    // 한컴 원본 동작: 인접 셀 border 중 더 두꺼운 것을 사용.
    let cell_border = pick_thicker_border(from_upper_cell_bottom, from_lower_cell_top);

    // 외곽 테두리: 셀 border와 table default 중 더 두꺼운 것을 사용.
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
        // 내부 행 경계: 셀 border가 w=0이면 table default를 fallback으로 사용
        match &cell_border {
            Some(cb) if cb.line_type == 0 => None,
            Some(cb) if cb.width == 0 => table_default_line.or(cell_border),
            Some(_) => cell_border,
            None => table_default_line,
        }
    }
}

/// 수직 경계선 렌더링 / Render vertical borders
pub(crate) fn render_vertical_borders(
    table: &Table,
    document: &HwpDocument,
    column_positions: &[f64],
    row_positions: &[f64],
    content: Size,
) -> String {
    let mut svg_paths = String::new();
    let epsilon = 0.01;

    for &col_x in column_positions {
        let is_left_edge = (col_x - 0.0).abs() < epsilon;
        let is_right_edge = (col_x - content.width).abs() < epsilon;

        // 좌/우 외곽선: 행별로 border를 확인하여 연속 구간 결합
        // 일부 행에서 line_type=0(선 없음)인 경우 해당 구간은 건너뜀
        if is_left_edge || is_right_edge {
            let mut seg_start: Option<(f64, BorderLine)> = None;
            for ri in 0..row_positions.len().saturating_sub(1) {
                let y0 = row_positions[ri];
                let y1 = row_positions[ri + 1];
                let line_opt = vertical_segment_borderline(
                    table,
                    document,
                    row_positions,
                    col_x,
                    y0,
                    y1,
                    is_left_edge,
                    is_right_edge,
                );
                match (&seg_start, &line_opt) {
                    (Some((_, ref prev_line)), Some(ref cur_line))
                        if prev_line.width == cur_line.width
                            && prev_line.line_type == cur_line.line_type =>
                    {
                        // 같은 스타일 → 연장
                    }
                    (Some((start_y, prev_line)), _) => {
                        // 스타일 변경 또는 None → 이전 구간 출력
                        svg_paths.push_str(&render_border_paths(
                            col_x, *start_y, col_x, y0, true, prev_line,
                        ));
                        seg_start = line_opt.map(|l| (y0, l));
                    }
                    (None, Some(_)) => {
                        seg_start = line_opt.map(|l| (y0, l));
                    }
                    (None, None) => {}
                }
            }
            // 마지막 구간 출력
            if let Some((start_y, line)) = seg_start {
                svg_paths.push_str(&render_border_paths(
                    col_x,
                    start_y,
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
    column_positions: &[f64],
    content: Size,
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
        }

        // 각 세그먼트를 열(column) 단위로 분할하여 border 확인
        // 같은 스타일 구간은 결합하고, line_type=0인 구간은 건너뜀
        for (x_start, x_end) in &segments {
            let mut col_boundaries: Vec<f64> = vec![*x_start];
            for col in column_positions {
                if *col > *x_start + 0.01 && *col < *x_end - 0.01 {
                    col_boundaries.push(*col);
                }
            }
            col_boundaries.push(*x_end);

            let mut sub_start: Option<(f64, BorderLine)> = None;
            for ci in 0..col_boundaries.len() - 1 {
                let cx0 = col_boundaries[ci];
                let cx1 = col_boundaries[ci + 1];
                let line_opt = horizontal_segment_borderline(
                    table,
                    document,
                    row_positions,
                    row_y,
                    cx0,
                    cx1,
                    ctrl_header_height_mm,
                    is_top_edge,
                    is_bottom_edge,
                );
                match (&sub_start, &line_opt) {
                    (Some((_, ref prev)), Some(ref cur))
                        if prev.width == cur.width && prev.line_type == cur.line_type =>
                    {
                        // 같은 스타일 → 연장
                    }
                    (Some((sx, prev)), _) => {
                        let overshoot = borderline_base_width_mm(prev) / 2.0;
                        svg_paths.push_str(&render_border_paths(
                            *sx - overshoot,
                            row_y,
                            cx0 + overshoot,
                            row_y,
                            false,
                            prev,
                        ));
                        sub_start = line_opt.map(|l| (cx0, l));
                    }
                    (None, Some(_)) => {
                        sub_start = line_opt.map(|l| (cx0, l));
                    }
                    (None, None) => {}
                }
            }
            // 마지막 구간 출력
            if let Some((sx, line)) = sub_start {
                let overshoot = borderline_base_width_mm(&line) / 2.0;
                svg_paths.push_str(&render_border_paths(
                    sx - overshoot,
                    row_y,
                    *x_end + overshoot,
                    row_y,
                    false,
                    &line,
                ));
            }
        }
    }

    svg_paths
}
