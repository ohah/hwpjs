use crate::document::bodytext::ctrl_header::VertRelTo;
/// 라인 세그먼트 렌더링 모듈 / Line segment rendering module
use crate::document::bodytext::{CharShapeInfo, LineSegmentInfo, PageDef, Table};
use crate::document::CtrlHeaderData;
use crate::viewer::html::ctrl_header::table::{CaptionInfo, CaptionText};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, ParaShape};

/// 테이블 정보 구조체 / Table info struct
#[derive(Debug, Clone)]
pub struct TableInfo<'a> {
    pub table: &'a Table,
    pub ctrl_header: Option<&'a CtrlHeaderData>,
    pub caption_text: Option<CaptionText>, // 캡션 텍스트 (구조적으로 분해됨) / Caption text (structurally parsed)
    pub caption_info: Option<CaptionInfo>, // 캡션 정보 / Caption info
    pub caption_char_shape_id: Option<usize>, // 캡션 문단의 첫 번째 char_shape_id / First char_shape_id from caption paragraph
    pub caption_para_shape_id: Option<usize>, // 캡션 문단의 para_shape_id / Para shape ID from caption paragraph
    pub caption_line_segment: Option<&'a LineSegmentInfo>, // 캡션 문단의 LineSegmentInfo / LineSegmentInfo from caption paragraph
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
    is_text_segment: bool, // 텍스트 세그먼트 여부 (테이블/이미지 like_letters 등은 false)
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
    let line_spacing_mm = round_to_2dp(int32_to_mm(segment.line_spacing));
    let baseline_distance_mm = round_to_2dp(int32_to_mm(segment.baseline_distance));

    // NOTE (fixture 기준):
    // - 일반 텍스트 세그먼트: line-height는 baseline_distance를 사용하고, top은 baseline 보정을 포함합니다.
    // - 테이블/이미지(like_letters) 등 비텍스트 세그먼트: line-height는 segment.line_height(=height)이고,
    //   top은 vertical_position 그대로 사용합니다. (fixtures/noori.html의 큰 표 hls 패턴)
    let line_height_value = if is_text_segment {
        round_to_2dp(baseline_distance_mm)
    } else {
        height_mm
    };

    let top_mm = if is_text_segment {
        // baseline 보정: (line-height - text_height) / 2
        let baseline_offset_mm = (line_height_value - text_height_mm) / 2.0;
        round_to_2dp(vertical_pos_mm + baseline_offset_mm)
    } else {
        // 비텍스트(표/이미지 등): fixture처럼 vertical_position 그대로
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
    render_line_segments_with_content(
        segments,
        text,
        char_shapes,
        document,
        para_shape_class,
        &[],
        &[],
        &HtmlOptions::default(),
        None, // ParaShape indent는 기본값으로 None 사용 / Use None as default for ParaShape indent
        None, // hcd_position은 기본값으로 None 사용 / Use None as default for hcd_position
        None, // page_def는 기본값으로 None 사용 / Use None as default for page_def
        1,    // table_counter_start는 기본값으로 1 사용 / Use 1 as default for table_counter_start
        &mut pattern_counter,
        &mut color_to_pattern,
    )
}

