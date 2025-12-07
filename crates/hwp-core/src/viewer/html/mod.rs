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
mod renderer;
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
    let page_def_opt = find_page_def_recursive(document);

    // 문서에서 사용되는 색상, 크기, 테두리 색상, 배경색, 테두리 두께 수집 / Collect colors, sizes, border colors, background colors, and border widths used in document
    let (
        used_text_colors,
        used_sizes,
        used_border_colors,
        used_background_colors,
        used_border_widths,
    ) = collect_used_styles(document);
    let _ = used_border_widths; // 사용하지 않지만 변수는 유지

    // CSS 스타일 추가 / Add CSS styles
    html.push_str("  <style>\n");
    html.push_str(&generate_css_styles(
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
            let paper_width_inch = page_def.paper_width.to_inches();
            let paper_height_inch = page_def.paper_height.to_inches();
            let left_margin_inch = page_def.left_margin.to_inches();
            let right_margin_inch = page_def.right_margin.to_inches();
            let top_margin_inch = page_def.top_margin.to_inches();
            let bottom_margin_inch = page_def.bottom_margin.to_inches();

            html.push_str(&format!(
                "    <p><strong>용지 크기</strong>: {:.2}인치 x {:.2}인치</p>\n",
                paper_width_inch, paper_height_inch
            ));
            html.push_str(&format!(
                "    <p><strong>용지 방향</strong>: {:?}</p>\n",
                page_def.attributes.paper_direction
            ));
            html.push_str(&format!(
                "    <p><strong>여백</strong>: 좌 {:.2}인치 / 우 {:.2}인치 / 상 {:.2}인치 / 하 {:.2}인치</p>\n",
                left_margin_inch, right_margin_inch, top_margin_inch, bottom_margin_inch
            ));
        }
    }

    // 개요 번호 추적기 생성 (문서 전체에 걸쳐 유지) / Create outline number tracker (maintained across entire document)
    use crate::viewer::html::utils::OutlineNumberTracker;
    let mut outline_tracker = OutlineNumberTracker::new();

    // 섹션별로 구조 생성 및 문단 렌더링 / Generate structure and render paragraphs for each section
    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        let _section_page_def = find_page_def_for_section(section);

        // Section 시작 / Start Section
        html.push_str(&format!(
            "    <section class=\"{0}Section {0}Section-{1}\">\n",
            css_prefix, section_idx
        ));

        // Paper 시작 / Start Paper
        html.push_str(&format!("      <div class=\"{0}Paper\">\n", css_prefix));

        // HeaderPageFooter (Header) / HeaderPageFooter (Header)
        // 섹션별로 머리말 찾아서 렌더링 / Find and render header for each section
        let header_html =
            render_header_for_section(section, document, options, &mut outline_tracker);
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

        for paragraph in &section.paragraphs {
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
                let para_html =
                    convert_paragraph_to_html(paragraph, document, options, &mut outline_tracker);

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
        let footer_html =
            render_footer_for_section(section, document, options, &mut outline_tracker);
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

/// 문서에서 사용되는 색상, 크기, 테두리 색상, 배경색, 테두리 두께 수집 / Collect colors, sizes, border colors, background colors, and border widths used in document
fn collect_used_styles(
    document: &HwpDocument,
) -> (
    std::collections::HashSet<u32>, // text colors
    std::collections::HashSet<u32>, // sizes
    std::collections::HashSet<u32>, // border colors
    std::collections::HashSet<u32>, // background colors
    std::collections::HashSet<u8>,  // border widths
) {
    use crate::document::ParagraphRecord;
    let mut text_colors = std::collections::HashSet::new();
    let mut sizes = std::collections::HashSet::new();
    let border_colors = std::collections::HashSet::new();
    let mut background_colors = std::collections::HashSet::new();
    let border_widths = std::collections::HashSet::new();

    // BorderFill에서 배경색 수집 / Collect background colors from BorderFill
    // border 관련 수집은 비활성화 / Border collection is disabled
    for border_fill in &document.doc_info.border_fill {
        // 배경색 수집 / Collect background colors
        use crate::document::FillInfo;
        match &border_fill.fill {
            FillInfo::Solid(solid) => {
                // 배경색이 0이 아닌 경우 모두 수집 (흰색 포함) / Collect all non-zero background colors (including white)
                if solid.background_color.0 != 0 {
                    background_colors.insert(solid.background_color.0);
                }
            }
            _ => {}
        }
    }

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
        text_colors: &mut std::collections::HashSet<u32>,
        sizes: &mut std::collections::HashSet<u32>,
        document: &HwpDocument,
    ) {
        for record in records {
            match record {
                ParagraphRecord::ParaCharShape { shapes } => {
                    // CharShapeInfo에서 shape_id를 사용하여 실제 CharShape 가져오기
                    // Get actual CharShape using shape_id from CharShapeInfo
                    for shape_info in shapes {
                        let shape_id = shape_info.shape_id as usize;
                        if shape_id > 0 && shape_id <= document.doc_info.char_shapes.len() {
                            let shape_idx = shape_id - 1; // 1-based to 0-based
                            if let Some(char_shape) = document.doc_info.char_shapes.get(shape_idx) {
                                // 텍스트 색상 수집 / Collect text color
                                if char_shape.text_color.0 != 0 {
                                    text_colors.insert(char_shape.text_color.0);
                                }
                                // 크기 수집 / Collect size
                                if char_shape.base_size > 0 {
                                    sizes.insert(char_shape.base_size as u32);
                                }
                            }
                        }
                    }
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    search_in_records(children, text_colors, sizes, document);
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        search_in_records(&paragraph.records, text_colors, sizes, document);
                    }
                }
                _ => {}
            }
        }
    }

    // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            search_in_records(&paragraph.records, &mut text_colors, &mut sizes, document);
        }
    }

    (
        text_colors,
        sizes,
        border_colors,
        background_colors,
        border_widths,
    )
}

