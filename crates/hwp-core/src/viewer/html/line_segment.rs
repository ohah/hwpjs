/// 라인 세그먼트 렌더링 모듈 / Line segment rendering module
use crate::document::bodytext::LineSegmentInfo;
use crate::viewer::html::styles::int32_to_mm;

/// 라인 세그먼트를 HTML로 렌더링 / Render line segment to HTML
pub fn render_line_segment(
    segment: &LineSegmentInfo,
    content: &str,
    para_shape_class: &str,
) -> String {
    let left_mm = int32_to_mm(segment.column_start_position);
    let top_mm = int32_to_mm(segment.vertical_position);
    let width_mm = int32_to_mm(segment.segment_width);
    let height_mm = int32_to_mm(segment.line_height);

    let style = format!(
        "line-height:{}mm;white-space:nowrap;left:{}mm;top:{}mm;height:{}mm;width:{}mm;",
        height_mm, left_mm, top_mm, height_mm, width_mm
    );

    // padding-left 처리 (들여쓰기) / Handle padding-left (indentation)
    if segment.tag.has_indentation {
        // TODO: 실제 들여쓰기 값 계산
    }

    format!(
        r#"<div class="hls {}" style="{}">{}</div>"#,
        para_shape_class, style, content
    )
}

/// 라인 세그먼트 그룹을 HTML로 렌더링 / Render line segment group to HTML
pub fn render_line_segments(
    segments: &[LineSegmentInfo],
    text: &str,
    char_shapes: &[crate::document::bodytext::CharShapeInfo],
    document: &crate::document::HwpDocument,
    para_shape_class: &str,
) -> String {
    render_line_segments_with_content(
        segments,
        text,
        char_shapes,
        document,
        para_shape_class,
        &[],
        &[],
        &crate::viewer::html::HtmlOptions::default(),
    )
}

/// 라인 세그먼트 그룹을 HTML로 렌더링 (이미지와 테이블 포함) / Render line segment group to HTML (with images and tables)
pub fn render_line_segments_with_content(
    segments: &[LineSegmentInfo],
    text: &str,
    char_shapes: &[crate::document::bodytext::CharShapeInfo],
    document: &crate::document::HwpDocument,
    para_shape_class: &str,
    images: &[(crate::types::UINT32, crate::types::UINT32, String)],
    tables: &[&crate::document::bodytext::Table],
    options: &crate::viewer::html::HtmlOptions,
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
            let (width, height, image_url) = &images[empty_count];
            use crate::viewer::html::image::render_image_with_style;
            let image_html = render_image_with_style(
                image_url,
                0,
                0,
                *width as crate::types::INT32,
                *height as crate::types::INT32,
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
                use crate::viewer::html::table::render_table;
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
                let table_left = segment.column_start_position;
                let table_top = segment.vertical_position;
                let table_html = render_table(
                    tables[table_index],
                    document,
                    table_left,
                    table_top,
                    options,
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
        result.push_str(&render_line_segment(segment, &content, para_shape_class));
    }

    result
}
