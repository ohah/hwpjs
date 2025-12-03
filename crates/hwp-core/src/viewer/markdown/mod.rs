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

/// Markdown 변환 옵션 / Markdown conversion options
#[derive(Debug, Clone)]
pub struct MarkdownOptions {
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    pub image_output_dir: Option<String>,

    /// HTML 태그 사용 여부 (Some(true)인 경우 테이블 등 개행 불가 영역에 <br> 태그 사용)
    /// Whether to use HTML tags (if Some(true), use <br> tags in areas where line breaks are not possible, such as tables)
    pub use_html: Option<bool>,

    /// 버전 정보 포함 여부 / Whether to include version information
    pub include_version: Option<bool>,

    /// 페이지 정보 포함 여부 / Whether to include page information
    pub include_page_info: Option<bool>,
}

impl MarkdownOptions {
    /// 이미지 출력 디렉토리 설정 / Set image output directory
    pub fn with_image_output_dir(mut self, dir: Option<&str>) -> Self {
        self.image_output_dir = dir.map(|s| s.to_string());
        self
    }

    /// HTML 태그 사용 설정 / Set HTML tag usage
    pub fn with_use_html(mut self, use_html: Option<bool>) -> Self {
        self.use_html = use_html;
        self
    }

    /// 버전 정보 포함 설정 / Set version information inclusion
    pub fn with_include_version(mut self, include: Option<bool>) -> Self {
        self.include_version = include;
        self
    }

    /// 페이지 정보 포함 설정 / Set page information inclusion
    pub fn with_include_page_info(mut self, include: Option<bool>) -> Self {
        self.include_page_info = include;
        self
    }
}

