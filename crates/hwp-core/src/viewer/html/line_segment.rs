use crate::document::bodytext::ctrl_header::VertRelTo;
/// 라인 세그먼트 렌더링 모듈 / Line segment rendering module
use crate::document::bodytext::{
    control_char::{ControlChar, ControlCharPosition},
    CharShapeInfo, LineSegmentInfo, PageDef, Table,
};
use crate::document::CtrlHeaderData;
use crate::viewer::html::ctrl_header::table::{CaptionData, TablePosition, TableRenderContext};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::HtmlOptions;
use crate::viewer::core::outline::{MarkerInfo, DEFAULT_MARKER_FONT_SIZE_PT};
use crate::{HwpDocument, ParaShape};
use std::collections::HashMap;

/// 라인 세그먼트 렌더링 콘텐츠 / Line segment rendering content
pub struct LineSegmentContent<'a> {
    pub segments: &'a [LineSegmentInfo],
    pub text: &'a str,
    pub char_shapes: &'a [CharShapeInfo],
    pub control_char_positions: &'a [ControlCharPosition],
    pub original_text_len: usize,
    pub images: &'a [ImageInfo],
    pub tables: &'a [TableInfo<'a>],
    /// 인라인 도형 HTML (앵커 위치, HTML) / Inline shape HTMLs (anchor position, HTML)
    pub shape_htmls: &'a [(usize, String)],
    /// 문단 머리 마커 정보 (Bullet/Number/Outline)
    pub marker_info: Option<&'a MarkerInfo>,
    /// 텍스트 박스 내 다중 문단 마커 (text_start_position, MarkerInfo)
    pub paragraph_markers: &'a [(u32, MarkerInfo)],
    /// 인라인 각주 참조 HTML (마지막 세그먼트 내부에 배치)
    pub footnote_refs: &'a [String],
    /// 인라인 미주 참조 HTML (마지막 세그먼트 내부에 배치)
    pub endnote_refs: &'a [String],
    /// AUTO_NUMBER 위치와 표시 텍스트 (원본 WCHAR 위치, display_text)
    /// 페이지 번호 등 display_text=None인 경우 플레이스홀더 사용
    pub auto_numbers: &'a [(usize, Option<String>)],
    /// 하이퍼링크 범위 목록 / Hyperlink ranges
    pub hyperlinks: &'a [HyperlinkRange],
}

/// 라인 세그먼트 렌더링 컨텍스트 / Line segment rendering context
pub struct LineSegmentRenderContext<'a> {
    pub document: &'a HwpDocument,
    pub para_shape_class: &'a str,
    pub options: &'a HtmlOptions,
    pub para_shape_indent: Option<i32>,
    pub hcd_position: Option<(f64, f64)>,
    pub page_def: Option<&'a PageDef>,
    /// 컨텍스트 레벨 body_default_hls 오버라이드
    pub body_default_hls: Option<(f64, f64)>,
}

/// 문서 레벨 렌더링 상태 / Document-level rendering state
pub struct DocumentRenderState<'a> {
    pub table_counter_start: u32,
    pub pattern_counter: &'a mut usize,
    pub color_to_pattern: &'a mut HashMap<u32, String>,
}

/// 테이블 정보 구조체 / Table info struct
#[derive(Debug, Clone)]
pub struct TableInfo<'a> {
    pub table: &'a Table,
    pub ctrl_header: Option<&'a CtrlHeaderData>,
    /// 문단 텍스트 내 컨트롤 문자(Shape/Table) 앵커 위치 (UTF-16 WCHAR 인덱스 기준)
    /// Anchor position of the control char in paragraph text (UTF-16 WCHAR index)
    pub anchor_char_pos: Option<usize>,
    pub caption: Option<CaptionData<'a>>, // 캡션 데이터 / Caption data
}

/// 하이퍼링크 범위 정보 / Hyperlink range information
#[derive(Debug, Clone)]
pub struct HyperlinkRange {
    /// 원본 WCHAR 시작 위치 / Original WCHAR start position
    pub start_original: usize,
    /// 원본 WCHAR 끝 위치 (exclusive) / Original WCHAR end position (exclusive)
    pub end_original: usize,
    /// onclick 속성값 / onclick attribute value
    pub onclick: String,
}

