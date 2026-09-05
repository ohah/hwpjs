use crate::document::bodytext::Table;
use crate::document::FillInfo;
use crate::HwpDocument;

use crate::viewer::html::styles::round_to_2dp;

use crate::viewer::html::ctrl_header::table::geometry::calculate_cell_left;

use std::collections::HashMap;

/// 배경 패턴 및 면 채우기 생성 / Build background patterns and fills
/// row_positions를 사용하여 border와 동일한 정확한 셀 위치/높이를 계산.
pub(crate) fn render_fills(
    table: &Table,
    document: &HwpDocument,
    row_positions: &[f64],
    pattern_counter: &mut usize,
    color_to_pattern: &mut HashMap<u32, String>,
) -> (String, String) {
    let mut svg_paths = String::new();
    let mut pattern_defs = String::new();

    for cell in table.cells.iter() {
        let cell_left = calculate_cell_left(table, cell);
        let row = cell.cell_attributes.row_address as usize;
        let row_span = if cell.cell_attributes.row_span == 0 {
            1usize
        } else {
            cell.cell_attributes.row_span as usize
        };
        // row_positions 기반으로 정확한 top/height 계산 (border와 동일)
        if row_positions.len() <= row || row_positions.len() <= row + row_span {
            continue;
        }
        let cell_top = row_positions[row];
        let cell_height = row_positions[row + row_span] - cell_top;
        let cell_width = cell.cell_attributes.width.to_mm();

        // 셀의 border_fill_id를 사용하거나, 0이면 테이블의 기본 border_fill_id 사용
        // Use cell's border_fill_id, or table's default border_fill_id if 0
        let border_fill_id_to_use = if cell.cell_attributes.border_fill_id > 0 {
            cell.cell_attributes.border_fill_id
        } else {
            table.attributes.border_fill_id
        };

        if border_fill_id_to_use > 0 {
            let border_fill_id = border_fill_id_to_use as usize;
            // border_fill_id는 1-based이므로 배열 인덱스는 border_fill_id - 1
            // border_fill_id is 1-based, so array index is border_fill_id - 1
            if border_fill_id > 0 && border_fill_id <= document.doc_info.border_fill.len() {
                let border_fill = &document.doc_info.border_fill[border_fill_id - 1];

                if let FillInfo::Solid(solid) = &border_fill.fill {
                    let color_value = solid.background_color.0;

                    // COLORREF가 0이 아니고 (투명하지 않고) 색상이 있는 경우
                    // If COLORREF is not 0 (not transparent) and has color
                    if color_value != 0 {
                        // 같은 색상이면 기존 패턴 재사용 / Reuse existing pattern for same color
                        let is_new_pattern = !color_to_pattern.contains_key(&color_value);
                        let pattern_id = if is_new_pattern {
                            let id = format!("w_{:02}", *pattern_counter);
                            *pattern_counter += 1;
                            let color = &solid.background_color;
                            pattern_defs.push_str(&format!(
                                r#"<pattern id="{}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgb({},{},{})" /></pattern>"#,
                                id, color.r(), color.g(), color.b()
                            ));
                            color_to_pattern.insert(color_value, id.clone());
                            id
                        } else {
                            color_to_pattern.get(&color_value).unwrap().clone()
                        };

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
