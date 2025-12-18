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
}

/// 라인 세그먼트 렌더링 컨텍스트 / Line segment rendering context
pub struct LineSegmentRenderContext<'a> {
    pub document: &'a HwpDocument,
    pub para_shape_class: &'a str,
    pub options: &'a HtmlOptions,
    pub para_shape_indent: Option<i32>,
    pub hcd_position: Option<(f64, f64)>,
    pub page_def: Option<&'a PageDef>,
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

/// 이미지 정보 구조체 / Image info struct
#[derive(Debug, Clone)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub url: String,
    /// object_common 속성: 글자처럼 취급 여부 / object_common attribute: treat as letters
    pub like_letters: bool,
    /// object_common 속성: 줄 간격에 영향 여부 / object_common attribute: affect line spacing
    pub affect_line_spacing: bool,
    /// object_common 속성: 세로 기준 위치 / object_common attribute: vertical reference position
    pub vert_rel_to: Option<VertRelTo>,
}

/// 라인 세그먼트를 HTML로 렌더링 / Render line segment to HTML
pub fn render_line_segment(
    segment: &LineSegmentInfo,
    content: &str,
    para_shape_class: &str,
    para_shape_indent: Option<i32>, // ParaShape의 indent 값 (옵션) / ParaShape indent value (optional)
    para_shape: Option<&ParaShape>, // ParaShape 정보 (옵션) / ParaShape info (optional)
    is_text_segment: bool,          // 텍스트 세그먼트 여부 (테이블/이미지 like_letters 등은 false)
    override_size_mm: Option<(f64, f64)>, // 비텍스트 세그먼트(이미지 등)에서 hls box 크기 override
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
    let text_height_mm = round_to_2dp(int32_to_mm(segment.text_height));
    let _line_spacing_mm = round_to_2dp(int32_to_mm(segment.line_spacing));
    // baseline_distance_mm는 fixture 매칭 계산에서 직접 사용하지 않지만,
    // 필요 시 디버깅을 위해 남겨둘 수 있습니다.

    // NOTE (HWP 데이터 기반 + 스펙 기반 추론):
    // - 스펙(표 44 bit8): use_line_grid=true 인 문단은 "편집 용지의 줄 격자"를 사용합니다.
    //   이 경우 줄 높이는 격자에 의해 고정되며(=LineSegmentInfo.line_height가 의미를 갖는다고 보는 게 자연스럽고),
    //   baseline_distance는 "줄의 세로 위치에서 베이스라인까지 거리"(표 62)로서 CSS line-height 그 자체가 아닙니다.
    //
    // 따라서:
    // - use_line_grid=false: 기존처럼 line-height=baseline_distance, top은 baseline 중심 보정
    // - use_line_grid=true : line-height=line_height, top은 (line_height - text_height)/2 로 중앙 정렬
    let use_line_grid = para_shape
        .map(|ps| ps.attributes1.use_line_grid)
        .unwrap_or(false);

    let line_height_value = if is_text_segment {
        if use_line_grid {
            // 줄 격자 사용: "줄의 높이"를 사용
            round_to_2dp(int32_to_mm(segment.line_height))
        } else {
            // 일반: baseline_distance를 사용
            round_to_2dp(int32_to_mm(segment.baseline_distance))
        }
    } else {
        height_mm
    };

    let top_mm = if is_text_segment {
        if use_line_grid {
            // 줄 격자 사용: 줄 높이 안에서 텍스트를 중앙 정렬
            let offset_mm = (line_height_value - text_height_mm) / 2.0;
            round_to_2dp(vertical_pos_mm + offset_mm)
        } else {
            // 일반: baseline 보정
            let baseline_offset_mm = (line_height_value - text_height_mm) / 2.0;
            round_to_2dp(vertical_pos_mm + baseline_offset_mm)
        }
    } else {
        round_to_2dp(vertical_pos_mm)
    };

    let mut style = format!(
        "line-height:{:.2}mm;white-space:nowrap;left:{:.2}mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;",
        line_height_value, left_mm, top_mm, height_mm, width_mm
    );

    // padding-left 처리 (들여쓰기) / Handle padding-left (indentation)
    if segment.tag.has_indentation {
        // NOTE:
        // HWP ParaShape의 `indent`는 첫 줄 들여쓰기(음수 가능; 내어쓰기/행잉 인덴트 표현)이고,
        // `outdent`는 다음 줄(들여쓰기 적용 라인)의 오프셋으로 사용하는 값입니다.
        // fixture(noori.html)에서 line_segment.tag.has_indentation=true인 라인은
        // padding-left가 양수로 적용되는데, 이는 `indent`가 아니라 `outdent`에 해당합니다.
        //
        // 우선순위: ParaShape.outdent → (fallback) 전달받은 para_shape_indent
        if let Some(ps) = para_shape {
            let outdent_mm = round_to_2dp(int32_to_mm(ps.outdent));
            style.push_str(&format!("padding-left:{:.2}mm;", outdent_mm));
        } else if let Some(indent) = para_shape_indent {
            let indent_mm = round_to_2dp(int32_to_mm(indent));
            style.push_str(&format!("padding-left:{:.2}mm;", indent_mm));
        }
    }

    format!(
        r#"<div class="hls {}" style="{}">{}</div>"#,
        para_shape_class, style, content
    )
}

