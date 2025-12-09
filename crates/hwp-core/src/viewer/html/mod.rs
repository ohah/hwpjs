/// HTML converter for HWP documents
/// HWP 문서를 HTML로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to HTML format.
/// 이 모듈은 HWP 문서를 HTML 형식으로 변환하는 기능을 제공합니다.
///
/// noori.html 스타일의 정확한 레이아웃 HTML 뷰어
mod common;
mod image;
mod line_segment;
mod page;
mod styles;
mod table;
mod text;

use crate::document::bodytext::{ColumnDivideType, ParagraphRecord};
use crate::document::HwpDocument;

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

    /// CSS 클래스 접두사 (기본값: "" - noori.html 스타일)
    /// CSS class prefix (default: "" - noori.html style)
    pub css_class_prefix: String,
}

impl Default for HtmlOptions {
    fn default() -> Self {
        Self {
            image_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: String::new(), // noori.html 스타일은 접두사 없음
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

/// 문서에서 첫 번째 PageDef 찾기 / Find first PageDef in document
fn find_page_def(document: &HwpDocument) -> Option<&crate::document::bodytext::PageDef> {
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

/// 문단을 HTML로 렌더링 / Render paragraph to HTML
/// 반환값: (문단 HTML, 테이블 HTML 리스트) / Returns: (paragraph HTML, table HTML list)
fn render_paragraph(
    paragraph: &crate::document::bodytext::Paragraph,
    document: &HwpDocument,
    options: &HtmlOptions,
) -> (String, Vec<String>) {
    let mut result = String::new();

    // ParaShape 클래스 가져오기 / Get ParaShape class
    let para_shape_id = paragraph.para_header.para_shape_id;
    let para_shape_class =
        if para_shape_id > 0 && para_shape_id as usize <= document.doc_info.para_shapes.len() {
            format!("ps{}", para_shape_id - 1)
        } else {
            String::new()
        };

    // 텍스트와 CharShape 추출 / Extract text and CharShape
    let (text, char_shapes) = text::extract_text_and_shapes(paragraph);

    // LineSegment 찾기 / Find LineSegment
    let mut line_segments = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            line_segments = segments.clone();
            break;
        }
    }

    // 이미지와 테이블 수집 / Collect images and tables
    let mut images = Vec::new();
    let mut tables = Vec::new();

    for record in &paragraph.records {
        match record {
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
            } => {
                // ShapeComponent의 children에서 이미지 찾기 / Find images in ShapeComponent's children
                for child in children {
                    if let ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } = child
                    {
                        let bindata_id = shape_component_picture.picture_info.bindata_id;
                        let image_url = common::get_image_url(
                            document,
                            bindata_id,
                            options.image_output_dir.as_deref(),
                        );
                        if !image_url.is_empty() {
                            // ShapeComponent에서 width와 height 가져오기 / Get width and height from ShapeComponent
                            images.push((shape_component.width, shape_component.height, image_url));
                        }
                    }
                }
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                let image_url = common::get_image_url(
                    document,
                    bindata_id,
                    options.image_output_dir.as_deref(),
                );
                if !image_url.is_empty() {
                    // border_rectangle에서 크기 계산 / Calculate size from border_rectangle
                    let width = (shape_component_picture.border_rectangle_x.right
                        - shape_component_picture.border_rectangle_x.left)
                        as u32;
                    let height = (shape_component_picture.border_rectangle_y.bottom
                        - shape_component_picture.border_rectangle_y.top)
                        as u32;
                    images.push((width, height, image_url));
                }
            }
            ParagraphRecord::Table { table } => {
                tables.push(table);
            }
            ParagraphRecord::CtrlHeader { children, .. } => {
                // CtrlHeader의 children에서 테이블 찾기 / Find tables in CtrlHeader's children
                for child in children {
                    if let ParagraphRecord::Table { table } = child {
                        tables.push(table);
                    }
                }
            }
            _ => {}
        }
    }

    // 테이블 HTML 리스트 생성 / Create table HTML list
    let mut table_htmls = Vec::new();

