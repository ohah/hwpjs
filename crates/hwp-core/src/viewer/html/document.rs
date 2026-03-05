use super::ctrl_header::process_ctrl_header;
use super::ctrl_header::{FootnoteBlock, FootnoteEndnoteState};
use super::line_segment::{DocumentRenderState, LineSegmentContent, LineSegmentRenderContext};
use super::page::{self, HcIBlock};
use super::pagination::{PageBreakReason, PaginationContext};
use super::paragraph::{
    render_paragraph, ParagraphPosition, ParagraphRenderContext, ParagraphRenderState,
};
use super::styles;
use super::styles::{int32_to_mm, round_to_2dp};
use super::text::extract_text_and_shapes;
use super::HtmlOptions;
use crate::document::bodytext::ctrl_header::{CtrlHeaderData, CtrlId};
use crate::document::bodytext::para_header::ColumnDivideType;
use crate::document::bodytext::{LineSegmentInfo, PageDef, ParagraphRecord};
use crate::document::HwpDocument;
use crate::viewer::core::outline::NumberTracker;
use crate::viewer::core::OutlineNumberTracker;
use crate::INT32;

/// HTML 속성값 이스케이프 (title 등) / Escape HTML attribute value (e.g. title)
fn escape_html_attribute(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

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

/// 각주 블록을 페이지 하단에 배치하기 위한 HcIBlock 생성
/// Generate HcIBlocks for footnote blocks positioned at the bottom of the page
fn generate_footnote_blocks(
    footnote_blocks: &[FootnoteBlock],
    content_height_mm: f64,
    content_width_mm: f64,
) -> Vec<HcIBlock> {
    if footnote_blocks.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();

    // 전체 각주 블록 높이 계산 (각 각주의 line_height 기반)
    // 각주 영역 = hfS 구분선 + 각 각주 블록 (line_height 간격)
    let total_footnote_height: f64 = footnote_blocks.iter().map(|b| b.height_mm).sum();
    let separator_height_mm = 0.11;
    let separator_gap_mm = 2.05; // 구분선과 첫 각주 사이 간격

    // 구분선(hfS) top 위치 = content_height_mm - total_footnote_height - separator_gap - separator_height
    let separator_top_mm = round_to_2dp(
        content_height_mm - total_footnote_height - separator_gap_mm - separator_height_mm,
    );

    // 구분선 SVG (hfS)
    let separator_width_mm = round_to_2dp(content_width_mm / 3.0);
    let hfs_html = format!(
        r#"<div class="hfS" style="left:0mm;top:{:.2}mm;width:{:.2}mm;height:{:.2}mm;"><svg class="hs" viewBox="-0.12 -0.12 {:.2} 0.35" style="left:-0.12mm;top:-0.12mm;width:{:.2}mm;height:0.35mm;left:0;top:0;"><path d="M0,0.06 L{:.0},0.06" style="stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
        separator_top_mm,
        separator_width_mm,
        separator_height_mm,
        separator_width_mm + 0.23,
        separator_width_mm + 0.23,
        separator_width_mm,
    );
    result.push(HcIBlock {
        html: hfs_html,
        left_mm: None,
        top_mm: None,
        is_raw: true,
    });

    // 각 각주를 hcD > hcI > hls 구조로 생성
    let mut footnote_top_mm =
        round_to_2dp(separator_top_mm + separator_height_mm + separator_gap_mm);
    for block in footnote_blocks {
        // top offset within hls (fixture: -0.16mm for footnote)
        let top_offset_mm = round_to_2dp((block.line_height_mm - block.height_mm) / 2.0);

        // haN 마커 너비: 글자 수 × 기준 폭 (fixture에서 역산)
        let marker_text = format!("{})", block.number);
        let marker_char_count = marker_text.chars().count() as f64;
        // 각주의 CharShape에서 폰트 크기 기반 마커 너비 계산
        let marker_width_mm =
            round_to_2dp(marker_char_count * block.height_mm / marker_char_count.max(1.0) * 0.92);

        let hcd_html = format!(
            r#"<div class="hcD" style="left:0mm;top:{:.2}mm;"><div class="hcI"><div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:0mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;"><div class="haN" style="left:0mm;top:0mm;width:{:.2}mm;height:{:.2}mm;"><span class="hrt {}">{}</span></div>{}</div></div></div>"#,
            footnote_top_mm,
            block.para_shape_class,
            block.line_height_mm,
            top_offset_mm,
            block.height_mm,
            block.width_mm,
            marker_width_mm,
            block.height_mm,
            block.char_shape_class,
            marker_text,
            block.body_html,
        );
        result.push(HcIBlock {
            html: hcd_html,
            left_mm: None,
            top_mm: None,
            is_raw: true,
        });

        footnote_top_mm = round_to_2dp(footnote_top_mm + block.height_mm);
    }

    result
}

/// 다단 상태 추적 / Multicolumn state tracking
struct MultiColumnState {
    col_count: usize,
    col_spacing_hu: i16,
    seg_width_mm: f64,
    /// 반올림 전 세그먼트 너비 (구분선 위치 계산용) / Raw segment width before rounding (for separator position calculation)
    seg_width_mm_raw: f64,
    /// 컬럼별 HTML 버퍼 / Per-column HTML buffers
    col_buffers: Vec<String>,
    /// 다단 시작 시점의 수직 위치 (mm, hcI top) / Vertical position where multicolumn starts (mm, hcI top)
    top_mm: Option<f64>,
    /// 각 컬럼의 최대 하단 위치 (mm) / Max bottom position per column (mm)
    col_max_bottoms: Vec<f64>,
    /// 구분선 종류 (0=없음, 1=실선 등) / Divider line type (0=none, 1=solid, etc.)
    div_line_type: u8,
    /// 구분선 색상 (BGR 형식) / Divider line color (BGR format)
    div_line_color: u32,
}

/// 위치 기반 컬럼 할당 / Position-based column assignment
/// 각 그룹의 first_vpos와 컬럼별 max_bottom을 비교하여 올바른 컬럼에 배치
/// Compares each group's first_vpos with per-column max_bottom to assign to correct column
/// Returns (col_idx, is_page_break)
fn assign_column(first_vpos: f64, col_max_bottoms: &[f64]) -> (usize, bool) {
    // Priority 1: 연속(continuation) — 콘텐츠가 있는 컬럼 중 first_vpos가 max_bottom에서 이어지는 컬럼
    // Continuation: column with content where first_vpos continues from max_bottom
    // max_bottom이 가장 높은(가장 가까운) 컬럼 선택 / Pick column with closest (highest) max_bottom
    let mut best_col: Option<(usize, f64)> = None;
    for (i, &bottom) in col_max_bottoms.iter().enumerate() {
        if bottom > 0.01 && first_vpos >= bottom - 1.0 {
            match best_col {
                None => best_col = Some((i, bottom)),
                Some((_, best_bottom)) => {
                    if bottom > best_bottom {
                        best_col = Some((i, bottom));
                    }
                }
            }
        }
    }
    if let Some((col_idx, _)) = best_col {
        return (col_idx, false);
    }

    // Priority 2: 빈 컬럼 (max_bottom ≈ 0) / First empty column
    for (i, &bottom) in col_max_bottoms.iter().enumerate() {
        if bottom < 0.01 {
            return (i, false);
        }
    }

    // Priority 3: 모든 컬럼에 콘텐츠 있고 연속이 아님 → 페이지 나누기
    // All columns have content, none continuing → page break
    (0, true)
}

/// hsG 형태의 도형 HTML을 인라인 hsR 형태로 변환
/// Convert hsG-wrapped shape HTML to inline hsR format
fn convert_shape_to_inline(shape_html: &str) -> String {
    // hsG 내부의 hsR을 찾아서 인라인 스타일 추가
    // Find hsR inside hsG and add inline styles
    // 구조 A (hsG 래퍼 있음): <div class="hsG" ...><div class="hsR" style="...">...</div></div>
    // 구조 B (hsR만 있음):    <div class="hsR" style="...">...</div>
    // 목표: <div class="hsR" style="margin-bottom:0mm;margin-right:0mm;display:inline-block;position:relative;vertical-align:middle;top:0mm;left:0mm;...">...</div>
    if let Some(hsr_start) = shape_html.find(r#"<div class=""#) {
        // hsG 전체에서 첫 번째 hsR div 찾기
        if let Some(hsr_pos) = shape_html[hsr_start..].find("hsR") {
            let hsr_abs_pos = hsr_start + hsr_pos - 12; // div class=" 이전으로
            let has_wrapper = hsr_abs_pos > 0; // hsR 앞에 래퍼(hsG)가 있는 경우
            let mut inner = if has_wrapper {
                // hsG 래퍼의 마지막 </div> 제거
                if let Some(last_div_end) = shape_html.rfind("</div>") {
                    shape_html[hsr_abs_pos..last_div_end].to_string()
                } else {
                    shape_html[hsr_abs_pos..].to_string()
                }
            } else {
                // 래퍼 없음 — hsR이 최상위이므로 그대로 사용
                shape_html.to_string()
            };
            // 인라인 도형은 절대 위치가 아닌 상대 위치(0mm)를 사용
            // Inline shapes use relative position (0mm) instead of absolute
            // top:Xmm → top:0mm, left:Xmm → left:0mm
            if let Some(top_start) = inner.find("top:") {
                if let Some(mm_end) = inner[top_start..].find("mm;") {
                    inner.replace_range(top_start..top_start + mm_end + 3, "top:0mm;");
                }
            }
            if let Some(left_start) = inner.find("left:") {
                if let Some(mm_end) = inner[left_start..].find("mm;") {
                    inner.replace_range(left_start..left_start + mm_end + 3, "left:0mm;");
                }
            }
            // hsR의 style에 인라인 속성 추가
            return inner.replacen(
                "style=\"",
                "style=\"margin-bottom:0mm;margin-right:0mm;display:inline-block;position:relative;vertical-align:middle;",
                1,
            );
        }
    }
    shape_html.to_string()
}

/// 라인 세그먼트를 컬럼 그룹으로 분할 / Split line segments into column groups
/// vertical_position이 이전 세그먼트 이하면 새 그룹 시작 / New group when vertical_position <= previous
pub(crate) fn split_into_column_groups(segments: &[LineSegmentInfo]) -> Vec<(usize, usize)> {
    let mut groups = Vec::new();
    if segments.is_empty() {
        return groups;
    }
    let mut group_start = 0;
    for i in 1..segments.len() {
        if segments[i].vertical_position <= segments[i - 1].vertical_position {
            groups.push((group_start, i));
            group_start = i;
        }
    }
    groups.push((group_start, segments.len()));
    groups
}

/// 다단 구분선(hcS) SVG HTML 생성 / Generate multicolumn separator (hcS) SVG HTML
/// sep_idx: 0-based separator index, content_height_mm: column content height
fn generate_separator_html(
    sep_idx: usize,
    seg_width_mm: f64,
    col_spacing_mm: f64,
    content_height_mm: f64,
    div_line_color: u32,
) -> String {
    // 구분선 좌측 위치: (i+1)*seg_width + i*col_spacing + (col_spacing - 0.11) / 2
    // Separator left: (i+1)*seg_width + i*col_spacing + (col_spacing - 0.11) / 2
    let sep_left = round_to_2dp(
        (sep_idx as f64 + 1.0) * seg_width_mm
            + sep_idx as f64 * col_spacing_mm
            + (col_spacing_mm - 0.11) / 2.0,
    );
    let stroke_color = format!("#{:06X}", div_line_color & 0x00FFFFFF);
    let view_h = round_to_2dp(content_height_mm + 0.23);
    format!(
        r#"<div class="hcS" style="left:{:.2}mm;top:0mm;width:0.11mm;height:{:.2}mm;"><svg class="hs" viewBox="-0.12 -0.12 0.35 {:.2}" style="left:-0.12mm;top:-0.12mm;width:0.35mm;height:{:.2}mm;left:0;top:0;"><path d="M0.06,0 L0.06,{:.2}" style="stroke:{};stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
        sep_left, content_height_mm, view_h, view_h, content_height_mm, stroke_color
    )
}

/// 다단 컬럼 버퍼를 HcIBlock으로 플러시 / Flush multicolumn column buffers to HcIBlocks
fn flush_multicol_to_blocks(
    mc_state: &mut Option<MultiColumnState>,
    page_blocks: &mut Vec<HcIBlock>,
) {
    if let Some(mc) = mc_state.take() {
        let col_spacing_mm_raw = int32_to_mm(mc.col_spacing_hu as i32);
        let col_spacing_mm = round_to_2dp(col_spacing_mm_raw);

        // 구분선 생성 (div_line_type > 0일 때) / Generate separators (when div_line_type > 0)
        if mc.div_line_type > 0 && mc.col_count > 1 {
            // 컬럼 콘텐츠 높이: 모든 컬럼의 max_bottom 중 최대값
            // Content height: max of all column max_bottoms
            let content_height_mm = mc.col_max_bottoms.iter().cloned().fold(0.0f64, f64::max);
            if content_height_mm > 0.01 {
                for sep_idx in 0..(mc.col_count - 1) {
                    let sep_html = generate_separator_html(
                        sep_idx,
                        mc.seg_width_mm_raw,
                        col_spacing_mm_raw,
                        content_height_mm,
                        mc.div_line_color,
                    );
                    page_blocks.push(HcIBlock {
                        html: sep_html,
                        left_mm: None,
                        top_mm: None,
                        is_raw: true,
                    });
                }
            }
        }

        for (col_idx, buffer) in mc.col_buffers.into_iter().enumerate() {
            if buffer.is_empty() {
                continue;
            }
            let left_mm = if col_idx == 0 {
                None
            } else {
                Some(round_to_2dp(
                    col_idx as f64 * (mc.seg_width_mm + col_spacing_mm),
                ))
            };
            page_blocks.push(HcIBlock {
                html: buffer,
                left_mm,
                top_mm: mc.top_mm,
                is_raw: false,
            });
        }
    }
}

/// col_buffers의 누적 콘텐츠를 HcIBlock으로 플러시 (상태 유지, 페이지 오버플로우 시 사용)
/// Flush accumulated col_buffers content to HcIBlocks (keep state alive, used on page overflow)
fn flush_col_buffers_to_blocks(mc: &mut MultiColumnState, page_blocks: &mut Vec<HcIBlock>) {
    let col_spacing_mm_raw = int32_to_mm(mc.col_spacing_hu as i32);
    let col_spacing_mm = round_to_2dp(col_spacing_mm_raw);

    // 구분선 생성 / Generate separators
    if mc.div_line_type > 0 && mc.col_count > 1 {
        let content_height_mm = mc.col_max_bottoms.iter().cloned().fold(0.0f64, f64::max);
        if content_height_mm > 0.01 {
            for sep_idx in 0..(mc.col_count - 1) {
                let sep_html = generate_separator_html(
                    sep_idx,
                    mc.seg_width_mm_raw,
                    col_spacing_mm_raw,
                    content_height_mm,
                    mc.div_line_color,
                );
                page_blocks.push(HcIBlock {
                    html: sep_html,
                    left_mm: None,
                    top_mm: None,
                    is_raw: true,
                });
            }
        }
    }

    for (col_idx, buffer) in mc.col_buffers.iter_mut().enumerate() {
        if buffer.is_empty() {
            continue;
        }
        let left_mm = if col_idx == 0 {
            None
        } else {
            Some(round_to_2dp(
                col_idx as f64 * (mc.seg_width_mm + col_spacing_mm),
            ))
        };
        page_blocks.push(HcIBlock {
            html: std::mem::take(buffer),
            left_mm,
            top_mm: mc.top_mm,
            is_raw: false,
        });
    }
    mc.col_max_bottoms.iter_mut().for_each(|b| *b = 0.0);
}

/// 다단 컬럼 정의 정보 / Multicolumn definition info
struct ColumnDefInfo {
    column_count: u8,
    column_spacing: i16,
    div_line_type: u8,
    div_line_color: u32,
}

/// 문단에서 ColumnDefinition을 찾아 반환 / Find ColumnDefinition in paragraph
fn detect_column_definition(paragraph: &crate::document::Paragraph) -> Option<ColumnDefInfo> {
    for record in &paragraph.records {
        if let ParagraphRecord::CtrlHeader { header, .. } = record {
            if let CtrlHeaderData::ColumnDefinition {
                attribute,
                column_spacing,
                divider_line_type,
                divider_line_color,
                ..
            } = &header.data
            {
                return Some(ColumnDefInfo {
                    column_count: attribute.column_count,
                    column_spacing: *column_spacing,
                    div_line_type: *divider_line_type,
                    div_line_color: *divider_line_color,
                });
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
    html.push('\n');
    html.push_str("<head>\n");
    let title = document
        .summary_information
        .as_ref()
        .and_then(|s| s.title.as_deref())
        .unwrap_or("");
    let title_escaped = escape_html_attribute(title);
    html.push_str(&format!("  <title>{}</title>\n", title_escaped));
    html.push_str("  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">\n");

    // CSS 스타일 생성 / Generate CSS styles
    html.push_str("  <style>\n");
    html.push_str(&styles::generate_css_styles(document));
    html.push_str("  </style>\n");
    html.push_str("</head>\n");
    html.push('\n');
    html.push('\n');

    // 머리말/꼬리말 수집 (본문 상단/하단에 출력) / Collect header/footer (output at top/bottom of body)
    let mut header_contents: Vec<String> = Vec::new();
    let mut footer_contents: Vec<String> = Vec::new();
    let mut footer_content_height_mm: Option<f64> = None;
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            let control_mask = &paragraph.para_header.control_mask;
            if !control_mask.has_header_footer() {
                continue;
            }
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader {
                    header: ctrl_header,
                    children,
                    paragraphs: ctrl_paragraphs,
                } = record
                {
                    if ctrl_header.ctrl_id.as_str() == CtrlId::HEADER
                        || ctrl_header.ctrl_id.as_str() == CtrlId::FOOTER
                    {
                        let r = process_ctrl_header(
                            ctrl_header,
                            children,
                            ctrl_paragraphs,
                            document,
                            options,
                            None,
                            None,
                        );
                        if let Some(h) = r.header_html {
                            header_contents.push(h);
                        }
                        if let Some(h) = r.footer_html {
                            footer_contents.push(h);
                        }
                        if r.footer_content_height_mm.is_some() {
                            footer_content_height_mm = r.footer_content_height_mm;
                        }
                    }
                }
            }
        }
    }

    html.push_str("<body>\n");

    // 머리말/꼬리말은 각 hpa 안에서 출력 (render_page에 fragment 전달) / Header/footer output inside each hpa (fragment passed to render_page)

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
    let mut page_blocks: Vec<HcIBlock> = Vec::new();
    let mut page_content = String::new(); // 현재 단일 컬럼 콘텐츠 누적 / Accumulate current single-column content
    let mut page_tables = Vec::new(); // 테이블을 별도로 저장 / Store tables separately
    let mut first_segment_pos: Option<(INT32, INT32)> = None; // 첫 번째 LineSegment 위치 저장 / Store first LineSegment position
    let mut hcd_position: Option<(f64, f64)> = None; // hcD 위치 저장 (mm 단위) / Store hcD position (in mm)
    let mut multi_col_state: Option<MultiColumnState> = None; // 다단 상태 / Multicolumn state
    let mut last_content_bottom_mm: f64 = 0.0; // 마지막 콘텐츠 하단 위치 (mm) / Last content bottom position (mm)

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
    #[allow(unused_assignments)]
    let mut outline_tracker = OutlineNumberTracker::new();
    let mut number_tracker = NumberTracker::new();

    // 각주/미주 수집 (문서 끝에 블록으로 출력) / Footnote/endnote collection (output as blocks at document end)
    let mut footnote_counter = 0u32;
    let mut endnote_counter = 0u32;
    let mut footnote_contents: Vec<FootnoteBlock> = Vec::new();
    let mut endnote_contents: Vec<FootnoteBlock> = Vec::new();

    // 페이지 높이 계산 (mm 단위) / Calculate page height (in mm)
    let page_height_mm = page_def.map(|pd| pd.effective_height_mm()).unwrap_or(297.0);
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
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            let control_mask = &paragraph.para_header.control_mask;
            let has_header_footer = control_mask.has_header_footer();
            if !has_header_footer {
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
                    // 문단 vertical_position 저장 (후속 기능을 위해) / Store paragraph vertical_position (for future features)
                    first_para_vertical_mm = Some(vertical_mm);
                }
            }
        }
    }

    // 문단 인덱스 추적 (vertical_position이 있는 문단만 카운트) / Track paragraph index (only count paragraphs with vertical_position)
    let mut para_index = 0;

    for section in &document.body_text.sections {
        // 섹션 전환 시 개요 번호 카운터 리셋 / Reset outline counter on section change
        outline_tracker = OutlineNumberTracker::new();

        // 섹션의 개요 번호 정의 ID 추출 (SectionDefinition의 number_para_shape_id)
        // Extract outline numbering definition ID from SectionDefinition
        let mut section_outline_numbering_id: u16 = 0;
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    if let CtrlHeaderData::SectionDefinition {
                        number_para_shape_id,
                        ..
                    } = &header.data
                    {
                        section_outline_numbering_id = *number_para_shape_id;
                        break;
                    }
                }
            }
            if section_outline_numbering_id > 0 {
                break;
            }
        }

        let mut prev_has_page_divide = false;
        for paragraph in &section.paragraphs {
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

            // 다단 진행 중 VerticalReset 억제 / Suppress VerticalReset during multicolumn
            // 다단 문단의 vertical_position은 컬럼 상대적이므로 0으로 리셋되는 것은 정상
            // 페이지 경계는 2패스 코드 내 위치 리셋 감지로 처리
            // Multicolumn paragraph vertical_position is column-relative, so reset to 0 is normal
            // Page boundaries handled by position-reset detection in 2-pass code
            let has_page_break =
                if has_page_break && para_result.reason == Some(PageBreakReason::VerticalReset) {
                    let is_entering_multicol = detect_column_definition(paragraph)
                        .map(|info| info.column_count > 1)
                        .unwrap_or(false);
                    let is_multicol_para = paragraph
                        .para_header
                        .column_divide_type
                        .contains(&ColumnDivideType::MultiColumn);

                    // 이전 문단에 Page 경계가 있었으면 VerticalReset을 실제 페이지 브레이크로 처리
                    // If previous paragraph had a Page divide, treat VerticalReset as a real page break
                    if prev_has_page_divide {
                        true
                    } else {
                        !(is_entering_multicol || is_multicol_para || multi_col_state.is_some())
                    }
                } else {
                    has_page_break
                };

            // 페이지 나누기가 있고 페이지 내용이 있으면 페이지 출력 (문단 렌더링 전) / Output page if page break and page content exists (before rendering paragraph)
            if has_page_break
                && (!page_content.is_empty()
                    || !page_blocks.is_empty()
                    || multi_col_state.is_some()
                    || !page_tables.is_empty())
            {
                // 다단 버퍼 플러시 (상태 유지: 같은 다단 구간 내 페이지 나누기 시 상태 보존)
                // Flush multicolumn buffers (preserve state for page break within same multicolumn section)
                if let Some(mc) = multi_col_state.as_mut() {
                    flush_col_buffers_to_blocks(mc, &mut page_blocks);
                    // 새 페이지 상태 리셋 (다단 설정은 유지) / Reset for new page (keep multicolumn settings)
                    mc.top_mm = None;
                }
                // 남은 단일 컬럼 콘텐츠를 블록으로 플러시 / Flush remaining single-column content to block
                if !page_content.is_empty() {
                    page_blocks.push(HcIBlock {
                        html: std::mem::take(&mut page_content),
                        left_mm: None,
                        top_mm: None,
                        is_raw: false,
                    });
                }
                // hcD 위치: PageDef 여백을 직접 사용 / hcD position: use PageDef margins directly
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
                // 각주 블록 삽입 / Insert footnote blocks before rendering page
                if !footnote_contents.is_empty() {
                    let fn_content_width = current_page_def
                        .map(|pd| round_to_2dp(pd.content_width_mm()))
                        .unwrap_or(150.0);
                    let fn_blocks = generate_footnote_blocks(
                        &footnote_contents,
                        content_height_mm,
                        fn_content_width,
                    );
                    page_blocks.extend(fn_blocks);
                    footnote_contents.clear();
                }
                // 이전 페이지를 현재(이전) PageDef로 렌더링 / Render previous page with current (old) PageDef
                html.push_str(&page::render_page(
                    page_number,
                    &page_blocks,
                    &page_tables,
                    current_page_def,
                    first_segment_pos,
                    hcd_pos,
                    page_number_position,
                    page_start_number,
                    document,
                    header_contents.first().map(String::as_str),
                    footer_contents.first().map(String::as_str),
                    footer_content_height_mm,
                ));
                // PageDef 업데이트 — 이전 페이지 렌더링 후에 업데이트
                // 페이지 나누기 이유와 관계없이, 새 문단에 PageDef가 있으면 항상 업데이트
                // Update PageDef — update after rendering previous page
                // Always update if new paragraph has PageDef, regardless of page break reason
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
                page_number += 1;
                page_content.clear();
                page_blocks.clear();
                page_tables.clear();
                current_max_vertical_mm = 0.0;
                pagination_context.current_max_vertical_mm = 0.0;
                pagination_context.prev_vertical_mm = None;
                first_segment_pos = None; // 새 페이지에서는 첫 번째 세그먼트 위치 리셋 / Reset first segment position for new page
                hcd_position = None;
                // 페이지네이션 발생 시 para_index 리셋 / Reset para_index on pagination
                para_index = 0;
                first_para_vertical_mm = None; // 새 페이지의 첫 번째 문단 추적을 위해 리셋 / Reset to track first paragraph of new page
                last_content_bottom_mm = 0.0; // 새 페이지에서는 콘텐츠 하단 위치 리셋 / Reset content bottom on new page
            }

            // 문단 렌더링 (각주/미주 포함하여 본문 참조 출력) / Render paragraph (include footnote/endnote for in-body refs)
            // 머리말/꼬리말 문단도 본문 콘텐츠(빈 줄 등)는 렌더링 (header_html/footer_html은 별도 수집)
            // Header/footer paragraphs also render body content (empty lines); header_html/footer_html collected separately
            {
                // 첫 번째 LineSegment 위치 저장 / Store first LineSegment position
                // PageDef 여백을 직접 사용 / Use PageDef margins directly
                if first_segment_pos.is_none() {
                    // hcD 위치는 PageDef만 사용 (상수 없음). 테이블 절대 위치는 table_position()에서
                    // hcd_position 또는 segment_position으로만 계산.
                    // hcD position from PageDef only (no constants). Table position from hcd_position or segment_position only.
                    let left_margin_mm = page_def
                        .map(|pd| round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm()))
                        .unwrap_or(20.0);
                    let top_margin_mm = page_def
                        .map(|pd| round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm()))
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
                    current_para_index, // 현재 문단 인덱스 전달 / Pass current paragraph index
                    content_height_mm: Some(content_height_mm),
                    table_fragment_height_mm: None,
                    table_fragment_apply_at_index: None,
                    page_number,
                };

                let context = ParagraphRenderContext {
                    document,
                    options,
                    position,
                    body_default_hls: None,
                };

                // 2. 다단 감지 및 렌더링 / Multicolumn detection and rendering
                let is_multicol_para = paragraph
                    .para_header
                    .column_divide_type
                    .contains(&ColumnDivideType::MultiColumn);

                // ColumnDefinition 감지 / Detect ColumnDefinition
                if let Some(col_def) = detect_column_definition(paragraph) {
                    if col_def.column_count > 1 && is_multicol_para {
                        // 다단 모드 진입/변경 / Enter/change multicolumn mode
                        flush_multicol_to_blocks(&mut multi_col_state, &mut page_blocks);
                        if !page_content.is_empty() {
                            page_blocks.push(HcIBlock {
                                html: std::mem::take(&mut page_content),
                                left_mm: None,
                                top_mm: None,
                                is_raw: false,
                            });
                        }

                        let line_segs = super::paragraph::collect_line_segments(paragraph);
                        let seg_width_mm_raw = line_segs
                            .first()
                            .map(|seg| int32_to_mm(seg.segment_width))
                            .unwrap_or(70.99);
                        let seg_width_mm = round_to_2dp(seg_width_mm_raw);

                        // 다단 시작 위치: 이전 콘텐츠 하단 + 컬럼 간격 기반 갭
                        // Multicolumn start position: previous content bottom + column-spacing-based gap
                        // gap = column_spacing × (col_count - 1) / 2 (HWP units)
                        let mc_top_mm = if page_blocks.is_empty() && page_content.is_empty() {
                            None
                        } else {
                            let gap_hu = col_def.column_spacing as f64
                                * (col_def.column_count as f64 - 1.0)
                                / 2.0;
                            let gap_mm = round_to_2dp(gap_hu * 25.4 / 7200.0);
                            Some(round_to_2dp(last_content_bottom_mm + gap_mm))
                        };

                        multi_col_state = Some(MultiColumnState {
                            col_count: col_def.column_count as usize,
                            col_spacing_hu: col_def.column_spacing,
                            seg_width_mm,
                            seg_width_mm_raw,
                            col_buffers: vec![String::new(); col_def.column_count as usize],
                            top_mm: mc_top_mm,
                            col_max_bottoms: vec![0.0; col_def.column_count as usize],
                            div_line_type: col_def.div_line_type,
                            div_line_color: col_def.div_line_color,
                        });
                    } else if col_def.column_count <= 1 {
                        flush_multicol_to_blocks(&mut multi_col_state, &mut page_blocks);
                    }
                }

                // 다단 per-column 렌더링 (2패스: 렌더링 → 라운드 기반 플러시)
                // Multicolumn per-column rendering (2-pass: render → round-based flush)
                let mut mc_has_inline_content = false;
                #[allow(clippy::unnecessary_unwrap)]
                if multi_col_state.is_some() {
                    // 1패스: 모든 컬럼 그룹 렌더링 (pattern_counter/color_to_pattern 사용)
                    // Pass 1: render all column groups (uses pattern_counter/color_to_pattern)
                    let line_segments = super::paragraph::collect_line_segments(paragraph);
                    let (text, char_shapes) = extract_text_and_shapes(paragraph);
                    let (control_char_positions, shape_positions) =
                        super::paragraph::collect_control_char_positions(paragraph);

                    let para_shape_class = format!("ps{}", paragraph.para_header.para_shape_id);
                    let para_shape_indent = document
                        .doc_info
                        .para_shapes
                        .get(paragraph.para_header.para_shape_id as usize)
                        .and_then(|ps| {
                            if ps.indent != 0 {
                                Some(ps.indent)
                            } else {
                                None
                            }
                        });

                    // 인라인 콘텐츠(테이블/도형) 수집 / Collect inline content (tables/shapes)
                    use super::line_segment::TableInfo;
                    let mut mc_inline_tables: Vec<TableInfo> = Vec::new();
                    let mut mc_shape_htmls: Vec<(usize, String)> = Vec::new();
                    let mut shape_anchor_cursor: usize = 0;

                    for record in &paragraph.records {
                        if let ParagraphRecord::CtrlHeader {
                            header,
                            children,
                            paragraphs: ctrl_paragraphs,
                            ..
                        } = record
                        {
                            let anchor = shape_positions.get(shape_anchor_cursor).copied();
                            shape_anchor_cursor += 1;

                            if header.ctrl_id == "tbl " {
                                // 테이블 수집 / Collect table
                                let ctrl_result = super::ctrl_header::process_ctrl_header(
                                    header,
                                    children,
                                    ctrl_paragraphs,
                                    document,
                                    options,
                                    None,
                                    None,
                                );
                                let like_letters = match &header.data {
                                    CtrlHeaderData::ObjectCommon { attribute, .. } => {
                                        attribute.like_letters
                                    }
                                    _ => false,
                                };
                                if like_letters {
                                    for t in ctrl_result.tables.iter() {
                                        let mut tt = t.clone();
                                        tt.anchor_char_pos = anchor;
                                        mc_inline_tables.push(tt);
                                    }
                                    mc_has_inline_content = true;
                                }
                            } else if header.ctrl_id == "gso " {
                                // 도형(글상자) 수집 — 인라인 렌더링 / Collect shape (text box) — inline rendering
                                let like_letters = match &header.data {
                                    CtrlHeaderData::ObjectCommon { attribute, .. } => {
                                        attribute.like_letters
                                    }
                                    _ => false,
                                };
                                if like_letters {
                                    let ctrl_result = super::ctrl_header::process_ctrl_header(
                                        header,
                                        children,
                                        ctrl_paragraphs,
                                        document,
                                        options,
                                        None,
                                        None,
                                    );
                                    if let Some(shape_html) = ctrl_result.shape_html {
                                        // hsG 래핑을 hsR 인라인으로 변환 / Convert hsG wrapping to inline hsR
                                        let inline_html = convert_shape_to_inline(&shape_html);
                                        if let Some(anchor_pos) = anchor {
                                            mc_shape_htmls.push((anchor_pos, inline_html));
                                            mc_has_inline_content = true;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    let col_groups = split_into_column_groups(&line_segments);
                    let mut rendered_groups: Vec<(String, f64, f64)> = Vec::new(); // (html, seg_bottom, first_vpos)

                    for (start, end) in col_groups.iter() {
                        let col_segs = &line_segments[*start..*end];
                        if col_segs.is_empty() {
                            rendered_groups.push((String::new(), 0.0, 0.0));
                            continue;
                        }

                        let original_text_len = if *end < line_segments.len() {
                            line_segments[*end].text_start_position as usize
                        } else {
                            paragraph.para_header.text_char_count as usize
                        };

                        let content = LineSegmentContent {
                            segments: col_segs,
                            text: &text,
                            char_shapes: &char_shapes,
                            control_char_positions: &control_char_positions,
                            original_text_len,
                            images: &[],
                            tables: &mc_inline_tables,
                            shape_htmls: &mc_shape_htmls,
                            marker_info: None,
                            paragraph_markers: &[],
                            footnote_refs: &[],
                            endnote_refs: &[],
                            auto_numbers: &[],
                            hyperlinks: &[],
                        };

                        let ls_context = LineSegmentRenderContext {
                            document,
                            para_shape_class: &para_shape_class,
                            options,
                            para_shape_indent,
                            hcd_position: None,
                            page_def: current_page_def,
                            body_default_hls: None,
                        };

                        let col_html = {
                            let mut ls_state = DocumentRenderState {
                                table_counter_start: 0,
                                pattern_counter: &mut pattern_counter,
                                color_to_pattern: &mut color_to_pattern,
                            };
                            super::line_segment::render_line_segments_with_content(
                                &content,
                                &ls_context,
                                &mut ls_state,
                            )
                        };

                        let seg_bottom = col_segs
                            .last()
                            .map(|seg| {
                                round_to_2dp(
                                    int32_to_mm(seg.vertical_position)
                                        + int32_to_mm(seg.line_height),
                                )
                            })
                            .unwrap_or(0.0);

                        let first_vpos = col_segs
                            .first()
                            .map(|seg| round_to_2dp(int32_to_mm(seg.vertical_position)))
                            .unwrap_or(0.0);

                        rendered_groups.push((col_html, seg_bottom, first_vpos));
                    }

                    // 2패스: 위치 기반 컬럼 할당 및 페이지 나누기 판정
                    // Pass 2: position-based column assignment and page break detection
                    for (col_html, seg_bottom, first_vpos) in rendered_groups {
                        if col_html.is_empty() {
                            continue;
                        }
                        #[allow(clippy::unnecessary_unwrap)]
                        let mc = multi_col_state.as_mut().unwrap();
                        let (col_idx, is_page_break) =
                            assign_column(first_vpos, &mc.col_max_bottoms);

                        if is_page_break {
                            // 현재 페이지 출력 / Output current page
                            flush_col_buffers_to_blocks(mc, &mut page_blocks);

                            if !page_content.is_empty() {
                                page_blocks.push(HcIBlock {
                                    html: std::mem::take(&mut page_content),
                                    left_mm: None,
                                    top_mm: None,
                                    is_raw: false,
                                });
                            }
                            let hcd_pos = if let Some((left, top)) = hcd_position {
                                Some((round_to_2dp(left), round_to_2dp(top)))
                            } else {
                                let left = page_def
                                    .map(|pd| {
                                        round_to_2dp(
                                            pd.left_margin.to_mm() + pd.binding_margin.to_mm(),
                                        )
                                    })
                                    .unwrap_or(20.0);
                                let top = page_def
                                    .map(|pd| {
                                        round_to_2dp(
                                            pd.top_margin.to_mm() + pd.header_margin.to_mm(),
                                        )
                                    })
                                    .unwrap_or(24.99);
                                Some((left, top))
                            };
                            // 각주 블록 삽입 / Insert footnote blocks
                            if !footnote_contents.is_empty() {
                                let fn_content_width = current_page_def
                                    .map(|pd| round_to_2dp(pd.content_width_mm()))
                                    .unwrap_or(150.0);
                                let fn_blocks = generate_footnote_blocks(
                                    &footnote_contents,
                                    content_height_mm,
                                    fn_content_width,
                                );
                                page_blocks.extend(fn_blocks);
                                footnote_contents.clear();
                            }
                            html.push_str(&page::render_page(
                                page_number,
                                &page_blocks,
                                &page_tables,
                                current_page_def,
                                first_segment_pos,
                                hcd_pos,
                                page_number_position,
                                page_start_number,
                                document,
                                header_contents.first().map(String::as_str),
                                footer_contents.first().map(String::as_str),
                                footer_content_height_mm,
                            ));
                            page_number += 1;
                            page_content.clear();
                            page_blocks.clear();
                            page_tables.clear();
                            current_max_vertical_mm = 0.0;
                            pagination_context.current_max_vertical_mm = 0.0;
                            pagination_context.prev_vertical_mm = None;
                            first_segment_pos = None;
                            hcd_position = None;
                            para_index = 0;
                            first_para_vertical_mm = None;

                            // 새 페이지 리셋 (다단 설정 유지)
                            // Reset for new page (keep multicolumn settings)
                            mc.top_mm = None;
                            mc.col_max_bottoms.iter_mut().for_each(|b| *b = 0.0);
                        }

                        // 컬럼에 콘텐츠 추가 / Add content to column
                        mc.col_buffers[col_idx].push_str(&col_html);
                        if seg_bottom > mc.col_max_bottoms[col_idx] {
                            mc.col_max_bottoms[col_idx] = seg_bottom;
                        }

                        // last_content_bottom_mm 업데이트 / Update last_content_bottom_mm
                        let round_top = mc.top_mm.unwrap_or(0.0);
                        let max_col_bottom =
                            mc.col_max_bottoms.iter().cloned().fold(0.0f64, f64::max);
                        last_content_bottom_mm = round_top + max_col_bottom;
                    }
                }

                // render_paragraph 호출 (note_state 수명 제한을 위해 블록 사용)
                // Call render_paragraph (block limits note_state lifetime for later footnote_contents access)
                let (para_html, table_htmls, obj_pagination_result) = {
                    let mut note_state = FootnoteEndnoteState {
                        footnote_counter: &mut footnote_counter,
                        endnote_counter: &mut endnote_counter,
                        footnote_contents: &mut footnote_contents,
                        endnote_contents: &mut endnote_contents,
                    };
                    let mut state = ParagraphRenderState {
                        table_counter: &mut table_counter,
                        pattern_counter: &mut pattern_counter,
                        color_to_pattern: &mut color_to_pattern,
                        note_state: Some(&mut note_state),
                        outline_tracker: Some(&mut outline_tracker),
                        number_tracker: Some(&mut number_tracker),
                        section_outline_numbering_id,
                    };

                    if multi_col_state.is_some() {
                        // 다단: 테이블/페이지네이션만, para_html 무시
                        // 인라인 콘텐츠가 이미 컬럼에 렌더링된 경우 table_htmls에서 제외
                        // Skip table_htmls when inline content already rendered in columns
                        let (_, table_htmls, obj_result) = render_paragraph(
                            paragraph,
                            &context,
                            &mut state,
                            &mut pagination_context,
                            0,
                        );
                        let filtered_table_htmls = if mc_has_inline_content {
                            Vec::new() // 인라인 콘텐츠는 이미 컬럼에 렌더링됨
                        } else {
                            table_htmls
                        };
                        (String::new(), filtered_table_htmls, obj_result)
                    } else {
                        // 단일 컬럼 (기존 로직)
                        render_paragraph(
                            paragraph,
                            &context,
                            &mut state,
                            &mut pagination_context,
                            0,
                        )
                    }
                };

                // 3. 객체 페이지네이션 결과 처리 / Handle object pagination result
                let has_obj_page_break = obj_pagination_result
                    .as_ref()
                    .map(|r| {
                        r.has_page_break
                            && (!page_content.is_empty()
                                || !page_blocks.is_empty()
                                || !page_tables.is_empty())
                    })
                    .unwrap_or(false);

                if let Some(ref obj_result) = obj_pagination_result {
                    if obj_result.has_page_break
                        && (!page_content.is_empty()
                            || !page_blocks.is_empty()
                            || !page_tables.is_empty())
                    {
                        // TableOverflow가 문단의 두 번째 이후 테이블에서 발생한 경우,
                        // 오버플로우 이전 테이블들은 현재 페이지에 정상적으로 배치되어야 함.
                        // When TableOverflow occurs at index > 0, tables before that index
                        // were already correctly rendered and should stay on the current page.
                        if obj_result.reason == Some(PageBreakReason::TableOverflow) {
                            if let Some(overflow_idx) = obj_result.table_overflow_at_index {
                                for table_html in
                                    table_htmls.iter().take(overflow_idx.min(table_htmls.len()))
                                {
                                    page_tables.push(table_html.clone());
                                }
                            }
                        }

                        // 페이지 출력 / Output page
                        let hcd_pos = if let Some((left, top)) = hcd_position {
                            Some((round_to_2dp(left), round_to_2dp(top)))
                        } else {
                            let left = page_def
                                .map(|pd| {
                                    round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                                })
                                .unwrap_or(20.0);
                            let top = page_def
                                .map(|pd| {
                                    round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm())
                                })
                                .unwrap_or(24.99);
                            Some((left, top))
                        };
                        // 남은 단일 컬럼 콘텐츠를 블록으로 플러시 / Flush remaining single-column content to block
                        if !page_content.is_empty() {
                            page_blocks.push(HcIBlock {
                                html: std::mem::take(&mut page_content),
                                left_mm: None,
                                top_mm: None,
                                is_raw: false,
                            });
                        }
                        // 각주 블록 삽입 / Insert footnote blocks
                        if !footnote_contents.is_empty() {
                            let fn_content_width = page_def
                                .map(|pd| round_to_2dp(pd.content_width_mm()))
                                .unwrap_or(150.0);
                            let fn_blocks = generate_footnote_blocks(
                                &footnote_contents,
                                content_height_mm,
                                fn_content_width,
                            );
                            page_blocks.extend(fn_blocks);
                            footnote_contents.clear();
                        }
                        html.push_str(&page::render_page(
                            page_number,
                            &page_blocks,
                            &page_tables,
                            page_def,
                            first_segment_pos,
                            hcd_pos,
                            page_number_position,
                            page_start_number,
                            document,
                            header_contents.first().map(String::as_str),
                            footer_contents.first().map(String::as_str),
                            footer_content_height_mm,
                        ));
                        page_number += 1;
                        page_content.clear();
                        page_blocks.clear();
                        page_tables.clear();
                        current_max_vertical_mm = 0.0;
                        pagination_context.current_max_vertical_mm = 0.0;
                        pagination_context.prev_vertical_mm = None;
                        first_segment_pos = None;
                        hcd_position = None;
                        // 페이지네이션 발생 시 para_index 리셋 / Reset para_index on pagination
                        para_index = 0;
                        first_para_vertical_mm = None; // 새 페이지의 첫 번째 문단 추적을 위해 리셋 / Reset to track first paragraph of new page

                        // 페이지네이션 후 같은 문단의 후속 테이블들을 새 페이지에 배치하기 위해 문단을 다시 렌더링
                        // Re-render paragraph to place subsequent tables on new page after pagination
                        // 새 페이지의 hcD 좌표를 current_page_def에서 계산해 position_next에 넣어 재렌더 시 테이블 위치가 올바른 기준을 사용하도록 함
                        // Compute new page's hcD from current_page_def so re-render uses correct content origin (fixes page 3 layout)
                        let hcd_pos_next = current_page_def
                            .map(|pd| {
                                (
                                    round_to_2dp(
                                        pd.left_margin.to_mm() + pd.binding_margin.to_mm(),
                                    ),
                                    round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm()),
                                )
                            })
                            .unwrap_or((20.0, 24.99));

                        if !table_htmls.is_empty() {
                            // 현재 문단의 vertical_position을 0으로 설정하여 새 페이지의 첫 문단으로 처리
                            // Set current paragraph's vertical_position to 0 to treat it as first paragraph of new page
                            let current_para_vertical_mm_for_next =
                                if current_para_vertical_mm.is_some() {
                                    Some(0.0)
                                } else {
                                    current_para_vertical_mm
                                };
                            let current_para_index_for_next = Some(0);

                            // TableOverflow: overflow_at_index > 0이면 오버플로우 이전 테이블은 이미 현재 페이지에 추가됨.
                            // 오버플로우한 테이블은 다음 페이지에서 처음부터 렌더(fragment 없음).
                            // overflow_at_index == 0이면 첫 테이블 자체가 페이지를 넘으므로 연속 조각 처리.
                            // When overflow_at_index > 0, tables before it are already on current page.
                            // The overflowing table renders fresh on next page (no fragment).
                            // When overflow_at_index == 0, the first table itself overflows, so use fragment.
                            let overflow_idx = obj_result.table_overflow_at_index.unwrap_or(0);
                            let (table_fragment_height_mm, table_fragment_apply_at_index) =
                                if obj_result.reason == Some(PageBreakReason::TableOverflow) {
                                    if overflow_idx > 0 {
                                        // 오버플로우 이전 테이블은 현재 페이지에 배치 완료; 오버플로우 테이블은 다음 페이지에서 전체 렌더
                                        (None, None)
                                    } else {
                                        (
                                            obj_result.table_overflow_remainder_mm,
                                            obj_result.table_overflow_at_index,
                                        )
                                    }
                                } else {
                                    (None, None)
                                };
                            let position_next = ParagraphPosition {
                                hcd_position: Some(hcd_pos_next),
                                page_def: current_page_def,
                                first_para_vertical_mm: Some(0.0),
                                current_para_vertical_mm: current_para_vertical_mm_for_next,
                                current_para_index: current_para_index_for_next,
                                content_height_mm: Some(content_height_mm),
                                table_fragment_height_mm,
                                table_fragment_apply_at_index,
                                page_number: page_number + 1, // 다음 페이지 / Next page
                            };

                            let context_next = ParagraphRenderContext {
                                document,
                                options,
                                position: position_next,
                                body_default_hls: None,
                            };

                            // TableOverflow: overflow_idx > 0이면 이전 테이블은 현재 페이지에 이미 배치했으므로 그만큼 스킵.
                            // overflow_idx == 0이면 첫 테이블 연속 조각이므로 처음부터 재렌더.
                            let skip_tables_count =
                                if obj_result.reason == Some(PageBreakReason::TableOverflow) {
                                    overflow_idx
                                } else {
                                    table_htmls.len()
                                };
                            // note_state 불필요: 재렌더 시 각주는 이미 수집됨
                            // note_state not needed: footnotes already collected in first render
                            let mut state_rerender = ParagraphRenderState {
                                table_counter: &mut table_counter,
                                pattern_counter: &mut pattern_counter,
                                color_to_pattern: &mut color_to_pattern,
                                note_state: None,
                                outline_tracker: Some(&mut outline_tracker),
                                number_tracker: Some(&mut number_tracker),
                                section_outline_numbering_id,
                            };
                            let (_para_html_next, table_htmls_next, _obj_pagination_result_next) =
                                render_paragraph(
                                    paragraph,
                                    &context_next,
                                    &mut state_rerender,
                                    &mut pagination_context,
                                    skip_tables_count,
                                );

                            // 후속 테이블들을 새 페이지에 추가
                            // Add subsequent tables to new page
                            for table_html in table_htmls_next {
                                page_tables.push(table_html);
                            }
                        }
                    }
                }

                // 현재 문단의 vertical_position 저장 (페이지별로 관리) / Store current paragraph's vertical_position (managed per page)
                // 페이지네이션이 발생하지 않은 경우에만 추가 (페이지네이션 발생 시에는 이미 위에서 설정됨) / Only set if pagination did not occur (already set above if pagination occurred)
                if !has_obj_page_break {
                    if let Some(vertical_mm) = current_para_vertical_mm {
                        first_para_vertical_mm = Some(vertical_mm);
                    }
                }

                // 인덱스 증가 (vertical_position이 있는 문단만) / Increment index (only for paragraphs with vertical_position)
                // 페이지네이션이 발생한 경우에는 인덱스를 증가시키지 않음 (이미 리셋됨) / Don't increment index if pagination occurred (already reset)
                if !has_obj_page_break && current_para_vertical_mm.is_some() {
                    para_index += 1;
                }
                if !para_html.is_empty() {
                    page_content.push_str(&para_html);
                }
                // 테이블은 hpa 레벨에 배치 (table.html 샘플 구조에 맞춤) / Tables are placed at hpa level (matching table.html sample structure)
                // TableOverflow일 때는 첫 조각은 이미 이전 페이지에 출력했으므로 table_htmls를 다시 넣지 않음
                let skip_adding_table_htmls = obj_pagination_result
                    .as_ref()
                    .is_some_and(|r| r.reason == Some(PageBreakReason::TableOverflow));
                if !skip_adding_table_htmls {
                    for table_html in table_htmls {
                        page_tables.push(table_html);
                    }
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
                        // 단일 컬럼 문단의 콘텐츠 하단 위치 추적 (다단 top_mm 계산용)
                        // Track single-column paragraph content bottom (for multicolumn top_mm calculation)
                        if multi_col_state.is_none() {
                            if let Some(last_seg) = segments.last() {
                                let seg_bottom = round_to_2dp(
                                    int32_to_mm(last_seg.vertical_position)
                                        + int32_to_mm(last_seg.line_height),
                                );
                                if seg_bottom > last_content_bottom_mm {
                                    last_content_bottom_mm = seg_bottom;
                                }
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

            // 이전 문단의 Page 경계 정보 갱신 / Update previous paragraph's Page divide info
            prev_has_page_divide = paragraph
                .para_header
                .column_divide_type
                .contains(&ColumnDivideType::Page);
        }
    }

    // 마지막 페이지 출력 / Output last page
    // 남은 다단 버퍼 플러시 / Flush remaining multicolumn buffers
    flush_multicol_to_blocks(&mut multi_col_state, &mut page_blocks);
    // 남은 단일 컬럼 콘텐츠를 블록으로 플러시 / Flush remaining single-column content to block
    if !page_content.is_empty() {
        page_blocks.push(HcIBlock {
            html: std::mem::take(&mut page_content),
            left_mm: None,
            top_mm: None,
            is_raw: false,
        });
    }
    if !page_blocks.is_empty() || !page_tables.is_empty() {
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
        // 각주 블록 삽입 / Insert footnote blocks
        if !footnote_contents.is_empty() {
            let fn_content_width = current_page_def
                .map(|pd| round_to_2dp(pd.content_width_mm()))
                .unwrap_or(150.0);
            let fn_blocks =
                generate_footnote_blocks(&footnote_contents, content_height_mm, fn_content_width);
            page_blocks.extend(fn_blocks);
            footnote_contents.clear();
        }
        html.push_str(&page::render_page(
            page_number,
            &page_blocks,
            &page_tables,
            current_page_def,
            first_segment_pos,
            hcd_pos,
            page_number_position,
            page_start_number,
            document,
            header_contents.first().map(String::as_str),
            footer_contents.first().map(String::as_str),
            footer_content_height_mm,
        ));
    }

    // 미주 전용 페이지 렌더링 / Render endnote-only page
    if !endnote_contents.is_empty() {
        let en_page_width_mm = current_page_def
            .map(|pd| round_to_2dp(pd.effective_width_mm()))
            .unwrap_or(210.0);
        let en_page_height_mm = current_page_def
            .map(|pd| round_to_2dp(pd.effective_height_mm()))
            .unwrap_or(297.0);
        let en_left_mm = current_page_def
            .map(|pd| round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm()))
            .unwrap_or(30.0);
        let en_top_mm = current_page_def
            .map(|pd| round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm()))
            .unwrap_or(35.0);
        let en_content_width_mm = current_page_def
            .map(|pd| round_to_2dp(pd.content_width_mm()))
            .unwrap_or(150.0);

        let mut en_page_html = format!(
            r#"<div class="hpa" style="width:{}mm;height:{}mm;"><div class="hcD" style="left:{}mm;top:{}mm;">"#,
            en_page_width_mm, en_page_height_mm, en_left_mm, en_top_mm
        );

        // 각 미주를 hcD > hcI > hls 구조로 배치 (top: 0mm부터 순차)
        let mut en_block_top_mm = 0.0f64;
        for block in &endnote_contents {
            let top_offset_mm = round_to_2dp((block.line_height_mm - block.height_mm) / 2.0);
            let marker_text = format!("{})", block.number);
            let marker_char_count = marker_text.chars().count() as f64;
            let marker_width_mm = round_to_2dp(
                marker_char_count * block.height_mm / marker_char_count.max(1.0) * 0.97,
            );

            en_page_html.push_str(&format!(
                r#"<div class="hcD" style="left:0mm;top:{:.2}mm;"><div class="hcI"><div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:0mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;"><div class="haN" style="left:0mm;top:0mm;width:{:.2}mm;height:{:.2}mm;"><span class="hrt {}">{}</span></div>{}</div></div></div>"#,
                en_block_top_mm,
                block.para_shape_class,
                block.line_height_mm,
                top_offset_mm,
                block.height_mm,
                en_content_width_mm,
                marker_width_mm,
                block.height_mm,
                block.char_shape_class,
                marker_text,
                block.body_html,
            ));

            en_block_top_mm = round_to_2dp(en_block_top_mm + block.height_mm);
        }

        // 빈 hcI (fixture와 일치)
        en_page_html.push_str(r#"<div class="hcI"></div>"#);
        en_page_html.push_str("</div></div>");
        html.push_str(&en_page_html);
    }

    html.push_str("</body>");
    html.push('\n');
    html.push('\n');
    html.push_str("</html>");
    html.push('\n');

    html
}
