/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
///
/// 구조는 HWPTAG 기준으로 나뉘어 있습니다:
/// Structure is organized by HWPTAG:
/// - para_text: PARA_TEXT (HWPTAG_BEGIN + 51)
/// - shape_component: SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
/// - shape_component_picture: SHAPE_COMPONENT_PICTURE
/// - list_header: LIST_HEADER (HWPTAG_BEGIN + 56)
/// - table: TABLE (HWPTAG_BEGIN + 61)
/// - ctrl_header: CTRL_HEADER (HWPTAG_BEGIN + 55) - CtrlId별로 세분화
mod common;
mod ctrl_header;
mod list_header;
mod para_text;
mod shape_component;
mod shape_component_picture;
mod table;

use crate::document::{ColumnDivideType, HwpDocument, Paragraph, ParagraphRecord};

pub use ctrl_header::convert_control_to_markdown;
pub use table::convert_table_to_markdown;

use para_text::convert_para_text_to_markdown;
use shape_component::convert_shape_component_children_to_markdown;
use shape_component_picture::convert_shape_component_picture_to_markdown;

/// Convert HWP document to Markdown format
/// HWP 문서를 마크다운 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
/// * `image_output_dir` - Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
///   이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
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
                // ParaText 변환 / Convert ParaText
                if let Some(text_md) = convert_para_text_to_markdown(text, control_char_positions) {
                    parts.push(text_md);
                }
            }
            ParagraphRecord::ShapeComponent {
                shape_component: _,
                children,
            } => {
                // SHAPE_COMPONENT의 children을 재귀적으로 처리 / Recursively process SHAPE_COMPONENT's children
                let shape_parts = convert_shape_component_children_to_markdown(
                    children,
                    document,
                    image_output_dir,
                );
                parts.extend(shape_parts);
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // ShapeComponentPicture 변환 / Convert ShapeComponentPicture
                if let Some(image_md) = convert_shape_component_picture_to_markdown(
                    shape_component_picture,
                    document,
                    image_output_dir,
                ) {
                    parts.push(image_md);
                }
            }
            ParagraphRecord::CtrlHeader { header, children } => {
                // 컨트롤 헤더의 자식 레코드 처리 (레벨 2, 예: 테이블, 그림 등) / Process control header children (level 2, e.g., table, images, etc.)
                let mut has_table = false;
                let mut has_image = false;
                let mut has_content = false; // 자식 레코드에서 내용이 추출되었는지 여부 / Whether content was extracted from child records

                // 먼저 표가 있는지 확인 / First check if table exists
                for child in children.iter() {
                    if matches!(child, ParagraphRecord::Table { .. }) {
                        has_table = true;
                        break;
                    }
                }

                // SHAPE_OBJECT인지 확인 / Check if this is SHAPE_OBJECT
                let is_shape_object =
                    header.ctrl_id.as_str() == crate::document::CtrlId::SHAPE_OBJECT;

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
                        ParagraphRecord::ShapeComponent {
                            shape_component: _,
                            children: shape_children,
                        } => {
                            // SHAPE_COMPONENT의 children 처리 (SHAPE_COMPONENT_PICTURE 등) / Process SHAPE_COMPONENT's children (SHAPE_COMPONENT_PICTURE, etc.)
                            let shape_parts = convert_shape_component_children_to_markdown(
                                shape_children,
                                document,
                                image_output_dir,
                            );
                            for shape_part in shape_parts {
                                if has_table {
                                    // 표 안에 이미지가 있는 경우 표 셀에 이미 포함되므로 여기서는 표시만 함
                                    // If image is in table, it's already included in table cell, so just mark it here
                                    has_image = true;
                                } else if is_shape_object {
                                    // SHAPE_OBJECT의 경우 표 밖에서도 이미지를 처리
                                    // For SHAPE_OBJECT, process image even outside table
                                    parts.push(shape_part);
                                    has_image = true;
                                    has_content = true;
                                } else {
                                    // 기타 경우에는 has_image만 설정
                                    // For other cases, only set has_image
                                    has_image = true;
                                }
                            }
                        }
                        ParagraphRecord::ShapeComponentPicture {
                            shape_component_picture,
                        } => {
                            // ShapeComponentPicture 변환 / Convert ShapeComponentPicture
                            if let Some(image_md) = convert_shape_component_picture_to_markdown(
                                shape_component_picture,
                                document,
                                image_output_dir,
                            ) {
                                if has_table {
                                    // 표 안에 이미지가 있는 경우 표 셀에 이미 포함되므로 여기서는 표시만 함
                                    // If image is in table, it's already included in table cell, so just mark it here
                                    has_image = true;
                                } else if is_shape_object {
                                    // SHAPE_OBJECT의 경우 표 밖에서도 이미지를 처리
                                    // For SHAPE_OBJECT, process image even outside table
                                    parts.push(image_md);
                                    has_image = true;
                                    has_content = true;
                                } else {
                                    // 기타 경우에는 has_image만 설정
                                    // For other cases, only set has_image
                                    has_image = true;
                                }
                            }
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
                                        has_content = true;
                                    }
                                }
                            }
                        }
                        ParagraphRecord::CtrlHeader {
                            header: _child_header,
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
                                                    has_content = true;
                                                }
                                            }
                                        }
                                    }
                                    ParagraphRecord::ShapeComponentPicture {
                                        shape_component_picture,
                                    } => {
                                        // ShapeComponentPicture 변환 / Convert ShapeComponentPicture
                                        if let Some(image_md) =
                                            convert_shape_component_picture_to_markdown(
                                                shape_component_picture,
                                                document,
                                                image_output_dir,
                                            )
                                        {
                                            if has_table {
                                                // 표 안에 이미지가 있는 경우 표 셀에 이미 포함되므로 여기서는 표시만 함
                                                // If image is in table, it's already included in table cell, so just mark it here
                                                has_image = true;
                                            } else if is_shape_object {
                                                // SHAPE_OBJECT의 경우 표 밖에서도 이미지를 처리
                                                // For SHAPE_OBJECT, process image even outside table
                                                parts.push(image_md);
                                                has_image = true;
                                                has_content = true;
                                            } else {
                                                // 기타 경우에는 has_image만 설정
                                                // For other cases, only set has_image
                                                has_image = true;
                                            }
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
                // 표나 이미지 또는 내용이 이미 추출되었다면 메시지를 출력하지 않음 / Don't output message if table, image, or content was already extracted
                let control_md = convert_control_to_markdown(header, has_table);
                if !control_md.is_empty() {
                    // SHAPE_OBJECT의 경우 description이 있으면 내용이 있다고 간주 / For SHAPE_OBJECT, if description exists, consider it as content
                    let is_shape_object_for_desc =
                        header.ctrl_id.as_str() == crate::document::CtrlId::SHAPE_OBJECT;
                    if is_shape_object_for_desc {
                        if let crate::document::CtrlHeaderData::ObjectCommon {
                            description, ..
                        } = &header.data
                        {
                            if let Some(desc) = description {
                                // description이 여러 줄이면 내용이 있다고 간주 / If description has multiple lines, consider it as content
                                if desc.contains('\n') && desc.lines().count() > 1 {
                                    has_content = true;
                                }
                            }
                        }
                    }

                    // 내용이 추출되었으면 (이미지 또는 텍스트) 메시지 부분만 제거 / Remove message part if content was extracted (image or text)
                    if (has_image || has_content)
                        && control_md.contains("[개체 내용은 추출되지 않았습니다]")
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
