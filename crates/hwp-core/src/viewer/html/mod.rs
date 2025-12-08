/// HTML converter for HWP documents
/// HWP 문서를 HTML로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to HTML format.
/// 이 모듈은 HWP 문서를 HTML 형식으로 변환하는 기능을 제공합니다.
///
/// 구조는 HWPTAG 기준으로 나뉘어 있습니다:
/// Structure is organized by HWPTAG:
/// - document: 문서 레벨 변환 (bodytext, docinfo, fileheader 등) / Document-level conversion (bodytext, docinfo, fileheader, etc.)
///   - bodytext: 본문 텍스트 관련 (para_text, paragraph, list_header, table, shape_component, shape_component_picture)
///   - docinfo: 문서 정보
///   - fileheader: 파일 헤더
/// - ctrl_header: CTRL_HEADER (HWPTAG_BEGIN + 55) - CtrlId별로 세분화
/// - utils: 유틸리티 함수들 / Utility functions
/// - common: 공통 함수들 (이미지 처리 등) / Common functions (image processing, etc.)
mod common;
mod ctrl_header;
pub mod document;
mod header_footer;
mod page_def;
mod renderer;
mod styles;
pub mod utils;

use crate::document::HwpDocument;

pub use document::bodytext::convert_paragraph_to_html;
pub use document::bodytext::convert_table_to_html;

/// HTML 변환 옵션 / HTML conversion options
#[derive(Debug, Clone)]
pub struct HtmlOptions {
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    pub image_output_dir: Option<String>,

    /// 버전 정보 포함 여부 / Whether to include version information
    pub include_version: Option<bool>,

    /// 페이지 정보 포함 여부 / Whether to include page information
    pub include_page_info: Option<bool>,

    /// CSS 클래스 접두사 (기본값: "ohah-hwpjs-")
    /// CSS class prefix (default: "ohah-hwpjs-")
    pub css_class_prefix: String,
}

impl Default for HtmlOptions {
    fn default() -> Self {
        Self {
            image_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: "ohah-hwpjs-".to_string(),
        }
    }
}

