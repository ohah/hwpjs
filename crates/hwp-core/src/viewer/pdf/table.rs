use crate::document::bodytext::{ParagraphRecord, Table};
use crate::document::HwpDocument;
use printpdf::*;

use super::font::PdfFonts;
use super::pdf_image::{decode_bindata_image, render_image};
use super::text::{render_text_segments, split_text_segments};
use super::PdfOptions;

/// 테이블의 열 너비를 mm 단위로 계산 (셀 width에서 추출)
fn col_widths_mm(table: &Table) -> Vec<f64> {
    let cols = table.attributes.col_count as usize;
    if cols == 0 {
        return Vec::new();
    }

    let mut widths = vec![0.0_f64; cols];
    for cell in &table.cells {
        let c = cell.cell_attributes.col_address as usize;
        let r = cell.cell_attributes.row_address as usize;
        if r == 0 && c < cols {
            let w = cell.cell_attributes.width.to_mm();
            if w > 0.0 {
                widths[c] = w;
            }
        }
    }

    let total: f64 = widths.iter().sum();
    if total < 1.0 {
        return vec![150.0 / cols as f64; cols];
    }
    let zero_count = widths.iter().filter(|&&w| w < 0.1).count();
    if zero_count > 0 {
        let avg = total / (cols - zero_count).max(1) as f64;
        for w in &mut widths {
            if *w < 0.1 {
                *w = avg;
            }
        }
    }

    widths
}

/// content_width에 맞춰 스케일링된 열 너비 반환
fn scaled_col_widths(table: &Table, content_width_mm: f64) -> Vec<f64> {
    let raw = col_widths_mm(table);
    let total: f64 = raw.iter().sum();
    if total <= 0.0 || total <= content_width_mm {
        return raw;
    }
    let scale = content_width_mm / total;
    raw.iter().map(|w| w * scale).collect()
}

/// 테이블의 행 높이를 mm 단위로 계산 (셀 속성 + 이미지 크기 고려)
fn row_heights_mm(table: &Table, document: &HwpDocument, embed_images: bool) -> Vec<f64> {
    let rows = table.attributes.row_count as usize;
    let mut heights = vec![6.0_f64; rows]; // 기본 6mm

    for cell in &table.cells {
        let r = cell.cell_attributes.row_address as usize;
        if r < rows {
            // cell_attributes.height 사용
            let h = cell.cell_attributes.height.to_mm();
            if h > 0.0 && h < 500.0 && h > heights[r] {
                heights[r] = h;
            }

            // 셀 내 이미지 높이 계산 (border_rectangle 기반)
            if embed_images {
                let img_h = estimate_cell_image_height(cell, document);
                if img_h > heights[r] {
                    heights[r] = img_h;
                }
            }
        }
    }
    heights
}

/// 셀 내 이미지 총 높이 추정 (border_rectangle 기반)
fn estimate_cell_image_height(
    cell: &crate::document::bodytext::TableCell,
    _document: &HwpDocument,
) -> f64 {
    let mut total_h = 0.0;
    for para in &cell.paragraphs {
        total_h += estimate_records_image_height(&para.records);
    }
    total_h
}

fn estimate_records_image_height(records: &[ParagraphRecord]) -> f64 {
    let mut h = 0.0;
    for record in records {
        match record {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let (_, hwp_h) = picture_size_hwpunit(shape_component_picture);
                if hwp_h > 0 {
                    h += hwp_h as f64 / 7200.0 * 25.4 + 1.0;
                }
            }
            ParagraphRecord::ShapeComponent { children, .. } => {
                h += estimate_records_image_height(children);
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs,
                ..
            } => {
                h += estimate_records_image_height(children);
                for para in paragraphs {
                    h += estimate_records_image_height(&para.records);
                }
            }
            _ => {}
        }
    }
    h
}

