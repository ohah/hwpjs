/// Document 기반 표 레이아웃 렌더러 (old viewer ctrl_header/table 포팅)
/// 절대 좌표(mm) 기반 표 배치 + 셀 콘텐츠 렌더링
use super::flat_text;
use super::layout_line_segment;
use super::styles::{hwpunit_to_mm, round_mm};
use hwp_model::document::BinaryStore;
use hwp_model::resources::Resources;
use hwp_model::table::Table;

/// 표를 레이아웃 HTML로 렌더링
/// 절대 좌표에 배치된 `htb > htG > hce` 구조
pub fn render_layout_table(
    table: &Table,
    resources: &Resources,
    _binaries: &BinaryStore,
) -> String {
    if table.rows.is_empty() {
        return String::new();
    }

    // ShapeCommon에서 위치/크기 정보 추출
    let common = &table.common;
    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    let mut html = format!(
        r#"<div class="htb" style="left:{:.2}mm;top:{:.2}mm;width:{:.2}mm;height:{:.2}mm;">"#,
        x_mm, y_mm, width_mm, height_mm
    );

    // 테이블 그리드: htG
    html.push_str(&format!(
        r#"<div class="htG" style="width:{:.2}mm;height:{:.2}mm;">"#,
        width_mm, height_mm
    ));

    // 셀 렌더링
    for row in &table.rows {
        for cell in &row.cells {
            let cell_width_mm = round_mm(hwpunit_to_mm(cell.width));
            let cell_height_mm = round_mm(hwpunit_to_mm(cell.height));

            // 셀 위치는 col/row 기반으로 계산 (간략화: 순차 배치)
            // 완전한 구현은 CellZone + col_widths 필요
            html.push_str(&format!(
                r#"<div class="hce" style="width:{:.2}mm;height:{:.2}mm;">"#,
                cell_width_mm, cell_height_mm
            ));

            // 셀 내 문단 렌더링
            for para in &cell.content.paragraphs {
                let flat = flat_text::extract_flat_text(para);
                if flat.text.is_empty() {
                    continue;
                }
                let ps_class = format!("ps{}", para.para_shape_id);
                let lines = layout_line_segment::render_line_segments(
                    &flat.text,
                    &flat.char_shapes,
                    &para.line_segments,
                    resources,
                    &ps_class,
                    0.0,
                );
                for line in lines {
                    html.push_str(&line);
                }
            }

            html.push_str("</div>"); // hce
        }
    }

    html.push_str("</div>"); // htG
    html.push_str("</div>"); // htb

    html
}

#[cfg(test)]
mod tests {
    use super::*;
    use hwp_model::table::*;

    #[test]
    fn test_empty_table() {
        let table = Table::default();
        let result = render_layout_table(&table, &Resources::default(), &BinaryStore::default());
        assert!(result.is_empty());
    }
}
