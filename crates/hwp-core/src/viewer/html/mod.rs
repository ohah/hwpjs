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

    // 문서에서 사용되는 색상과 크기 수집 / Collect colors and sizes used in document
    let (used_colors, used_sizes) = collect_used_styles(document);

    // CSS 스타일 추가 / Add CSS styles
    html.push_str("  <style>\n");
    html.push_str(&generate_css_styles(
        css_prefix,
        document,
        page_def_opt,
        &used_colors,
        &used_sizes,
    ));
    // border_fill CSS 클래스 추가 / Add border_fill CSS classes
    html.push_str(
        &crate::viewer::html::document::bodytext::generate_border_fill_css(document, css_prefix),
    );
    html.push_str("  </style>\n");

    html.push_str("</head>\n");
    html.push_str("<body>\n");
    html.push_str(&format!(
        "  <div class=\"{}\">\n",
        format!("{}document", css_prefix)
    ));

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

    // Convert body text to HTML using common logic / 공통 로직을 사용하여 본문 텍스트를 HTML로 변환
    use crate::viewer::core::bodytext::process_bodytext;
    use crate::viewer::html::renderer::HtmlRenderer;
    let renderer = HtmlRenderer;
    let parts = process_bodytext(document, &renderer, options);

    // 머리말, 본문, 꼬리말, 각주, 미주 순서로 결합 / Combine in order: headers, body, footers, footnotes, endnotes
    if !parts.headers.is_empty() {
        html.push_str("    <header class=\"");
        html.push_str(css_prefix);
        html.push_str("header\">\n");
        for header in &parts.headers {
            html.push_str(header);
            html.push('\n');
        }
        html.push_str("    </header>\n");
    }

    html.push_str("    <main class=\"");
    html.push_str(css_prefix);
    html.push_str("main\">\n");
    for body_line in &parts.body_lines {
        html.push_str(body_line);
        html.push('\n');
    }
    html.push_str("    </main>\n");

    if !parts.footers.is_empty() {
        html.push_str("    <footer class=\"");
        html.push_str(css_prefix);
        html.push_str("footer\">\n");
        for footer in &parts.footers {
            html.push_str(footer);
            html.push('\n');
        }
        html.push_str("    </footer>\n");
    }

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

/// 문서에서 사용되는 색상과 크기 수집 / Collect colors and sizes used in document
fn collect_used_styles(
    document: &HwpDocument,
) -> (
    std::collections::HashSet<u32>,
    std::collections::HashSet<u32>,
) {
    use crate::document::ParagraphRecord;
    let mut colors = std::collections::HashSet::new();
    let mut sizes = std::collections::HashSet::new();

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
        colors: &mut std::collections::HashSet<u32>,
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
                                // 색상 수집 / Collect color
                                if char_shape.text_color.0 != 0 {
                                    colors.insert(char_shape.text_color.0);
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
                    search_in_records(children, colors, sizes, document);
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        search_in_records(&paragraph.records, colors, sizes, document);
                    }
                }
                _ => {}
            }
        }
    }

    // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            search_in_records(&paragraph.records, &mut colors, &mut sizes, document);
        }
    }

    (colors, sizes)
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

/// Generate CSS styles
/// CSS 스타일 생성
fn generate_css_styles(
    css_prefix: &str,
    document: &HwpDocument,
    _page_def_opt: Option<&crate::document::bodytext::PageDef>, // TODO: 레이아웃 깨짐 문제로 인해 일단 사용 안 함 / Temporarily unused due to layout issues
    used_colors: &std::collections::HashSet<u32>,
    used_sizes: &std::collections::HashSet<u32>,
) -> String {
    // face_names를 사용하여 폰트 CSS 생성 / Generate font CSS using face_names
    let mut font_css = String::new();
    let mut font_families = Vec::new();

    for (idx, face_name) in document.doc_info.face_names.iter().enumerate() {
        // 폰트 이름을 CSS-safe하게 변환 / Convert font name to CSS-safe
        let font_name = face_name.name.replace('"', "'");
        let css_font_name = format!("hwp-font-{}", idx);

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

    // 색상 클래스 생성 / Generate color classes
    let mut color_css = String::new();
    for &color_value in used_colors {
        let r = (color_value >> 16) & 0xFF;
        let g = (color_value >> 8) & 0xFF;
        let b = color_value & 0xFF;
        color_css.push_str(&format!(
            "    .{0}color-{1:02x}{2:02x}{3:02x} {{\n        color: rgb({4}, {5}, {6});\n    }}\n\n",
            css_prefix, r, g, b, r, g, b
        ));
    }

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

    // 페이지 크기 및 여백 계산 / Calculate page size and margins
    // TODO: 레이아웃 깨짐 문제로 인해 일단 주석 처리 / Temporarily commented out due to layout issues
    // let (max_width_px, padding_left_px, padding_right_px, padding_top_px, padding_bottom_px) =
    //     if let Some(page_def) = page_def_opt {
    //         // HWP는 72 DPI를 기준으로 함 / HWP uses 72 DPI as standard
    //         // 1 inch = 72px (HWP 표준) / 1 inch = 72px (HWP standard)
    //         let paper_width_px = page_def.paper_width.to_inches() * 72.0;
    //         let left_margin_px = page_def.left_margin.to_inches() * 72.0;
    //         let right_margin_px = page_def.right_margin.to_inches() * 72.0;
    //         let top_margin_px = page_def.top_margin.to_inches() * 72.0;
    //         let bottom_margin_px = page_def.bottom_margin.to_inches() * 72.0;
    //
    //         // max-width는 용지 전체 너비로 설정하고, 여백은 padding으로 처리
    //         // max-width is set to full paper width, margins are handled as padding
    //         (
    //             paper_width_px,
    //             left_margin_px,
    //             right_margin_px,
    //             top_margin_px,
    //             bottom_margin_px,
    //         )
    //     } else {
    //         // 기본값 / Default values
    //         (800.0, 20.0, 20.0, 20.0, 20.0)
    //     };

    // 기본값 사용 / Use default values
    let max_width_px = 800.0;
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
    }}

    /* Typography reset */
    h1, h2, h3, h4, h5, h6 {{
        margin: 0;
        padding: 0;
        font-size: 1em;
        font-weight: normal;
        line-height: 1;
    }}

    p, blockquote, pre {{
        margin: 0;
        padding: 0;
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
        list-style: none;
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
        border: 0;
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
    }}

    summary {{
        display: list-item;
    }}

    /* HWP Document Styles */
    .{0}document {{
        max-width: {3}px;
        margin: 0 auto;
        padding: {4}px {5}px {6}px {7}px;
        font-family: {1}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        line-height: 1.6;
    }}
{2}

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
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
    }}

    .{0}table th {{
        background-color: #f2f2f2;
        font-weight: bold;
    }}

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
        size_css
    )
}
