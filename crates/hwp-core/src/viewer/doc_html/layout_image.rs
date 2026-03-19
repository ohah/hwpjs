/// Document 기반 이미지/도형 레이아웃 렌더러
/// 절대 좌표(mm) 기반 이미지 배치 (hsR div)
use super::styles::{hwpunit_to_mm, round_mm};
use crate::viewer::doc_utils;
use hwp_model::document::BinaryStore;
use hwp_model::shape::{Picture, ShapeCommon};

/// 이미지를 레이아웃 HTML로 렌더링
/// treat_as_char=true: hhi span (인라인)
/// treat_as_char=false: hsR div (절대 좌표)
pub fn render_layout_picture(pic: &Picture, binaries: &BinaryStore) -> String {
    let common = &pic.common;
    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));

    let img_src = get_image_src(&pic.img.binary_item_id, binaries);
    if img_src.is_empty() {
        return String::new();
    }

    if common.position.treat_as_char {
        // 인라인 이미지 (hhi span)
        format!(
            r#"<span class="hhi" style="width:{:.2}mm;height:{:.2}mm;background-image:url({});"></span>"#,
            width_mm, height_mm, img_src
        )
    } else {
        // 절대 좌표 이미지 (hsR div)
        let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
        let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));
        format!(
            r#"<div class="hsR" style="left:{:.2}mm;top:{:.2}mm;width:{:.2}mm;height:{:.2}mm;background-image:url({});"></div>"#,
            x_mm, y_mm, width_mm, height_mm, img_src
        )
    }
}

/// 이미지를 <img> 태그가 아닌 background-image data URI로 반환
fn get_image_src(binary_item_id: &str, binaries: &BinaryStore) -> String {
    if let Some(item) = doc_utils::find_binary_item(binary_item_id, binaries) {
        if item.data.is_empty() {
            return item.src.clone();
        }
        let mime = doc_utils::image_format_to_mime(&item.format);
        let b64 = {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(&item.data)
        };
        format!("data:{};base64,{}", mime, b64)
    } else {
        String::new()
    }
}