/// 테이블 렌더링 (테두리 + 셀 텍스트 + 이미지). 반환값: 테이블 전체 높이(mm)
pub fn render_table(
    layer: &PdfLayerReference,
    table: &Table,
    document: &HwpDocument,
    fonts: &PdfFonts,
    options: &PdfOptions,
    origin_x_mm: f64,
    origin_y_mm: f64,
    content_width_mm: f64,
) -> f64 {
    let rows = table.attributes.row_count as usize;
    let cols = table.attributes.col_count as usize;
    if rows == 0 || cols == 0 {
        return 0.0;
    }

    let col_ws = scaled_col_widths(table, content_width_mm);
    let row_hs = row_heights_mm(table, document, options.embed_images);
    let total_height: f64 = row_hs.iter().sum();
    let total_width: f64 = col_ws.iter().sum();

    // 열 x 오프셋
    let mut col_x_offsets = vec![0.0_f64];
    for w in &col_ws {
        col_x_offsets.push(col_x_offsets.last().unwrap() + w);
    }

    // 행 y 오프셋 (위에서 아래로)
    let mut row_y_offsets = vec![0.0_f64];
    for h in &row_hs {
        row_y_offsets.push(row_y_offsets.last().unwrap() + h);
    }

    // 테두리
    layer.set_outline_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
    layer.set_outline_thickness(0.5);

    // 가로선
    for i in 0..=rows {
        let y = origin_y_mm - row_y_offsets[i.min(row_y_offsets.len() - 1)];
        let points = vec![
            (Point::new(Mm(origin_x_mm as f32), Mm(y as f32)), false),
            (
                Point::new(Mm((origin_x_mm + total_width) as f32), Mm(y as f32)),
                false,
            ),
        ];
        layer.add_line(Line {
            points,
            is_closed: false,
        });
    }

    // 세로선
    for j in 0..=cols {
        let x = origin_x_mm + col_x_offsets[j.min(col_x_offsets.len() - 1)];
        let points = vec![
            (Point::new(Mm(x as f32), Mm(origin_y_mm as f32)), false),
            (
                Point::new(Mm(x as f32), Mm((origin_y_mm - total_height) as f32)),
                false,
            ),
        ];
        layer.add_line(Line {
            points,
            is_closed: false,
        });
    }

    // 셀 콘텐츠 렌더링 (텍스트 + 이미지)
    for cell in &table.cells {
        let r = cell.cell_attributes.row_address as usize;
        let c = cell.cell_attributes.col_address as usize;
        if r >= rows || c >= cols {
            continue;
        }

        let cell_x = origin_x_mm + col_x_offsets[c];
        let cell_y = origin_y_mm - row_y_offsets[r];
        let cell_w = if c < col_ws.len() { col_ws[c] } else { 30.0 };
        let cell_h = if r < row_hs.len() { row_hs[r] } else { 6.0 };
        let pad = 1.0;
        let text_x = cell_x + pad;
        let mut content_y = cell_y - pad - 3.0;

        for para in &cell.paragraphs {
            // 텍스트 렌더링
            let (text, char_shapes) = crate::viewer::html::text::extract_text_and_shapes(para);
            if !text.is_empty() {
                let segments = split_text_segments(&text, &char_shapes, document);
                let cell_font_h = if segments.is_empty() {
                    10.0 * 0.3528
                } else {
                    segments[0].style.font_size_pt * 0.3528
                };
                let cell_line_h = cell_font_h * 1.6;
                let used_h = render_text_segments(
                    layer,
                    &segments,
                    fonts,
                    text_x,
                    content_y,
                    cell_w - pad * 2.0,
                    crate::document::docinfo::para_shape::ParagraphAlignment::Left,
                    0.0,
                    cell_line_h,
                );
                content_y -= used_h.max(5.0);
            }

            // 셀 내 이미지 렌더링 (ShapeComponentPicture, ShapeComponent 내부 포함)
            render_cell_images(
                &para.records,
                layer,
                document,
                options,
                cell_x + pad,
                &mut content_y,
                cell_w - pad * 2.0,
                cell_h - pad * 2.0,
            );
        }
    }

    total_height
}

