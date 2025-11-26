/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
mod control;
mod table;

use crate::document::bodytext::ControlChar;
use crate::document::{BinDataRecord, ColumnDivideType, HwpDocument, Paragraph, ParagraphRecord};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::Path;

pub use control::convert_control_to_markdown;
pub use table::convert_table_to_markdown;

/// Convert HWP document to Markdown format
/// HWP 문서를 마크다운 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
/// * `image_output_dir` - Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
///                        이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
///
/// # Returns / 반환값
/// Markdown string representation of the document / 문서의 마크다운 문자열 표현
pub fn to_markdown(document: &HwpDocument, image_output_dir: Option<&str>) -> String {
    let mut lines = Vec::new();

    // Add document title with version info / 문서 제목과 버전 정보 추가
    lines.push("# HWP 문서".to_string());
    lines.push(String::new());
    lines.push(format!("**버전**: {}", format_version(document)));
    lines.push(String::new());

    // Convert body text to markdown / 본문 텍스트를 마크다운으로 변환
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // Check if we need to add page break / 페이지 나누기가 필요한지 확인
            let has_page_break = paragraph
                .para_header
                .column_divide_type
                .iter()
                .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

            if has_page_break && !lines.is_empty() {
                // Only add page break if we have content before / 이전에 내용이 있을 때만 페이지 구분선 추가
                let last_line = lines.last().map(|s| s.as_str()).unwrap_or("");
                if !last_line.is_empty() && last_line != "---" {
                    lines.push("---".to_string());
                    lines.push(String::new());
                }
            }

            // Convert paragraph to markdown (includes text and controls) / 문단을 마크다운으로 변환 (텍스트와 컨트롤 포함)
            let markdown = convert_paragraph_to_markdown(paragraph, document, image_output_dir);
            if !markdown.is_empty() {
                lines.push(markdown);
            }
        }
    }

    lines.join("\n")
}

/// Format version number to readable string
/// 의미 있는 텍스트인지 확인합니다. / Check if text is meaningful.
///
/// 제어 문자와 공백만 있는 텍스트는 의미 없다고 판단합니다.
/// Text containing only control characters and whitespace is considered meaningless.
///
/// # Arguments / 매개변수
/// * `text` - 제어 문자가 이미 제거된 텍스트 / Text with control characters already removed
/// * `control_positions` - 제어 문자 위치 정보 (원본 텍스트 기준) / Control character positions (based on original text)
///
/// # Returns / 반환값
/// 의미 있는 텍스트이면 `true`, 그렇지 않으면 `false` / `true` if meaningful, `false` otherwise
pub(crate) fn is_meaningful_text(text: &str, control_positions: &[(usize, u8)]) -> bool {
    // 제어 문자는 이미 파싱 단계에서 text에서 제거되었으므로,
    // 텍스트가 비어있지 않은지만 확인하면 됩니다.
    // Control characters are already removed from text during parsing,
    // so we only need to check if text is not empty.
    !text.trim().is_empty()
}

/// 버전 번호를 읽기 쉬운 문자열로 변환
fn format_version(document: &HwpDocument) -> String {
    let version = document.file_header.version;
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let build = version & 0xFF;

    format!("{}.{:02}.{:02}.{:02}", major, minor, patch, build)
}