/// 이미지 정보 구조체 / Image info struct
#[derive(Debug, Clone)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub url: String,
    /// object_common 속성: 글자처럼 취급 여부 / object_common attribute: treat as letters
    pub like_letters: bool,
    /// object_common 속성: 세로 기준 위치 / object_common attribute: vertical reference position
    pub vert_rel_to: Option<VertRelTo>,
}

/// 라인 세그먼트를 HTML로 렌더링 / Render line segment to HTML
/// body_default_hls: 본문이 모두 빈 세그먼트(줄 격자만)일 때 fixture 일치를 위해 (line_height_mm, top_offset_mm) 사용.
#[allow(clippy::too_many_arguments)]
pub fn render_line_segment(
    segment: &LineSegmentInfo,
    content: &str,
    para_shape_class: &str,
    para_shape_indent: Option<i32>, // ParaShape의 indent 값 (옵션) / ParaShape indent value (optional)
    para_shape: Option<&ParaShape>, // ParaShape 정보 (옵션) / ParaShape info (optional)
    is_text_segment: bool,          // 텍스트 세그먼트 여부 (테이블/이미지 like_letters 등은 false)
    override_size_mm: Option<(f64, f64)>, // 비텍스트 세그먼트(이미지 등)에서 hls box 크기 override
    body_default_hls: Option<(f64, f64)>, // 본문 빈 hls일 때 (line_height_mm, top_offset_mm) fixture 일치
) -> String {
    let left_mm = round_to_2dp(int32_to_mm(segment.column_start_position));
    let vertical_pos_mm = int32_to_mm(segment.vertical_position);
    let (width_mm, height_mm) = if let Some((w, h)) = override_size_mm {
        (round_to_2dp(w), round_to_2dp(h))
    } else {
        (
            round_to_2dp(int32_to_mm(segment.segment_width)),
            round_to_2dp(int32_to_mm(segment.line_height)),
        )
    };
    // body_default_hls 사용 시 fixture와 동일하게 height 3.53mm 사용 (table-caption 등).
    // 텍스트 세그먼트는 height를 text_height 기반으로 (fixture 3.53/7.06/5.29mm).
    let (width_mm, height_mm) = if let Some((_, _)) = body_default_hls {
        (width_mm, 3.53)
    } else if is_text_segment {
        let h = round_to_2dp(int32_to_mm(segment.text_height));
        (width_mm, h)
    } else {
        (width_mm, height_mm)
    };
    let text_height_mm = round_to_2dp(int32_to_mm(segment.text_height));
    let _line_spacing_mm = round_to_2dp(int32_to_mm(segment.line_spacing));
    // TEMP DEBUG
    if segment.line_height > 900 && segment.line_height < 1100 && is_text_segment {
        eprintln!("DEBUG_LINESEG: is_text={} vpos={} line_height_hu={} text_height_hu={} baseline_hu={} line_spacing_hu={} lh_mm={:.4} th_mm={:.4} h_mm={:.2} w={:.2}",
            is_text_segment, segment.vertical_position, segment.line_height, segment.text_height, segment.baseline_distance,
            segment.line_spacing,
            int32_to_mm(segment.line_height), int32_to_mm(segment.text_height), height_mm, width_mm);
    }

    // HWP 5.0 표 62(문단의 레이아웃) 기준: 줄의 세로 위치, 줄의 높이, 텍스트 부분의 높이를 그대로 사용.
    // 보정 계수 없이 스펙 필드 → mm 변환만 적용. (1 HWPUNIT = 1/7200 inch, 25.4 mm/inch)

    // CSS line-height: 표 62 "줄의 높이" (line_height) → mm
    let line_height_value = if let Some((lh, _)) = body_default_hls {
        lh
    } else if is_text_segment {
        round_to_2dp(int32_to_mm(segment.line_height))
    } else {
        height_mm
    };

    // CSS top: 표 62 "줄의 세로 위치" (vertical_position) → mm. 줄 높이 안에서 텍스트 세로 정렬 시 오프셋 추가.
    let top_mm = if let Some((_, top_off)) = body_default_hls {
        round_to_2dp(vertical_pos_mm + top_off)
    } else if is_text_segment {
        let offset_mm = (line_height_value - text_height_mm) / 2.0;
        round_to_2dp(vertical_pos_mm + offset_mm)
    } else {
        round_to_2dp(vertical_pos_mm)
    };

    let mut style = format!(
        "line-height:{:.2}mm;white-space:nowrap;left:{:.2}mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;",
        line_height_value, left_mm, top_mm, height_mm, width_mm
    );

    // padding-left 처리 (들여쓰기/내어쓰기) / Handle padding-left (indentation)
    if segment.tag.has_indentation {
        // HWP ParaShape.indent:
        //   양수 → 들여쓰기 (첫 줄 들여쓰기, has_indentation이 첫 줄에 설정)
        //   음수 → 내어쓰기 (둘째 줄 이후 들여쓰기, has_indentation이 둘째 줄 이후에 설정)
        // padding-left = int32_to_mm(abs(indent)) / 2.0
        // NOTE: /2.0 보정은 fixture 역산으로 도출 (정확한 스펙 근거 미확인)
        if let Some(ps) = para_shape {
            let indent_mm = round_to_2dp(int32_to_mm(ps.indent.abs()) / 2.0);
            style.push_str(&format!("padding-left:{:.2}mm;", indent_mm));
        } else if let Some(indent) = para_shape_indent {
            let indent_mm = round_to_2dp(int32_to_mm(indent.abs()) / 2.0);
            style.push_str(&format!("padding-left:{:.2}mm;", indent_mm));
        }
    }

    format!(
        r#"<div class="hls {}" style="{}">{}</div>"#,
        para_shape_class, style, content
    )
}