/// ShapeComponentPicture에서 크기(HWPUNIT) 추출.
/// border_rectangle가 유효하면 사용, 높이가 0이면 crop_rectangle 폴백.
fn picture_size_hwpunit(scp: &crate::document::bodytext::ShapeComponentPicture) -> (i32, i32) {
    let w = (scp.border_rectangle_x.right - scp.border_rectangle_x.left).abs();
    let mut h = (scp.border_rectangle_y.bottom - scp.border_rectangle_y.top).abs();
    if h == 0 {
        // crop_rectangle 폴백
        h = (scp.crop_rectangle.bottom - scp.crop_rectangle.top).abs();
    }
    if w == 0 {
        let w2 = (scp.crop_rectangle.right - scp.crop_rectangle.left).abs();
        return (w2, h);
    }
    (w, h)
}

/// 셀 내 이미지 재귀 렌더링. max_w는 셀 너비, max_h는 셀 높이 제한.
#[allow(clippy::too_many_arguments)]
fn render_cell_images(
    records: &[ParagraphRecord],
    layer: &PdfLayerReference,
    document: &HwpDocument,
    options: &PdfOptions,
    x_mm: f64,
    y_mm: &mut f64,
    max_w: f64,
    max_h: f64,
) {
    for record in records {
        match record {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                if let Some((img, orig_w, orig_h)) =
                    decode_bindata_image(document, bindata_id, options.embed_images)
                {
                    // border_rectangle에서 크기 추출, 0이면 crop_rectangle 폴백
                    let scp = shape_component_picture;
                    let (hwp_w, hwp_h) = picture_size_hwpunit(scp);

                    let (mut img_w, mut img_h) = if hwp_w > 0 && hwp_h > 0 {
                        let w_mm = hwp_w as f64 / 7200.0 * 25.4;
                        let h_mm = hwp_h as f64 / 7200.0 * 25.4;
                        (w_mm, h_mm)
                    } else {
                        let aspect = orig_h as f64 / orig_w.max(1) as f64;
                        (max_w, max_w * aspect)
                    };

                    // 셀 영역에 맞춤 (비율 유지)
                    if img_w > max_w {
                        let scale = max_w / img_w;
                        img_w = max_w;
                        img_h *= scale;
                    }
                    if img_h > max_h && max_h > 0.0 {
                        let scale = max_h / img_h;
                        img_h = max_h;
                        img_w *= scale;
                    }

                    render_image(layer, &img, x_mm, *y_mm - img_h, img_w, img_h);
                    *y_mm -= img_h + 1.0;
                }
            }
            ParagraphRecord::ShapeComponent { children, .. } => {
                render_cell_images(children, layer, document, options, x_mm, y_mm, max_w, max_h);
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs,
                ..
            } => {
                render_cell_images(children, layer, document, options, x_mm, y_mm, max_w, max_h);
                for para in paragraphs {
                    render_cell_images(
                        &para.records,
                        layer,
                        document,
                        options,
                        x_mm,
                        y_mm,
                        max_w,
                        max_h,
                    );
                }
            }
            _ => {}
        }
    }
}

/// 테이블 예상 높이(mm) 사전 계산 (페이지 넘김 판단용)
pub fn estimate_table_height(table: &Table, document: &HwpDocument, embed_images: bool) -> f64 {
    let row_hs = row_heights_mm(table, document, embed_images);
    row_hs.iter().sum()
}

/// 테이블 요약 문자열 (스냅샷용)
pub fn table_summary(table: &Table) -> String {
    let r = table.attributes.row_count;
    let c = table.attributes.col_count;
    let col_ws = col_widths_mm(table);
    let cols_str: Vec<String> = col_ws.iter().map(|w| format!("{:.0}mm", w)).collect();
    format!("{}x{} (cols: {})", r, c, cols_str.join(","))
}