/// Convert a paragraph to markdown
/// 문단을 마크다운으로 변환
fn convert_paragraph_to_markdown(
    paragraph: &Paragraph,
    document: &HwpDocument,
    image_output_dir: Option<&str>,
) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();

    // Process all records in order / 모든 레코드를 순서대로 처리
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText {
                text,
                control_char_positions,
                inline_control_params: _,
            } => {
                // 의미 있는 텍스트인지 확인 / Check if text is meaningful
                // 제어 문자는 이미 파싱 단계에서 제거되었으므로 텍스트를 그대로 사용 / Control characters are already removed during parsing, so use text as-is
                if is_meaningful_text(text, control_char_positions) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                }
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // 그림 개체를 마크다운 이미지로 변환 / Convert picture shape component to markdown image
                let bindata_id = shape_component_picture.picture_info.bindata_id;

                // BinData에서 해당 이미지 찾기 / Find image in BinData
                if let Some(bin_item) = document
                    .bin_data
                    .items
                    .iter()
                    .find(|item| item.index == bindata_id)
                {
                    let image_markdown = format_image_markdown(
                        document,
                        bindata_id,
                        &bin_item.data,
                        image_output_dir,
                    );
                    if !image_markdown.is_empty() {
                        parts.push(image_markdown);
                    }
                }
            }
            ParagraphRecord::CtrlHeader { header, children } => {
                // 컨트롤 헤더의 자식 레코드 처리 (레벨 2, 예: 테이블, 그림 등) / Process control header children (level 2, e.g., table, images, etc.)
                let mut has_table = false;
                let mut has_image = false;

                // 먼저 표가 있는지 확인 / First check if table exists
                for child in children.iter() {
                    if matches!(child, ParagraphRecord::Table { .. }) {
                        has_table = true;
                        break;
                    }
                }

                // 자식 레코드 처리 / Process children
                for child in children {
                    match child {
                        ParagraphRecord::Table { table } => {
                            // 테이블을 마크다운으로 변환 / Convert table to markdown
                            let table_md =
                                convert_table_to_markdown(table, document, image_output_dir);
                            if !table_md.is_empty() {
                                parts.push(table_md);
                                has_table = true;
                            }
                        }
                        ParagraphRecord::ShapeComponentPicture {
                            shape_component_picture,
                        } => {
                            // 표 안에 이미지가 있는 경우 표 셀에 이미 포함되므로 여기서는 표시만 함
                            // If image is in table, it's already included in table cell, so just mark it here
                            let bindata_id = shape_component_picture.picture_info.bindata_id;
                            // 표 안에 이미지가 있는지 확인하기 위해 has_image만 설정
                            // Only set has_image to check if image exists in table
                            if document
                                .bin_data
                                .items
                                .iter()
                                .any(|item| item.index == bindata_id)
                            {
                                has_image = true;
                            }
                            // 표 밖에 이미지를 출력하지 않음 (표 셀에 이미 포함됨)
                            // Don't output image outside table (already included in table cell)
                        }
                        ParagraphRecord::ListHeader { paragraphs, .. } => {
                            // ListHeader는 표 셀 내부의 문단들을 포함할 수 있음
                            // ListHeader can contain paragraphs inside table cells
                            // 표가 있는 경우, ListHeader의 paragraphs가 표 셀에 포함되는지 확인
                            // If table exists, check if ListHeader's paragraphs are included in table cells
                            if has_table {
                                // 표가 있으면 ListHeader는 표 셀의 일부이므로 건너뜀
                                // If table exists, ListHeader is part of table cell, so skip
                                // 이미지가 포함되어 있는지만 확인
                                // Only check if image is included
                                for para in paragraphs {
                                    let para_md = convert_paragraph_to_markdown(
                                        para,
                                        document,
                                        image_output_dir,
                                    );
                                    if para_md.contains("![이미지]") {
                                        has_image = true;
                                    }
                                }
                            } else {
                                // 표가 없으면 ListHeader의 paragraphs를 처리
                                // If no table, process ListHeader's paragraphs
                                for para in paragraphs {
                                    let para_md = convert_paragraph_to_markdown(
                                        para,
                                        document,
                                        image_output_dir,
                                    );
                                    if !para_md.is_empty() {
                                        // 이미지가 포함되어 있는지 확인 / Check if image is included
                                        if para_md.contains("![이미지]") {
                                            has_image = true;
                                        }
                                        // 이미지가 있든 없든 마크다운 추가 / Add markdown regardless of image
                                        parts.push(para_md);
                                    }
                                }
                            }
                        }
                        ParagraphRecord::CtrlHeader {
                            header: child_header,
                            children: child_children,
                        } => {
                            // 중첩된 CtrlHeader의 자식들을 재귀적으로 처리 / Recursively process nested CtrlHeader children
                            for grandchild in child_children {
                                match grandchild {
                                    ParagraphRecord::ListHeader { paragraphs, .. } => {
                                        // ListHeader는 표 셀 내부의 문단들을 포함할 수 있음
                                        // ListHeader can contain paragraphs inside table cells
                                        // 표가 있는 경우, ListHeader의 paragraphs가 표 셀에 포함되는지 확인
                                        // If table exists, check if ListHeader's paragraphs are included in table cells
                                        if has_table {
                                            // 표가 있으면 ListHeader는 표 셀의 일부이므로 건너뜀
                                            // If table exists, ListHeader is part of table cell, so skip
                                            // 이미지가 포함되어 있는지만 확인
                                            // Only check if image is included
                                            for para in paragraphs {
                                                let para_md = convert_paragraph_to_markdown(
                                                    para,
                                                    document,
                                                    image_output_dir,
                                                );
                                                if para_md.contains("![이미지]") {
                                                    has_image = true;
                                                }
                                            }
                                        } else {
                                            // 표가 없으면 ListHeader의 paragraphs를 처리
                                            // If no table, process ListHeader's paragraphs
                                            for para in paragraphs {
                                                let para_md = convert_paragraph_to_markdown(
                                                    para,
                                                    document,
                                                    image_output_dir,
                                                );
                                                if !para_md.is_empty() {
                                                    // 이미지가 포함되어 있는지 확인 / Check if image is included
                                                    if para_md.contains("![이미지]") {
                                                        has_image = true;
                                                    }
                                                    // 이미지가 있든 없든 마크다운 추가 / Add markdown regardless of image
                                                    parts.push(para_md);
                                                }
                                            }
                                        }
                                    }
                                    ParagraphRecord::ShapeComponentPicture {
                                        shape_component_picture,
                                    } => {
                                        // 표 안에 이미지가 있는 경우 표 셀에 이미 포함되므로 여기서는 표시만 함
                                        // If image is in table, it's already included in table cell, so just mark it here
                                        let bindata_id =
                                            shape_component_picture.picture_info.bindata_id;
                                        // 표 안에 이미지가 있는지 확인하기 위해 has_image만 설정
                                        // Only set has_image to check if image exists in table
                                        if document
                                            .bin_data
                                            .items
                                            .iter()
                                            .any(|item| item.index == bindata_id)
                                        {
                                            has_image = true;
                                        }
                                        // 표 밖에 이미지를 출력하지 않음 (표 셀에 이미 포함됨)
                                        // Don't output image outside table (already included in table cell)
                                    }
                                    _ => {
                                        // 기타 자식 레코드는 무시 / Ignore other child records
                                    }
                                }
                            }
                        }
                        _ => {
                            // 기타 자식 레코드는 무시 / Ignore other child records
                        }
                    }
                }
                // Convert control header to markdown / 컨트롤 헤더를 마크다운으로 변환
                // 표나 이미지가 이미 추출되었다면 메시지를 출력하지 않음 / Don't output message if table or image was already extracted
                let control_md = convert_control_to_markdown(header, has_table);
                if !control_md.is_empty() {
                    // 이미지가 있으면 메시지 부분만 제거 / Remove message part if image exists
                    if has_image && control_md.contains("[개체 내용은 추출되지 않았습니다]")
                    {
                        let header_info = control_md
                            .lines()
                            .take_while(|line| !line.contains("[개체 내용은 추출되지 않았습니다]"))
                            .collect::<Vec<_>>()
                            .join("\n");
                        if !header_info.trim().is_empty() {
                            parts.push(header_info);
                        }
                    } else {
                        parts.push(control_md);
                    }
                }
            }
            _ => {
                // Other record types (char shape, line seg, etc.) are formatting info
                // 기타 레코드 타입 (글자 모양, 줄 세그먼트 등)은 서식 정보
                // Skip for now, but could be used for styling in the future
                // 현재는 건너뛰지만, 향후 스타일링에 사용할 수 있음
            }
        }
    }

    parts.join("\n\n")
}

