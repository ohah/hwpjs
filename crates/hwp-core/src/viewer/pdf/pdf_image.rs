use crate::document::HwpDocument;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use printpdf::{Image, ImageTransform, Mm, PdfLayerReference};

/// Base64 입력 최대 길이 (메모리 DoS 방지).
const MAX_BASE64_INPUT_LEN: usize = 16 * 1024 * 1024; // 16 MiB
/// 디코딩된 이미지 바이트 최대 길이 (메모리 DoS 방지).
const MAX_IMAGE_DECODED_LEN: usize = 12 * 1024 * 1024; // 12 MiB

/// BinData 항목용 Base64 디코딩 (공백·줄바꿈 무시).
fn decode_bindata_base64(input: &[u8]) -> Result<Vec<u8>, base64::DecodeError> {
    STANDARD.decode(input).or_else(|_| {
        let stripped: Vec<u8> = input
            .iter()
            .copied()
            .filter(|&b| !b.is_ascii_whitespace())
            .collect();
        STANDARD.decode(&stripped)
    })
}

/// BinData에서 이미지를 디코딩. 반환: (DynamicImage, 원본 폭, 원본 높이)
pub fn decode_bindata_image(
    document: &HwpDocument,
    bindata_id: u16,
    embed_images: bool,
) -> Option<(image::DynamicImage, u32, u32)> {
    if !embed_images {
        return None;
    }
    let item = document
        .bin_data
        .items
        .iter()
        .find(|i| i.index == bindata_id)?;
    if item.data.len() > MAX_BASE64_INPUT_LEN {
        return None;
    }
    let decoded = decode_bindata_base64(item.data.as_bytes()).ok()?;
    if decoded.len() > MAX_IMAGE_DECODED_LEN {
        return None;
    }
    let dynamic = image::io::Reader::new(std::io::Cursor::new(&decoded))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;
    let w = dynamic.width();
    let h = dynamic.height();
    let opaque = dynamic.to_rgb8();
    let dynamic_opaque = image::DynamicImage::ImageRgb8(opaque);
    Some((dynamic_opaque, w, h))
}

/// 이미지를 PDF 레이어에 배치
pub fn render_image(
    layer: &PdfLayerReference,
    dynamic_img: &image::DynamicImage,
    x_mm: f64,
    y_mm: f64,
    width_mm: f64,
    height_mm: f64,
) {
    let pdf_image = Image::from_dynamic_image(dynamic_img);
    let dpi = 300.0_f32;
    let orig_w_pt = dynamic_img.width() as f32 * 72.0 / dpi;
    let orig_h_pt = dynamic_img.height() as f32 * 72.0 / dpi;
    let target_w_pt = width_mm as f32 * 2.8346;
    let target_h_pt = height_mm as f32 * 2.8346;

    let scale_x = if orig_w_pt > 0.0 {
        target_w_pt / orig_w_pt
    } else {
        1.0
    };
    let scale_y = if orig_h_pt > 0.0 {
        target_h_pt / orig_h_pt
    } else {
        1.0
    };

    let transform = ImageTransform {
        translate_x: Some(Mm(x_mm as f32)),
        translate_y: Some(Mm(y_mm as f32)),
        scale_x: Some(scale_x),
        scale_y: Some(scale_y),
        dpi: Some(dpi),
        ..Default::default()
    };
    pdf_image.add_to_layer(layer.clone(), transform);
}
