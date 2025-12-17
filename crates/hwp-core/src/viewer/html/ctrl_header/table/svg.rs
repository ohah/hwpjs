/// SVG 렌더링 모듈 / SVG rendering module
use crate::document::bodytext::Table;
use crate::HwpDocument;

use crate::viewer::html::ctrl_header::table::constants::BORDER_OFFSET_MM;
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
    // 테이블의 오른쪽 끝을 명시적으로 추가 (가장 오른쪽 셀의 오른쪽 경계가 content.width와 일치하지 않을 수 있음)
    // Explicitly add table's right edge (rightmost cell's right boundary may not match content.width)
    if let Some(&last_col) = cols.last() {
        if (last_col - content.width).abs() > 0.01 {
            cols.push(content.width);
            cols.sort_by(|a, b| a.partial_cmp(b).unwrap());
        }
    } else {
        cols.push(content.width);
    }
    let rows = row_positions(table, content.height, document, ctrl_header_height_mm);

    let vertical =
        borders::render_vertical_borders(table, document, &cols, content, ctrl_header_height_mm);
    let horizontal = borders::render_horizontal_borders(
        table,
        document,
        &rows,
        content,
        BORDER_OFFSET_MM,
        ctrl_header_height_mm,
    );

    format!(
        r#"<svg class="hs" viewBox="{} {} {} {}" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><defs>{}</defs>{}</svg>"#,
        view_box.left,
        view_box.top,
        view_box.width,
        view_box.height,
        view_box.left,
        view_box.top,
        view_box.width,
        view_box.height,
        pattern_defs,
        format!("{fills}{vertical}{horizontal}")
    )
}
