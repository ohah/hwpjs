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

    let has_caption = table.common.caption.is_some();

    // htG wrapper (캡션 있을 때 — old viewer 구조: htG > htb + hcD)
    let mut html = String::new();
    if has_caption {
        // htG: 표 + 캡션 그룹 (캡션 gap 포함 크기)
        let cap_gap = table.common.caption.as_ref()
            .map(|c| round_mm(hwpunit_to_mm(c.gap)))
            .unwrap_or(3.0);
        let htg_height = height_mm + cap_gap + 3.53; // 캡션 높이 근사
        html.push_str(&format!(
            r#"<div class="htG" style="left:{:.2}mm;width:{:.2}mm;top:{:.2}mm;height:{:.2}mm;">"#,
            x_mm, width_mm, y_mm, htg_height
        ));
    }

    // htb: 표 본체
    let htb_x = if has_caption { 0.0 } else { x_mm };
    let htb_y = if has_caption { 0.0 } else { y_mm };
    html.push_str(&format!(
        r#"<div class="htb" style="left:{:.2}mm;width:{:.2}mm;top:{:.2}mm;height:{:.2}mm;">"#,
        htb_x, width_mm, htb_y, height_mm
    ));

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

                // 텍스트 렌더링 (빈 문단도 line_segments가 있으면 빈 hls 생성)
                let flat = flat_text::extract_flat_text(para);
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

    // 캡션 렌더링
    if let Some(ref caption) = table.common.caption {
        let cap_html = render_caption(caption, resources);
        if !cap_html.is_empty() {
            html.push_str(&cap_html);
        }
    }

    // htG 닫기
    if has_caption {
        html.push_str("</div>"); // htG
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

/// 표의 셀 경계를 SVG path로 생성 (셀별 BorderFill 기반)
fn generate_table_svg_borders(
    table: &Table,
    width_mm: f64,
    height_mm: f64,
    resources: &Resources,
) -> String {
    use std::fmt::Write;

    let margin = 2.5;
    let vb_w = round_mm(width_mm + margin * 2.0);
    let vb_h = round_mm(height_mm + margin * 2.0);

    let mut svg = format!(
        r#"<svg class="hs" viewBox="-{m} -{m} {w} {h}" style="left:-{m}mm;top:-{m}mm;width:{w}mm;height:{h}mm;">"#,
        m = margin, w = vb_w, h = vb_h,
    );
    svg.push_str("<defs></defs>");

    // 셀별 절대 좌표를 계산하여 각 셀의 4변을 그림
    let mut row_top = 0.0_f64;

    for row in &table.rows {
        let mut col_left = 0.0_f64;
        let mut max_h = 0.0_f64;

        for cell in &row.cells {
            let cw = round_mm(hwpunit_to_mm(cell.width));
            let ch = round_mm(hwpunit_to_mm(cell.height));
            if ch > max_h {
                max_h = ch;
            }

            // 셀의 BorderFill에서 테두리 정보 가져오기
            let bf = if cell.border_fill_id > 0 {
                resources
                    .border_fills
                    .get((cell.border_fill_id as usize).wrapping_sub(1))
            } else {
                None
            };

            let x1 = round_mm(col_left);
            let y1 = round_mm(row_top);
            let x2 = round_mm(col_left + cw);
            let y2 = round_mm(row_top + ch);

            // 중복 방지: 왼쪽 변과 위쪽 변만 그림
            // (오른쪽/아래는 인접 셀의 왼쪽/위로 그려짐)
            // 표 오른쪽/아래 외곽선은 마지막 셀에서 그림
            if let Some(bf) = bf {
                // 왼쪽 변
                if let Some(ref line) = bf.left_border {
                    draw_border_line(&mut svg, x1, y1, x1, y2, line);
                }
                // 위쪽 변
                if let Some(ref line) = bf.top_border {
                    draw_border_line(&mut svg, x1, y1, x2, y1, line);
                }
                // 표 오른쪽 외곽 (마지막 열)
                if (x2 - width_mm).abs() < 0.5 {
                    if let Some(ref line) = bf.right_border {
                        draw_border_line(&mut svg, x2, y1, x2, y2, line);
                    }
                }
                // 표 아래쪽 외곽 (마지막 행)
                if (y2 - height_mm).abs() < 0.5 {
                    if let Some(ref line) = bf.bottom_border {
                        draw_border_line(&mut svg, x1, y2, x2, y2, line);
                    }
                }
            }

            col_left += cw;
        }

        row_top += max_h;
    }

    svg.push_str("</svg>");
    svg
}

/// SVG path 하나를 그리는 헬퍼
fn draw_border_line(
    svg: &mut String,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    line: &hwp_model::resources::LineSpec,
) {
    use std::fmt::Write;

    let color = match line.color {
        Some(c) if c != 0xFFFFFF => format!(
            "#{:02X}{:02X}{:02X}",
            (c >> 16) & 0xFF,
            (c >> 8) & 0xFF,
            c & 0xFF
        ),
        _ => return, // 투명 또는 흰색이면 스킵
    };

    let width = if line.width.is_empty() {
        "0.12"
    } else {
        line.width.trim_end_matches("mm").trim_end_matches(" mm")
    };

    write!(
        svg,
        r#"<path d="M{:.2},{:.2} L{:.2},{:.2}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
        x1, y1, x2, y2, color, width
    )
    .ok();
    svg.push_str("</path>");
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
