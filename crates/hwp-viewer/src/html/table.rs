use super::styles;
use crate::RenderOptions;
use hwp_model::document::Document;
use hwp_model::table::Table;

/// Table → HTML table
pub fn render_table(table: &Table, document: &Document, options: &RenderOptions) -> String {
    let mut html = String::new();

    let width_mm = styles::hwpunit_to_mm(table.common.size.width);

    html.push_str(&format!(
        "<table class=\"hwp-table\" style=\"width:{}mm;\">\n",
        width_mm
    ));

    for row in &table.rows {
        html.push_str("<tr>\n");
        for cell in &row.cells {
            let mut td_style = String::new();

            // 셀 크기
            let cell_width = styles::hwpunit_to_mm(cell.width);
            if cell_width > 0.0 {
                td_style.push_str(&format!("width:{}mm;", cell_width));
            }

            // 셀 세로 정렬
            match cell.content.vert_align {
                hwp_model::types::VAlign::Center => td_style.push_str("vertical-align:middle;"),
                hwp_model::types::VAlign::Bottom => td_style.push_str("vertical-align:bottom;"),
                _ => {}
            }

            // 셀 여백
            let m = &cell.cell_margin;
            if m.left != 0 || m.right != 0 || m.top != 0 || m.bottom != 0 {
                td_style.push_str(&format!(
                    "padding:{}mm {}mm {}mm {}mm;",
                    styles::hwpunit_to_mm(m.top),
                    styles::hwpunit_to_mm(m.right),
                    styles::hwpunit_to_mm(m.bottom),
                    styles::hwpunit_to_mm(m.left),
                ));
            }

            let mut attrs = String::new();
            if cell.col_span > 1 {
                attrs.push_str(&format!(" colspan=\"{}\"", cell.col_span));
            }
            if cell.row_span > 1 {
                attrs.push_str(&format!(" rowspan=\"{}\"", cell.row_span));
            }
            if !td_style.is_empty() {
                attrs.push_str(&format!(" style=\"{}\"", td_style));
            }

            html.push_str(&format!("<td{}>\n", attrs));

            for para in &cell.content.paragraphs {
                html.push_str(&super::render_paragraph(para, document, options));
            }

            html.push_str("</td>\n");
        }
        html.push_str("</tr>\n");
    }

    html.push_str("</table>\n");
    html
}