/// 라인 세그먼트를 HTML로 렌더링 (ParaShape indent 포함) / Render line segment to HTML (with ParaShape indent)
pub fn render_line_segment_with_indent(
    segment: &LineSegmentInfo,
    content: &str,
    para_shape_class: &str,
    para_shape_indent: Option<i32>,
) -> String {
    render_line_segment(
        segment,
        content,
        para_shape_class,
        para_shape_indent,
        None,
        true,
        None,
    )
}

/// 라인 세그먼트 그룹을 HTML로 렌더링 / Render line segment group to HTML
pub fn render_line_segments(
    segments: &[LineSegmentInfo],
    text: &str,
    char_shapes: &[CharShapeInfo],
    document: &HwpDocument,
    para_shape_class: &str,
) -> String {
    // 이 함수는 레거시 호환성을 위해 유지되지만, 내부적으로는 독립적인 pattern_counter를 사용합니다.
    // This function is kept for legacy compatibility but uses an independent pattern_counter internally.
    use std::collections::HashMap;
    let mut pattern_counter = 0;
    let mut color_to_pattern: HashMap<u32, String> = HashMap::new();

    let content = LineSegmentContent {
        segments,
        text,
        char_shapes,
        control_char_positions: &[],
        original_text_len: text.chars().count(),
        images: &[],
        tables: &[],
    };

    let context = LineSegmentRenderContext {
        document,
        para_shape_class,
        options: &HtmlOptions::default(),
        para_shape_indent: None,
        hcd_position: None,
        page_def: None,
    };

    let mut state = DocumentRenderState {
        table_counter_start: 1,
        pattern_counter: &mut pattern_counter,
        color_to_pattern: &mut color_to_pattern,
    };

    render_line_segments_with_content(&content, &context, &mut state)
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
                };

                let table_html = render_table(
                    table_info.table,
                    &mut context,
                    position,
                    table_info.caption.as_ref(),
                );
                content.push_str(&table_html);
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
            // 텍스트 렌더링 / Render text
            use crate::viewer::html::text::render_text;
            let rendered_text = render_text(&segment_text, &segment_char_shapes, document, "");
            content.push_str(&rendered_text);
        }

        // 라인 세그먼트 렌더링 / Render line segment
        // ParaShape 정보 가져오기 (para_shape_class에서 ID 추출) / Get ParaShape info (extract ID from para_shape_class)
        let para_shape = if para_shape_class.starts_with("ps") {
            if let Ok(para_shape_id) = para_shape_class[2..].parse::<usize>() {
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
            // 텍스트 렌더링 경로일 때만 true. (이미지/테이블 like_letters를 배치한 세그먼트는 false)
            !(!tables_for_segment.is_empty()
                || ((is_empty_segment || is_text_empty) && !images.is_empty())),
            override_size_mm,
        ));
    }

    result
}
