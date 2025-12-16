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
}

/// 라인 세그먼트를 HTML로 렌더링 / Render line segment to HTML
pub fn render_line_segment(
    segment: &LineSegmentInfo,
    content: &str,
    para_shape_class: &str,
    para_shape_indent: Option<i32>, // ParaShape의 indent 값 (옵션) / ParaShape indent value (optional)
    para_shape: Option<&ParaShape>, // ParaShape 정보 (옵션) / ParaShape info (optional)
) -> String {
    let left_mm = round_to_2dp(int32_to_mm(segment.column_start_position));
    let top_mm = round_to_2dp(int32_to_mm(segment.vertical_position));
    let width_mm = round_to_2dp(int32_to_mm(segment.segment_width));
    let height_mm = round_to_2dp(int32_to_mm(segment.line_height));
    let text_height_mm = round_to_2dp(int32_to_mm(segment.text_height));
    let line_spacing_mm = round_to_2dp(int32_to_mm(segment.line_spacing));
    let baseline_distance_mm = round_to_2dp(int32_to_mm(segment.baseline_distance));

    // line-height 계산: baseline_distance를 직접 사용
    // 원본 HTML 분석 결과, CSS line-height는 baseline_distance 값을 사용함
    // Calculate line-height: use baseline_distance directly
    // Analysis of original HTML shows CSS line-height uses baseline_distance value
    let line_height_value = round_to_2dp(baseline_distance_mm);

    let mut style = format!(
        "line-height:{:.2}mm;white-space:nowrap;left:{:.2}mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;",
        line_height_value, left_mm, top_mm, height_mm, width_mm
    );

    // padding-left 처리 (들여쓰기) / Handle padding-left (indentation)
    if segment.tag.has_indentation {
        if let Some(indent) = para_shape_indent {
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
    render_line_segment(segment, content, para_shape_class, para_shape_indent, None)
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
        let segment_char_shapes: Vec<_> = char_shapes
            .iter()
            .filter(|shape| {
                let pos = shape.position as usize;
                pos >= start_pos && pos < end_pos
            })
            .cloned()
            .collect();

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
        ));
    }

    result
}
