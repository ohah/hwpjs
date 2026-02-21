#![deny(clippy::all)]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use hwp_core::HwpParser;
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

/// Convert HWP file to JSON
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
///
/// # Returns
/// Parsed HWP document as JSON string
#[napi]
pub fn to_json(data: Buffer) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    // Convert to JSON
    serde_json::to_string(&document)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize to JSON: {}", e)))
}

/// Image format option for markdown conversion
/// 마크다운 변환 시 이미지 형식 옵션
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    /// Base64 data URI embedded directly in markdown
    /// 마크다운에 base64 데이터 URI를 직접 포함
    Base64,
    /// Image data as separate blob array
    /// 이미지를 별도 blob 배열로 반환
    Blob,
}

/// Markdown conversion options
#[napi(object)]
pub struct ToMarkdownOptions {
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    /// 이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
    pub image_output_dir: Option<String>,
    /// Image format: 'base64' to embed base64 data URI directly in markdown, 'blob' to return as separate ImageData array (default: 'blob')
    /// 이미지 형식: 'base64'는 마크다운에 base64 데이터 URI를 직접 포함, 'blob'은 별도 ImageData 배열로 반환 (기본값: 'blob')
    pub image: Option<String>,
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

/// Markdown conversion result
#[napi(object)]
pub struct ToMarkdownResult {
    /// Markdown string with image references (e.g., "![이미지](image-0)")
    /// 이미지 참조가 포함된 마크다운 문자열 (예: "![이미지](image-0)")
    pub markdown: String,
    /// Extracted image data
    /// 추출된 이미지 데이터
    pub images: Vec<ImageData>,
}

/// Convert HWP file to Markdown format
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
/// * `options` - Optional markdown conversion options
///
/// # Returns
/// ToMarkdownResult containing markdown string and image data
#[napi]
pub fn to_markdown(
    data: Buffer,
    options: Option<ToMarkdownOptions>,
) -> Result<ToMarkdownResult, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    // Determine image format option (default: 'blob')
    let image_format = options
        .as_ref()
        .and_then(|o| o.image.as_ref())
        .map(|s| s.to_lowercase())
        .map(|s| match s.as_str() {
            "base64" => ImageFormat::Base64,
            "blob" => ImageFormat::Blob,
            _ => ImageFormat::Blob, // Default to blob for invalid values
        })
        .unwrap_or(ImageFormat::Blob);

    // Build markdown options
    let markdown_options = hwp_core::viewer::markdown::MarkdownOptions {
        image_output_dir: None, // Force base64 mode for internal processing
        use_html: options.as_ref().and_then(|o| o.use_html),
        include_version: options.as_ref().and_then(|o| o.include_version),
        include_page_info: options.as_ref().and_then(|o| o.include_page_info),
    };

    // Convert to markdown with base64 images
    let mut markdown = document.to_markdown(&markdown_options);

    // Extract images from BinData
    let mut images = Vec::new();

    match image_format {
        ImageFormat::Base64 => {
            // For base64 format, we need to ensure all image placeholders are replaced with base64 URIs
            // to_markdown should already generate base64 URIs, but we'll make sure by replacing any placeholders
            for (index, bin_item) in document.bin_data.items.iter().enumerate() {
                let mime_type = get_mime_type_from_bindata_id(&document, bin_item.index);
                let base64_data_uri = format!("data:{};base64,{}", mime_type, bin_item.data);
                let image_id = format!("image-{}", index);

                // Replace any placeholder with base64 URI
                let placeholder_pattern = format!("![이미지]({})", image_id);
                if markdown.contains(&placeholder_pattern) {
                    markdown = markdown.replace(
                        &placeholder_pattern,
                        &format!("![이미지]({})", base64_data_uri),
                    );
                }

                // Also check if there's already a base64 URI and ensure it's correct
                // (This handles the case where to_markdown already generated base64)
                // No need to do anything if base64 is already there
            }
            // Don't add to images array for base64 format
        }
        ImageFormat::Blob => {
            // Extract all images and replace base64 URIs with placeholders
            for (index, bin_item) in document.bin_data.items.iter().enumerate() {
                // Get extension and mime type from bin_data_records
                let extension = get_extension_from_bindata_id(&document, bin_item.index);
                let mime_type = get_mime_type_from_bindata_id(&document, bin_item.index);
                let base64_data_uri = format!("data:{};base64,{}", mime_type, bin_item.data);
                let image_id = format!("image-{}", index);

                // Decode base64 data for blob format
                let image_data = STANDARD.decode(&bin_item.data).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to decode base64 image data: {}", e))
                })?;

                images.push(ImageData {
                    id: image_id.clone(),
                    data: Buffer::from(image_data),
                    format: extension,
                });

                // Replace base64 data URIs in markdown with placeholders
                // Pattern: ![이미지](data:image/...;base64,...)
                let pattern = format!("![이미지]({})", base64_data_uri);
                let replacement = format!("![이미지]({})", image_id);
                markdown = markdown.replace(&pattern, &replacement);

                // Also handle cases where the pattern might be split across lines or have different formatting
                let pattern2 = format!(
                    "![이미지]({})",
                    base64_data_uri.replace("(", "\\(").replace(")", "\\)")
                );
                markdown = markdown.replace(&pattern2, &replacement);
            }
        }
    }

    Ok(ToMarkdownResult { markdown, images })
}

