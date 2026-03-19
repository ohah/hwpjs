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
    render_layout_table_with_offset(table, resources, _binaries, 0.0, 0.0)
}

/// 페이지 오프셋 포함 테이블 렌더링
pub fn render_layout_table_with_offset(
    table: &Table,
    resources: &Resources,
    _binaries: &BinaryStore,
    page_left_mm: f64,
    page_top_mm: f64,
) -> String {
    if table.rows.is_empty() {
        return String::new();
    }

    // ShapeCommon에서 위치/크기 정보 추출
    let common = &table.common;
    let content_width = round_mm(hwpunit_to_mm(common.size.width));
    let content_height = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    // 외곽 마진 (old viewer: ObjectCommon.width + margin.left + margin.right)
    // 반올림 전 raw 값으로 합산 후 최종 반올림 (old viewer 정밀도 일치)
    let (margin_l_raw, margin_r_raw, margin_t_raw, margin_b_raw) = common.out_margin.as_ref()
        .map(|m| (
            hwpunit_to_mm(m.left),
            hwpunit_to_mm(m.right),
            hwpunit_to_mm(m.top),
            hwpunit_to_mm(m.bottom),
        ))
        .unwrap_or((0.0, 0.0, 0.0, 0.0));

    // htb 크기: content + margins (old viewer htb_size)
    let htb_width = round_mm(hwpunit_to_mm(common.size.width) + margin_l_raw + margin_r_raw);
    let htb_height = round_mm(hwpunit_to_mm(common.size.height) + margin_t_raw + margin_b_raw);

    let has_caption = table.common.caption.is_some();

    // htb 절대 좌표: 페이지 오프셋 + 테이블 상대 좌표
    let abs_x = round_mm(page_left_mm + x_mm);
    let abs_y = round_mm(page_top_mm + y_mm);

    // htG wrapper (캡션 있을 때 — old viewer 구조: htG > htb + hcD)
    let mut html = String::new();
    if has_caption {
        // htG: 표 + 캡션 그룹 (캡션 gap 포함 크기)
        let cap_gap = table.common.caption.as_ref()
            .map(|c| round_mm(hwpunit_to_mm(c.gap)))
            .unwrap_or(3.0);
        let htg_height = htb_height + cap_gap + 3.53; // 캡션 높이 근사
        html.push_str(&format!(
            r#"<div class="htG" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">"#,
            abs_x, htb_width, abs_y, htg_height
        ));
    }

    // htb: 표 본체
    let htb_x = if has_caption { 0.0 } else { abs_x };
    let htb_y = if has_caption { 0.0 } else { abs_y };
    html.push_str(&format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">"#,
        htb_x, htb_width, htb_y, htb_height
    ));

    // SVG 테두리 (viewBox는 htb 크기 기반)
    let svg = generate_table_svg_borders(table, htb_width, htb_height, resources);
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
                let parsed_h = hwpunit_to_mm(cell.height);
                let ch = if parsed_h < 1.0 && cell.height != 0 {
                    let content_h = compute_cell_content_height_raw(cell);
                    round_mm(if content_h > parsed_h { content_h } else { parsed_h })
                } else {
                    round_mm(parsed_h)
                };
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
            // 셀 높이: cell.height가 실제 높이보다 작은 경우 콘텐츠 기반 높이 사용
            // (HWP 파서에서 cell.height가 내부 마진만 포함할 수 있음)
            let parsed_height_raw = hwpunit_to_mm(cell.height);
            let cell_height_raw = if parsed_height_raw < 1.0 && cell.height != 0 {
                // 콘텐츠 기반 높이 계산 (line_segments 사용)
                let content_h = compute_cell_content_height_raw(cell);
                if content_h > parsed_height_raw { content_h } else { parsed_height_raw }
            } else {
                parsed_height_raw
            };
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

