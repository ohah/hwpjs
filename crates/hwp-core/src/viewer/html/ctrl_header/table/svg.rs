/// SVG 렌더링 모듈 / SVG rendering module
use crate::document::bodytext::Table;
use crate::HwpDocument;

use crate::viewer::html::ctrl_header::table::geometry::{column_positions, row_positions};
use crate::viewer::html::ctrl_header::table::position::ViewBox;
use crate::viewer::html::ctrl_header::table::size::Size;

mod borders;
mod fills;

pub(crate) fn render_svg(
    table: &Table,
    document: &HwpDocument,
    view_box: &ViewBox,
    content: Size,
    ctrl_header_height_mm: Option<f64>,
    pattern_counter: &mut usize, // 문서 레벨 pattern_counter (문서 전체에서 패턴 ID 공유) / Document-level pattern_counter (share pattern IDs across document)
    color_to_pattern: &mut std::collections::HashMap<u32, String>, // 문서 레벨 color_to_pattern (문서 전체에서 패턴 ID 공유) / Document-level color_to_pattern (share pattern IDs across document)
) -> String {
    let (pattern_defs, fills) = fills::render_fills(
        table,
        document,
        ctrl_header_height_mm,
        pattern_counter,
        color_to_pattern,
    );
    let mut cols = column_positions(table);
    // column_positions의 마지막 값을 content.width로 정규화
    // 셀 너비의 개별 합산과 총합은 부동소수점 오차로 다를 수 있으므로,
    // 마지막 열 경계를 content.width로 맞춰 is_right_edge 판정을 정확하게 함
    if let Some(last_col) = cols.last_mut() {
        if (*last_col - content.width).abs() < 0.1 {
            *last_col = content.width;
        } else {
            cols.push(content.width);
            cols.sort_by(|a, b| a.partial_cmp(b).unwrap());
        }
    } else {
        cols.push(content.width);
    }
    let rows = row_positions(table, content.height, document, ctrl_header_height_mm);

    let vertical = borders::render_vertical_borders(table, document, &cols, &rows, content);
    let horizontal =
        borders::render_horizontal_borders(table, document, &rows, content, ctrl_header_height_mm);

    let view_left = view_box.left;
    let view_top = view_box.top;
    let view_width = view_box.width;
    let view_height = view_box.height;

    format!(
        r#"<svg class="hs" viewBox="{} {} {} {}" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><defs>{}</defs>{}</svg>"#,
        view_left,
        view_top,
        view_width,
        view_height,
        view_left,
        view_top,
        view_width,
        view_height,
        pattern_defs,
        (format!("{fills}{vertical}{horizontal}"))
    )
}
