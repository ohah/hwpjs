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

    // 셀 절대 좌표 계산을 위한 row/col 누적 위치
    let mut row_top_mm = 0.0_f64;

    for row in &table.rows {
        let mut col_left_mm = 0.0_f64;
        let mut max_height_mm = 0.0_f64;

        for cell in &row.cells {
            let cell_width_mm = round_mm(hwpunit_to_mm(cell.width));
            let cell_height_mm = round_mm(hwpunit_to_mm(cell.height));
            let cell_margin = 0.5; // 기본 셀 내부 마진 (mm)

            if cell_height_mm > max_height_mm {
                max_height_mm = cell_height_mm;
            }

            // hce: 절대 좌표 배치
            html.push_str(&format!(
                r#"<div class="hce" style="left:{:.2}mm;top:{:.2}mm;width:{:.2}mm;height:{:.2}mm;">"#,
                round_mm(col_left_mm),
                round_mm(row_top_mm),
                cell_width_mm,
                cell_height_mm
            ));

            // hcD > hcI 구조 (old viewer와 동일)
            html.push_str(&format!(
                r#"<div class="hcD" style="left:{:.1}mm;top:{:.1}mm;"><div class="hcI">"#,
                cell_margin, cell_margin
            ));

            // 셀 내 문단 렌더링 (텍스트 + Object)
            for para in &cell.content.paragraphs {
                // Object(Picture/Rectangle) 렌더링
                for run in &para.runs {
                    for content in &run.contents {
                        if let hwp_model::paragraph::RunContent::Object(ref shape) = content {
                            let obj_html = match shape {
                                hwp_model::shape::ShapeObject::Picture(ref pic) => {
                                    super::layout_image::render_layout_picture(pic, _binaries)
                                }
                                hwp_model::shape::ShapeObject::Rectangle(ref rect) => {
                                    if let Some(ref dt) = rect.draw_text {
                                        super::layout_image::render_layout_textbox(
                                            &rect.common,
                                            &dt.paragraphs,
                                            resources,
                                        )
                                    } else {
                                        String::new()
                                    }
                                }
                                _ => String::new(),
                            };
                            if !obj_html.is_empty() {
                                html.push_str(&obj_html);
                            }
                        }
                    }
                }

                // 텍스트 렌더링
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

            html.push_str("</div></div>"); // hcI, hcD
            html.push_str("</div>"); // hce

            col_left_mm += cell_width_mm;
        }

        row_top_mm += max_height_mm;
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
