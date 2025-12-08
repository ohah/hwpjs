/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
///
/// 구조는 HWPTAG 기준으로 나뉘어 있습니다:
/// Structure is organized by HWPTAG:
/// - document: 문서 레벨 변환 (bodytext, docinfo, fileheader 등) / Document-level conversion (bodytext, docinfo, fileheader, etc.)
///   - bodytext: 본문 텍스트 관련 (para_text, paragraph, list_header, table, shape_component, shape_component_picture)
///   - docinfo: 문서 정보
///   - fileheader: 파일 헤더
/// - ctrl_header: CTRL_HEADER (HWPTAG_BEGIN + 55) - CtrlId별로 세분화
/// - utils: 유틸리티 함수들 / Utility functions
/// - collect: 텍스트/이미지 수집 함수들 / Text/image collection functions
pub mod collect;
mod common;
mod ctrl_header;
pub mod document;
mod renderer;
pub mod utils;

use crate::document::HwpDocument;

pub use ctrl_header::convert_control_to_markdown;
pub use document::bodytext::convert_paragraph_to_markdown;
pub use document::bodytext::convert_table_to_markdown;
pub use renderer::MarkdownRenderer;

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
        lines.push(format!("**버전**: {}", document::format_version(document)));
        lines.push(String::new());
    }

    // 페이지 정보 추가 / Add page information
    if options.include_page_info == Some(true) {
        if let Some(page_def) = document::extract_page_info(document) {
            let paper_width_mm = page_def.paper_width.to_mm();
            let paper_height_mm = page_def.paper_height.to_mm();
            let left_margin_mm = page_def.left_margin.to_mm();
            let right_margin_mm = page_def.right_margin.to_mm();
            let top_margin_mm = page_def.top_margin.to_mm();
            let bottom_margin_mm = page_def.bottom_margin.to_mm();

            lines.push(format!(
                "**용지 크기**: {:.2}mm x {:.2}mm",
                paper_width_mm, paper_height_mm
            ));
            lines.push(format!(
                "**용지 방향**: {:?}",
                page_def.attributes.paper_direction
            ));
            lines.push(format!(
                "**여백**: 좌 {:.2}mm / 우 {:.2}mm / 상 {:.2}mm / 하 {:.2}mm",
                left_margin_mm, right_margin_mm, top_margin_mm, bottom_margin_mm
            ));
            lines.push(String::new());
        }
    }

    // Convert body text to markdown using common logic / 공통 로직을 사용하여 본문 텍스트를 마크다운으로 변환
    use crate::viewer::core::bodytext::process_bodytext;
    use crate::viewer::markdown::renderer::MarkdownRenderer;
    let renderer = MarkdownRenderer;
    let parts = process_bodytext(document, &renderer, options);

    // 머리말, 본문, 꼬리말, 각주, 미주 순서로 결합 / Combine in order: headers, body, footers, footnotes, endnotes
    if !parts.headers.is_empty() {
        lines.extend(parts.headers.clone());
        lines.push(String::new());
    }
    lines.extend(parts.body_lines.clone());
    if !parts.footers.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        lines.extend(parts.footers.clone());
    }
    if !parts.footnotes.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        // 각주 섹션 헤더 추가 / Add footnote section header
        lines.push("## 각주".to_string());
        lines.push(String::new());
        lines.extend(parts.footnotes.clone());
    }
    if !parts.endnotes.is_empty() {
        if !lines.is_empty() && !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        }
        // 미주 섹션 헤더 추가 / Add endnote section header
        lines.push("## 미주".to_string());
        lines.push(String::new());
        lines.extend(parts.endnotes.clone());
    }

    // 문단 사이에 빈 줄을 추가하여 마크다운에서 각 문단이 구분되도록 함
    // Add blank lines between paragraphs so each paragraph is distinguished in markdown
    lines.join("\n\n")
}
