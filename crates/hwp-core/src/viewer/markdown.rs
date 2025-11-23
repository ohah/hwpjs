/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
use crate::document::{
    ColumnDivideType, CtrlHeader, CtrlHeaderData, HwpDocument, Paragraph, ParagraphRecord,
};

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
            let markdown = convert_paragraph_to_markdown(paragraph);
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
fn convert_paragraph_to_markdown(paragraph: &Paragraph) -> String {
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
            ParagraphRecord::CtrlHeader { header } => {
                // Convert control header to markdown / 컨트롤 헤더를 마크다운으로 변환
                let control_md = convert_control_to_markdown(header);
                if !control_md.is_empty() {
                    parts.push(control_md);
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

/// Convert control header to markdown
/// 컨트롤 헤더를 마크다운으로 변환
fn convert_control_to_markdown(header: &CtrlHeader) -> String {
    match header.ctrl_id.as_str() {
        "tbl " => {
            // 표 (Table) / Table
            let mut md = String::from("**표**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[표 내용은 추출되지 않았습니다]*");
            md
        }
        "gso " => {
            // 그리기 개체 (Shape Object) - 글상자, 그림 등
            // Shape Object - text boxes, images, etc.
            let mut md = String::from("**그리기 개체**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[개체 내용은 추출되지 않았습니다]*");
            md
        }
        "head" => {
            // 머리말 (Header) / Header
            String::from("*[머리말]*")
        }
        "foot" => {
            // 꼬리말 (Footer) / Footer
            String::from("*[꼬리말]*")
        }
        "cold" => {
            // 단 정의 (Column Definition) / Column Definition
            String::from("*[단 정의]*")
        }
        _ => {
            // 기타 컨트롤 / Other controls
            format!("*[컨트롤: {}]*", header.ctrl_id.trim())
        }
    }
}