impl HtmlOptions {
    /// 이미지 출력 디렉토리 설정 / Set image output directory
    pub fn with_image_output_dir(mut self, dir: Option<&str>) -> Self {
        self.image_output_dir = dir.map(|s| s.to_string());
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

    /// CSS 클래스 접두사 설정 / Set CSS class prefix
    pub fn with_css_class_prefix(mut self, prefix: &str) -> Self {
        self.css_class_prefix = prefix.to_string();
        self
    }
}

/// Convert HWP document to HTML format
/// HWP 문서를 HTML 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
/// * `options` - HTML conversion options / HTML 변환 옵션
///
/// # Returns / 반환값
/// HTML string representation of the document / 문서의 HTML 문자열 표현
pub fn to_html(document: &HwpDocument, options: &HtmlOptions) -> String {
    let css_prefix = &options.css_class_prefix;
    let mut html = String::new();

    // HTML 문서 시작 / Start HTML document
    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"ko\">\n");
    html.push_str("<head>\n");
    html.push_str("  <meta charset=\"UTF-8\">\n");
    html.push_str("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.push_str("  <title>HWP 문서</title>\n");

    // 페이지 정의 찾기 (재귀적으로) / Find page definition (recursively)
    let page_def_opt = page_def::find_page_def_recursive(document);

    // 문서에서 사용되는 색상, 크기, 테두리 색상, 배경색, 테두리 두께 수집 / Collect colors, sizes, border colors, background colors, and border widths used in document
    let (
        used_text_colors,
        used_sizes,
        used_border_colors,
        used_background_colors,
        used_border_widths,
    ) = styles::collect_used_styles(document);
    let _ = used_border_widths; // 사용하지 않지만 변수는 유지

    // CSS 스타일 추가 / Add CSS styles
    html.push_str("  <style>\n");
    html.push_str(&styles::generate_css_styles(
        css_prefix,
        document,
        page_def_opt,
        &used_text_colors,
        &used_sizes,
        &used_border_colors,
        &used_background_colors,
    ));
    // border_fill CSS 클래스는 더 이상 사용하지 않음 (개별 클래스로 처리) / border_fill CSS classes no longer used (handled by individual classes)
    html.push_str("  </style>\n");

    html.push_str("</head>\n");
    html.push_str("<body>\n");
    html.push_str(&format!("  <div class=\"{0}document\">\n", css_prefix));

    // 문서 제목 / Document title
    html.push_str("    <h1>HWP 문서</h1>\n");

    // 버전 정보 추가 / Add version information
    if options.include_version != Some(false) {
        let version = document.file_header.version;
        let major = (version >> 24) & 0xFF;
        let minor = (version >> 16) & 0xFF;
        let patch = (version >> 8) & 0xFF;
        let build = version & 0xFF;
        html.push_str(&format!(
            "    <p><strong>버전</strong>: {}.{:02}.{:02}.{:02}</p>\n",
            major, minor, patch, build
        ));
    }

    // 페이지 정보 추가 / Add page information
    if options.include_page_info == Some(true) {
        if let Some(page_def) = page_def_opt {
            let paper_width_mm = page_def.paper_width.to_mm();
            let paper_height_mm = page_def.paper_height.to_mm();
            let left_margin_mm = page_def.left_margin.to_mm();
            let right_margin_mm = page_def.right_margin.to_mm();
            let top_margin_mm = page_def.top_margin.to_mm();
            let bottom_margin_mm = page_def.bottom_margin.to_mm();

            html.push_str(&format!(
                "    <p><strong>용지 크기</strong>: {:.2}mm x {:.2}mm</p>\n",
                paper_width_mm, paper_height_mm
            ));
            html.push_str(&format!(
                "    <p><strong>용지 방향</strong>: {:?}</p>\n",
                page_def.attributes.paper_direction
            ));
            html.push_str(&format!(
                "    <p><strong>여백</strong>: 좌 {:.2}mm / 우 {:.2}mm / 상 {:.2}mm / 하 {:.2}mm</p>\n",
                left_margin_mm, right_margin_mm, top_margin_mm, bottom_margin_mm
            ));
        }
    }

    // 개요 번호 추적기 생성 (문서 전체에 걸쳐 유지) / Create outline number tracker (maintained across entire document)
    use crate::viewer::html::utils::OutlineNumberTracker;
    let mut outline_tracker = OutlineNumberTracker::new();

    // 섹션별로 구조 생성 및 문단 렌더링 / Generate structure and render paragraphs for each section
    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        let _section_page_def = page_def::find_page_def_for_section(section);

        // Section 시작 / Start Section
        html.push_str(&format!(
            "    <section class=\"{0}Section {0}Section-{1}\">\n",
            css_prefix, section_idx
        ));

        // Paper 시작 / Start Paper
        html.push_str(&format!("      <div class=\"{0}Paper\">\n", css_prefix));

        // HeaderPageFooter (Header) / HeaderPageFooter (Header)
        // 섹션별로 머리말 찾아서 렌더링 / Find and render header for each section
        let header_html = header_footer::render_header_for_section(
            section,
            document,
            options,
            &mut outline_tracker,
        );
        html.push_str(&format!(
            "        <div class=\"{0}HeaderPageFooter {0}Header\">\n",
            css_prefix
        ));
        if !header_html.is_empty() {
            // 들여쓰기 추가 / Add indentation
            let indented_header: String = header_html
                .lines()
                .filter(|line| !line.is_empty())
                .map(|line| format!("          {}\n", line))
                .collect();
            html.push_str(&indented_header);
        }
        html.push_str("        </div>\n");

        // Page 시작 / Start Page
        html.push_str(&format!("        <div class=\"{0}Page\">\n", css_prefix));

        // 각 섹션의 문단들을 렌더링 / Render paragraphs in each section
        use crate::document::bodytext::ColumnDivideType;
        use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

        let mut is_first_paragraph_in_page = true;

        for (para_idx, paragraph) in section.paragraphs.iter().enumerate() {
            // 페이지 나누기 확인 / Check for page break
            let has_page_break = paragraph
                .para_header
                .column_divide_type
                .iter()
                .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

            // 페이지 나누기가 있고 첫 문단이 아니면 페이지 구분선 추가 / Add page break line if page break exists and not first paragraph
            if has_page_break && !is_first_paragraph_in_page {
                html.push_str(&format!(
                    "          <hr class=\"{0}page-break\" />\n",
                    css_prefix
                ));
            }

            // 문단 렌더링 (일반 본문 문단만) / Render paragraph (only regular body paragraphs)
            // 머리말/꼬리말/각주/미주는 나중에 처리 / Headers/footers/footnotes/endnotes will be handled later
            let control_mask = &paragraph.para_header.control_mask;
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();

            if !has_header_footer && !has_footnote_endnote {
                // 일반 본문 문단 렌더링 / Render regular body paragraph
                use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html_with_indices;
                let para_html = convert_paragraph_to_html_with_indices(
                    paragraph,
                    document,
                    options,
                    &mut outline_tracker,
                    Some(section_idx),
                    Some(para_idx),
                );

                if !para_html.is_empty() {
                    html.push_str("          ");
                    html.push_str(&para_html);
                    html.push('\n');
                    is_first_paragraph_in_page = false;
                }
            }
        }

        // Page 끝 / End Page
        html.push_str("        </div>\n");

        // HeaderPageFooter (Footer) / HeaderPageFooter (Footer)
        // 섹션별로 꼬리말 찾아서 렌더링 / Find and render footer for each section
        let footer_html = header_footer::render_footer_for_section(
            section,
            document,
            options,
            &mut outline_tracker,
        );
        html.push_str(&format!(
            "        <div class=\"{0}HeaderPageFooter {0}Footer\">\n",
            css_prefix
        ));
        if !footer_html.is_empty() {
            // 들여쓰기 추가 / Add indentation
            let indented_footer: String = footer_html
                .lines()
                .filter(|line| !line.is_empty())
                .map(|line| format!("          {}\n", line))
                .collect();
            html.push_str(&indented_footer);
        }
        html.push_str("        </div>\n");

        // Paper 끝 / End Paper
        html.push_str("      </div>\n");

        // Section 끝 / End Section
        html.push_str("    </section>\n");
    }

