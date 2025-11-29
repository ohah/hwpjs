#![deny(clippy::all)]

use hwp_core::HwpParser;
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Parse HWP file from byte array (Buffer or Uint8Array)
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
///
/// # Returns
/// Parsed HWP document as JSON string
#[napi]
pub fn parse_hwp(data: Buffer) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    // Convert to JSON
    serde_json::to_string(&document)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize to JSON: {}", e)))
}


/// Markdown conversion options
#[napi(object)]
pub struct ParseHwpToMarkdownOptions {
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    /// 이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
    pub image_output_dir: Option<String>,
    /// Whether to use HTML tags (if Some(true), use <br> tags in areas where line breaks are not possible, such as tables)
    /// HTML 태그 사용 여부 (Some(true)인 경우 테이블 등 개행 불가 영역에 <br> 태그 사용)
    pub use_html: Option<bool>,
    /// Whether to include version information
    /// 버전 정보 포함 여부
    pub include_version: Option<bool>,
    /// Whether to include page information
    /// 페이지 정보 포함 여부
    pub include_page_info: Option<bool>,
}

/// Image data structure
#[napi(object)]
pub struct ImageData {
    /// Image ID (e.g., "image-0")
    /// 이미지 ID (예: "image-0")
    pub id: String,
    /// Image data as Uint8Array
    /// 이미지 데이터 (Uint8Array)
    pub data: Buffer,
    /// Image format (e.g., "jpg", "png", "bmp")
    /// 이미지 형식 (예: "jpg", "png", "bmp")
    pub format: String,
}

/// Parse HWP to Markdown result
#[napi(object)]
pub struct ParseHwpToMarkdownResult {
    /// Markdown string with image references (e.g., "![이미지](image-0)")
    /// 이미지 참조가 포함된 마크다운 문자열 (예: "![이미지](image-0)")
    pub markdown: String,
    /// Extracted image data
    /// 추출된 이미지 데이터
    pub images: Vec<ImageData>,
}

/// Parse HWP file and convert to Markdown format
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
/// * `options` - Optional markdown conversion options
///
/// # Returns
/// ParseHwpToMarkdownResult containing markdown string and image data
#[napi]
pub fn parse_hwp_to_markdown(
    data: Buffer,
    options: Option<ParseHwpToMarkdownOptions>,
) -> Result<ParseHwpToMarkdownResult, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    // Build markdown options
    let markdown_options = hwp_core::viewer::markdown::MarkdownOptions {
        image_output_dir: None, // Force base64 mode
        use_html: options.as_ref().and_then(|o| o.use_html),
        include_version: options.as_ref().and_then(|o| o.include_version),
        include_page_info: options.as_ref().and_then(|o| o.include_page_info),
    };

    // Convert to markdown with base64 images (we'll replace them with placeholders)
    let mut markdown = document.to_markdown(&markdown_options);

    // Extract images from BinData and create mapping
    let mut images = Vec::new();
    let mut image_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for (index, bin_item) in document.bin_data.items.iter().enumerate() {
        // Get extension from bin_data_records
        let extension = get_extension_from_bindata_id(&document, bin_item.index);

        // Decode base64 data
        let image_data = STANDARD
            .decode(&bin_item.data)
            .map_err(|e| napi::Error::from_reason(format!("Failed to decode base64 image data: {}", e)))?;

        let image_id = format!("image-{}", index);

        // Create base64 data URI pattern that might appear in markdown
        let mime_type = get_mime_type_from_bindata_id(&document, bin_item.index);
        let base64_data_uri = format!("data:{};base64,{}", mime_type, bin_item.data);

        // Store mapping from base64 data URI to image ID
        image_map.insert(base64_data_uri.clone(), image_id.clone());

        images.push(ImageData {
            id: image_id,
            data: Buffer::from(image_data),
            format: extension,
        });
    }

    // Replace base64 data URIs in markdown with placeholders
    // Pattern: ![이미지](data:image/...;base64,...)
    for (base64_uri, image_id) in &image_map {
        let pattern = format!("![이미지]({})", base64_uri);
        let replacement = format!("![이미지]({})", image_id);
        markdown = markdown.replace(&pattern, &replacement);

        // Also handle cases where the pattern might be split across lines or have different formatting
        // Try with escaped parentheses
        let pattern2 = format!("![이미지]({})", base64_uri.replace("(", "\\(").replace(")", "\\)"));
        markdown = markdown.replace(&pattern2, &replacement);
    }

    Ok(ParseHwpToMarkdownResult { markdown, images })
}

/// Get file extension from BinData ID
fn get_extension_from_bindata_id(document: &hwp_core::HwpDocument, bindata_id: hwp_core::WORD) -> String {
    for record in &document.doc_info.bin_data {
        if let hwp_core::BinDataRecord::Embedding { embedding, .. } = record {
            if embedding.binary_data_id == bindata_id {
                return embedding.extension.clone();
            }
        }
    }
    "jpg".to_string()
}

/// Get MIME type from BinData ID
fn get_mime_type_from_bindata_id(document: &hwp_core::HwpDocument, bindata_id: hwp_core::WORD) -> String {
    for record in &document.doc_info.bin_data {
        if let hwp_core::BinDataRecord::Embedding { embedding, .. } = record {
            if embedding.binary_data_id == bindata_id {
                return match embedding.extension.to_lowercase().as_str() {
                    "jpg" | "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "bmp" => "image/bmp",
                    _ => "image/jpeg",
                }
                .to_string();
            }
        }
    }
    "image/jpeg".to_string()
}

/// Parse HWP file and return only FileHeader as JSON
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
///
/// # Returns
/// FileHeader as JSON string
#[napi]
pub fn parse_hwp_fileheader(data: Buffer) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    parser
        .parse_fileheader_json(&data_vec)
        .map_err(napi::Error::from_reason)
}
