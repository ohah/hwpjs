use crate::document::bodytext::Table;
use crate::viewer::html::styles::round_to_2dp;

use crate::viewer::html::ctrl_header::table::geometry::{calculate_cell_left, calculate_cell_top, get_cell_height};
use crate::viewer::html::ctrl_header::table::size::Size;

/// 수직 경계선 렌더링 / Render vertical borders
pub(crate) fn render_vertical_borders(
    table: &Table,
    column_positions: &[f64],
    content: Size,
    border_color: &str,
    border_width: f64,
    ctrl_header_height_mm: Option<f64>,
) -> String {
    let mut svg_paths = String::new();

    for &col_x in column_positions {
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();
            let cell_top = calculate_cell_top(table, cell, ctrl_header_height_mm);
            let cell_height = get_cell_height(table, cell, ctrl_header_height_mm);

            if cell_left < col_x && (cell_left + cell_width) > col_x {
                covered_ranges.push((cell_top, cell_top + cell_height));
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

        if segments.is_empty() {
            continue;
        } else if segments.len() == 1 && segments[0].0 == 0.0 && segments[0].1 == content.height {
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                round_to_2dp(col_x),
                0,
                round_to_2dp(col_x),
                round_to_2dp(content.height),
                border_color,
                border_width
            ));
        } else {
            for (y_start, y_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    round_to_2dp(col_x),
                    round_to_2dp(y_start),
                    round_to_2dp(col_x),
                    round_to_2dp(y_end),
                    border_color,
                    border_width
                ));
            }
        }
    }

    svg_paths
}

/// 수평 경계선 렌더링 / Render horizontal borders
pub(crate) fn render_horizontal_borders(
    table: &Table,
    row_positions: &[f64],
    content: Size,
    border_color: &str,
    border_width: f64,
    border_offset: f64,
    ctrl_header_height_mm: Option<f64>,
) -> String {
    let mut svg_paths = String::new();

    for &row_y in row_positions {
        let mut covered_ranges = Vec::new();
        for cell in &table.cells {
            let cell_top = calculate_cell_top(table, cell, ctrl_header_height_mm);
            let cell_height = get_cell_height(table, cell, ctrl_header_height_mm);
            let cell_left = calculate_cell_left(table, cell);
            let cell_width = cell.cell_attributes.width.to_mm();

            if cell_top < row_y && (cell_top + cell_height) > row_y {
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
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                round_to_2dp(-border_offset),
                round_to_2dp(row_y),
                round_to_2dp(content.width + border_offset),
                round_to_2dp(row_y),
                border_color,
                border_width
            ));
        } else {
            for (x_start, x_end) in segments {
                svg_paths.push_str(&format!(
                    r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                    round_to_2dp(x_start - border_offset),
                    round_to_2dp(row_y),
                    round_to_2dp(x_end + border_offset),
                    round_to_2dp(row_y),
                    border_color,
                    border_width
                ));
            }
        }
    }

    svg_paths
}