/// Get MIME type from BinData ID using bin_data_records
/// bin_data_records를 사용하여 BinData ID에서 MIME 타입 가져오기
fn get_mime_type_from_bindata_id(document: &HwpDocument, bindata_id: crate::types::WORD) -> String {
    // bin_data_records에서 EMBEDDING 타입의 extension 찾기 / Find extension from EMBEDDING type in bin_data_records
    for record in &document.doc_info.bin_data {
        match record {
            BinDataRecord::Embedding { embedding, .. } => {
                if embedding.binary_data_id == bindata_id {
                    return match embedding.extension.to_lowercase().as_str() {
                        "jpg" | "jpeg" => "image/jpeg",
                        "png" => "image/png",
                        "gif" => "image/gif",
                        "bmp" => "image/bmp",
                        _ => "image/jpeg", // 기본값 / default
                    }
                    .to_string();
                }
            }
            _ => {}
        }
    }
    // 기본값 / default
    "image/jpeg".to_string()
}

/// Get file extension from BinData ID using bin_data_records
/// bin_data_records를 사용하여 BinData ID에서 파일 확장자 가져오기
fn get_extension_from_bindata_id(document: &HwpDocument, bindata_id: crate::types::WORD) -> String {
    // bin_data_records에서 EMBEDDING 타입의 extension 찾기 / Find extension from EMBEDDING type in bin_data_records
    for record in &document.doc_info.bin_data {
        if let BinDataRecord::Embedding { embedding, .. } = record {
            if embedding.binary_data_id == bindata_id {
                return embedding.extension.clone();
            }
        }
    }
    // 기본값 / default
    "jpg".to_string()
}