/// 표의 셀 경계를 SVG path로 생성 (old viewer 방식: column/row positions 기반 연속선)
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

    // column_positions 계산 (셀 너비 누적)
    let col_positions = compute_column_positions(table);
    // row_positions 계산 (row_span=1 셀 기준)
    let row_positions = compute_row_positions(table);

    // SVG fills (배경 패턴) 생성
    let mut pattern_counter = 0_usize;
    let mut color_to_pattern: std::collections::HashMap<u32, String> = std::collections::HashMap::new();
    let (pattern_defs, fill_paths) = generate_table_fills(
        table, &row_positions, resources, &mut pattern_counter, &mut color_to_pattern,
    );

    // SVG viewBox와 style (old viewer: ViewBox 기반)
    let mut svg = format!(
        r#"<svg class="hs" viewBox="-{m} -{m} {w} {h}" style="left:-{m}mm;top:-{m}mm;width:{w}mm;height:{h}mm;">"#,
        m = margin, w = vb_w, h = vb_h,
    );
    svg.push_str(&format!("<defs>{}</defs>", pattern_defs));
    svg.push_str(&fill_paths);

    let content_w = *col_positions.last().unwrap_or(&width_mm);
    let content_h = *row_positions.last().unwrap_or(&height_mm);

    // 기본 border 정보 (첫 번째 셀의 BorderFill 사용)
    let default_border = table.rows.first()
        .and_then(|r| r.cells.first())
        .and_then(|c| {
            if c.border_fill_id > 0 {
                resources.border_fills.get((c.border_fill_id as usize).wrapping_sub(1))
            } else { None }
        });
    let default_stroke_width = default_border
        .and_then(|bf| bf.left_border.as_ref())
        .map(|l| {
            if l.width.is_empty() { 0.12 }
            else { l.width.trim_end_matches("mm").parse::<f64>().unwrap_or(0.12) }
        })
        .unwrap_or(0.12);
    let overshoot = default_stroke_width / 2.0;

    // 수직 경계선 (column_positions 순회)
    for &col_x in &col_positions {
        // covered_ranges: row_span으로 이 열 경계를 가로지르는 셀 영역
        let mut covered = Vec::new();
        for row in &table.rows {
            let mut cx = 0.0_f64;
            for cell in &row.cells {
                let cw = round_mm(hwpunit_to_mm(cell.width));
                let cl = round_mm(cx);
                let cr = round_mm(cx + cw);
                // 셀이 이 열 경계를 가로지르는가? (셀 내부에 경계가 있으면 선 생략)
                if cl + 0.01 < col_x && cr - 0.01 > col_x {
                    let ri = cell.row as usize;
                    let rs = if cell.row_span > 0 { cell.row_span as usize } else { 1 };
                    if ri < row_positions.len() && ri + rs < row_positions.len() {
                        covered.push((row_positions[ri], row_positions[ri + rs]));
                    }
                }
                cx += cw;
            }
        }
        covered.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        // covered 영역을 제외한 segments
        let mut segments = Vec::new();
        let mut cur_y = 0.0_f64;
        for (cs, ce) in &covered {
            if cur_y < *cs { segments.push((cur_y, *cs)); }
            cur_y = cur_y.max(*ce);
        }
        // old viewer: covered가 있으면 마지막 세그먼트도 포함 (zero-length 포함)
        if !covered.is_empty() || cur_y < content_h {
            segments.push((cur_y, content_h));
        }

        for (y0, y1) in &segments {
            svg_path_v(&mut svg, col_x, *y0, *y1, default_stroke_width, resources, default_border);
        }
    }

    // 수평 경계선 (row_positions 순회 + overshoot)
    for &row_y in &row_positions {
        // covered_ranges: col_span으로 이 행 경계를 가로지르는 셀 영역
        let mut covered = Vec::new();
        for row in &table.rows {
            let mut cx = 0.0_f64;
            for cell in &row.cells {
                let cw = round_mm(hwpunit_to_mm(cell.width));
                let ri = cell.row as usize;
                let rs = if cell.row_span > 0 { cell.row_span as usize } else { 1 };
                if ri < row_positions.len() && ri + rs < row_positions.len() {
                    let ct = row_positions[ri];
                    let cb = row_positions[ri + rs];
                    // 셀이 이 행 경계를 가로지르는가?
                    if ct < row_y && cb > row_y {
                        covered.push((round_mm(cx), round_mm(cx + cw)));
                    }
                }
                cx += cw;
            }
        }
        covered.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut segments = Vec::new();
        let mut cur_x = 0.0_f64;
        for (cs, ce) in &covered {
            if cur_x < *cs { segments.push((cur_x, *cs)); }
            cur_x = cur_x.max(*ce);
        }
        if cur_x < content_w { segments.push((cur_x, content_w)); }

        for (x0, x1) in &segments {
            // overshoot: 수평선 양끝에 stroke-width/2만큼 확장
            svg_path_h(&mut svg, *x0 - overshoot, *x1 + overshoot, row_y, default_stroke_width, resources, default_border);
        }
    }

    svg.push_str("</svg>");
    svg
}

/// column_positions 계산
fn compute_column_positions(table: &Table) -> Vec<f64> {
    let mut positions = vec![0.0_f64];
    if let Some(first_row) = table.rows.first() {
        let mut x = 0.0_f64;
        for cell in &first_row.cells {
            x += round_mm(hwpunit_to_mm(cell.width));
            positions.push(round_mm(x));
        }
    }
    positions
}

/// row_positions 계산 (row_span=1 셀 기준)
fn compute_row_positions(table: &Table) -> Vec<f64> {
    let row_count = table.rows.len();
    let mut row_heights = vec![0.0_f64; row_count];
    for (ri, row) in table.rows.iter().enumerate() {
        for cell in &row.cells {
            if cell.row_span <= 1 {
                let parsed_h = hwpunit_to_mm(cell.height);
                let ch = if parsed_h < 1.0 && cell.height != 0 {
                    let content_h = compute_cell_content_height_raw(cell);
                    round_mm(if content_h > parsed_h { content_h } else { parsed_h })
                } else {
                    round_mm(parsed_h)
                };
                if ch > row_heights[ri] { row_heights[ri] = ch; }
            }
        }
    }
    let mut positions = vec![0.0_f64; row_count + 1];
    for ri in 0..row_count {
        positions[ri + 1] = round_mm(positions[ri] + row_heights[ri]);
    }
    positions
}

