/// 테이블 렌더링 모듈 / Table rendering module
use crate::document::bodytext::{TableCell, Table};
use crate::types::INT32;
use crate::viewer::html::styles::int32_to_mm;

/// 테이블을 HTML로 렌더링 / Render table to HTML
pub fn render_table(
    table: &Table,
    document: &crate::document::HwpDocument,
    left: INT32,
    top: INT32,
    _options: &crate::viewer::html::HtmlOptions,
) -> String {
    let left_mm = int32_to_mm(left);
    let top_mm = int32_to_mm(top);

    // 테이블 크기 계산 / Calculate table size
    let mut total_width = 0.0;
    let mut total_height = 0.0;

    // 행 높이 합계 / Sum of row heights
    for row_size in &table.attributes.row_sizes {
        total_height += (*row_size as f64 / 7200.0) * 25.4;
    }

    // 열 너비 계산 (첫 번째 행의 셀 너비 합계) / Calculate column width (sum of cell widths in first row)
    let first_row_cells: Vec<_> = table
        .cells
        .iter()
        .filter(|cell| cell.cell_attributes.row_address == 0)
        .collect();
    for cell in &first_row_cells {
        total_width += cell.cell_attributes.width.to_mm();
    }

    // SVG viewBox 계산 / Calculate SVG viewBox
    let svg_padding = 2.5; // mm
    let view_box_left = -svg_padding;
    let view_box_top = -svg_padding;
    let view_box_width = total_width + (svg_padding * 2.0);
    let view_box_height = total_height + (svg_padding * 2.0);

    // SVG 테두리 경로 생성 / Generate SVG border paths
    let mut svg_paths = String::new();
    let mut pattern_defs = String::new();
    let mut pattern_counter = 0;

    // 셀별로 테두리 그리기 / Draw borders for each cell
    for cell in &table.cells {
        let cell_left = calculate_cell_left(&table, cell);
        let cell_top = calculate_cell_top(&table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_row_height(&table, cell.cell_attributes.row_address as usize);

        // 배경색 처리 (BorderFill에서) / Handle background color (from BorderFill)
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
                            cell_left,
                            cell_top,
                            cell_left + cell_width,
                            cell_top,
                            cell_left + cell_width,
                            cell_top + cell_height,
                            cell_left,
                            cell_top + cell_height,
                            cell_left,
                            cell_top
                        ));
                    }
                }
            }
        }

        // 테두리 선 그리기 (간단한 버전) / Draw border lines (simplified version)
        // TODO: 실제 테두리 스타일, 두께, 색상 반영
        let border_color = "#000000";
        let border_width = 0.12; // mm

        // 왼쪽 테두리 / Left border
        if cell.cell_attributes.col_address == 0 {
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                cell_left,
                cell_top,
                cell_left,
                cell_top + cell_height,
                border_color,
                border_width
            ));
        }

        // 오른쪽 테두리 / Right border
        svg_paths.push_str(&format!(
            r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
            cell_left + cell_width,
            cell_top,
            cell_left + cell_width,
            cell_top + cell_height,
            border_color,
            border_width
        ));

        // 위쪽 테두리 / Top border
        if cell.cell_attributes.row_address == 0 {
            svg_paths.push_str(&format!(
                r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
                cell_left,
                cell_top,
                cell_left + cell_width,
                cell_top,
                border_color,
                border_width
            ));
        }

        // 아래쪽 테두리 / Bottom border
        svg_paths.push_str(&format!(
            r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};"></path>"#,
            cell_left,
            cell_top + cell_height,
            cell_left + cell_width,
            cell_top + cell_height,
            border_color,
            border_width
        ));
    }

    // SVG 생성 / Generate SVG
    let svg = format!(
        r#"<svg class="hs" viewBox="{} {} {} {}" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><defs>{}</defs>{}</svg>"#,
        view_box_left,
        view_box_top,
        view_box_width,
        view_box_height,
        -svg_padding,
        -svg_padding,
        view_box_width,
        view_box_height,
        pattern_defs,
        svg_paths
    );

    // 셀 렌더링 / Render cells
    let mut cells_html = String::new();
    for cell in &table.cells {
        let cell_left = calculate_cell_left(&table, cell);
        let cell_top = calculate_cell_top(&table, cell);
        let cell_width = cell.cell_attributes.width.to_mm();
        let cell_height = get_row_height(&table, cell.cell_attributes.row_address as usize);

        // 셀 내용 렌더링 / Render cell content
        let cell_content = String::new();
        // TODO: 문단 렌더링 (재귀적으로 처리 필요)
        // for paragraph in &cell.paragraphs {
        //     cell_content.push_str(&render_paragraph(paragraph, document, options));
        // }

        // HWPUNIT16을 mm로 변환 (1/7200인치 단위) / Convert HWPUNIT16 to mm (1/7200 inch unit)
        let left_margin_mm = (cell.cell_attributes.left_margin as f64 / 7200.0) * 25.4;
        let top_margin_mm = (cell.cell_attributes.top_margin as f64 / 7200.0) * 25.4;
        
        cells_html.push_str(&format!(
            r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI">{}</div></div></div>"#,
            cell_left,
            cell_top,
            cell_width,
            cell_height,
            left_margin_mm,
            top_margin_mm,
            cell_content
        ));
    }

    // 테이블 컨테이너 생성 / Create table container
    format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;display:inline-block;position:relative;vertical-align:middle;">{}{}</div>"#,
        left_mm, total_width, top_mm, total_height, svg, cells_html
    )
}

/// 셀의 왼쪽 위치 계산 / Calculate cell left position
fn calculate_cell_left(table: &Table, cell: &TableCell) -> f64 {
    let mut left = 0.0;
    for i in 0..(cell.cell_attributes.col_address as usize) {
        // 이 열의 너비 찾기 / Find width of this column
        if let Some(first_row_cell) = table
            .cells
            .iter()
            .find(|c| c.cell_attributes.row_address == 0 && c.cell_attributes.col_address == i as u16)
        {
            left += first_row_cell.cell_attributes.width.to_mm();
        }
    }
    left
}

/// 셀의 위쪽 위치 계산 / Calculate cell top position
fn calculate_cell_top(table: &Table, cell: &TableCell) -> f64 {
    let mut top = 0.0;
    for i in 0..(cell.cell_attributes.row_address as usize) {
        top += get_row_height(table, i);
    }
    top
}

/// 행 높이 가져오기 / Get row height
fn get_row_height(table: &Table, row_index: usize) -> f64 {
    if row_index < table.attributes.row_sizes.len() {
        (table.attributes.row_sizes[row_index] as f64 / 7200.0) * 25.4
    } else {
        0.0
    }
}

