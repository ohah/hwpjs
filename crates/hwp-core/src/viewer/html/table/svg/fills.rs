use crate::document::bodytext::Table;

use crate::viewer::html::styles::round_to_2dp;

use crate::viewer::html::table::geometry::{calculate_cell_left, calculate_cell_top, get_cell_height};

/// 배경 패턴 및 면 채우기 생성 / Build background patterns and fills
pub(crate) fn render_fills(
    table: &Table,
    document: &crate::document::HwpDocument,
) -> (String, String) {
    let mut svg_paths = String::new();
    let mut pattern_defs = String::new();
    let mut pattern_counter = 0;

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
                            round_to_2dp(cell_left),
                            round_to_2dp(cell_top),
                            round_to_2dp(cell_left + cell_width),
                            round_to_2dp(cell_top),
                            round_to_2dp(cell_left + cell_width),
                            round_to_2dp(cell_top + cell_height),
                            round_to_2dp(cell_left),
                            round_to_2dp(cell_top + cell_height),
                            round_to_2dp(cell_left),
                            round_to_2dp(cell_top)
                        ));
                    }
                }
            }
        }
    }

    (pattern_defs, svg_paths)
}