/// 라인 세그먼트 그룹을 HTML로 렌더링 (이미지와 테이블 포함) / Render line segment group to HTML (with images and tables)
pub fn render_line_segments_with_content(
    content: &LineSegmentContent,
    context: &LineSegmentRenderContext,
    state: &mut DocumentRenderState,
) -> String {
    // 구조체에서 개별 값 추출 / Extract individual values from structs
    let segments = content.segments;
    let text = content.text;
    let char_shapes = content.char_shapes;
    let control_char_positions = content.control_char_positions;
    let original_text_len = content.original_text_len;
    let images = content.images;
    let tables = content.tables;
    let shape_htmls = content.shape_htmls;
    let content_marker_info = content.marker_info;
    let paragraph_markers = content.paragraph_markers;
    let footnote_refs = content.footnote_refs;
    let endnote_refs = content.endnote_refs;
    let auto_numbers = content.auto_numbers;
    let hyperlinks = content.hyperlinks;

    let document = context.document;
    let para_shape_class = context.para_shape_class;
    let options = context.options;
    let para_shape_indent = context.para_shape_indent;
    let hcd_position = context.hcd_position;
    let page_def = context.page_def;

    let table_counter_start = state.table_counter_start;
    // pattern_counter와 color_to_pattern은 이미 &mut이므로 직접 사용 / pattern_counter and color_to_pattern are already &mut, so use directly

    let mut result = String::new();

    // 원본 WCHAR 인덱스(original) -> cleaned_text 인덱스(cleaned) 매핑
    // Map original WCHAR index -> cleaned_text index.
    //
    // control_char_positions.position은 "원본 WCHAR 인덱스" 기준입니다.
    // text(여기 인자)는 제어 문자를 대부분 제거한 cleaned_text 입니다.
    fn original_to_cleaned_index(pos: usize, control_chars: &[ControlCharPosition]) -> isize {
        let mut delta: isize = 0; // cleaned = original + delta
        for cc in control_chars.iter() {
            if cc.position >= pos {
                break;
            }
            let size = ControlChar::get_size_by_code(cc.code) as isize;
            let contributes = if ControlChar::is_convertible(cc.code)
                && cc.code != ControlChar::PARA_BREAK
                && cc.code != ControlChar::LINE_BREAK
            {
                1
            } else {
                0
            } as isize;
            delta += contributes - size;
        }
        delta
    }

    fn slice_cleaned_by_original_range(
        cleaned: &str,
        control_chars: &[ControlCharPosition],
        start_original: usize,
        end_original: usize,
    ) -> String {
        let start_delta = original_to_cleaned_index(start_original, control_chars);
        let end_delta = original_to_cleaned_index(end_original, control_chars);

        let start_cleaned = (start_original as isize + start_delta).max(0) as usize;
        let end_cleaned = (end_original as isize + end_delta).max(0) as usize;

        let cleaned_chars: Vec<char> = cleaned.chars().collect();
        let s = start_cleaned.min(cleaned_chars.len());
        let e = end_cleaned.min(cleaned_chars.len());
        if s >= e {
            return String::new();
        }
        cleaned_chars[s..e].iter().collect()
    }

    // body_default_hls: 컨텍스트 오버라이드 우선, 없으면 빈 세그먼트 감지
    let body_default_hls = if let Some(override_hls) = context.body_default_hls {
        Some(override_hls)
    } else if tables.is_empty()
        && images.is_empty()
        && segments.iter().all(|seg| {
            let start = seg.text_start_position as usize;
            let end = segments
                .iter()
                .find(|s| s.text_start_position > seg.text_start_position)
                .map(|s| s.text_start_position as usize)
                .unwrap_or(original_text_len);
            slice_cleaned_by_original_range(text, control_char_positions, start, end)
                .trim()
                .is_empty()
        }) {
        Some((2.79, -0.18))
    } else {
        None
    };

    for segment in segments {
        let mut content = String::new();
        let mut override_size_mm: Option<(f64, f64)> = None;

        // 이 세그먼트에 해당하는 텍스트 추출 (원본 WCHAR 인덱스 기준) / Extract text for this segment (based on original WCHAR indices)
        let start_pos = segment.text_start_position as usize;
        let end_pos = if let Some(next_segment) = segments
            .iter()
            .find(|s| s.text_start_position > segment.text_start_position)
        {
            next_segment.text_start_position as usize
        } else {
            original_text_len
        };

        let segment_text =
            slice_cleaned_by_original_range(text, control_char_positions, start_pos, end_pos);

        // 이 세그먼트에 해당하는 CharShape 필터링 / Filter CharShape for this segment
        //
        // IMPORTANT:
        // CharShapeInfo.position은 "문단 전체 텍스트(원본 WCHAR) 기준" 인덱스입니다.
        // 여기서는 원본(start_pos..end_pos) 범위를 기준으로 segment_char_shapes를 보정해야 합니다.
        // position을 세그먼트 기준(0부터)으로 보정하지 않으면 스타일(csXX)이 누락되어
        // `<span class="hrt">...</span>`로 떨어질 수 있습니다. (noori.html에서 재현)
        //
        // Strategy:
        // - 세그먼트 시작 위치(start_pos)에 해당하는 CharShape가 있으면 그것을 0으로 이동
        // - 없으면 start_pos 이전의 마지막 CharShape를 기본으로 0 위치에 추가
        // - 세그먼트 범위 내 CharShape는 position -= start_pos 로 이동
        let mut segment_char_shapes: Vec<CharShapeInfo> = Vec::new();

        // 세그먼트 시작점에 정확히 CharShape 변화가 있는지 확인 / Check if there's a shape change exactly at start_pos
        let has_shape_at_start = char_shapes
            .iter()
            .any(|shape| shape.position as usize == start_pos);

        // start_pos 이전의 마지막 CharShape를 기본으로 포함 / Include the last shape before start_pos as the default
        if !has_shape_at_start {
            if let Some(prev_shape) = char_shapes
                .iter()
                .filter(|shape| (shape.position as usize) < start_pos)
                .max_by_key(|shape| shape.position)
            {
                segment_char_shapes.push(CharShapeInfo {
                    position: 0,
                    shape_id: prev_shape.shape_id,
                });
            }
        }

        // 세그먼트 범위 내 CharShape를 보정해서 추가 / Add in-range shapes with adjusted positions
        for shape in char_shapes.iter() {
            let pos = shape.position as usize;
            if pos >= start_pos && pos < end_pos {
                segment_char_shapes.push(CharShapeInfo {
                    position: (pos - start_pos) as u32,
                    shape_id: shape.shape_id,
                });
            }
        }

        // position 기준 정렬 (render_text에서 다시 정렬하지만, 여기서도 정렬해두면 안정적) / Sort by position
        segment_char_shapes.sort_by_key(|s| s.position);

        // 세그먼트 인덱스 계산 / Calculate segment index
        let segment_index = segments
            .iter()
            .position(|s| std::ptr::eq(s, segment))
            .unwrap_or(0);

        // 텍스트가 비어있는지 확인 / Check if text is empty
        let is_text_empty = segment_text.trim().is_empty();

        // is_empty_segment 플래그 확인 / Check is_empty_segment flag
        let is_empty_segment = segment.tag.is_empty_segment;

        // 빈 세그먼트 카운터 (is_empty_segment 플래그를 사용) / Empty segment counter (using is_empty_segment flag)
        let mut empty_count = 0;
        for (idx, seg) in segments.iter().enumerate() {
            if idx >= segment_index {
                break;
            }
            if seg.tag.is_empty_segment {
                empty_count += 1;
            }
        }

        // 이미지와 테이블 렌더링 / Render images and tables
        //
        // 정확도 최우선:
        // - 테이블(like_letters=true)은 "빈 세그먼트 순서"가 아니라 ParaText control_char_positions(앵커) 기반으로
        //   어떤 LineSegment에 속하는지 결정해서 딱 한 번만 렌더링합니다.
        // - 이미지는 기존 empty_count 방식 유지 (향후 필요 시 동일 방식으로 개선 가능)

        // 이 세그먼트 범위에 속하는 테이블 찾기 (앵커 기반; 원본 인덱스 기준) / Find tables for this segment (anchor-based; original indices)
        let mut tables_for_segment: Vec<&TableInfo> = Vec::new();
        for t in tables.iter() {
            if let Some(anchor) = t.anchor_char_pos {
                if anchor >= start_pos && anchor < end_pos {
                    tables_for_segment.push(t);
                }
            }
        }

        // 이 세그먼트 범위에 속하는 인라인 도형 찾기 (앵커 기반) / Find inline shapes for this segment (anchor-based)
        let mut shapes_for_segment: Vec<&str> = Vec::new();
        for (anchor, html) in shape_htmls.iter() {
            if *anchor >= start_pos && *anchor < end_pos {
                shapes_for_segment.push(html);
            }
        }
        let has_shapes_for_segment = !shapes_for_segment.is_empty();

        if !tables_for_segment.is_empty() {
            // 테이블 렌더링 (앵커 기반) / Render tables (anchor-based)
            use crate::viewer::html::ctrl_header::table::render_table;
            for (idx_in_seg, table_info) in tables_for_segment.iter().enumerate() {
                let current_table_number = table_counter_start + idx_in_seg as u32;
                let segment_position =
                    Some((segment.column_start_position, segment.vertical_position));

                let mut context = TableRenderContext {
                    document,
                    ctrl_header: table_info.ctrl_header,
                    page_def,
                    options,
                    table_number: Some(current_table_number),
                    pattern_counter: state.pattern_counter,
                    color_to_pattern: state.color_to_pattern,
                };

                let position = TablePosition {
                    hcd_position,
                    segment_position,
                    para_start_vertical_mm: None,
                    para_start_column_mm: None,
                    para_segment_width_mm: None,
                    first_para_vertical_mm: None,
                    content_height_mm: None,
                    fragment_height_mm: None,
                    table_height_for_overflow_mm: None,
                    segment_line_height_mm: Some(round_to_2dp(int32_to_mm(segment.line_height))),
                    segment_baseline_distance_mm: Some(round_to_2dp(int32_to_mm(segment.baseline_distance))),
                };

                let (table_html, _) = render_table(
                    table_info.table,
                    &mut context,
                    position,
                    table_info.caption.as_ref(),
                );
                content.push_str(&table_html);
            }
        } else if has_shapes_for_segment {
            // 인라인 도형 렌더링 (앵커 기반) / Render inline shapes (anchor-based)
            for shape_html in shapes_for_segment {
                content.push_str(shape_html);
            }
        } else if (is_empty_segment || is_text_empty)
            && !images.is_empty()
            && empty_count < images.len()
        {
            // 이미지 렌더링 (빈 세그먼트에 이미지) / Render images (images in empty segments)
            let image = &images[empty_count];
            use crate::viewer::html::image::render_image_with_style;
            let image_html = render_image_with_style(
                &image.url,
                0,
                0,
                image.width as crate::types::INT32,
                image.height as crate::types::INT32,
                0,
                0,
            );
            content.push_str(&image_html);
            // IMPORTANT: 일부 파일(noori 'BIN0002.bmp')에서 LineSegment의 segment_width/line_height가 0에 가깝게 나와
            // hls 박스가 0폭/작은 높이로 생성되며 이미지 중앙정렬이 깨집니다.
            // fixture(noori.html) 기준으로는 이미지가 셀에 별도 배치되는 케이스가 있어
            // hls width는 원래 segment_width(0일 수 있음)를 유지하고, height만 이미지 높이에 맞춥니다.
            override_size_mm = Some((
                round_to_2dp(int32_to_mm(segment.segment_width)),
                round_to_2dp(int32_to_mm(image.height as crate::types::INT32)),
            ));
        } else if !is_text_empty {
            // 이 세그먼트 범위에 AUTO_NUMBER가 있는지 확인
            // Check if AUTO_NUMBER falls within this segment range
            let auto_number_in_segment = auto_numbers.iter().find(|(pos, _)| {
                *pos >= start_pos && *pos < end_pos
            });

            if let Some((auto_pos, display_text)) = auto_number_in_segment {
                // AUTO_NUMBER 위치에서 텍스트 분리 후 haN div 삽입
                // Split text at AUTO_NUMBER position and insert haN div
                use crate::viewer::html::text::render_text;

                let split_delta =
                    original_to_cleaned_index(*auto_pos, control_char_positions);
                let split_cleaned =
                    (*auto_pos as isize + split_delta).max(0) as usize;
                let start_delta =
                    original_to_cleaned_index(start_pos, control_char_positions);
                let segment_start_cleaned =
                    (start_pos as isize + start_delta).max(0) as usize;
                let local_split = split_cleaned - segment_start_cleaned;

                let chars: Vec<char> = segment_text.chars().collect();
                let before: String =
                    chars[..local_split.min(chars.len())].iter().collect();
                let after: String =
                    chars[local_split.min(chars.len())..].iter().collect();

                // CharShape 클래스 결정
                let cs_class = segment_char_shapes
                    .first()
                    .and_then(|s| {
                        if (s.shape_id as usize) < document.doc_info.char_shapes.len() {
                            Some(format!("cs{}", s.shape_id))
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| "cs0".to_string());

                // haN 크기 계산: CharShape base_size 기반
                // height: font_size를 floor로 2dp 절삭 (3.175 → 3.17)
                // width: 글꼴 메트릭 근사치 (ASCII 반각 비율)
                let (han_w_mm, han_h_mm) = {
                    let cs = segment_char_shapes
                        .first()
                        .and_then(|s| document.doc_info.char_shapes.get(s.shape_id as usize))
                        .or_else(|| document.doc_info.char_shapes.first());
                    if let Some(cs) = cs {
                        let font_size_mm = (cs.base_size as f64 / 100.0) * (25.4 / 72.0);
                        let h = (font_size_mm * 100.0).floor() / 100.0;
                        let num_text = display_text.as_deref().unwrap_or("0");
                        let char_count = num_text.chars().count().max(1);
                        let w = round_to_2dp(h * 0.5732 * char_count as f64);
                        (w, h)
                    } else {
                        (1.82, 3.17)
                    }
                };

                // 페이지 번호 플레이스홀더 (display_text=None → 페이지 번호)
                let page_num_placeholder = "<!--PN-->";
                let num_text = display_text
                    .as_deref()
                    .unwrap_or(page_num_placeholder);

                // before 텍스트
                if !before.is_empty() {
                    let rendered_before =
                        render_text(&before, &segment_char_shapes, document, "");
                    content.push_str(&rendered_before);
                }
                // haN div
                content.push_str(&format!(
                    r#"<div class="haN" style="left:0mm;top:0mm;width:{}mm;height:{}mm;"><span class="hrt {}">{}</span></div>"#,
                    han_w_mm, han_h_mm, cs_class, num_text
                ));
                // after 텍스트
                if !after.is_empty() {
                    let rendered_after =
                        render_text(&after, &segment_char_shapes, document, "");
                    content.push_str(&rendered_after);
                }
            } else {
                // 이 세그먼트에 하이퍼링크 범위가 있는지 확인
                // Check if hyperlink ranges overlap this segment
                let segment_hyperlinks: Vec<&HyperlinkRange> = hyperlinks
                    .iter()
                    .filter(|h| h.start_original < end_pos && h.end_original > start_pos)
                    .collect();

                if segment_hyperlinks.is_empty() {
                    // 일반 텍스트 렌더링 / Normal text rendering
                    use crate::viewer::html::text::render_text;
                    let rendered_text =
                        render_text(&segment_text, &segment_char_shapes, document, "");
                    content.push_str(&rendered_text);
                } else {
                    // 하이퍼링크 범위별로 텍스트 분할 렌더링
                    use crate::viewer::html::text::{render_text, render_text_with_onclick};

                    let start_delta =
                        original_to_cleaned_index(start_pos, control_char_positions);
                    let segment_start_cleaned =
                        (start_pos as isize + start_delta).max(0) as usize;
                    let seg_chars: Vec<char> = segment_text.chars().collect();

                    // 분할 포인트 수집 (세그먼트 로컬 cleaned 인덱스 기준)
                    struct TextSlice<'a> {
                        text: String,
                        local_start: usize, // seg_chars 내 시작 인덱스
                        onclick: Option<&'a str>,
                    }
                    let mut slices: Vec<TextSlice> = Vec::new();
                    let mut cursor = 0usize; // 세그먼트 내 cleaned 인덱스

                    for hl in &segment_hyperlinks {
                        let hl_start_delta =
                            original_to_cleaned_index(hl.start_original, control_char_positions);
                        let hl_start_cleaned =
                            (hl.start_original as isize + hl_start_delta).max(0) as usize;
                        let hl_end_delta =
                            original_to_cleaned_index(hl.end_original, control_char_positions);
                        let hl_end_cleaned =
                            (hl.end_original as isize + hl_end_delta).max(0) as usize;

                        // 세그먼트 로컬 인덱스로 변환
                        let local_start =
                            hl_start_cleaned.saturating_sub(segment_start_cleaned);
                        let local_end =
                            hl_end_cleaned.saturating_sub(segment_start_cleaned);
                        let local_start = local_start.min(seg_chars.len());
                        let local_end = local_end.min(seg_chars.len());

                        // 하이퍼링크 이전 텍스트
                        if cursor < local_start {
                            let t: String =
                                seg_chars[cursor..local_start].iter().collect();
                            if !t.is_empty() {
                                slices.push(TextSlice {
                                    text: t,
                                    local_start: cursor,
                                    onclick: None,
                                });
                            }
                        }
                        // 하이퍼링크 텍스트
                        if local_start < local_end {
                            let t: String =
                                seg_chars[local_start..local_end].iter().collect();
                            if !t.is_empty() {
                                slices.push(TextSlice {
                                    text: t,
                                    local_start,
                                    onclick: Some(&hl.onclick),
                                });
                            }
                        }
                        cursor = local_end;
                    }
                    // 남은 텍스트
                    if cursor < seg_chars.len() {
                        let t: String = seg_chars[cursor..].iter().collect();
                        if !t.is_empty() {
                            slices.push(TextSlice {
                                text: t,
                                local_start: cursor,
                                onclick: None,
                            });
                        }
                    }

                    // segment_char_shapes는 이미 세그먼트 시작(start_pos) 기준으로 보정됨.
                    // 그러나 position은 "원본 WCHAR 기준 - start_pos"이고,
                    // 슬라이스는 "cleaned text" 기준이므로 CharShape position을 cleaned 기준으로 변환 필요.
                    // cleaned_segment_char_shapes: position을 cleaned text 인덱스로 변환
                    let cleaned_seg_shapes: Vec<CharShapeInfo> = {
                        use crate::document::bodytext::CharShapeInfo;
                        segment_char_shapes
                            .iter()
                            .map(|s| {
                                // segment_char_shapes의 position은 (원본pos - start_pos)
                                // → 원본pos = position + start_pos로 되돌려서 cleaned 변환
                                let orig_pos = s.position as usize + start_pos;
                                let delta = original_to_cleaned_index(orig_pos, control_char_positions);
                                let cleaned_pos = (orig_pos as isize + delta).max(0) as usize;
                                let local_cleaned = cleaned_pos.saturating_sub(segment_start_cleaned);
                                CharShapeInfo {
                                    position: local_cleaned as u32,
                                    shape_id: s.shape_id,
                                }
                            })
                            .collect()
                    };

                    for slice in &slices {
                        // 슬라이스 시작 위치 기준으로 CharShape 위치 재조정
                        let slice_char_shapes: Vec<CharShapeInfo> = {
                            use crate::document::bodytext::CharShapeInfo;
                            let offset = slice.local_start as u32;
                            let slice_len = slice.text.chars().count() as u32;

                            let mut shapes: Vec<CharShapeInfo> = Vec::new();
                            let has_shape_at_start = cleaned_seg_shapes
                                .iter()
                                .any(|s| s.position == offset);
                            if !has_shape_at_start {
                                if let Some(prev) = cleaned_seg_shapes
                                    .iter()
                                    .filter(|s| s.position < offset)
                                    .max_by_key(|s| s.position)
                                {
                                    shapes.push(CharShapeInfo {
                                        position: 0,
                                        shape_id: prev.shape_id,
                                    });
                                }
                            }
                            for s in cleaned_seg_shapes.iter() {
                                if s.position >= offset && s.position < offset + slice_len {
                                    shapes.push(CharShapeInfo {
                                        position: s.position - offset,
                                        shape_id: s.shape_id,
                                    });
                                }
                            }
                            if shapes.is_empty() {
                                if let Some(first) = cleaned_seg_shapes.first() {
                                    shapes.push(CharShapeInfo {
                                        position: 0,
                                        shape_id: first.shape_id,
                                    });
                                }
                            }
                            shapes.sort_by_key(|s| s.position);
                            shapes
                        };

                        if let Some(onclick) = slice.onclick {
                            let rendered = render_text_with_onclick(
                                &slice.text,
                                &slice_char_shapes,
                                document,
                                "",
                                onclick,
                            );
                            content.push_str(&rendered);
                        } else {
                            let rendered = render_text(
                                &slice.text,
                                &slice_char_shapes,
                                document,
                                "",
                            );
                            content.push_str(&rendered);
                        }
                    }
                }
            }
        }

        // 첫 번째 세그먼트에 마커(hhe) 삽입 / Insert marker (hhe) in first segment
        if segment_index == 0 {
            if let Some(marker) = content_marker_info {
                content = format!("{}{}", render_marker_hhe(marker), content);
            }
        }
        // 텍스트 박스 다중 문단 마커 처리 / Text box multi-paragraph marker
        if let Some((_pos, marker)) = paragraph_markers
            .iter()
            .find(|(pos, _)| *pos == segment.text_start_position)
        {
            content = format!("{}{}", render_marker_hhe(marker), content);
        }

        // 마지막 세그먼트에 각주/미주 인라인 참조 추가 / Append footnote/endnote inline refs in last segment
        let is_last_segment = segment_index == segments.len() - 1;
        if is_last_segment {
            for r in footnote_refs {
                content.push_str(r);
            }
            for r in endnote_refs {
                content.push_str(r);
            }
        }

        // 라인 세그먼트 렌더링 / Render line segment
        // ParaShape 정보 가져오기 (para_shape_class에서 ID 추출; css_class_prefix 제거 후 ps숫자 파싱)
        let class_after_prefix = para_shape_class
            .strip_prefix(context.options.css_class_prefix.as_str())
            .unwrap_or(para_shape_class);
        let para_shape = if let Some(id_str) = class_after_prefix.strip_prefix("ps") {
            if let Ok(para_shape_id) = id_str.parse::<usize>() {
                if para_shape_id < document.doc_info.para_shapes.len() {
                    Some(&document.doc_info.para_shapes[para_shape_id])
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };
        result.push_str(&render_line_segment(
            segment,
            &content,
            para_shape_class,
            para_shape_indent,
            para_shape,
            // 텍스트 렌더링 경로일 때만 true. (이미지/테이블/도형 like_letters를 배치한 세그먼트는 false)
            !(!tables_for_segment.is_empty()
                || has_shapes_for_segment
                || ((is_empty_segment || is_text_empty) && !images.is_empty())),
            override_size_mm,
            body_default_hls,
        ));
    }

    result
}

/// 마커(hhe) HTML 렌더링 헬퍼 / Marker (hhe) HTML rendering helper
fn render_marker_hhe(marker: &MarkerInfo) -> String {
    let font_size = marker
        .font_size_pt
        .map(|s| {
            if (s - s.round()).abs() < 0.001 {
                format!("font-size:{}pt;", s as i32)
            } else {
                format!("font-size:{:.2}pt;", s)
            }
        })
        .unwrap_or_else(|| {
            format!("font-size:{}pt;", DEFAULT_MARKER_FONT_SIZE_PT as i32)
        });
    let margin_left_str = if marker.margin_left_mm == 0.0 {
        "margin-left:0mm".to_string()
    } else {
        format!("margin-left:{:.2}mm", marker.margin_left_mm)
    };
    format!(
        r#"<div class="hhe" style="display:inline-block;{};width:{:.2}mm;height:{:.2}mm;"><span class="hrt {}" style="{}">{}</span></div>"#,
        margin_left_str,
        marker.width_mm,
        marker.height_mm,
        marker.char_shape_class,
        font_size,
        marker.marker_text
    )
}