    // LineSegment가 있으면 사용 / Use LineSegment if available
    if !line_segments.is_empty() {
        // 테이블을 제외하고 LineSegment 렌더링 / Render LineSegment without tables
        result.push_str(&line_segment::render_line_segments_with_content(
            &line_segments,
            &text,
            &char_shapes,
            document,
            &para_shape_class,
            &images,
            &[], // 테이블은 제외 / Exclude tables
            options,
        ));
        // 테이블을 별도로 렌더링 (hpa 레벨에 배치) / Render tables separately (placed at hpa level)
        for table in tables.iter() {
            // 테이블 위치는 첫 번째 빈 LineSegment의 위치를 기준으로 계산
            // Table position is calculated based on first empty LineSegment position
            let table_left =
                if let Some(empty_seg) = line_segments.iter().find(|s| s.tag.is_empty_segment) {
                    empty_seg.column_start_position
                } else if let Some(first_seg) = line_segments.first() {
                    first_seg.column_start_position
                } else {
                    0
                };
            let table_top =
                if let Some(empty_seg) = line_segments.iter().find(|s| s.tag.is_empty_segment) {
                    empty_seg.vertical_position
                } else if let Some(first_seg) = line_segments.first() {
                    first_seg.vertical_position
                } else {
                    0
                };
            use crate::viewer::html::table::render_table;
            table_htmls.push(render_table(
                table, document, table_left, table_top, options,
            ));
        }
    } else if !text.is_empty() {
        // LineSegment가 없으면 텍스트만 렌더링 / Render text only if no LineSegment
        let rendered_text =
            text::render_text(&text, &char_shapes, document, &options.css_class_prefix);
        result.push_str(&format!(
            r#"<div class="hls {}">{}</div>"#,
            para_shape_class, rendered_text
        ));
    }

    (result, table_htmls)
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
    let mut html = String::new();

    // HTML 문서 시작 / Start HTML document
    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html>\n");
    html.push_str("<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge,chrome=1\">\n");
    html.push_str("\n");
    html.push_str("<head>\n");
    html.push_str("  <title>HWP 문서</title>\n");
    html.push_str("  <meta http_quiv=\"content-type\" content=\"text/html; charset=utf-8\">\n");

    // CSS 스타일 생성 / Generate CSS styles
    let style_info = styles::StyleInfo::collect(document);
    html.push_str("  <style>\n");
    html.push_str(&styles::generate_css_styles(document, &style_info));
    html.push_str("  </style>\n");
    html.push_str("</head>\n");
    html.push_str("\n");
    html.push_str("<body>\n");

    // PageDef 찾기 / Find PageDef
    let page_def = find_page_def(document);

    // 페이지별로 렌더링 / Render by page
    let mut page_number = 1;
    let mut page_content = String::new();

    // 페이지 높이 계산 (mm 단위) / Calculate page height (in mm)
    let page_height_mm = page_def.map(|pd| pd.paper_height.to_mm()).unwrap_or(297.0);
    let top_margin_mm = page_def.map(|pd| pd.top_margin.to_mm()).unwrap_or(24.99);
    let bottom_margin_mm = page_def.map(|pd| pd.bottom_margin.to_mm()).unwrap_or(10.0);
    let header_margin_mm = page_def.map(|pd| pd.header_margin.to_mm()).unwrap_or(0.0);
    let footer_margin_mm = page_def.map(|pd| pd.footer_margin.to_mm()).unwrap_or(0.0);

    // 실제 콘텐츠 영역 높이 / Actual content area height
    let content_height_mm =
        page_height_mm - top_margin_mm - bottom_margin_mm - header_margin_mm - footer_margin_mm;

    // 현재 페이지의 최대 vertical_position (mm 단위) / Maximum vertical_position of current page (in mm)
    let mut current_max_vertical_mm = 0.0;
    // 이전 문단의 마지막 vertical_position (mm 단위) / Last vertical_position of previous paragraph (in mm)
    let mut prev_vertical_mm: Option<f64> = None;

    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // 페이지 나누기 확인 / Check for page break
            // 1. column_divide_type에서 페이지 나누기 확인 / Check page break from column_divide_type
            let has_page_break_from_para = paragraph
                .para_header
                .column_divide_type
                .iter()
                .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

