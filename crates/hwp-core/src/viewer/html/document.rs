use super::page;
use super::pagination::{PageBreakReason, PaginationContext};
use super::paragraph::{
    render_paragraph, ParagraphPosition, ParagraphRenderContext, ParagraphRenderState,
};
use super::styles;
use super::styles::round_to_2dp;
use super::HtmlOptions;
use crate::document::bodytext::ctrl_header::{CtrlHeaderData, CtrlId};
use crate::document::bodytext::{PageDef, ParagraphRecord};
use crate::document::HwpDocument;
use crate::types::RoundTo2dp;
use crate::INT32;

/// 문서에서 첫 번째 PageDef 찾기 / Find first PageDef in document
fn find_page_def(document: &HwpDocument) -> Option<&PageDef> {
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

/// 문서에서 첫 번째 PageNumberPosition 찾기 / Find first PageNumberPosition in document
fn find_page_number_position(document: &HwpDocument) -> Option<&CtrlHeaderData> {
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    if header.ctrl_id == CtrlId::PAGE_NUMBER
                        || header.ctrl_id == CtrlId::PAGE_NUMBER_POS
                    {
                        if let CtrlHeaderData::PageNumberPosition { .. } = &header.data {
                            return Some(&header.data);
                        }
                    }
                }
            }
        }
    }
    None
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
    html.push_str("  <style>\n");
    html.push_str(&styles::generate_css_styles(document));
    html.push_str("  </style>\n");
    html.push_str("</head>\n");
    html.push_str("\n");
    html.push_str("\n");
    html.push_str("<body>\n");

    // PageDef 찾기 / Find PageDef
    let page_def = find_page_def(document);

    // PageNumberPosition 찾기 / Find PageNumberPosition
    let page_number_position = find_page_number_position(document);

    // 페이지 시작 번호 가져오기 / Get page start number
    let page_start_number = document
        .doc_info
        .document_properties
        .as_ref()
        .map(|p| p.page_start_number)
        .unwrap_or(1);

    // 페이지별로 렌더링 / Render by page
    let mut page_number = 1;
    let mut page_content = String::new();
    let mut page_tables = Vec::new(); // 테이블을 별도로 저장 / Store tables separately
    let mut first_segment_pos: Option<(INT32, INT32)> = None; // 첫 번째 LineSegment 위치 저장 / Store first LineSegment position
    let mut hcd_position: Option<(f64, f64)> = None; // hcD 위치 저장 (mm 단위) / Store hcD position (in mm)

    // 문서 레벨에서 table_counter 관리 (문서 전체에서 테이블 번호 연속 유지) / Manage table_counter at document level (maintain sequential table numbers across document)
    let mut table_counter = document
        .doc_info
        .document_properties
        .as_ref()
        .map(|p| p.table_start_number as u32)
        .unwrap_or(1);

    // 문서 레벨에서 pattern_counter와 color_to_pattern 관리 (문서 전체에서 패턴 ID 공유) / Manage pattern_counter and color_to_pattern at document level (share pattern IDs across document)
    use std::collections::HashMap;
    let mut pattern_counter = 0;
    let mut color_to_pattern: HashMap<u32, String> = HashMap::new();

    // 페이지 높이 계산 (mm 단위) / Calculate page height (in mm)
    let page_height_mm = page_def.map(|pd| pd.paper_height.to_mm()).unwrap_or(297.0);
    let top_margin_mm = page_def.map(|pd| pd.top_margin.to_mm()).unwrap_or(24.99);
    let bottom_margin_mm = page_def.map(|pd| pd.bottom_margin.to_mm()).unwrap_or(10.0);
    let header_margin_mm = page_def.map(|pd| pd.header_margin.to_mm()).unwrap_or(0.0);
    let footer_margin_mm = page_def.map(|pd| pd.footer_margin.to_mm()).unwrap_or(0.0);

    // 실제 콘텐츠 영역 높이 / Actual content area height
    let content_height_mm =
        page_height_mm - top_margin_mm - bottom_margin_mm - header_margin_mm - footer_margin_mm;

    // 페이지네이션 컨텍스트 초기화 / Initialize pagination context
    let mut pagination_context = PaginationContext {
        prev_vertical_mm: None,
        current_max_vertical_mm: 0.0,
        content_height_mm,
    };
    let mut current_page_def = page_def; // 현재 페이지의 PageDef 추적 / Track current page's PageDef

    // 현재 페이지의 최대 vertical_position (mm 단위) / Maximum vertical_position of current page (in mm)
    let mut current_max_vertical_mm = 0.0;
    // 이전 문단의 마지막 vertical_position (mm 단위) / Last vertical_position of previous paragraph (in mm)
    let mut prev_vertical_mm: Option<f64> = None;
    let mut first_para_vertical_mm: Option<f64> = None; // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
                                                        // 각 문단의 vertical_position을 저장 (vert_rel_to: "para"일 때 참조 문단 찾기 위해) / Store each paragraph's vertical_position (to find reference paragraph when vert_rel_to: "para")
                                                        // 먼저 모든 문단의 vertical_position을 수집 / First collect all paragraphs' vertical_positions
    let mut para_vertical_positions: Vec<f64> = Vec::new();
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            let control_mask = &paragraph.para_header.control_mask;
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();
            if !has_header_footer && !has_footnote_endnote {
                let vertical_mm = paragraph.records.iter().find_map(|record| {
                    if let ParagraphRecord::ParaLineSeg { segments } = record {
                        segments
                            .first()
                            .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0)
                    } else {
                        None
                    }
                });
                if let Some(vertical_mm) = vertical_mm {
                    para_vertical_positions.push(vertical_mm);
                }
            }
        }
    }

    // 문단 인덱스 추적 (vertical_position이 있는 문단만 카운트) / Track paragraph index (only count paragraphs with vertical_position)
    let mut para_index = 0;

    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // 페이지네이션 컨텍스트는 아래에서 업데이트됨 / Pagination context will be updated below

            // 1. 문단 페이지 나누기 확인 (렌더링 전) / Check paragraph page break (before rendering)
            let para_result = super::pagination::check_paragraph_page_break(
                paragraph,
                &pagination_context,
                current_page_def,
            );

            // LineSegment의 vertical_position 추출 (기존 로직 유지) / Extract vertical_position from LineSegment (keep existing logic)
            let mut first_vertical_mm: Option<f64> = None;
            for record in &paragraph.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    if let Some(first_segment) = segments.first() {
                        first_vertical_mm =
                            Some(first_segment.vertical_position as f64 * 25.4 / 7200.0);
                    }
                    break;
                }
            }

            let has_page_break = para_result.has_page_break;

            // 페이지 나누기가 있고 페이지 내용이 있으면 페이지 출력 (문단 렌더링 전) / Output page if page break and page content exists (before rendering paragraph)
            if has_page_break && (!page_content.is_empty() || !page_tables.is_empty()) {
                // PageDef 업데이트 (PageDefChange인 경우) / Update PageDef (if PageDefChange)
                if para_result.reason == Some(PageBreakReason::PageDefChange) {
                    // 문단에서 PageDef 찾기 / Find PageDef in paragraph
                    for record in &paragraph.records {
                        if let ParagraphRecord::PageDef { page_def } = record {
                            current_page_def = Some(page_def);
                            break;
                        }
                        if let ParagraphRecord::CtrlHeader { children, .. } = record {
                            for child in children {
                                if let ParagraphRecord::PageDef { page_def } = child {
                                    current_page_def = Some(page_def);
                                    break;
                                }
                            }
                        }
                    }
                }
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
                    current_page_def,
                    first_segment_pos,
                    hcd_pos,
                    page_number_position,
                    page_start_number,
                    document,
                ));
                page_number += 1;
                page_content.clear();
                page_tables.clear();
                current_max_vertical_mm = 0.0;
                pagination_context.current_max_vertical_mm = 0.0;
                pagination_context.prev_vertical_mm = None;
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

                // 현재 문단의 vertical_position 계산 / Calculate current paragraph's vertical_position
                let current_para_vertical_mm = paragraph.records.iter().find_map(|record| {
                    if let ParagraphRecord::ParaLineSeg { segments } = record {
                        segments
                            .first()
                            .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0)
                    } else {
                        None
                    }
                });

                // 현재 문단 인덱스 (vertical_position이 있는 문단만 카운트) / Current paragraph index (only count paragraphs with vertical_position)
                let current_para_index = if current_para_vertical_mm.is_some() {
                    Some(para_index)
                } else {
                    None
                };

                let position = ParagraphPosition {
                    hcd_position,
                    page_def: current_page_def, // 현재 페이지의 PageDef 사용 / Use current page's PageDef
                    first_para_vertical_mm,
                    current_para_vertical_mm,
                    para_vertical_positions: &para_vertical_positions, // 모든 문단의 vertical_position 전달 / Pass all paragraphs' vertical_positions
                    current_para_index, // 현재 문단 인덱스 전달 / Pass current paragraph index
                };

                let context = ParagraphRenderContext {
                    document,
                    options,
                    position,
                };

                let mut state = ParagraphRenderState {
                    table_counter: &mut table_counter, // 문서 레벨 table_counter 전달 / Pass document-level table_counter
                    pattern_counter: &mut pattern_counter, // 문서 레벨 pattern_counter 전달 / Pass document-level pattern_counter
                    color_to_pattern: &mut color_to_pattern, // 문서 레벨 color_to_pattern 전달 / Pass document-level color_to_pattern
                };

                // 2. 문단 렌더링 (내부에서 테이블/이미지 페이지네이션 체크) / Render paragraph (check table/image pagination inside)
                let (para_html, table_htmls, obj_pagination_result) = render_paragraph(
                    paragraph,
                    &context,
                    &mut state,
                    &mut pagination_context, // 페이지네이션 컨텍스트 전달 / Pass pagination context
                );

                // 3. 객체 페이지네이션 결과 처리 / Handle object pagination result
                if let Some(obj_result) = obj_pagination_result {
                    if obj_result.has_page_break
                        && (!page_content.is_empty() || !page_tables.is_empty())
                    {
                        // 페이지 출력 / Output page
                        let hcd_pos = if let Some((left, top)) = hcd_position {
                            Some((left.round_to_2dp(), top.round_to_2dp()))
                        } else {
                            let left = page_def
                                .map(|pd| {
                                    (pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                                        .round_to_2dp()
                                })
                                .unwrap_or(20.0);
                            let top = page_def
                                .map(|pd| {
                                    (pd.top_margin.to_mm() + pd.header_margin.to_mm())
                                        .round_to_2dp()
                                })
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
                            page_number_position,
                            page_start_number,
                            document,
                        ));
                        page_number += 1;
                        page_content.clear();
                        page_tables.clear();
                        current_max_vertical_mm = 0.0;
                        pagination_context.current_max_vertical_mm = 0.0;
                        pagination_context.prev_vertical_mm = None;
                        first_segment_pos = None;
                        hcd_position = None;
                    }
                }

                // 인덱스 증가 (vertical_position이 있는 문단만) / Increment index (only for paragraphs with vertical_position)
                if current_para_vertical_mm.is_some() {
                    para_index += 1;
                }
                if !para_html.is_empty() {
                    page_content.push_str(&para_html);
                }
                // 테이블은 hpa 레벨에 배치 (table.html 샘플 구조에 맞춤) / Tables are placed at hpa level (matching table.html sample structure)
                // 페이지네이션 체크는 render_paragraph 내부에서 이미 수행되었으므로, 여기서는 바로 추가
                // Pagination check is already performed in render_paragraph, so just add tables here
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
                        }
                        break;
                    }
                }
                // 첫 번째 세그먼트의 vertical_position을 prev_vertical_mm으로 저장 / Store first segment's vertical_position as prev_vertical_mm
                if let Some(vertical) = first_vertical_mm {
                    prev_vertical_mm = Some(vertical);
                }
                // 페이지네이션 컨텍스트 업데이트 / Update pagination context
                pagination_context.current_max_vertical_mm = current_max_vertical_mm;
                pagination_context.prev_vertical_mm = prev_vertical_mm;
            }
        }
    }

    // 마지막 페이지 출력 / Output last page
    if !page_content.is_empty() || !page_tables.is_empty() {
        // hcD 위치: PageDef 여백을 직접 사용 / hcD position: use PageDef margins directly
        let hcd_pos = if let Some((left, top)) = hcd_position {
            Some((round_to_2dp(left), round_to_2dp(top)))
        } else {
            // hcd_position이 없으면 PageDef 여백 사용 / Use PageDef margins if hcd_position not available
            let left = current_page_def
                .map(|pd| round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm()))
                .unwrap_or(20.0);
            let top = current_page_def
                .map(|pd| round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm()))
                .unwrap_or(24.99);
            Some((left, top))
        };
        html.push_str(&page::render_page(
            page_number,
            &page_content,
            &page_tables,
            current_page_def,
            first_segment_pos,
            hcd_pos,
            page_number_position,
            page_start_number,
            document,
        ));
    }

    html.push_str("</body>");
    html.push('\n');
    html.push('\n');
    html.push_str("</html>");
    html.push('\n');

    html
}