/// Rectangle을 SVG로 렌더링 (fill + line_shape 기반)
pub fn render_layout_rect_svg(rect: &hwp_model::shape::RectObject) -> String {
    let common = &rect.common;
    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    if width_mm <= 0.0 || height_mm <= 0.0 {
        return String::new();
    }

    let margin = 0.15;
    let vb_w = round_mm(width_mm + margin * 2.0);
    let vb_h = round_mm(height_mm + margin * 2.0);
    let pw = round_mm(width_mm - 0.12);
    let ph = round_mm(height_mm - 0.12);

    // 채우기
    let fill_attr = match &rect.fill {
        Some(hwp_model::resources::FillBrush::WinBrush { face_color, .. }) => {
            if let Some(c) = face_color {
                if *c != 0xFFFFFF && *c != 0 {
                    format!(
                        r#"fill="rgb({},{},{})""#,
                        (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF
                    )
                } else { "fill=\"none\"".to_string() }
            } else { "fill=\"none\"".to_string() }
        }
        _ => "fill=\"none\"".to_string(),
    };

    // 외곽선
    let line = &rect.line_shape;
    let stroke_color = line.color
        .filter(|&c| c != 0)
        .map(|c| format!("#{:02X}{:02X}{:02X}", (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF))
        .unwrap_or_else(|| "#000000".to_string());

    let dash = match line.style {
        hwp_model::types::LineType1::Dot => "stroke-dasharray:0.17,0.26;",
        hwp_model::types::LineType1::Dash => "stroke-dasharray:0.47,0.47,0.47,0,0.47,0.47,0.47,0;",
        hwp_model::types::LineType1::DashDot => "stroke-dasharray:1.86,0.52,0.17,0.52;",
        hwp_model::types::LineType1::DashDotDot => "stroke-dasharray:0.47,0.47,0.47,0,0.47,0.47,0.47,0;",
        hwp_model::types::LineType1::None => "stroke:none;",
        _ => "",
    };

    format!(
        r#"<div class="hsR" style="top:{y:.2}mm;left:{x:.2}mm;width:{w:.2}mm;height:{h:.2}mm;"><svg class="hs" viewBox="-{m} -{m} {vw} {vh}" style="left:-{m}mm;top:-{m}mm;width:{vw}mm;height:{vh}mm;"><path {fill} d="M0,0L{pw:.2},0L{pw:.2},{ph:.2}L0,{ph:.2}L0,0Z " style="stroke:{sc};stroke-linecap:butt;{da}stroke-width:0.12;"></path></svg></div>"#,
        y = y_mm, x = x_mm, w = width_mm, h = height_mm,
        m = margin, vw = vb_w, vh = vb_h,
        fill = fill_attr, pw = pw, ph = ph,
        sc = stroke_color, da = dash,
    )
}

/// Rectangle(draw_text=None)를 SVG 외곽선으로 렌더링 (하위 호환)
#[allow(dead_code)]
pub fn render_layout_rect_outline(common: &ShapeCommon) -> String {
    render_layout_rect_with_fill(common, None)
}

/// Rectangle을 SVG로 렌더링 (외곽선 + 선택적 배경색)
pub fn render_layout_rect_with_fill(
    common: &ShapeCommon,
    fill_color: Option<&str>,
) -> String {
    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    if width_mm <= 0.0 || height_mm <= 0.0 {
        return String::new();
    }

    let margin = 0.15;
    let vb_w = round_mm(width_mm + margin * 2.0);
    let vb_h = round_mm(height_mm + margin * 2.0);

    let fill_attr = fill_color
        .map(|c| format!(r#"fill="{}""#, c))
        .unwrap_or_else(|| "fill=\"none\"".to_string());

    format!(
        r#"<div class="hsR" style="top:{y:.2}mm;left:{x:.2}mm;width:{w:.2}mm;height:{h:.2}mm;"><svg class="hs" viewBox="-{m} -{m} {vw} {vh}" style="left:-{m}mm;top:-{m}mm;width:{vw}mm;height:{vh}mm;"><path {fill} d="M0,0L{pw:.2},0L{pw:.2},{ph:.2}L0,{ph:.2}L0,0Z " style="stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
        y = y_mm, x = x_mm, w = width_mm, h = height_mm,
        m = margin, vw = vb_w, vh = vb_h,
        fill = fill_attr,
        pw = round_mm(width_mm - 0.12), ph = round_mm(height_mm - 0.12),
    )
}

/// Line 도형을 SVG로 렌더링
pub fn render_layout_line(line: &hwp_model::shape::LineObject) -> String {
    let common = &line.common;
    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    if width_mm <= 0.0 && height_mm <= 0.0 {
        return String::new();
    }

    let margin = 0.15;
    let vb_w = round_mm(width_mm.max(0.3) + margin * 2.0);
    let vb_h = round_mm(height_mm.max(0.3) + margin * 2.0);

    let stroke_color = line
        .line_shape
        .color
        .filter(|&c| c != 0)
        .map(|c| {
            format!(
                "#{:02X}{:02X}{:02X}",
                (c >> 16) & 0xFF,
                (c >> 8) & 0xFF,
                c & 0xFF
            )
        })
        .unwrap_or_else(|| "#000000".to_string());

    let x1 = round_mm(hwpunit_to_mm(line.start_pt.x));
    let y1 = round_mm(hwpunit_to_mm(line.start_pt.y));
    let x2 = round_mm(hwpunit_to_mm(line.end_pt.x));
    let y2 = round_mm(hwpunit_to_mm(line.end_pt.y));

    format!(
        r#"<div class="hsR" style="top:{ly:.2}mm;left:{lx:.2}mm;width:{w:.2}mm;height:{h:.2}mm;"><svg class="hs" viewBox="-{m} -{m} {vw} {vh}" style="left:-{m}mm;top:-{m}mm;width:{vw}mm;height:{vh}mm;"><path d="M{x1},{y1} L{x2},{y2}" style="stroke:{sc};stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
        lx = x_mm, ly = y_mm, w = width_mm.max(0.3), h = height_mm.max(0.3),
        m = margin, vw = vb_w, vh = vb_h,
        x1 = x1, y1 = y1, x2 = x2, y2 = y2,
        sc = stroke_color,
    )
}

/// ShapeObject(Rectangle) 텍스트 박스를 레이아웃 HTML로 렌더링
pub fn render_layout_textbox(
    common: &ShapeCommon,
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
) -> String {
    use super::{flat_text, layout_line_segment};

    let width_mm = round_mm(hwpunit_to_mm(common.size.width));
    let height_mm = round_mm(hwpunit_to_mm(common.size.height));
    let x_mm = round_mm(hwpunit_to_mm(common.position.horz_offset));
    let y_mm = round_mm(hwpunit_to_mm(common.position.vert_offset));

    let mut html = format!(
        r#"<div class="hsT" style="left:{:.2}mm;top:{:.2}mm;width:{:.2}mm;height:{:.2}mm;">"#,
        x_mm, y_mm, width_mm, height_mm
    );

    for para in paragraphs {
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

    html.push_str("</div>");
    html
}