            // 2. LineSegment의 vertical_position 확인 / Check vertical_position from LineSegment
            // 레거시 라이브러리들(ruby-hwp, hwpjs.js)은 is_first_line_of_page를 사용하지 않고
            // vertical_position이 0이거나 이전보다 작아지면 새 페이지로 간주합니다
            // Legacy libraries (ruby-hwp, hwpjs.js) don't use is_first_line_of_page,
            // instead they consider new page when vertical_position is 0 or smaller than previous
            let mut first_vertical_mm: Option<f64> = None;
            let mut has_first_line_of_page = false;
            for record in &paragraph.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    if let Some(first_segment) = segments.first() {
                        has_first_line_of_page = first_segment.tag.is_first_line_of_page;
                        // vertical_position을 mm로 변환 / Convert vertical_position to mm
                        // HWPUNIT은 1/7200 inch, INT32는 1/7200 inch 단위
                        // 1 inch = 25.4 mm, 따라서 1 HWPUNIT = 25.4 / 7200 mm
                        first_vertical_mm =
                            Some(first_segment.vertical_position as f64 * 25.4 / 7200.0);
                    }
                    break;
                }
            }

            // 3. vertical_position이 0으로 리셋되거나 이전보다 작아지면 새 페이지 (hwpjs.js 방식) / New page if vertical_position resets to 0 or becomes smaller (hwpjs.js method)
            // hwpjs.js: if(data.paragraph.start_line === 0 || preline > parseInt(data.paragraph.start_line))
            // 레거시 라이브러리들은 is_first_line_of_page 플래그를 사용하지 않고 vertical_position으로만 판단합니다
            // Legacy libraries don't use is_first_line_of_page flag, they only use vertical_position
            let vertical_reset =
                if let (Some(prev), Some(current)) = (prev_vertical_mm, first_vertical_mm) {
                    // vertical_position이 0이거나 이전보다 작아지면 새 페이지 / New page if vertical_position is 0 or smaller than previous
                    // hwpjs.js와 동일한 로직: start_line === 0 || preline > start_line
                    current < 0.1 || (prev > 0.1 && current < prev - 0.1) // 0.1mm 미만이거나 이전보다 0.1mm 이상 작아지면 새 페이지 / New page if less than 0.1mm or 0.1mm smaller than previous
                } else if let Some(current) = first_vertical_mm {
                    // 첫 번째 문단이 아니고 vertical_position이 0이면 새 페이지 / New page if not first paragraph and vertical_position is 0
                    current < 0.1 && prev_vertical_mm.is_some()
                } else {
                    false
                };

            // 4. vertical_position이 페이지 높이를 초과하면 새 페이지 (ruby-hwp 방식) / New page if vertical_position exceeds page height (ruby-hwp method)
            let vertical_overflow = if let Some(current_vertical) = first_vertical_mm {
                current_vertical > content_height_mm && current_max_vertical_mm > 0.0
            } else {
                false
            };

            // 페이지 나누기 확인 / Check page break
            // 레거시 라이브러리들(ruby-hwp, hwpjs.js)은 is_first_line_of_page를 사용하지 않고
            // vertical_position만으로 페이지를 나눕니다. 따라서 우선순위는:
            // Legacy libraries (ruby-hwp, hwpjs.js) don't use is_first_line_of_page,
            // they only use vertical_position. So priority is:
            // 우선순위: column_divide_type > vertical_reset > vertical_overflow
            // Priority: column_divide_type > vertical_reset > vertical_overflow
            // is_first_line_of_page는 실제로 true가 되는 경우가 거의 없으므로 제외
            // is_first_line_of_page is excluded because it's rarely true in practice
            let has_page_break = has_page_break_from_para || vertical_reset || vertical_overflow;

            // 페이지 나누기가 있고 페이지 내용이 있으면 페이지 출력 (문단 렌더링 전) / Output page if page break and page content exists (before rendering paragraph)
            if has_page_break && !page_content.is_empty() {
                html.push_str(&page::render_page(page_number, &page_content, page_def));
                page_number += 1;
                page_content.clear();
                current_max_vertical_mm = 0.0;
            }

            // 문단 렌더링 (일반 본문 문단만) / Render paragraph (only regular body paragraphs)
            let control_mask = &paragraph.para_header.control_mask;
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();

            if !has_header_footer && !has_footnote_endnote {
                let (para_html, table_htmls) = render_paragraph(paragraph, document, options);
                if !para_html.is_empty() {
                    page_content.push_str(&para_html);
                }
                // 테이블은 hpa 레벨에 배치 (table.html 샘플 구조에 맞춤) / Tables are placed at hpa level (matching table.html sample structure)
                for table_html in table_htmls {
                    page_content.push_str(&table_html);
                }

                // vertical_position 업데이트 (문단의 모든 LineSegment 확인) / Update vertical_position (check all LineSegments in paragraph)
                for record in &paragraph.records {
                    if let ParagraphRecord::ParaLineSeg { segments } = record {
                        for segment in segments {
                            let vertical_mm = segment.vertical_position as f64 * 25.4 / 7200.0;
                            if vertical_mm > current_max_vertical_mm {
                                current_max_vertical_mm = vertical_mm;
                            }
                            // 첫 번째 세그먼트의 vertical_position을 prev_vertical_mm으로 저장 / Store first segment's vertical_position as prev_vertical_mm
                            if prev_vertical_mm.is_none() || first_vertical_mm.is_none() {
                                prev_vertical_mm = Some(vertical_mm);
                            }
                        }
                        break;
                    }
                }
                // 첫 번째 세그먼트의 vertical_position을 prev_vertical_mm으로 저장 / Store first segment's vertical_position as prev_vertical_mm
                if let Some(vertical) = first_vertical_mm {
                    prev_vertical_mm = Some(vertical);
                }
            }
        }
    }

    // 마지막 페이지 출력 / Output last page
    if !page_content.is_empty() {
        html.push_str(&page::render_page(page_number, &page_content, page_def));
    }

    html.push_str("</body>");
    html.push('\n');
    html.push('\n');
    html.push_str("</html>");
    html.push('\n');

    html
}
