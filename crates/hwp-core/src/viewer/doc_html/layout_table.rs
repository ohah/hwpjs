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

    // htb: 표 본체 (old viewer 구조: htb > svg + hce[])
    let mut html = format!(
        r#"<div class="htb" style="left:{:.2}mm;width:{:.2}mm;top:{:.2}mm;height:{:.2}mm;">"#,
        x_mm, width_mm, y_mm, height_mm
    );

    // SVG 테두리
    let svg = generate_table_svg_borders(table, width_mm, height_mm, resources);
    if !svg.is_empty() {
        html.push_str(&svg);
    }

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

    html.push_str("</div>"); // htb

    // 캡션 렌더링 (표 아래/위/좌/우에 배치)
    if let Some(ref caption) = table.common.caption {
        let cap_html = render_caption(caption, resources);
        if !cap_html.is_empty() {
            html.push_str(&cap_html);
        }
    }

    html
}

/// 표 캡션 렌더링
fn render_caption(
    caption: &hwp_model::shape::Caption,
    resources: &Resources,
) -> String {
    let gap_mm = round_mm(hwpunit_to_mm(caption.gap));
    let width_mm = round_mm(hwpunit_to_mm(caption.width));

    let mut html = format!(
        r#"<div class="hcD" style="width:{:.2}mm;height:3.53mm;overflow:hidden;"><div class="hcI">"#,
        width_mm
    );

    for para in &caption.content.paragraphs {
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

    html.push_str("</div></div>");
    let _ = gap_mm; // TODO: 캡션 위치를 gap 기반으로 계산
    html
}

/// 표의 셀 경계를 SVG path로 생성
fn generate_table_svg_borders(
    table: &Table,
    width_mm: f64,
    height_mm: f64,
    resources: &Resources,
) -> String {
    use std::fmt::Write;

    let margin = 2.5; // SVG 오버플로우 마진 (mm)
    let vb_w = round_mm(width_mm + margin * 2.0);
    let vb_h = round_mm(height_mm + margin * 2.0);

    let mut svg = format!(
        r#"<svg class="hs" viewBox="-{m} -{m} {w} {h}" style="left:-{m}mm;top:-{m}mm;width:{w}mm;height:{h}mm;">"#,
        m = margin,
        w = vb_w,
        h = vb_h,
    );
    svg.push_str("<defs></defs>");

    // BorderFill에서 선 색상/두께 가져오기
    let border_fill = if table.border_fill_id > 0 {
        resources
            .border_fills
            .get((table.border_fill_id as usize).wrapping_sub(1))
    } else {
        None
    };

    let stroke_color = border_fill
        .and_then(|bf| bf.left_border.as_ref())
        .and_then(|l| l.color)
        .map(|c| {
            format!(
                "#{:02X}{:02X}{:02X}",
                (c >> 16) & 0xFF,
                (c >> 8) & 0xFF,
                c & 0xFF
            )
        })
        .unwrap_or_else(|| "#000000".to_string());

    let stroke_width = border_fill
        .and_then(|bf| bf.left_border.as_ref())
        .map(|l| l.width.clone())
        .unwrap_or_else(|| "0.12".to_string())
        .replace("mm", "");

    // 세로선 (열 경계)
    let mut col_x = 0.0_f64;
    if let Some(first_row) = table.rows.first() {
        // 왼쪽 경계
        write!(
            svg,
            r#"<path d="M{:.2},0 L{:.2},{:.0}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
            0.0, 0.0, height_mm, stroke_color, stroke_width
        )
        .ok();
        svg.push_str("</path>");

        for cell in &first_row.cells {
            col_x += round_mm(hwpunit_to_mm(cell.width));
            write!(
                svg,
                r#"<path d="M{:.2},0 L{:.2},{:.0}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
                col_x, col_x, height_mm, stroke_color, stroke_width
            )
            .ok();
            svg.push_str("</path>");
        }
    }

    // 가로선 (행 경계)
    let mut row_y = 0.0_f64;
    // 상단 경계
    write!(
        svg,
        r#"<path d="M-0.06,0 L{:.2},0" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
        round_mm(width_mm + 0.06),
        stroke_color,
        stroke_width
    )
    .ok();
    svg.push_str("</path>");

    for row in &table.rows {
        let max_h = row
            .cells
            .iter()
            .map(|c| hwpunit_to_mm(c.height))
            .fold(0.0_f64, f64::max);
        row_y += round_mm(max_h);
        write!(
            svg,
            r#"<path d="M-0.06,{:.2} L{:.2},{:.2}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
            row_y,
            round_mm(width_mm + 0.06),
            row_y,
            stroke_color,
            stroke_width
        )
        .ok();
        svg.push_str("</path>");
    }

    svg.push_str("</svg>");
    svg
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
