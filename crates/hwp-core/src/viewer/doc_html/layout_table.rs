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
        // old viewer mm 포맷 (정수는 소수점 없이)
        html.push_str(&format!(
            r#"<div class="htG" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">"#,
            x_mm, width_mm, y_mm, htg_height
        ));
    }

    // htb: 표 본체
    let htb_x = if has_caption { 0.0 } else { x_mm };
    let htb_y = if has_caption { 0.0 } else { y_mm };
    // old viewer mm 포맷 (정수는 소수점 없이)
    html.push_str(&format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">"#,
        htb_x, width_mm, htb_y, height_mm
    ));

    // SVG 테두리
    let svg = generate_table_svg_borders(table, width_mm, height_mm, resources);
    if !svg.is_empty() {
        html.push_str(&svg);
    }

    // 행 위치 계산 (row_span 고려)
    let row_count = table.rows.len();
    let mut row_heights: Vec<f64> = vec![0.0; row_count];

    // 1) row_span=1인 셀에서 각 행의 기본 높이 결정
    for (ri, row) in table.rows.iter().enumerate() {
        for cell in &row.cells {
            if cell.row_span <= 1 {
                let ch = round_mm(hwpunit_to_mm(cell.height));
                if ch > row_heights[ri] {
                    row_heights[ri] = ch;
                }
            }
        }
    }

    // 2) row_positions 누적 (old viewer row_positions와 동일)
    let mut row_positions: Vec<f64> = vec![0.0; row_count + 1];
    for ri in 0..row_count {
        row_positions[ri + 1] = round_mm(row_positions[ri] + row_heights[ri]);
    }

    // 셀 렌더링
    for (ri, row) in table.rows.iter().enumerate() {
        let mut col_left_mm = 0.0_f64;

        for cell in &row.cells {
            let cell_width_mm = round_mm(hwpunit_to_mm(cell.width));
            let cell_height_raw = hwpunit_to_mm(cell.height); // hcI 계산용 (반올림 전)
            let cell_height_mm = round_mm(cell_height_raw);
            // 셀 마진: 실제 데이터 사용, 없으면 기본 0.5mm
            let margin_left = if cell.cell_margin.left != 0 {
                round_mm(hwpunit_to_mm(cell.cell_margin.left))
            } else { 0.5 };
            let margin_top = if cell.cell_margin.top != 0 {
                round_mm(hwpunit_to_mm(cell.cell_margin.top))
            } else { 0.5 };
            let margin_bottom = if cell.cell_margin.bottom != 0 {
                round_mm(hwpunit_to_mm(cell.cell_margin.bottom))
            } else { 0.5 };

            let cell_top = round_mm(row_positions[ri]);
            let cell_left = round_mm(col_left_mm);

            // hce: old viewer mm 포맷 (정수는 소수점 없이)
            html.push_str(&format!(
                r#"<div class="hce" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;">"#,
                cell_left,
                cell_top,
                cell_width_mm,
                cell_height_mm
            ));

            // 셀 내 콘텐츠 높이 계산 (세로 정렬용)
            let content_height_mm = compute_cell_content_height(cell, margin_top, margin_bottom);

            // hcI top 계산 (세로 정렬: Center가 기본)
            // old viewer: cell_height는 반올림 전 raw 값 사용 (정밀도 일치)
            let hci_top_mm = if content_height_mm > 0.0 && cell_height_raw > content_height_mm {
                round_mm((cell_height_raw - content_height_mm) / 2.0)
            } else {
                0.0
            };
            let hci_style = if hci_top_mm.abs() > 0.01 {
                format!(r#" style="top:{}mm;""#, round_mm(hci_top_mm))
            } else {
                String::new()
            };

            // hcD > hcI 구조 (old viewer와 동일)
            html.push_str(&format!(
                r#"<div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI"{}>"#,
                margin_left, margin_top, hci_style
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

    // 중복 path 방지
    let mut drawn: std::collections::HashSet<(i32, i32, i32, i32)> =
        std::collections::HashSet::new();

    // 셀별 절대 좌표를 계산하여 각 셀의 경계를 그림
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
                // 정규화된 키: 시작점을 항상 작은 쪽으로
                let mk = |a: f64, b: f64, c: f64, d: f64| {
                    let (a, b, c, d) = if a > c || (a == c && b > d) {
                        (c, d, a, b)
                    } else {
                        (a, b, c, d)
                    };
                    ((a * 100.0) as i32, (b * 100.0) as i32, (c * 100.0) as i32, (d * 100.0) as i32)
                };
                // row_span=1 또는 첫 행일 때만 왼쪽/위 변 그림
                let is_first_row_of_span = cell.row_span <= 1 || cell.row == 0;
                if is_first_row_of_span {
                    if let Some(ref line) = bf.left_border {
                        if drawn.insert(mk(x1, y1, x1, y2)) {
                            draw_border_line(&mut svg, x1, y1, x1, y2, line);
                        }
                    }
                }
                if let Some(ref line) = bf.top_border {
                    if drawn.insert(mk(x1, y1, x2, y1)) {
                        draw_border_line(&mut svg, x1, y1, x2, y1, line);
                    }
                }
                if (x2 - width_mm).abs() < 0.5 {
                    if let Some(ref line) = bf.right_border {
                        if drawn.insert(mk(x2, y1, x2, y2)) {
                            draw_border_line(&mut svg, x2, y1, x2, y2, line);
                        }
                    }
                }
                if (y2 - height_mm).abs() < 0.5 {
                    if let Some(ref line) = bf.bottom_border {
                        if drawn.insert(mk(x1, y2, x2, y2)) {
                            draw_border_line(&mut svg, x1, y2, x2, y2, line);
                        }
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

/// 셀 내 콘텐츠 높이 계산 (세로 정렬용)
/// old viewer cells.rs와 동일: 전체 line_segment 블록 높이 + 셀 마진
fn compute_cell_content_height(
    cell: &hwp_model::table::TableCell,
    margin_top: f64,
    margin_bottom: f64,
) -> f64 {
    let mut min_vp: Option<i32> = None;
    let mut max_bottom: Option<i32> = None;

    for para in &cell.content.paragraphs {
        for seg in &para.line_segments {
            let vp = seg.vertical_pos;
            let bottom = seg.vertical_pos + seg.line_height;
            min_vp = Some(min_vp.map(|x: i32| x.min(vp)).unwrap_or(vp));
            max_bottom = Some(max_bottom.map(|x: i32| x.max(bottom)).unwrap_or(bottom));
        }
    }

    if let (Some(min_vp), Some(max_bottom)) = (min_vp, max_bottom) {
        if max_bottom > min_vp {
            let content_h = round_mm(hwpunit_to_mm(max_bottom - min_vp));
            // 마진 포함 (old viewer: content_height + top_margin + bottom_margin)
            round_mm(content_h + margin_top + margin_bottom)
        } else {
            0.0
        }
    } else {
        0.0
    }
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
