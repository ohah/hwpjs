/// SVG 렌더링 모듈 / SVG rendering module
use crate::document::bodytext::Table;

use crate::viewer::html::table::constants::{BORDER_COLOR, BORDER_OFFSET_MM, BORDER_WIDTH_MM};
use crate::viewer::html::table::geometry::{column_positions, row_positions};
use crate::viewer::html::table::position::ViewBox;
use crate::viewer::html::table::size::Size;

mod borders;
mod fills;

pub(crate) fn render_svg(
    table: &Table,
    document: &crate::document::HwpDocument,
    view_box: &ViewBox,
    content: Size,
) -> String {
    let (pattern_defs, fills) = fills::render_fills(table, document);
    let cols = column_positions(table);
    let rows = row_positions(table, content.height);

    let vertical =
        borders::render_vertical_borders(table, &cols, content, BORDER_COLOR, BORDER_WIDTH_MM);
    let horizontal = borders::render_horizontal_borders(
        table,
        &rows,
        content,
        BORDER_COLOR,
        BORDER_WIDTH_MM,
        BORDER_OFFSET_MM,
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
