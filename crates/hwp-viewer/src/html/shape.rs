use super::{styles, table};
use crate::RenderOptions;
use hwp_model::document::Document;
use hwp_model::shape::*;

/// ShapeObject → HTML
pub fn render_shape_object(
    obj: &ShapeObject,
    document: &Document,
    options: &RenderOptions,
) -> String {
    match obj {
        ShapeObject::Table(t) => table::render_table(t, document, options),
        ShapeObject::Picture(p) => render_picture(p, document, options),
        ShapeObject::Line(l) => render_line(l),
        ShapeObject::Rectangle(r) => render_rect(r, document, options),
        ShapeObject::Ellipse(_) => String::new(), // TODO
        ShapeObject::Arc(_) => String::new(),
        ShapeObject::Polygon(_) => String::new(),
        ShapeObject::Curve(_) => String::new(),
        ShapeObject::ConnectLine(_) => String::new(),
        ShapeObject::TextArt(t) => render_textart(t),
        ShapeObject::Container(c) => render_container(c, document, options),
        ShapeObject::Ole(_) => String::new(),
        ShapeObject::Equation(eq) => render_equation(eq),
        ShapeObject::Chart(_) => String::new(),
        ShapeObject::Video(v) => render_video(v),
    }
}

fn render_picture(pic: &Picture, document: &Document, options: &RenderOptions) -> String {
    let width_mm = styles::hwpunit_to_mm(pic.common.size.width);
    let height_mm = styles::hwpunit_to_mm(pic.common.size.height);

    // 이미지 소스 찾기
    let src = if options.inline_images {
        find_image_base64(document, &pic.img.binary_item_id)
    } else {
        Some(pic.img.binary_item_id.clone())
    };

    match src {
        Some(ref s) => {
            let mut style = format!("width:{}mm;height:{}mm;", width_mm, height_mm);

            // 글자처럼 취급이 아닌 경우 absolute 배치
            if !pic.common.position.treat_as_char {
                let top = styles::hwpunit_to_mm(pic.common.position.vert_offset);
                let left = styles::hwpunit_to_mm(pic.common.position.horz_offset);
                style.push_str(&format!("position:absolute;top:{}mm;left:{}mm;", top, left));
            }

            format!(
                "<img class=\"hwp-image\" src=\"{}\" style=\"{}\" alt=\"\">\n",
                s, style
            )
        }
        None => format!(
            "<div class=\"hwp-image\" style=\"width:{}mm;height:{}mm;background:#eee;\"></div>\n",
            width_mm, height_mm
        ),
    }
}

fn find_image_base64(document: &Document, item_id: &str) -> Option<String> {
    document
        .binaries
        .items
        .iter()
        .find(|b| b.id == item_id)
        .map(|b| {
            let mime = match b.format {
                hwp_model::document::ImageFormat::Png => "image/png",
                hwp_model::document::ImageFormat::Jpg => "image/jpeg",
                hwp_model::document::ImageFormat::Gif => "image/gif",
                hwp_model::document::ImageFormat::Bmp => "image/bmp",
                hwp_model::document::ImageFormat::Svg => "image/svg+xml",
                _ => "image/png",
            };
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD.encode(&b.data);
            format!("data:{};base64,{}", mime, encoded)
        })
}

fn render_line(line: &LineObject) -> String {
    let width_mm = styles::hwpunit_to_mm(line.common.size.width);
    let height_mm = styles::hwpunit_to_mm(line.common.size.height);
    let color = line
        .line_shape
        .color
        .map(|c| format!("#{:06x}", c))
        .unwrap_or_else(|| "#000000".to_string());
    let thickness = styles::hwpunit_to_mm(line.line_shape.width);

    format!(
        "<svg class=\"hwp-shape\" width=\"{}mm\" height=\"{}mm\" style=\"overflow:visible;\">\
         <line x1=\"0\" y1=\"0\" x2=\"100%\" y2=\"100%\" \
         stroke=\"{}\" stroke-width=\"{}mm\"/></svg>\n",
        width_mm, height_mm, color, thickness
    )
}

fn render_rect(rect: &RectObject, document: &Document, options: &RenderOptions) -> String {
    let width_mm = styles::hwpunit_to_mm(rect.common.size.width);
    let height_mm = styles::hwpunit_to_mm(rect.common.size.height);

    let mut style = format!("width:{}mm;height:{}mm;", width_mm, height_mm);

    // 배경색
    if let Some(hwp_model::resources::FillBrush::WinBrush { face_color, .. }) = rect.fill.as_ref() {
        if let Some(ref c) = styles::color_to_css(*face_color) {
            style.push_str(&format!("background-color:{};", c));
        }
    }

    // 테두리
    let border_color = rect
        .line_shape
        .color
        .map(|c| format!("#{:06x}", c))
        .unwrap_or_else(|| "#000000".to_string());
    if !matches!(rect.line_shape.style, hwp_model::types::LineType1::None) {
        let w = styles::hwpunit_to_mm(rect.line_shape.width);
        style.push_str(&format!("border:{}mm solid {};", w, border_color));
    }

    let mut html = format!("<div class=\"hwp-shape\" style=\"{}\">\n", style);

    // drawText (글상자)
    if let Some(ref dt) = rect.draw_text {
        for para in &dt.paragraphs {
            html.push_str(&super::render_paragraph(para, document, options));
        }
    }

    html.push_str("</div>\n");

    // 캡션
    if let Some(ref caption) = rect.common.caption {
        html.push_str("<div class=\"hwp-caption\">");
        for para in &caption.content.paragraphs {
            html.push_str(&super::render_paragraph(para, document, options));
        }
        html.push_str("</div>\n");
    }

    html
}

fn render_textart(ta: &TextArtObject) -> String {
    format!(
        "<div class=\"hwp-shape hwp-textart\" style=\"font-family:'{}';\">{}</div>\n",
        ta.font_name.as_deref().unwrap_or(""),
        super::escape_html(&ta.text)
    )
}

fn render_container(
    container: &ContainerObject,
    document: &Document,
    options: &RenderOptions,
) -> String {
    let mut html = String::from("<div class=\"hwp-container\">\n");
    for child in &container.children {
        html.push_str(&render_shape_object(child, document, options));
    }
    html.push_str("</div>\n");
    html
}

fn render_equation(eq: &EquationObject) -> String {
    format!(
        "<div class=\"hwp-equation\"><code>{}</code></div>\n",
        super::escape_html(&eq.script)
    )
}

fn render_video(video: &VideoObject) -> String {
    if let Some(ref tag) = video.tag {
        // 웹 비디오 (iframe)
        format!("<div class=\"hwp-video\">{}</div>\n", tag)
    } else {
        "<div class=\"hwp-video\">[Video]</div>\n".to_string()
    }
}
