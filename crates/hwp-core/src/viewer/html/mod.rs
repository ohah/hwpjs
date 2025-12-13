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

use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::Table;
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
                // 직접 PageDef인 경우 / Direct PageDef
                if let ParagraphRecord::PageDef { page_def } = record {
                    return Some(page_def);
                }
                // CtrlHeader의 children에서 PageDef 찾기 / Find PageDef in CtrlHeader's children
                if let ParagraphRecord::CtrlHeader { children, .. } = record {
                    for child in children {
                        if let ParagraphRecord::PageDef { page_def } = child {
                            return Some(page_def);
                        }
                    }
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
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&crate::document::bodytext::PageDef>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> (String, Vec<String>) {
    let mut result = String::new();

    // ParaShape 클래스 가져오기 / Get ParaShape class
    let para_shape_id = paragraph.para_header.para_shape_id;
    // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
    let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
        format!("ps{}", para_shape_id)
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
    let mut tables: Vec<(
        &Table,
        Option<&CtrlHeaderData>,
        Option<String>, // 캡션 텍스트 / Caption text
    )> = Vec::new();

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
                tables.push((table, None, None));
            }
            ParagraphRecord::CtrlHeader {
                header,
                children,
                paragraphs,
                ..
            } => {
                // CtrlHeader의 children에서 테이블 찾기 / Find tables in CtrlHeader's children
                // CtrlHeader 객체를 직접 전달 / Pass CtrlHeader object directly
                let ctrl_header = match &header.data {
                    CtrlHeaderData::ObjectCommon { .. } => Some(&header.data),
                    _ => None,
                };
                // 캡션 텍스트 추출: paragraphs 필드에서 모든 캡션 수집 / Extract caption text: collect all captions from paragraphs field
                let mut caption_texts: Vec<String> = Vec::new();
                let mut found_table = false;
                // paragraphs 필드에서 모든 캡션 수집 / Collect all captions from paragraphs field
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText { text, .. } = record {
                            if !text.trim().is_empty() {
                                caption_texts.push(text.clone());
                            }
                        }
                    }
                }
                let mut caption_index = 0;
                let mut caption_text: Option<String> = None;
                for (idx, child) in children.iter().enumerate() {
                    if let ParagraphRecord::Table { table } = child {
                        found_table = true;
                        // paragraphs 필드에서 캡션 사용 (순서대로) / Use caption from paragraphs field (in order)
                        let current_caption = if caption_index < caption_texts.len() {
                            Some(caption_texts[caption_index].clone())
                        } else {
                            caption_text.clone()
                        };
                        caption_index += 1;
                        tables.push((table, ctrl_header, current_caption));
                        caption_text = None; // 다음 테이블을 위해 초기화 / Reset for next table
                    } else if found_table {
                        // 테이블 다음에 오는 문단에서 텍스트 추출 / Extract text from paragraph after table
                        if let ParagraphRecord::ParaText { text, .. } = child {
                            caption_text = Some(text.clone());
                            break;
                        } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                            // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                            for para in paragraphs {
                                for record in &para.records {
                                    if let ParagraphRecord::ParaText { text, .. } = record {
                                        caption_text = Some(text.clone());
                                        break;
                                    }
                                }
                                if caption_text.is_some() {
                                    break;
                                }
                            }
                            if caption_text.is_some() {
                                break;
                            }
                        }
                    } else {
                        // 테이블 이전에 오는 문단에서 텍스트 추출 (첫 번째 테이블의 캡션) / Extract text from paragraph before table (caption for first table)
                        if let ParagraphRecord::ParaText { text, .. } = child {
                            caption_text = Some(text.clone());
                        } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                            // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                            for para in paragraphs {
                                for record in &para.records {
                                    if let ParagraphRecord::ParaText { text, .. } = record {
                                        caption_text = Some(text.clone());
                                        break;
                                    }
                                }
                                if caption_text.is_some() {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // 테이블 HTML 리스트 생성 / Create table HTML list
    let mut table_htmls = Vec::new();
    // inline_tables는 owned tuple을 저장하므로 타입 명시 / inline_tables stores owned tuples, so specify type
    let mut inline_tables: Vec<(&Table, Option<&CtrlHeaderData>, Option<String>)> = Vec::new(); // like_letters=true인 테이블들 / Tables with like_letters=true

    // 문단의 첫 번째 LineSegment의 vertical_position 계산 (vert_rel_to: "para"일 때 사용) / Calculate first LineSegment's vertical_position (used when vert_rel_to: "para")
    let para_start_vertical_mm = line_segments
        .first()
        .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0);

    // LineSegment가 있으면 사용 / Use LineSegment if available
    if !line_segments.is_empty() {
        // like_letters=true인 테이블과 false인 테이블 분리 / Separate tables with like_letters=true and false
        let mut absolute_tables = Vec::new();
        for (table, ctrl_header, caption_text) in tables.iter() {
            let like_letters = ctrl_header
                .and_then(|h| match h {
                    CtrlHeaderData::ObjectCommon { attribute, .. } => Some(attribute.like_letters),
                    _ => None,
                })
                .unwrap_or(false);
            if like_letters {
                inline_tables.push((*table, *ctrl_header, caption_text.clone()));
            } else {
                absolute_tables.push((*table, *ctrl_header, caption_text.clone()));
            }
        }

        // ParaShape indent 값 가져오기 / Get ParaShape indent value
        // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
        let para_shape_indent = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
            Some(document.doc_info.para_shapes[para_shape_id as usize].indent)
        } else {
            None
        };

        // like_letters=true인 테이블을 line_segment에 포함 / Include tables with like_letters=true in line_segment
        // inline_tables는 Vec<(&Table, ...)>이고, TableInfo는 (&Table, ..., Option<&str>)이므로 변환 필요
        // inline_tables is Vec<(&Table, ...)> and TableInfo is (&Table, ..., Option<&str>), so need conversion
        use crate::viewer::html::line_segment::TableInfo;
        let inline_table_infos: Vec<TableInfo> = inline_tables
            .iter()
            .map(|(table, ctrl_header, caption_text)| {
                // iter()로 인해 table은 &&Table이 되므로 한 번 역참조 / table becomes &&Table due to iter(), so dereference once
                // ctrl_header는 Option<&CtrlHeaderData>이므로 복사 / ctrl_header is Option<&CtrlHeaderData>, copy
                // caption_text는 Option<String>이므로 as_deref()로 Option<&str>로 변환 / caption_text is Option<String>, convert to Option<&str> with as_deref()
                (*table, *ctrl_header, caption_text.as_deref())
            })
            .collect();
        // 테이블 번호 시작값 계산 / Calculate table number start value
        let table_counter_start = document
            .doc_info
            .document_properties
            .as_ref()
            .map(|p| p.table_start_number as u32)
            .unwrap_or(1);
        result.push_str(&line_segment::render_line_segments_with_content(
            &line_segments,
            &text,
            &char_shapes,
            document,
            &para_shape_class,
            &images,
            inline_table_infos.as_slice(), // like_letters=true인 테이블 포함 / Include tables with like_letters=true
            options,
            para_shape_indent,
            hcd_position,        // hcD 위치 전달 / Pass hcD position
            page_def,            // 페이지 정의 전달 / Pass page definition
            table_counter_start, // 테이블 번호 시작값 전달 / Pass table number start value
        ));

        // like_letters=true인 테이블은 이미 line_segment에 포함되었으므로 여기서는 처리하지 않음
        // Tables with like_letters=true are already included in line_segment, so don't process them here

        // like_letters=false인 테이블을 별도로 렌더링 (hpa 레벨에 배치) / Render tables with like_letters=false separately (placed at hpa level)
        let mut table_counter = document
            .doc_info
            .document_properties
            .as_ref()
            .map(|p| p.table_start_number as u32)
            .unwrap_or(1);
        // inline_tables의 개수만큼 table_counter 증가 (이미 line_segment에 포함되었으므로) / Increment table_counter by inline_tables count (already included in line_segment)
        table_counter += inline_tables.len() as u32;
        for (table, ctrl_header, caption_text) in absolute_tables.iter() {
            use crate::viewer::html::table::render_table;

            let table_html = render_table(
                table,
                document,
                ctrl_header.clone(),
                hcd_position,
                page_def,
                options,
                Some(table_counter),
                caption_text.as_deref(),
                None, // like_letters=false인 테이블은 segment_position 없음 / No segment_position for like_letters=false tables
                para_start_vertical_mm, // 문단 시작 위치 전달 / Pass paragraph start position
                first_para_vertical_mm, // 첫 번째 문단의 vertical_position 전달 (가설 O) / Pass first paragraph's vertical_position (Hypothesis O)
            );
            table_htmls.push(table_html);
            table_counter += 1;
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
    html.push_str("  <title></title>\n");
    html.push_str("  <meta http_quiv=\"content-type\" content=\"text/html; charset=utf-8\">\n");

    // CSS 스타일 생성 / Generate CSS styles
    let style_info = styles::StyleInfo::collect(document);
    html.push_str("  <style>\n");
    html.push_str(&styles::generate_css_styles(document, &style_info));
    html.push_str("  </style>\n");
    html.push_str("</head>\n");
    html.push_str("\n");
    html.push_str("\n");
    html.push_str("<body>\n");

    // PageDef 찾기 / Find PageDef
    let page_def = find_page_def(document);

    // 페이지별로 렌더링 / Render by page
    let mut page_number = 1;
    let mut page_content = String::new();
    let mut page_tables = Vec::new(); // 테이블을 별도로 저장 / Store tables separately
    let mut first_segment_pos: Option<(crate::types::INT32, crate::types::INT32)> = None; // 첫 번째 LineSegment 위치 저장 / Store first LineSegment position
    let mut hcd_position: Option<(f64, f64)> = None; // hcD 위치 저장 (mm 단위) / Store hcD position (in mm)

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
    let mut first_para_vertical_mm: Option<f64> = None; // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)

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
            if has_page_break && (!page_content.is_empty() || !page_tables.is_empty()) {
                // hcD 위치: PageDef 여백을 직접 사용 / hcD position: use PageDef margins directly
                use crate::types::RoundTo2dp;
                let hcd_pos = if let Some((left, top)) = hcd_position {
                    Some((left.round_to_2dp(), top.round_to_2dp()))
                } else {
                    // hcd_position이 없으면 PageDef 여백 사용 / Use PageDef margins if hcd_position not available
                    let left = page_def
                        .map(|pd| {
                            (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp()
                        })
                        .unwrap_or(20.0);
                    let top = page_def
                        .map(|pd| (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp())
                        .unwrap_or(24.99);
                    Some((left, top))
                };
                html.push_str(&page::render_page(
                    page_number,
                    &page_content,
                    &page_tables,
                    page_def,
                    first_segment_pos,
                    hcd_pos,
                ));
                page_number += 1;
                page_content.clear();
                page_tables.clear();
                current_max_vertical_mm = 0.0;
                first_segment_pos = None; // 새 페이지에서는 첫 번째 세그먼트 위치 리셋 / Reset first segment position for new page
                hcd_position = None;
            }

            // 문단 렌더링 (일반 본문 문단만) / Render paragraph (only regular body paragraphs)
            let control_mask = &paragraph.para_header.control_mask;
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();

            if !has_header_footer && !has_footnote_endnote {
                // 첫 번째 LineSegment 위치 저장 / Store first LineSegment position
                // PageDef 여백을 직접 사용 / Use PageDef margins directly
                if first_segment_pos.is_none() {
                    // hcD 위치는 left_margin + binding_margin, top_margin + header_margin을 직접 사용
                    // hcD position uses left_margin + binding_margin, top_margin + header_margin directly
                    use crate::types::RoundTo2dp;
                    let left_margin_mm = page_def
                        .map(|pd| {
                            (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp()
                        })
                        .unwrap_or(20.0);
                    let top_margin_mm = page_def
                        .map(|pd| (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp())
                        .unwrap_or(24.99);

                    hcd_position = Some((left_margin_mm, top_margin_mm));

                    // LineSegment 위치 저장 (참고용) / Store LineSegment position (for reference)
                    for record in &paragraph.records {
                        if let ParagraphRecord::ParaLineSeg { segments } = record {
                            if let Some(first_segment) = segments.first() {
                                first_segment_pos = Some((
                                    first_segment.column_start_position,
                                    first_segment.vertical_position,
                                ));
                                break;
                            }
                        }
                    }
                }

                // 첫 번째 문단의 vertical_position 추적 (가설 O) / Track first paragraph's vertical_position (Hypothesis O)
                if first_para_vertical_mm.is_none() {
                    for record in &paragraph.records {
                        if let ParagraphRecord::ParaLineSeg { segments } = record {
                            if let Some(first_segment) = segments.first() {
                                first_para_vertical_mm =
                                    Some(first_segment.vertical_position as f64 * 25.4 / 7200.0);
                                break;
                            }
                        }
                    }
                }

                let (para_html, table_htmls) = render_paragraph(
                    paragraph,
                    document,
                    options,
                    hcd_position,
                    page_def,
                    first_para_vertical_mm,
                );
                if !para_html.is_empty() {
                    page_content.push_str(&para_html);
                }
                // 테이블은 hpa 레벨에 배치 (table.html 샘플 구조에 맞춤) / Tables are placed at hpa level (matching table.html sample structure)
                for table_html in table_htmls {
                    page_tables.push(table_html);
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
    if !page_content.is_empty() || !page_tables.is_empty() {
        // hcD 위치: PageDef 여백을 직접 사용 / hcD position: use PageDef margins directly
        use crate::viewer::html::styles::round_to_2dp;
        let hcd_pos = if let Some((left, top)) = hcd_position {
            Some((round_to_2dp(left), round_to_2dp(top)))
        } else {
            // hcd_position이 없으면 PageDef 여백 사용 / Use PageDef margins if hcd_position not available
            let left = page_def
                .map(|pd| round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm()))
                .unwrap_or(20.0);
            let top = page_def
                .map(|pd| round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm()))
                .unwrap_or(24.99);
            Some((left, top))
        };
        html.push_str(&page::render_page(
            page_number,
            &page_content,
            &page_tables,
            page_def,
            first_segment_pos,
            hcd_pos,
        ));
    }

    html.push_str("</body>");
    html.push('\n');
    html.push('\n');
    html.push_str("</html>");
    html.push('\n');

    html
}
