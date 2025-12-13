use crate::document::bodytext::Table;
use crate::viewer::html::styles::round_to_2dp;

use super::geometry::{calculate_cell_left, calculate_cell_top, get_cell_height};

pub(crate) fn render_cells(table: &Table, ctrl_header_height_mm: Option<f64>) -> String {
    let mut cells_html = String::new();
    for cell in &table.cells {
        let cell_left = calculate_cell_left(table, cell);
        let cell_top = calculate_cell_top(table, cell, ctrl_header_height_mm);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_cell_height(table, cell, ctrl_header_height_mm);

        let cell_content = String::new();

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
    cells_html
}