/// Get file extension from BinData ID
fn get_extension_from_bindata_id(
    document: &hwp_core::HwpDocument,
    bindata_id: hwp_core::WORD,
) -> String {
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
fn get_mime_type_from_bindata_id(
    document: &hwp_core::HwpDocument,
    bindata_id: hwp_core::WORD,
) -> String {
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

/// HTML conversion options
#[napi(object)]
pub struct ToHtmlOptions {
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    /// 이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
    pub image_output_dir: Option<String>,
    /// Directory path where HTML file is saved (used for calculating relative image paths)
    /// HTML 파일이 저장되는 디렉토리 경로 (이미지 상대 경로 계산에 사용)
    pub html_output_dir: Option<String>,
    /// Whether to include version information
    /// 버전 정보 포함 여부
    pub include_version: Option<bool>,
    /// Whether to include page information
    /// 페이지 정보 포함 여부
    pub include_page_info: Option<bool>,
    /// CSS class prefix (default: "" - noori.html style)
    /// CSS 클래스 접두사 (기본값: "" - noori.html 스타일)
    pub css_class_prefix: Option<String>,
}

/// Convert HWP file to HTML format
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
/// * `options` - Optional HTML conversion options
///
/// # Returns
/// HTML string representation of the document
#[napi]
pub fn to_html(data: Buffer, options: Option<ToHtmlOptions>) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    // Build HTML options
    let html_options = hwp_core::viewer::html::HtmlOptions {
        image_output_dir: options.as_ref().and_then(|o| o.image_output_dir.clone()),
        html_output_dir: options.as_ref().and_then(|o| o.html_output_dir.clone()),
        include_version: options.as_ref().and_then(|o| o.include_version),
        include_page_info: options.as_ref().and_then(|o| o.include_page_info),
        css_class_prefix: options
            .as_ref()
            .and_then(|o| o.css_class_prefix.clone())
            .unwrap_or_default(),
    };

    // Convert to HTML
    let html = document.to_html(&html_options);

    Ok(html)
}

/// PDF conversion options
#[napi(object)]
pub struct ToPdfOptions {
    /// Directory path containing TTF/OTF font files (e.g. LiberationSans). Required for PDF export.
    /// TTF/OTF 폰트 파일이 있는 디렉토리 경로 (예: LiberationSans). PDF 변환에 필요합니다.
    pub font_dir: Option<String>,
    /// Whether to embed images in PDF (default: true)
    /// PDF에 이미지 임베드 여부 (기본값: true)
    pub embed_images: Option<bool>,
}

/// Convert HWP file to PDF format
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
/// * `options` - Optional PDF conversion options (font_dir recommended)
///
/// # Returns
/// PDF file content as Buffer
#[napi]
pub fn to_pdf(data: Buffer, options: Option<ToPdfOptions>) -> Result<Buffer, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    let document = parser.parse(&data_vec).map_err(napi::Error::from_reason)?;

    let pdf_options = hwp_core::viewer::PdfOptions {
        font_dir: options
            .as_ref()
            .and_then(|o| o.font_dir.as_ref())
            .map(|s| std::path::PathBuf::from(s)),
        embed_images: options.as_ref().and_then(|o| o.embed_images).unwrap_or(true),
    };

    let pdf_bytes = document.to_pdf(&pdf_options);
    Ok(Buffer::from(pdf_bytes))
}

/// Extract FileHeader from HWP file as JSON
///
/// # Arguments
/// * `data` - Byte array containing HWP file data (Buffer or Uint8Array)
///
/// # Returns
/// FileHeader as JSON string
#[napi]
pub fn file_header(data: Buffer) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let data_vec: Vec<u8> = data.into();
    parser
        .parse_fileheader_json(&data_vec)
        .map_err(napi::Error::from_reason)
}