/// 라인 세그먼트 그룹을 HTML로 렌더링 (이미지와 테이블 포함) / Render line segment group to HTML (with images and tables)
pub fn render_line_segments_with_content(
    segments: &[LineSegmentInfo],
    text: &str,
    char_shapes: &[CharShapeInfo],
    document: &HwpDocument,
    para_shape_class: &str,
    images: &[ImageInfo],
    tables: &[TableInfo],
    options: &HtmlOptions,
    para_shape_indent: Option<i32>, // ParaShape의 indent 값 (옵션) / ParaShape indent value (optional)
    hcd_position: Option<(f64, f64)>, // hcD 위치 (mm) / hcD position (mm)
    page_def: Option<&PageDef>,     // 페이지 정의 / Page definition
    table_counter_start: u32,       // 테이블 번호 시작값 / Table number start value
    pattern_counter: &mut usize, // 문서 레벨 pattern_counter (문서 전체에서 패턴 ID 공유) / Document-level pattern_counter (share pattern IDs across document)
    color_to_pattern: &mut std::collections::HashMap<u32, String>, // 문서 레벨 color_to_pattern (문서 전체에서 패턴 ID 공유) / Document-level color_to_pattern (share pattern IDs across document)
) -> String {
    let mut result = String::new();

    for segment in segments {
        let mut content = String::new();
        let mut override_size_mm: Option<(f64, f64)> = None;

        // 이 세그먼트에 해당하는 텍스트 추출 / Extract text for this segment
        let start_pos = segment.text_start_position as usize;
        let end_pos = if let Some(next_segment) = segments
            .iter()
            .find(|s| s.text_start_position > segment.text_start_position)
        {
            next_segment.text_start_position as usize
        } else {
            text.chars().count()
        };

        let segment_text = if start_pos < text.chars().count() && end_pos <= text.chars().count() {
            text.chars()
                .skip(start_pos)
                .take(end_pos - start_pos)
                .collect::<String>()
        } else {
            String::new()
        };

        // 이 세그먼트에 해당하는 CharShape 필터링 / Filter CharShape for this segment
        //
        // IMPORTANT:
        // CharShapeInfo.position은 "문단 전체 텍스트 기준" 인덱스입니다.
        // 그런데 여기서는 segment_text를 (start_pos..end_pos)로 잘라서 render_text()에 넘기므로,
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
        // is_empty_segment 플래그가 true이고 텍스트가 비어있으면 이미지/테이블 배치 / Place images/tables if is_empty_segment is true and text is empty
        if (is_empty_segment || is_text_empty) && !images.is_empty() && empty_count < images.len() {
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
        } else if (is_empty_segment || is_text_empty)
            && !tables.is_empty()
            && empty_count >= images.len()
        {
            // 테이블 렌더링 (이미지 개수 이후의 빈 세그먼트에 테이블) / Render tables (tables in empty segments after images)
            let table_index = empty_count - images.len();
            if table_index < tables.len() {
                use crate::viewer::html::ctrl_header::table::render_table;
                // 테이블 위치는 LineSegment의 위치를 기준으로 계산 / Calculate table position based on LineSegment position
                // table.html 샘플을 보면 htb가 hcD 내부에 있고, hcD의 위치는 페이지의 절대 위치입니다
                // In table.html sample, htb is inside hcD, and hcD position is absolute page position
                // 하지만 테이블은 LineSegment 내부에 있으므로, LineSegment의 위치를 기준으로 상대 위치를 계산해야 합니다
                // However, table is inside LineSegment, so we need to calculate relative position based on LineSegment position
                // table.html에서는 htb가 hcD 내부에 있고 left:31mm, top:35.99mm인데, hcD는 left:30mm, top:35mm입니다
                // In table.html, htb is inside hcD with left:31mm, top:35.99mm, while hcD is left:30mm, top:35mm
                // 따라서 테이블의 상대 위치는 left:1mm, top:0.99mm입니다
                // So table's relative position is left:1mm, top:0.99mm
                // LineSegment의 column_start_position과 vertical_position을 사용하여 테이블 위치 계산
                // Calculate table position using LineSegment's column_start_position and vertical_position
                // like_letters=true인 테이블은 hcd_position과 page_def를 전달하여 올바른 htG 생성
                // For tables with like_letters=true, pass hcd_position and page_def to generate correct htG
                let table_info = &tables[table_index];
                let current_table_number = table_counter_start + table_index as u32;
                // LineSegment 위치 전달 / Pass LineSegment position
                let segment_position =
                    Some((segment.column_start_position, segment.vertical_position));
                let table_html = render_table(
                    table_info.table,
                    document,
                    table_info.ctrl_header,
                    hcd_position,
                    page_def,
                    options,
                    Some(current_table_number), // 테이블 번호 전달 / Pass table number
                    table_info.caption_text.as_ref(),
                    table_info.caption_info, // 캡션 정보 전달 / Pass caption info
                    table_info.caption_char_shape_id, // 캡션 char_shape_id 전달 / Pass caption char_shape_id
                    table_info.caption_para_shape_id, // 캡션 para_shape_id 전달 / Pass caption para_shape_id
                    table_info.caption_line_segment, // 캡션 LineSegmentInfo 전달 / Pass caption LineSegmentInfo
                    segment_position, // LineSegment 위치 전달 / Pass LineSegment position
                    None, // line_segment에서는 para_start_vertical_mm 사용 안 함 / para_start_vertical_mm not used in line_segment
                    None, // line_segment에서는 first_para_vertical_mm 사용 안 함 / first_para_vertical_mm not used in line_segment
                    pattern_counter, // 문서 레벨 pattern_counter 전달 / Pass document-level pattern_counter
                    color_to_pattern, // 문서 레벨 color_to_pattern 전달 / Pass document-level color_to_pattern
                );
                content.push_str(&table_html);
            }
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
            !((is_empty_segment || is_text_empty) && (!images.is_empty() || !tables.is_empty())),
            override_size_mm,
        ));
    }

    result
}