/// Convert HWP document to Markdown format
/// HWP 문서를 마크다운 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
/// * `options` - Markdown conversion options / 마크다운 변환 옵션
///
/// # Returns / 반환값
/// Markdown string representation of the document / 문서의 마크다운 문자열 표현
pub fn to_markdown(document: &HwpDocument, options: &MarkdownOptions) -> String {
    let mut lines = Vec::new();

    // Add document title with version info / 문서 제목과 버전 정보 추가
    lines.push("# HWP 문서".to_string());
    lines.push(String::new());

    // 버전 정보 추가 / Add version information
    if options.include_version != Some(false) {
        lines.push(format!("**버전**: {}", format_version(document)));
        lines.push(String::new());
    }

    // 페이지 정보 추가 / Add page information
    if options.include_page_info == Some(true) {
        if let Some(page_def) = extract_page_info(document) {
            let paper_width_inch = page_def.paper_width.to_inches();
            let paper_height_inch = page_def.paper_height.to_inches();
            let left_margin_inch = page_def.left_margin.to_inches();
            let right_margin_inch = page_def.right_margin.to_inches();
            let top_margin_inch = page_def.top_margin.to_inches();
            let bottom_margin_inch = page_def.bottom_margin.to_inches();

            lines.push(format!(
                "**용지 크기**: {:.2}인치 x {:.2}인치",
                paper_width_inch, paper_height_inch
            ));
            lines.push(format!(
                "**용지 방향**: {:?}",
                page_def.attributes.paper_direction
            ));
            lines.push(format!(
                "**여백**: 좌 {:.2}인치 / 우 {:.2}인치 / 상 {:.2}인치 / 하 {:.2}인치",
                left_margin_inch, right_margin_inch, top_margin_inch, bottom_margin_inch
            ));
            lines.push(String::new());
        }
    }

    // 머리말, 본문, 꼬리말, 각주, 미주를 분리하여 수집 / Collect headers, body, footers, footnotes, and endnotes separately
    let mut headers = Vec::new();
    let mut body_lines = Vec::new();
    let mut footers = Vec::new();
    let mut footnotes = Vec::new();
    let mut endnotes = Vec::new();

    // Convert body text to markdown / 본문 텍스트를 마크다운으로 변환
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // 머리말/꼬리말 컨트롤 찾기 / Find header/footer controls
            let mut is_header_paragraph = false;
            let mut is_footer_paragraph = false;

            // 문단의 레코드를 순회하여 머리말/꼬리말/각주/미주 확인 / Check if paragraph contains header/footer/footnote/endnote
            let mut is_footnote_paragraph = false;
            let mut is_endnote_paragraph = false;
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    use crate::document::{CtrlHeaderData, CtrlId};
                    if header.ctrl_id.as_str() == CtrlId::HEADER {
                        is_header_paragraph = true;
                        break;
                    } else if header.ctrl_id.as_str() == CtrlId::FOOTER {
                        is_footer_paragraph = true;
                        break;
                    } else if header.ctrl_id.as_str() == CtrlId::FOOTNOTE
                        && !matches!(header.data, CtrlHeaderData::HeaderFooter)
                    {
                        // 각주 (HeaderFooter 데이터 타입이 아닌 경우) / Footnote (when not HeaderFooter data type)
                        is_footnote_paragraph = true;
                        break;
                    } else if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                        // 미주 / Endnote
                        is_endnote_paragraph = true;
                        break;
                    }
                }
            }

            if is_header_paragraph {
                // 머리말 문단 처리 / Process header paragraph
                let markdown = convert_paragraph_to_markdown(paragraph, document, options);
                if !markdown.is_empty() {
                    headers.push(markdown);
                }
            } else if is_footer_paragraph {
                // 꼬리말 문단 처리 / Process footer paragraph
                let markdown = convert_paragraph_to_markdown(paragraph, document, options);
                if !markdown.is_empty() {
                    footers.push(markdown);
                }
            } else if is_footnote_paragraph {
                // 각주 문단 처리 / Process footnote paragraph
                // 각주 컨트롤 헤더의 자식 레코드(ListHeader)에 있는 모든 문단 처리 / Process all paragraphs in ListHeader children of footnote control header
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader { header, children } = record {
                        use crate::document::CtrlId;
                        if header.ctrl_id.as_str() == CtrlId::FOOTNOTE {
                            // 컨트롤 헤더 마크다운 / Control header markdown
                            let control_md = convert_control_to_markdown(header, false);
                            if !control_md.is_empty() {
                                footnotes.push(control_md);
                            }

                            // 자식 레코드 처리 (ListHeader의 문단들) / Process child records (paragraphs in ListHeader)
                            for child in children {
                                if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                                    for para in paragraphs {
                                        let para_md =
                                            convert_paragraph_to_markdown(para, document, options);
                                        if !para_md.is_empty() {
                                            footnotes.push(para_md);
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            } else if is_endnote_paragraph {
                // 미주 문단 처리 / Process endnote paragraph
                // 미주 컨트롤 헤더의 자식 레코드(ListHeader)에 있는 모든 문단 처리 / Process all paragraphs in ListHeader children of endnote control header
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader { header, children } = record {
                        use crate::document::CtrlId;
                        if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                            // 컨트롤 헤더 마크다운 / Control header markdown
                            let control_md = convert_control_to_markdown(header, false);
                            if !control_md.is_empty() {
                                endnotes.push(control_md);
                            }

                            // 자식 레코드 처리 (ListHeader의 문단들) / Process child records (paragraphs in ListHeader)
                            for child in children {
                                if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                                    for para in paragraphs {
                                        let para_md =
                                            convert_paragraph_to_markdown(para, document, options);
                                        if !para_md.is_empty() {
                                            endnotes.push(para_md);
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            } else {
                // 일반 본문 문단 처리 / Process regular body paragraph
                // Check if we need to add page break / 페이지 나누기가 필요한지 확인
                let has_page_break = paragraph
                    .para_header
                    .column_divide_type
                    .iter()
                    .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

                if has_page_break && !body_lines.is_empty() {
                    // Only add page break if we have content before / 이전에 내용이 있을 때만 페이지 구분선 추가
                    let last_line = body_lines.last().map(String::as_str).unwrap_or("");
                    if !last_line.is_empty() && last_line != "---" {
                        body_lines.push("---".to_string());
                        body_lines.push(String::new());
                    }
                }

                // Convert paragraph to markdown (includes text and controls) / 문단을 마크다운으로 변환 (텍스트와 컨트롤 포함)
                let markdown = convert_paragraph_to_markdown(paragraph, document, options);
                if !markdown.is_empty() {
                    body_lines.push(markdown);
                }
            }
        }
    }

    // 머리말, 본문, 꼬리말, 각주, 미주 순서로 결합 / Combine in order: headers, body, footers, footnotes, endnotes
    if !headers.is_empty() {
        lines.extend(headers);
        lines.push(String::new());
    }
    lines.extend(body_lines);
    if !footers.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        lines.extend(footers);
    }
    if !footnotes.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        lines.extend(footnotes);
    }
    if !endnotes.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        lines.extend(endnotes);
    }

    // 문단 사이에 빈 줄을 추가하여 마크다운에서 각 문단이 구분되도록 함
    // Add blank lines between paragraphs so each paragraph is distinguished in markdown
    lines.join("\n\n")
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

/// 문서에서 첫 번째 PageDef 정보 추출 / Extract first PageDef information from document
fn extract_page_info(document: &HwpDocument) -> Option<&crate::document::bodytext::PageDef> {
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                if let ParagraphRecord::PageDef { page_def } = record {
                    return Some(page_def);
                }
            }
        }
    }
    None
}

/// Convert a paragraph to markdown
/// 문단을 마크다운으로 변환
pub(crate) fn convert_paragraph_to_markdown(
    paragraph: &Paragraph,
    document: &HwpDocument,
    options: &MarkdownOptions,
) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();
    let mut text_parts = Vec::new(); // 같은 문단 내의 텍스트 레코드들을 모음 / Collect text records in the same paragraph

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
                    // 같은 문단 내의 텍스트는 나중에 합침 / Text in the same paragraph will be combined later
                    text_parts.push(text_md);
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
                    options.image_output_dir.as_deref(),
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
                    options.image_output_dir.as_deref(),
                ) {
                    parts.push(image_md);
                }
            }
            ParagraphRecord::CtrlHeader { header, children } => {
                // 마크다운으로 표현할 수 없는 컨트롤 헤더는 건너뜀 / Skip control headers that cannot be expressed in markdown
                if !should_process_control_header(header) {
                    // 자식 레코드만 처리 (예: SHAPE_OBJECT 내부의 이미지) / Only process children (e.g., images inside SHAPE_OBJECT)
                    for child in children {
                        match child {
                            ParagraphRecord::ShapeComponent {
                                shape_component: _,
                                children: shape_children,
                            } => {
                                let shape_parts = convert_shape_component_children_to_markdown(
                                    shape_children,
                                    document,
                                    options.image_output_dir.as_deref(),
                                );
                                parts.extend(shape_parts);
                            }
                            ParagraphRecord::ShapeComponentPicture {
                                shape_component_picture,
                            } => {
                                if let Some(image_md) = convert_shape_component_picture_to_markdown(
                                    shape_component_picture,
                                    document,
                                    options.image_output_dir.as_deref(),
                                ) {
                                    parts.push(image_md);
                                }
                            }
                            _ => {
                                // 기타 자식 레코드는 무시 (이미 처리된 경우만 도달) / Ignore other child records (only reached if already processed)
                            }
                        }
                    }
                    continue; // 이 컨트롤 헤더는 더 이상 처리하지 않음 / Don't process this control header further
                }

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
                            let table_md = convert_table_to_markdown(table, document, options);
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
                                options.image_output_dir.as_deref(),
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
                                options.image_output_dir.as_deref(),
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
                                    let para_md =
                                        convert_paragraph_to_markdown(para, document, options);
                                    if para_md.contains("![이미지]") {
                                        has_image = true;
                                    }
                                }
                            } else {
                                // 표가 없으면 ListHeader의 paragraphs를 처리
                                // If no table, process ListHeader's paragraphs
                                // paragraph_count가 있으므로 각 문단 사이에 개행 추가
                                // Since paragraph_count exists, add line breaks between paragraphs
                                for (idx, para) in paragraphs.iter().enumerate() {
                                    let para_md =
                                        convert_paragraph_to_markdown(para, document, options);
                                    if !para_md.is_empty() {
                                        // 이미지가 포함되어 있는지 확인 / Check if image is included
                                        if para_md.contains("![이미지]") {
                                            has_image = true;
                                        }
                                        // 이미지가 있든 없든 마크다운 추가 / Add markdown regardless of image
                                        parts.push(para_md);
                                        has_content = true;

                                        // 마지막 문단이 아니면 문단 사이 개행 추가 (스페이스 2개 + 개행)
                                        // If not last paragraph, add line break between paragraphs (two spaces + newline)
                                        if idx < paragraphs.len() - 1 {
                                            parts.push("  \n".to_string());
                                        }
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
                                                    para, document, options,
                                                );
                                                if para_md.contains("![이미지]") {
                                                    has_image = true;
                                                }
                                            }
                                        } else {
                                            // 표가 없으면 ListHeader의 paragraphs를 처리
                                            // If no table, process ListHeader's paragraphs
                                            // paragraph_count가 있으므로 각 문단 사이에 개행 추가
                                            // Since paragraph_count exists, add line breaks between paragraphs
                                            for (idx, para) in paragraphs.iter().enumerate() {
                                                let para_md = convert_paragraph_to_markdown(
                                                    para, document, options,
                                                );
                                                if !para_md.is_empty() {
                                                    // 이미지가 포함되어 있는지 확인 / Check if image is included
                                                    if para_md.contains("![이미지]") {
                                                        has_image = true;
                                                    }
                                                    // 이미지가 있든 없든 마크다운 추가 / Add markdown regardless of image
                                                    parts.push(para_md);
                                                    has_content = true;

                                                    // 마지막 문단이 아니면 문단 사이 개행 추가 (스페이스 2개 + 개행)
                                                    // If not last paragraph, add line break between paragraphs (two spaces + newline)
                                                    if idx < paragraphs.len() - 1 {
                                                        parts.push("  \n".to_string());
                                                    }
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
                                                options.image_output_dir.as_deref(),
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
                // 마크다운으로 표현할 수 없는 컨트롤은 이미 should_process_control_header에서 필터링되었으므로
                // 여기서는 처리 가능한 컨트롤만 도달함
                // Controls that cannot be expressed in markdown are already filtered in should_process_control_header,
                // so only processable controls reach here
            }
            _ => {
                // Other record types (char shape, line seg, etc.) are formatting info
                // 기타 레코드 타입 (글자 모양, 줄 세그먼트 등)은 서식 정보
                // Skip for now, but could be used for styling in the future
                // 현재는 건너뛰지만, 향후 스타일링에 사용할 수 있음
            }
        }
    }

    // 같은 문단 내의 텍스트 레코드들을 합침 / Combine text records in the same paragraph
    if !text_parts.is_empty() {
        // 텍스트들을 합치되, 각 텍스트 사이에 스페이스 2개 + 개행 추가
        // Combine texts, adding two spaces + newline between each text
        let combined_text = text_parts.join("  \n");
        // 개요 레벨 확인 및 헤딩으로 변환 / Check outline level and convert to heading
        let heading_md =
            convert_to_heading_if_outline(&combined_text, &paragraph.para_header, document);
        parts.push(heading_md);
    }

    // 마크다운 문법에 맞게 개행 처리 / Handle line breaks according to markdown syntax
    // 텍스트가 연속으로 나올 때는 스페이스 2개 + 개행, 블록 요소 사이는 빈 줄
    // For consecutive text: two spaces + newline, for block elements: blank line
    if parts.is_empty() {
        return String::new();
    }

    if parts.len() == 1 {
        return parts[0].clone();
    }

    let mut result = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            let prev_part = &parts[i - 1];
            let is_prev_text = is_text_part(prev_part);
            let is_current_text = is_text_part(part);

            // 텍스트가 연속으로 나올 때는 스페이스 2개 + 개행
            // When text is consecutive, use two spaces + newline
            if is_prev_text && is_current_text {
                result.push_str("  \n");
            }
            // 블록 요소가 포함된 경우는 빈 줄
            // When block elements are involved, use blank line
            else {
                result.push_str("\n\n");
            }
        }
        result.push_str(part);
    }

    result
}

