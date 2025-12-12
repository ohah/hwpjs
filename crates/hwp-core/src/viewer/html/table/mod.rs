/// 테이블 렌더링 모듈 / Table rendering modules
mod cells;
mod constants;
mod geometry;
mod position;
mod size;
mod svg;

use crate::document::bodytext::ctrl_header::ObjectAttribute;
use crate::document::bodytext::{Margin, PageDef, Table};
use crate::types::{HWPUNIT, SHWPUNIT};

use self::position::{table_position, view_box};
use self::size::{content_size, htb_size, resolve_container_size};
use crate::viewer::html::table::constants::SVG_PADDING_MM;

/// 테이블을 HTML로 렌더링
#[allow(clippy::too_many_arguments)]
pub fn render_table(
    table: &Table,
    document: &crate::document::HwpDocument,
    ctrl_header_size: Option<(HWPUNIT, HWPUNIT, Margin)>,
    _attr_info: Option<(&ObjectAttribute, SHWPUNIT, SHWPUNIT)>,
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&PageDef>,
    _options: &crate::viewer::html::HtmlOptions,
    _table_number: Option<u32>,
    _caption_text: Option<&str>,
    segment_position: Option<(crate::types::INT32, crate::types::INT32)>,
) -> String {
    if table.cells.is_empty() || table.attributes.row_count == 0 {
        return r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
            .to_string();
    }

    let container_size = htb_size(ctrl_header_size.clone());
    let content_size = content_size(table, ctrl_header_size);
    let resolved_size = resolve_container_size(container_size, content_size);
    let view_box = view_box(resolved_size.width, resolved_size.height, SVG_PADDING_MM);

    let svg = svg::render_svg(
        table,
        document,
        &view_box,
        content_size,
    );
    let cells_html = cells::render_cells(table);

    let (left_mm, top_mm) = table_position(hcd_position, page_def, segment_position);

    format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
        left_mm, resolved_size.width, top_mm, resolved_size.height, svg, cells_html
    )
}
