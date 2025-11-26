/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
mod control;
mod table;

use crate::document::{BinDataRecord, ColumnDivideType, HwpDocument, Paragraph, ParagraphRecord};

pub use control::convert_control_to_markdown;
pub use table::convert_table_to_markdown;

/// Convert HWP document to Markdown format
/// HWP 문서를 마크다운 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
///
/// # Returns / 반환값
/// Markdown string representation of the document / 문서의 마크다운 문자열 표현
pub fn to_markdown(document: &HwpDocument) -> String {
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
            let markdown = convert_paragraph_to_markdown(paragraph, document);
            if !markdown.is_empty() {
                lines.push(markdown);
            }
        }
    }

    lines.join("\n")
}

/// Format version number to readable string
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
fn convert_paragraph_to_markdown(paragraph: &Paragraph, document: &HwpDocument) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();

    // Process all records in order / 모든 레코드를 순서대로 처리
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText { text } => {
                // Clean up control characters and normalize whitespace / 제어 문자 제거 및 공백 정규화
                let cleaned = text
                    .chars()
                    .filter(|c| {
                        // Keep printable characters and common whitespace / 출력 가능한 문자와 일반 공백 유지
                        c.is_whitespace() || !c.is_control()
                    })
                    .collect::<String>();

                if !cleaned.trim().is_empty() {
                    parts.push(cleaned.trim().to_string());
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
                    // base64 데이터를 마크다운 이미지 형식으로 출력 / Output base64 data as markdown image
                    // 확장자는 bin_data_records에서 찾을 수 있지만, 간단하게 jpeg로 가정
                    // Extension can be found from bin_data_records, but assume jpeg for simplicity
                    let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
                    let image_markdown =
                        format!("![이미지](data:{};base64,{})", mime_type, bin_item.data);
                    parts.push(image_markdown);
                }
            }
            ParagraphRecord::CtrlHeader { header, children } => {
                // 컨트롤 헤더의 자식 레코드 처리 (레벨 2, 예: 테이블, 그림 등) / Process control header children (level 2, e.g., table, images, etc.)
                let mut has_table = false;
                let mut has_image = false;
                // 먼저 자식 레코드를 처리하여 이미지나 테이블 찾기 / First process children to find images or tables
                for child in children {
                    match child {
                        ParagraphRecord::Table { table } => {
                            // 테이블을 마크다운으로 변환 / Convert table to markdown
                            let table_md = convert_table_to_markdown(table);
                            if !table_md.is_empty() {
                                parts.push(table_md);
                                has_table = true;
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
                                // base64 데이터를 마크다운 이미지 형식으로 출력 / Output base64 data as markdown image
                                let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
                                let image_markdown = format!(
                                    "![이미지](data:{};base64,{})",
                                    mime_type, bin_item.data
                                );
                                parts.push(image_markdown);
                                has_image = true;
                            }
                        }
                        ParagraphRecord::ListHeader { paragraphs, .. } => {
                            // ListHeader의 paragraphs를 재귀적으로 처리하여 이미지 찾기
                            // Recursively process ListHeader paragraphs to find images
                            for para in paragraphs {
                                let para_md = convert_paragraph_to_markdown(para, document);
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
                        ParagraphRecord::CtrlHeader {
                            header: child_header,
                            children: child_children,
                        } => {
                            // 중첩된 CtrlHeader의 자식들을 재귀적으로 처리 / Recursively process nested CtrlHeader children
                            for grandchild in child_children {
                                match grandchild {
                                    ParagraphRecord::ListHeader { paragraphs, .. } => {
                                        // ListHeader의 paragraphs를 재귀적으로 처리하여 이미지 찾기
                                        // Recursively process ListHeader paragraphs to find images
                                        for para in paragraphs {
                                            let para_md =
                                                convert_paragraph_to_markdown(para, document);
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
                                    ParagraphRecord::ShapeComponentPicture {
                                        shape_component_picture,
                                    } => {
                                        // 그림 개체를 마크다운 이미지로 변환 / Convert picture shape component to markdown image
                                        let bindata_id =
                                            shape_component_picture.picture_info.bindata_id;

                                        // BinData에서 해당 이미지 찾기 / Find image in BinData
                                        if let Some(bin_item) = document
                                            .bin_data
                                            .items
                                            .iter()
                                            .find(|item| item.index == bindata_id)
                                        {
                                            // base64 데이터를 마크다운 이미지 형식으로 출력 / Output base64 data as markdown image
                                            let mime_type =
                                                get_mime_type_from_bindata_id(document, bindata_id);
                                            let image_markdown = format!(
                                                "![이미지](data:{};base64,{})",
                                                mime_type, bin_item.data
                                            );
                                            parts.push(image_markdown);
                                            has_image = true;
                                        }
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