/// Check if a part is a text part (not a block element)
/// part가 텍스트인지 확인 (블록 요소가 아님)
fn is_text_part(part: &str) -> bool {
    !is_block_element(part)
}

/// Check if a part is a block element (image, table, etc.)
/// part가 블록 요소인지 확인 (이미지, 표 등)
fn is_block_element(part: &str) -> bool {
    part.starts_with("![이미지]")
        || part.starts_with("|") // 테이블 / table
        || part.starts_with("---") // 페이지 구분선 / page break
        || part.starts_with("#") // 헤딩 / heading
}

/// Check if control header should be processed for markdown
/// 컨트롤 헤더가 마크다운 변환에서 처리되어야 하는지 확인
fn should_process_control_header(header: &crate::document::CtrlHeader) -> bool {
    use crate::document::{CtrlHeaderData, CtrlId};
    match header.ctrl_id.as_str() {
        // 마크다운으로 표현 가능한 컨트롤만 처리 / Only process controls that can be expressed in markdown
        CtrlId::TABLE => true,
        CtrlId::SHAPE_OBJECT => true, // 이미지는 자식 레코드에서 처리 / Images are processed from child records
        CtrlId::HEADER => true,       // 머리말 처리 / Process header
        CtrlId::FOOTER => true,       // 꼬리말 처리 / Process footer
        CtrlId::FOOTNOTE => {
            // 각주 처리 (HeaderFooter 데이터 타입이 아닌 경우) / Process footnote (when not HeaderFooter data type)
            !matches!(header.data, CtrlHeaderData::HeaderFooter)
        }
        CtrlId::ENDNOTE => true,     // 미주 처리 / Process endnote
        CtrlId::COLUMN_DEF => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        _ => false, // 기타 컨트롤도 마크다운으로 표현 불가 / Other controls also cannot be expressed in markdown
    }
}

/// Convert text to heading if it's an outline level
/// 개요 레벨이면 텍스트를 헤딩으로 변환
fn convert_to_heading_if_outline(
    text: &str,
    para_header: &crate::document::bodytext::ParaHeader,
    document: &HwpDocument,
) -> String {
    use crate::document::HeaderShapeType;

    // ParaShape 찾기 (para_shape_id는 인덱스) / Find ParaShape (para_shape_id is index)
    let para_shape_id = para_header.para_shape_id as usize;
    if let Some(para_shape) = document.doc_info.para_shapes.get(para_shape_id) {
        // 개요 타입이고 레벨이 1 이상이면 헤딩으로 변환
        // If outline type and level >= 1, convert to heading
        if para_shape.attributes1.header_shape_type == HeaderShapeType::Outline
            && para_shape.attributes1.paragraph_level >= 1
        {
            let level = para_shape.attributes1.paragraph_level.min(6) as usize; // 최대 6레벨 / max 6 levels
            let hashes = "#".repeat(level);
            return format!("{} {}", hashes, text);
        }
    }
    text.to_string()
}
