/// 텍스트 렌더링 모듈 / Text rendering module
use crate::document::{
    bodytext::{CharShapeInfo, ParagraphRecord},
    HwpDocument,
};

/// 텍스트를 HTML로 렌더링 / Render text to HTML
pub fn render_text(
    text: &str,
    char_shapes: &[CharShapeInfo],
    document: &HwpDocument,
    _css_prefix: &str,
) -> String {
    if text.is_empty() {
        return String::new();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();

    // CharShape 구간 계산 / Calculate CharShape segments
    let mut segments: Vec<(usize, usize, Option<usize>)> = Vec::new();

    // CharShape 정보를 position 기준으로 정렬 / Sort CharShape info by position
    let mut sorted_shapes: Vec<_> = char_shapes.iter().collect();
    sorted_shapes.sort_by_key(|shape| shape.position);

    // 구간 정의 / Define segments
    let mut positions = vec![0];
    for shape_info in &sorted_shapes {
        let pos = shape_info.position as usize;
        if pos <= text_len {
            positions.push(pos);
        }
    }
    positions.push(text_len);
    positions.sort();
    positions.dedup();

    // 각 구간에 대한 CharShape 찾기 / Find CharShape for each segment
    for i in 0..positions.len() - 1 {
        let start = positions[i];
        let end = positions[i + 1];

        // 이 구간에 해당하는 CharShape 찾기 / Find CharShape for this segment
        let char_shape_id = sorted_shapes
            .iter()
            .rev()
            .find(|shape| (shape.position as usize) <= start)
            .map(|shape| shape.shape_id as usize);

        segments.push((start, end, char_shape_id));
    }

    // 각 구간을 HTML로 렌더링 / Render each segment to HTML
    let mut result = String::new();
    for (start, end, char_shape_id_opt) in segments {
        if start >= end {
            continue;
        }

        let segment_text: String = text_chars[start..end].iter().collect();
        if segment_text.is_empty() {
            continue;
        }

        // CharShape 가져오기 / Get CharShape
        // HWP 파일의 shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for shape_id
        let char_shape_opt = char_shape_id_opt.and_then(|id| {
            if id < document.doc_info.char_shapes.len() {
                document.doc_info.char_shapes.get(id)
            } else {
                None
            }
        });

        // 텍스트 스타일 적용 / Apply text styles
        // 첫 공백과 마지막 공백을 &nbsp;로 변환 (HTML 태그 적용 전에 처리) / Convert leading and trailing spaces to &nbsp; (process before applying HTML tags)
        let mut text_for_styling = segment_text.to_string();
        // 첫 공백을 &nbsp;로 변환 / Convert leading space to &nbsp;
        if text_for_styling.starts_with(' ') {
            text_for_styling = text_for_styling.replacen(' ', "&nbsp;", 1);
        }
        // 마지막 공백을 &nbsp;로 변환 / Convert trailing space to &nbsp;
        if text_for_styling.ends_with(' ') {
            text_for_styling.pop();
            text_for_styling.push_str("&nbsp;");
        }

        if let Some(char_shape) = char_shape_opt {
            // CharShape 클래스 적용 / Apply CharShape class (0-based indexing to match XSL/XML format)
            let class_name = format!("cs{}", char_shape_id_opt.unwrap());

            // 인라인 스타일 추가 / Add inline styles
            let mut inline_style = String::new();

            // 폰트 크기 / Font size
            let size_pt = char_shape.base_size as f64 / 100.0;
            inline_style.push_str(&format!("font-size:{}pt;", size_pt));

            // 텍스트 색상 / Text color
            let color = &char_shape.text_color;
            inline_style.push_str(&format!(
                "color:rgb({},{},{});",
                color.r(),
                color.g(),
                color.b()
            ));

            // 속성 / Attributes
            // bold는 CSS의 font-weight:bold로 처리되므로 <strong> 태그 사용하지 않음
            // Bold is handled by CSS font-weight:bold, so don't use <strong> tag
            let mut styled_text = text_for_styling;
            if char_shape.attributes.italic {
                styled_text = format!("<em>{}</em>", styled_text);
            }
            if char_shape.attributes.underline_type > 0 {
                styled_text = format!("<u>{}</u>", styled_text);
            }
            if char_shape.attributes.strikethrough > 0 {
                styled_text = format!("<s>{}</s>", styled_text);
            }
            if char_shape.attributes.superscript {
                styled_text = format!("<sup>{}</sup>", styled_text);
            }
            if char_shape.attributes.subscript {
                styled_text = format!("<sub>{}</sub>", styled_text);
            }

            // .hrt span으로 래핑 / Wrap with .hrt span
            if !inline_style.is_empty() {
                result.push_str(&format!(
                    r#"<span class="hrt {}" style="{}">{}</span>"#,
                    class_name, inline_style, styled_text
                ));
            } else {
                result.push_str(&format!(
                    r#"<span class="hrt {}">{}</span>"#,
                    class_name, styled_text
                ));
            }
        } else {
            // CharShape가 없는 경우 기본 스타일 / Default style when no CharShape
            result.push_str(&format!(r#"<span class="hrt">{}</span>"#, text_for_styling));
        }
    }

    result
}

/// 문단에서 텍스트와 CharShape 추출 / Extract text and CharShape from paragraph
pub fn extract_text_and_shapes(
    paragraph: &crate::document::bodytext::Paragraph,
) -> (String, Vec<CharShapeInfo>) {
    let mut text = String::new();
    let mut char_shapes = Vec::new();

    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText {
                text: para_text, ..
            } => {
                text.push_str(para_text);
            }
            ParagraphRecord::ParaCharShape { shapes } => {
                char_shapes.extend(shapes.iter().cloned());
            }
            _ => {}
        }
    }

    (text, char_shapes)
}