/// 재귀적으로 페이지 정의 찾기 / Find page definition recursively
fn find_page_def_recursive(document: &HwpDocument) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
    ) -> Option<&crate::document::bodytext::PageDef> {
        for record in records {
            match record {
                ParagraphRecord::PageDef { page_def } => {
                    return Some(page_def);
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    if let Some(page_def) = search_in_records(children) {
                        return Some(page_def);
                    }
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        if let Some(page_def) = search_in_records(&paragraph.records) {
                            return Some(page_def);
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }

    // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            if let Some(page_def) = search_in_records(&paragraph.records) {
                return Some(page_def);
            }
        }
    }

    None
}

/// 섹션별로 페이지 정의 찾기 / Find page definition for each section
fn find_page_def_for_section(
    section: &crate::document::bodytext::Section,
) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
    ) -> Option<&crate::document::bodytext::PageDef> {
        for record in records {
            match record {
                ParagraphRecord::PageDef { page_def } => {
                    return Some(page_def);
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    if let Some(page_def) = search_in_records(children) {
                        return Some(page_def);
                    }
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        if let Some(page_def) = search_in_records(&paragraph.records) {
                            return Some(page_def);
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }

    // 섹션의 문단들을 검색 / Search paragraphs in section
    for paragraph in &section.paragraphs {
        if let Some(page_def) = search_in_records(&paragraph.records) {
            return Some(page_def);
        }
    }

    None
}

/// 섹션에서 머리말 찾아서 HTML로 렌더링 / Find and render header from section as HTML
fn render_header_for_section(
    section: &crate::document::bodytext::Section,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> String {
    use crate::document::{CtrlId, ParagraphRecord};
    use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

    let mut header_html = String::new();

    for paragraph in &section.paragraphs {
        let control_mask = &paragraph.para_header.control_mask;
        if control_mask.has_header_footer() {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader {
                    header,
                    children,
                    paragraphs: ctrl_paragraphs,
                } = record
                {
                    if header.ctrl_id.as_str() == CtrlId::HEADER {
                        // 머리말 문단 처리 / Process header paragraph
                        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                        // If LIST_HEADER exists, process from children, otherwise from paragraphs
                        let mut found_list_header = false;
                        for child_record in children {
                            if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record {
                                found_list_header = true;
                                // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                for para in paragraphs {
                                    let para_html =
                                        convert_paragraph_to_html(para, document, options, tracker);
                                    if !para_html.is_empty() {
                                        header_html.push_str(&para_html);
                                        header_html.push('\n');
                                    }
                                }
                            }
                        }
                        // LIST_HEADER가 없으면 paragraphs 처리 / If no LIST_HEADER, process paragraphs
                        if !found_list_header {
                            for para in ctrl_paragraphs {
                                let para_html =
                                    convert_paragraph_to_html(para, document, options, tracker);
                                if !para_html.is_empty() {
                                    header_html.push_str(&para_html);
                                    header_html.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    header_html
}

/// 섹션에서 꼬리말 찾아서 HTML로 렌더링 / Find and render footer from section as HTML
fn render_footer_for_section(
    section: &crate::document::bodytext::Section,
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> String {
    use crate::document::{CtrlId, ParagraphRecord};
    use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

    let mut footer_html = String::new();

    for paragraph in &section.paragraphs {
        let control_mask = &paragraph.para_header.control_mask;
        if control_mask.has_header_footer() {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader {
                    header,
                    children,
                    paragraphs: ctrl_paragraphs,
                } = record
                {
                    if header.ctrl_id.as_str() == CtrlId::FOOTER {
                        // 꼬리말 문단 처리 / Process footer paragraph
                        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
                        // If LIST_HEADER exists, process from children, otherwise from paragraphs
                        let mut found_list_header = false;
                        for child_record in children {
                            if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record {
                                found_list_header = true;
                                // LIST_HEADER 내부의 문단 처리 / Process paragraphs inside LIST_HEADER
                                for para in paragraphs {
                                    let para_html =
                                        convert_paragraph_to_html(para, document, options, tracker);
                                    if !para_html.is_empty() {
                                        footer_html.push_str(&para_html);
                                        footer_html.push('\n');
                                    }
                                }
                            }
                        }
                        // LIST_HEADER가 없으면 paragraphs 처리 / If no LIST_HEADER, process paragraphs
                        if !found_list_header {
                            for para in ctrl_paragraphs {
                                let para_html =
                                    convert_paragraph_to_html(para, document, options, tracker);
                                if !para_html.is_empty() {
                                    footer_html.push_str(&para_html);
                                    footer_html.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    footer_html
}

/// Generate CSS styles
/// CSS 스타일 생성
fn generate_css_styles(
    css_prefix: &str,
    document: &HwpDocument,
    _page_def_opt: Option<&crate::document::bodytext::PageDef>, // TODO: 레이아웃 깨짐 문제로 인해 일단 사용 안 함 / Temporarily unused due to layout issues
    used_text_colors: &std::collections::HashSet<u32>,
    used_sizes: &std::collections::HashSet<u32>,
    used_border_colors: &std::collections::HashSet<u32>,
    used_background_colors: &std::collections::HashSet<u32>,
) -> String {
    // face_names를 사용하여 폰트 CSS 생성 / Generate font CSS using face_names
    let mut font_css = String::new();
    let mut font_families = Vec::new();

    for (idx, face_name) in document.doc_info.face_names.iter().enumerate() {
        // 폰트 이름을 CSS-safe하게 변환 / Convert font name to CSS-safe
        let font_name = face_name.name.replace('"', "'");
        let _css_font_name = format!("hwp-font-{}", idx);

        // @font-face는 실제 폰트 파일이 필요하므로, font-family만 생성
        // @font-face requires actual font files, so only generate font-family
        font_families.push(format!("\"{}\"", font_name));

        // 폰트 클래스 생성 (선택적) / Generate font class (optional)
        font_css.push_str(&format!(
            "    .{0}font-{1} {{\n        font-family: \"{2}\", sans-serif;\n    }}\n\n",
            css_prefix, idx, font_name
        ));
    }

    // 기본 폰트 패밀리 생성 / Generate default font family
    let default_font_family = if !font_families.is_empty() {
        format!("{}, ", font_families.join(", "))
    } else {
        String::new()
    };

    // 텍스트 색상 클래스 생성 / Generate text color classes
    let mut color_css = String::new();
    for &color_value in used_text_colors {
        let color = crate::types::COLORREF(color_value);
        let r = color.r();
        let g = color.g();
        let b = color.b();
        color_css.push_str(&format!(
            "    .{0}color-{1:02x}{2:02x}{3:02x} {{\n        color: rgb({4}, {5}, {6});\n    }}\n\n",
            css_prefix, r, g, b, r, g, b
        ));
    }

    // 테두리 색상 클래스 생성 (방향별) - 비활성화 / Generate border color classes (by direction) - disabled
    let border_color_css = String::new();
    let border_directions = ["left", "right", "top", "bottom"];
    let _ = used_border_colors; // 사용하지 않지만 변수는 유지
    let _ = border_directions; // 사용하지 않지만 변수는 유지

    // 배경색 클래스 생성 / Generate background color classes
    let mut background_color_css = String::new();
    for &color_value in used_background_colors {
        let color = crate::types::COLORREF(color_value);
        let r = color.r();
        let g = color.g();
        let b = color.b();
        // 테이블 셀에 우선 적용되도록 !important 추가 / Add !important to ensure it applies to table cells
        background_color_css.push_str(&format!(
            "    .{0}bg-color-{1:02x}{2:02x}{3:02x} {{\n        background-color: rgb({4}, {5}, {6}) !important;\n    }}\n\n",
            css_prefix, r, g, b, r, g, b
        ));
    }

    // 테두리 스타일 및 두께 클래스 생성 (방향별) - 비활성화 / Generate border style and width classes (by direction) - disabled
    let border_style_css = String::new();
    let border_width_css = String::new();
    let _ = document; // 사용하지 않지만 변수는 유지

    // 크기 클래스 생성 / Generate size classes
    let mut size_css = String::new();
    for &size_value in used_sizes {
        let size_pt = size_value as f32 / 100.0;
        let size_int = (size_pt * 100.0) as u32; // 13.00pt -> 1300
        size_css.push_str(&format!(
            "    .{0}size-{1} {{\n        font-size: {2:.2}pt;\n    }}\n\n",
            css_prefix, size_int, size_pt
        ));
    }

    // 섹션별 CSS 생성 / Generate CSS for each section
    let mut section_css = String::new();
    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        if let Some(page_def) = find_page_def_for_section(section) {
            // mm 단위로 변환 / Convert to mm
            // 용지 방향에 따라 width와 height 결정 / Determine width and height based on paper direction
            use crate::document::bodytext::PaperDirection;
            let (paper_width_mm, paper_height_mm) = match page_def.attributes.paper_direction {
                PaperDirection::Vertical => {
                    // 세로 방향: width < height / Vertical: width < height
                    (page_def.paper_width.to_mm(), page_def.paper_height.to_mm())
                }
                PaperDirection::Horizontal => {
                    // 가로 방향: width와 height를 바꿈 / Horizontal: swap width and height
                    (page_def.paper_height.to_mm(), page_def.paper_width.to_mm())
                }
            };
            let left_margin_mm = page_def.left_margin.to_mm();
            let right_margin_mm = page_def.right_margin.to_mm();
            let top_margin_mm = page_def.top_margin.to_mm();
            let bottom_margin_mm = page_def.bottom_margin.to_mm();
            let header_margin_mm = page_def.header_margin.to_mm();
            let footer_margin_mm = page_def.footer_margin.to_mm();

            section_css.push_str(&format!(
                r#"
    /* Section {0} Styles */
    .{1}Section-{0} {{
        width: 100%;
        margin: 0;
        padding: 0;
    }}

    .{1}Section-{0} .{1}Paper {{
        width: {2:.2}mm;
        min-height: {3:.2}mm;
        margin: 0 auto 40px auto;
        background-color: #fff;
        position: relative;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }}

    .{1}Section-{0} .{1}Page {{
        width: 100%;
        min-height: {3:.2}mm;
        padding: {6:.2}mm {4:.2}mm {7:.2}mm {5:.2}mm;
        box-sizing: border-box;
    }}

    .{1}Section-{0} .{1}HeaderPageFooter {{
        width: 100%;
        position: absolute;
        left: 0;
        padding: 0 {4:.2}mm 0 {5:.2}mm;
        box-sizing: border-box;
    }}

    .{1}Section-{0} .{1}HeaderPageFooter.{1}Header {{
        top: 0;
        height: {8:.2}mm;
    }}

    .{1}Section-{0} .{1}HeaderPageFooter.{1}Footer {{
        bottom: 0;
        height: {9:.2}mm;
    }}
"#,
                section_idx,
                css_prefix,
                paper_width_mm,
                paper_height_mm,
                right_margin_mm,
                left_margin_mm,
                top_margin_mm,
                bottom_margin_mm,
                header_margin_mm,
                footer_margin_mm,
            ));
        }
    }

    // 기본값 사용 / Use default values
    // max-width는 제거하여 섹션의 Paper 크기에 맞게 자동 조정 / Remove max-width to auto-adjust to section Paper size
    let max_width_px = "none";
    let padding_left_px = 20.0;
    let padding_right_px = 20.0;
    let padding_top_px = 20.0;
    let padding_bottom_px = 20.0;

    format!(
        r#"
    /* CSS Reset - 브라우저 기본 스타일 초기화 / CSS Reset - Reset browser default styles */
    *, *::before, *::after {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        /* 논리적 속성 초기화 / Reset logical properties */
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}

    html, body {{
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
    }}

    html {{
        font-size: 100%;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
    }}

    body {{
        font-size: 1rem;
        line-height: 1;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background-color: #f5f5f5;
    }}

    /* Typography reset */
    h1, h2, h3, h4, h5, h6 {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        font-size: 1em;
        font-weight: normal;
        line-height: 1;
        display: block;
        unicode-bidi: normal;
    }}

    p, blockquote, pre {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        display: block;
        unicode-bidi: normal;
    }}

    /* Links */
    a {{
        margin: 0;
        padding: 0;
        text-decoration: none;
        color: inherit;
        background-color: transparent;
    }}

    a:active, a:hover {{
        outline: 0;
    }}

    /* Lists */
    ul, ol, li {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        list-style: none;
    }}
    
    ul, ol {{
        display: block;
    }}
    
    li {{
        display: list-item;
    }}

    /* Tables */
    table {{
        display: table;
        border-collapse: collapse;
        border-spacing: 0;
        border-color: transparent;
        width: 100%;
        table-layout: auto;
        empty-cells: show;
    }}

    thead, tbody, tfoot {{
        margin: 0;
        padding: 0;
        border: 0;
    }}

    tr {{
        margin: 0;
        padding: 0;
        border: 0;
        display: table-row;
        vertical-align: inherit;
    }}

    th, td {{
        margin: 0;
        padding: 0;
        /* border: 0 제거 - border 클래스가 적용되도록 / Remove border: 0 to allow border classes to apply */
        text-align: left;
        font-weight: normal;
        font-style: normal;
        vertical-align: top;
        display: table-cell;
    }}

    th {{
        font-weight: normal;
    }}

    caption {{
        margin: 0;
        padding: 0;
        text-align: center;
    }}

    /* Forms */
    button, input, select, textarea {{
        margin: 0;
        padding: 0;
        border: 0;
        outline: 0;
        font: inherit;
        color: inherit;
        background: transparent;
        vertical-align: baseline;
    }}

    button, input {{
        overflow: visible;
    }}

    button, select {{
        text-transform: none;
    }}

    button, [type="button"], [type="reset"], [type="submit"] {{
        -webkit-appearance: button;
        cursor: pointer;
    }}

    button::-moz-focus-inner, [type="button"]::-moz-focus-inner, [type="reset"]::-moz-focus-inner, [type="submit"]::-moz-focus-inner {{
        border-style: none;
        padding: 0;
    }}

    input[type="checkbox"], input[type="radio"] {{
        box-sizing: border-box;
        padding: 0;
    }}

    textarea {{
        overflow: auto;
        resize: vertical;
    }}

    /* Images and media */
    img, svg, video, canvas, audio, iframe, embed, object {{
        display: block;
        max-width: 100%;
        height: auto;
        border: 0;
        vertical-align: middle;
    }}

    img {{
        border-style: none;
    }}

    svg:not(:root) {{
        overflow: hidden;
    }}

    /* Other elements */
    hr {{
        margin: 0;
        padding: 0;
        border: 0;
        height: 0;
    }}

    code, kbd, samp, pre {{
        font-family: monospace, monospace;
        font-size: 1em;
    }}

    abbr[title] {{
        border-bottom: none;
        text-decoration: underline;
        text-decoration: underline dotted;
    }}

    b, strong {{
        font-weight: normal;
    }}

    i, em {{
        font-style: normal;
    }}

    small {{
        font-size: 80%;
    }}

    sub, sup {{
        font-size: 75%;
        line-height: 0;
        position: relative;
        vertical-align: baseline;
    }}

    sub {{
        bottom: -0.25em;
    }}

    sup {{
        top: -0.5em;
    }}

    /* Additional resets */
    article, aside, details, figcaption, figure, footer, header, hgroup, main, menu, nav, section {{
        display: block;
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}
    
    /* Block-level elements reset */
    div, address, dl, dt, dd, fieldset, form, legend {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}
    
    div {{
        display: block;
    }}

    summary {{
        display: list-item;
    }}

    /* HWP Document Styles */
    .{0}document {{
        max-width: {3};
        margin: 0 auto;
        padding: {4}px {5}px {6}px {7}px;
        font-family: {1}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        line-height: 1.6;
    }}
{2}

    /* Section and Page Styles */
    .{0}Section {{
        width: 100%;
        margin: 0;
        padding: 0;
        margin-bottom: 40px;
    }}

    .{0}Paper {{
        width: 100%;
        margin: 0 auto;
        background-color: #fff;
        position: relative;
    }}

    .{0}Page {{
        width: 100%;
        box-sizing: border-box;
    }}

    .{0}HeaderPageFooter {{
        width: 100%;
        position: absolute;
        left: 0;
        box-sizing: border-box;
    }}

    .{0}HeaderPageFooter.{0}Header {{
        top: 0;
    }}

    .{0}HeaderPageFooter.{0}Footer {{
        bottom: 0;
    }}

{14}

    .{0}header {{
        margin-bottom: 20px;
    }}

    .{0}footer {{
        margin-top: 20px;
        border-top: 1px solid #ddd;
        padding-top: 10px;
    }}

    .{0}main {{
        margin: 20px 0;
    }}

    .{0}paragraph {{
        margin: 10px 0;
    }}

    .{0}outline {{
        display: block;
        margin: 10px 0;
    }}

    .{0}table {{
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
    }}

    .{0}table th,
    .{0}table td {{
        padding: 8px;
        text-align: left;
        border: 1px solid black;
    }}

    .{0}table th {{
        font-weight: bold;
    }}
    
    /* 테이블 셀 배경색은 bg-color 클래스로 처리 / Table cell background colors are handled by bg-color classes */

    .{0}image {{
        max-width: 100%;
        height: auto;
        margin: 10px 0;
    }}

    .{0}footnote-ref,
    .{0}endnote-ref {{
        text-decoration: none;
        color: #0066cc;
        font-weight: bold;
    }}

    .{0}footnote-ref:hover,
    .{0}endnote-ref:hover {{
        text-decoration: underline;
    }}

    .{0}footnote,
    .{0}endnote {{
        margin: 10px 0;
        padding: 10px;
        background-color: #f9f9f9;
        border-left: 3px solid #0066cc;
    }}

    .{0}footnotes,
    .{0}endnotes {{
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid #ddd;
    }}

    .{0}page-number {{
        font-weight: normal;
    }}

    .{0}overline {{
        text-decoration: overline;
    }}

    .{0}emboss {{
        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
    }}

    .{0}engrave {{
        text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.3);
    }}

    .{0}underline-solid {{
        text-decoration: underline;
        text-decoration-style: solid;
    }}

    .{0}underline-dotted {{
        text-decoration: underline;
        text-decoration-style: dotted;
    }}

    .{0}underline-dashed {{
        text-decoration: underline;
        text-decoration-style: dashed;
    }}

    .{0}underline-double {{
        text-decoration: underline;
        text-decoration-style: double;
    }}

    .{0}strikethrough-solid {{
        text-decoration: line-through;
        text-decoration-style: solid;
    }}

    .{0}strikethrough-dotted {{
        text-decoration: line-through;
        text-decoration-style: dotted;
    }}

    .{0}strikethrough-dashed {{
        text-decoration: line-through;
        text-decoration-style: dashed;
    }}

    .{0}footnote-back,
    .{0}endnote-back {{
        text-decoration: none;
        color: #0066cc;
        margin-left: 5px;
    }}

    .{0}footnote-back:hover,
    .{0}endnote-back:hover {{
        text-decoration: underline;
    }}

    .{0}page-break {{
        border: none;
        border-top: 2px solid #ddd;
        margin: 20px 0;
    }}

    .{0}emphasis-1::before {{
        content: "●";
        margin-right: 3px;
    }}

    .{0}emphasis-2::before {{
        content: "○";
        margin-right: 3px;
    }}

    .{0}emphasis-3::before {{
        content: "◆";
        margin-right: 3px;
    }}

    .{0}emphasis-4::before {{
        content: "◇";
        margin-right: 3px;
    }}

    .{0}emphasis-5::before {{
        content: "■";
        margin-right: 3px;
    }}

    .{0}emphasis-6::before {{
        content: "□";
        margin-right: 3px;
    }}

    .{0}emphasis-7::before {{
        content: "★";
        margin-right: 3px;
    }}

    .{0}emphasis-8::before {{
        content: "☆";
        margin-right: 3px;
    }}

               {8}
               {9}
               {10}
               {11}
               {12}
               {13}
               "#,
        css_prefix,
        default_font_family,
        font_css,
        max_width_px,
        padding_top_px,
        padding_right_px,
        padding_bottom_px,
        padding_left_px,
        color_css,
        size_css,
        border_color_css,
        background_color_css,
        border_style_css,
        border_width_css,
        section_css
    )
}