/// Format image markdown - either as base64 data URI or file path
/// 이미지 마크다운 포맷 - base64 데이터 URI 또는 파일 경로
pub(crate) fn format_image_markdown(
    document: &HwpDocument,
    bindata_id: crate::types::WORD,
    base64_data: &str,
    image_output_dir: Option<&str>,
) -> String {
    match image_output_dir {
        Some(dir_path) => {
            // 이미지를 파일로 저장하고 파일 경로를 마크다운에 포함 / Save image as file and include file path in markdown
            match save_image_to_file(document, bindata_id, base64_data, dir_path) {
                Ok(file_path) => {
                    // 상대 경로로 변환 (images/ 디렉토리 포함) / Convert to relative path (include images/ directory)
                    let file_path_obj = Path::new(&file_path);
                    let file_name = file_path_obj
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&file_path);
                    // images/ 디렉토리 경로 포함 / Include images/ directory path
                    format!("![이미지](images/{})", file_name)
                }
                Err(e) => {
                    eprintln!("Failed to save image: {}", e);
                    // 실패 시 base64로 폴백 / Fallback to base64 on failure
                    let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
                    format!("![이미지](data:{};base64,{})", mime_type, base64_data)
                }
            }
        }
        None => {
            // base64 데이터 URI로 임베드 / Embed as base64 data URI
            let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
            format!("![이미지](data:{};base64,{})", mime_type, base64_data)
        }
    }
}

/// Save image to file from base64 data
/// base64 데이터에서 이미지를 파일로 저장
fn save_image_to_file(
    document: &HwpDocument,
    bindata_id: crate::types::WORD,
    base64_data: &str,
    dir_path: &str,
) -> Result<String, String> {
    // base64 디코딩 / Decode base64
    let image_data = STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // 파일명 생성 / Generate filename
    let extension = get_extension_from_bindata_id(document, bindata_id);
    let file_name = format!("BIN{:04X}.{}", bindata_id, extension);
    let file_path = Path::new(dir_path).join(&file_name);

    // 디렉토리 생성 / Create directory
    fs::create_dir_all(dir_path)
        .map_err(|e| format!("Failed to create directory '{}': {}", dir_path, e))?;

    // 파일 저장 / Save file
    fs::write(&file_path, &image_data)
        .map_err(|e| format!("Failed to write file '{}': {}", file_path.display(), e))?;

    Ok(file_path.to_string_lossy().to_string())
}