/// 수직 경계선 path
fn svg_path_v(
    svg: &mut String,
    x: f64, y0: f64, y1: f64,
    stroke_width: f64,
    _resources: &Resources,
    default_border: Option<&hwp_model::resources::BorderFill>,
) {
    let color = default_border
        .and_then(|bf| bf.left_border.as_ref())
        .and_then(|l| l.color)
        .map(|c| format!("#{:02X}{:02X}{:02X}", (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF))
        .unwrap_or_else(|| "#000000".to_string());
    use std::fmt::Write;
    write!(svg,
        r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
        round_mm(x), round_mm(y0), round_mm(x), round_mm(y1), color, stroke_width
    ).ok();
    svg.push_str("</path>");
}

/// 수평 경계선 path
fn svg_path_h(
    svg: &mut String,
    x0: f64, x1: f64, y: f64,
    stroke_width: f64,
    _resources: &Resources,
    default_border: Option<&hwp_model::resources::BorderFill>,
) {
    let color = default_border
        .and_then(|bf| bf.top_border.as_ref())
        .and_then(|l| l.color)
        .map(|c| format!("#{:02X}{:02X}{:02X}", (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF))
        .unwrap_or_else(|| "#000000".to_string());
    use std::fmt::Write;
    write!(svg,
        r#"<path d="M{},{} L{},{}" style="stroke:{};stroke-linecap:butt;stroke-width:{};">"#,
        round_mm(x0), round_mm(y), round_mm(x1), round_mm(y), color, stroke_width
    ).ok();
    svg.push_str("</path>");
}

/// 배경 패턴 및 면 채우기 생성 (old viewer fills.rs 포팅)
fn generate_table_fills(
    table: &Table,
    row_positions: &[f64],
    resources: &Resources,
    pattern_counter: &mut usize,
    color_to_pattern: &mut std::collections::HashMap<u32, String>,
) -> (String, String) {
    let mut pattern_defs = String::new();
    let mut fill_paths = String::new();

    for row in &table.rows {
        let mut cx = 0.0_f64;
        for cell in &row.cells {
            let cell_left = round_mm(cx);
            let cell_width = round_mm(hwpunit_to_mm(cell.width));
            let ri = cell.row as usize;
            let rs = if cell.row_span > 0 { cell.row_span as usize } else { 1 };

            if ri < row_positions.len() && ri + rs < row_positions.len() {
                let cell_top = row_positions[ri];
                let cell_height = row_positions[ri + rs] - cell_top;

                if cell.border_fill_id > 0 {
                    if let Some(bf) = resources.border_fills.get((cell.border_fill_id as usize).wrapping_sub(1)) {
                        if let Some(ref fill) = bf.fill {
                            // Solid 배경색 처리
                            if let Some(color) = extract_solid_color(fill) {
                                if color != 0 {
                                    let pattern_id = if let Some(existing) = color_to_pattern.get(&color) {
                                        existing.clone()
                                    } else {
                                        let id = format!("w_{:02}", *pattern_counter);
                                        *pattern_counter += 1;
                                        let r = (color >> 16) & 0xFF;
                                        let g = (color >> 8) & 0xFF;
                                        let b = color & 0xFF;
                                        pattern_defs.push_str(&format!(
                                            r#"<pattern id="{}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgb({},{},{})" /></pattern>"#,
                                            id, r, g, b
                                        ));
                                        color_to_pattern.insert(color, id.clone());
                                        id
                                    };

                                    fill_paths.push_str(&format!(
                                        r#"<path fill="url(#{})" d="M{},{}L{},{}L{},{}L{},{}L{},{}Z "></path>"#,
                                        pattern_id,
                                        round_mm(cell_left), round_mm(cell_top),
                                        round_mm(cell_left + cell_width), round_mm(cell_top),
                                        round_mm(cell_left + cell_width), round_mm(cell_top + cell_height),
                                        round_mm(cell_left), round_mm(cell_top + cell_height),
                                        round_mm(cell_left), round_mm(cell_top),
                                    ));
                                }
                            }
                        }
                    }
                }
            }

            cx += cell_width;
        }
    }

    (pattern_defs, fill_paths)
}

/// FillBrush에서 Solid 배경색 추출
fn extract_solid_color(fill: &hwp_model::resources::FillBrush) -> Option<u32> {
    match fill {
        hwp_model::resources::FillBrush::WinBrush { face_color, .. } => {
            face_color.filter(|&c| c != 0xFFFFFF)
        }
        _ => None,
    }
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

/// 셀 콘텐츠 높이 (raw mm, 마진 미포함) — line_segments에서 계산
fn compute_cell_content_height_raw(cell: &hwp_model::table::TableCell) -> f64 {
    let mut max_bottom: Option<i32> = None;
    for para in &cell.content.paragraphs {
        for seg in &para.line_segments {
            let bottom = seg.vertical_pos + seg.line_height;
            max_bottom = Some(max_bottom.map(|x: i32| x.max(bottom)).unwrap_or(bottom));
        }
    }
    max_bottom.map(|b| hwpunit_to_mm(b)).unwrap_or(0.0)
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