    // 각주와 미주는 섹션 외부에 추가 / Add footnotes and endnotes outside sections
    // TODO: 각주/미주를 섹션별로 찾아서 추가해야 함 / TODO: Need to find footnotes/endnotes per section
    // 현재는 process_bodytext에서 수집한 전체 각주/미주를 사용 / Currently uses all footnotes/endnotes collected by process_bodytext
    use crate::viewer::core::bodytext::process_bodytext;
    use crate::viewer::html::renderer::HtmlRenderer;
    let renderer = HtmlRenderer;
    let parts = process_bodytext(document, &renderer, options);

    if !parts.footnotes.is_empty() {
        html.push_str("    <section class=\"");
        html.push_str(css_prefix);
        html.push_str("footnotes\">\n");
        html.push_str("      <h2>각주</h2>\n");
        for footnote in &parts.footnotes {
            html.push_str(footnote);
            html.push('\n');
        }
        html.push_str("    </section>\n");
    }

    if !parts.endnotes.is_empty() {
        html.push_str("    <section class=\"");
        html.push_str(css_prefix);
        html.push_str("endnotes\">\n");
        html.push_str("      <h2>미주</h2>\n");
        for endnote in &parts.endnotes {
            html.push_str(endnote);
            html.push('\n');
        }
        html.push_str("    </section>\n");
    }

    html.push_str("  </div>\n");
    html.push_str("</body>\n");
    html.push_str("</html>\n");

    html
}
