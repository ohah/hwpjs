/// ParaText conversion to HTML
/// ParaText를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, PARA_TEXT (HWPTAG_BEGIN + 51)
/// Spec mapping: Table 57 - BodyText data records, PARA_TEXT (HWPTAG_BEGIN + 51)
use crate::document::bodytext::{CharShapeInfo, ControlChar, ControlCharPosition};
use crate::document::CharShape;

/// 의미 있는 텍스트인지 확인합니다. / Check if text is meaningful.
///
/// 공백만 있는 텍스트는 의미 없다고 판단합니다.
/// Text containing only whitespace is considered meaningless.
pub(crate) fn is_meaningful_text(text: &str, _control_positions: &[ControlCharPosition]) -> bool {
    !text.trim().is_empty()
}

/// Convert character index to byte index in UTF-8 string
/// UTF-8 문자열에서 문자 인덱스를 바이트 인덱스로 변환
fn char_index_to_byte_index(text: &str, char_idx: usize) -> Option<usize> {
    text.char_indices()
        .nth(char_idx)
        .map(|(byte_idx, _)| byte_idx)
}

/// Convert ParaText to HTML
/// ParaText를 HTML로 변환
pub fn convert_para_text_to_html<'a>(
    text: &str,
    control_positions: &[ControlCharPosition],
    char_shapes: &[CharShapeInfo],
    get_char_shape: Option<&'a dyn Fn(u32) -> Option<&'a CharShape>>,
    css_prefix: &str,
    document: Option<&'a crate::document::HwpDocument>,
    line_segments: Option<&[crate::document::bodytext::LineSegmentInfo]>,
) -> Option<String> {
    // CharShape 정보가 있으면 텍스트를 구간별로 나누어 스타일 적용 / If CharShape info exists, divide text into segments and apply styles
    if !char_shapes.is_empty() && get_char_shape.is_some() {
        return convert_text_with_char_shapes(
            text,
            control_positions,
            char_shapes,
            get_char_shape.unwrap(),
            css_prefix,
            document,
            line_segments,
        );
    }

    // PARA_BREAK나 LINE_BREAK가 있는지 확인 / Check for PARA_BREAK or LINE_BREAK
    let has_breaks = control_positions
        .iter()
        .any(|pos| pos.code == ControlChar::PARA_BREAK || pos.code == ControlChar::LINE_BREAK);

    if !has_breaks {
        // 제어 문자가 없으면 기존 로직 사용 / Use existing logic if no control characters
        if is_meaningful_text(text, control_positions) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        return None;
    }

    // PARA_BREAK/LINE_BREAK가 있는 경우 처리 / Process when PARA_BREAK/LINE_BREAK exists
    let mut result = String::new();
    let mut last_char_pos = 0;

    // control_positions를 정렬하여 순서대로 처리 / Sort control_positions to process in order
    let mut sorted_positions: Vec<_> = control_positions.iter().collect();
    sorted_positions.sort_by_key(|pos| pos.position);

    for pos in sorted_positions {
        // PARA_BREAK나 LINE_BREAK만 처리 / Only process PARA_BREAK or LINE_BREAK
        if pos.code != ControlChar::PARA_BREAK && pos.code != ControlChar::LINE_BREAK {
            continue;
        }

        // 문자 인덱스를 바이트 인덱스로 변환 / Convert character index to byte index
        let byte_idx = match char_index_to_byte_index(text, pos.position) {
            Some(idx) => idx,
            None => continue, // 유효하지 않은 위치는 건너뜀 / Skip invalid position
        };

        let last_byte_idx = char_index_to_byte_index(text, last_char_pos).unwrap_or(0);

        // 제어 문자 이전의 텍스트 추가 / Add text before control character
        if byte_idx > last_byte_idx && byte_idx <= text.len() {
            let text_part = &text[last_byte_idx..byte_idx];
            let trimmed = text_part.trim();
            if !trimmed.is_empty() {
                result.push_str(trimmed);
            }
        }

        // PARA_BREAK나 LINE_BREAK를 <br> 태그로 변환 / Convert PARA_BREAK or LINE_BREAK to <br> tag
        result.push_str("<br />");

        // 제어 문자 다음 위치 / Position after control character
        last_char_pos = pos.position + 1;
    }

    // 마지막 부분의 텍스트 추가 / Add remaining text
    let last_byte_idx = char_index_to_byte_index(text, last_char_pos).unwrap_or(0);
    if last_byte_idx < text.len() {
        let text_part = &text[last_byte_idx..];
        let trimmed = text_part.trim();
        if !trimmed.is_empty() {
            result.push_str(trimmed);
        }
    }

    let trimmed_result = result.trim();
    if !trimmed_result.is_empty() {
        Some(trimmed_result.to_string())
    } else {
        None
    }
}

/// Convert text with CharShape information to HTML
/// CharShape 정보를 사용하여 텍스트를 HTML로 변환
fn convert_text_with_char_shapes<'a>(
    text: &str,
    control_positions: &[ControlCharPosition],
    char_shapes: &[CharShapeInfo],
    get_char_shape: &'a dyn Fn(u32) -> Option<&'a CharShape>,
    css_prefix: &str,
    document: Option<&'a crate::document::HwpDocument>,
    line_segments: Option<&[crate::document::bodytext::LineSegmentInfo]>,
) -> Option<String> {
    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();

    if text_len == 0 {
        return None;
    }

    // CharShape 구간 계산 / Calculate CharShape segments
    // CharShapeInfo는 position 기준이므로, position을 기준으로 구간을 계산
    // CharShapeInfo is position-based, so calculate segments based on positions
    let mut segments: Vec<(usize, usize, Option<&CharShape>)> = Vec::new();

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

        // 이 구간에 적용할 CharShape 찾기 / Find CharShape to apply to this segment
        // start 위치에서 시작하는 가장 가까운 CharShape를 찾음 / Find the closest CharShape starting at start position
        let char_shape = sorted_shapes
            .iter()
            .find(|shape| (shape.position as usize) == start)
            .or_else(|| {
                // 정확히 일치하는 것이 없으면, start보다 작은 position 중 가장 큰 것을 찾음
                // If no exact match, find the largest position less than start
                sorted_shapes
                    .iter()
                    .rev()
                    .find(|shape| (shape.position as usize) < start)
            })
            .and_then(|shape| get_char_shape(shape.shape_id));

        segments.push((start, end, char_shape));
    }

    // PARA_BREAK/LINE_BREAK 위치 수집 / Collect PARA_BREAK/LINE_BREAK positions
    let mut break_positions: Vec<usize> = control_positions
        .iter()
        .filter(|pos| pos.code == ControlChar::PARA_BREAK || pos.code == ControlChar::LINE_BREAK)
        .map(|pos| pos.position as usize)
        .collect();
    break_positions.sort();

    // 각 구간에 스타일 적용하여 결과 생성 / Generate result by applying styles to each segment
    let mut result = String::new();
    for (start, end, char_shape) in &segments {
        if *start < *end && *end <= text_len {
            // 이 구간 내에 PARA_BREAK/LINE_BREAK가 있는지 확인 / Check if there are breaks in this segment
            let mut segment_breaks: Vec<usize> = break_positions
                .iter()
                .filter(|&&break_pos| break_pos >= *start && break_pos < *end)
                .copied()
                .collect();

            if segment_breaks.is_empty() {
                // 구간 내에 break가 없으면 전체 구간에 스타일 적용 / No breaks in segment, apply style to entire segment
                let segment_text: String = text_chars[*start..*end].iter().collect();
                if !segment_text.trim().is_empty() {
                    if let Some(shape) = char_shape {
                        let styled = apply_html_styles(
                            &segment_text,
                            shape,
                            css_prefix,
                            document,
                            Some(*start),
                            Some(*end),
                            line_segments,
                        );
                        result.push_str(&styled);
                    } else {
                        // 클래스가 없어도 position 정보가 있으면 span으로 감싸기 / Wrap in span even without classes if position info exists
                        result.push_str(&format!(
                            r#"<span data-start="{}" data-end="{}">{}</span>"#,
                            *start, *end, segment_text
                        ));
                    }
                }
            } else {
                // 구간 내에 break가 있으면 break 위치로 나누어 처리 / Split segment by breaks
                segment_breaks.insert(0, *start);
                segment_breaks.push(*end);

                for i in 0..segment_breaks.len() - 1 {
                    let seg_start = segment_breaks[i];
                    let seg_end = segment_breaks[i + 1];

                    if seg_start < seg_end && seg_end <= text_len {
                        let segment_text: String = text_chars[seg_start..seg_end].iter().collect();
                        if !segment_text.trim().is_empty() {
                            if let Some(shape) = char_shape {
                                let styled = apply_html_styles(
                                    &segment_text,
                                    shape,
                                    css_prefix,
                                    document,
                                    Some(seg_start),
                                    Some(seg_end),
                                    line_segments,
                                );
                                result.push_str(&styled);
                            } else {
                                // 클래스가 없어도 position 정보가 있으면 span으로 감싸기 / Wrap in span even without classes if position info exists
                                result.push_str(&format!(
                                    r#"<span data-start="{}" data-end="{}">{}</span>"#,
                                    seg_start, seg_end, segment_text
                                ));
                            }
                        }
                    }

                    // break 다음이면 <br> 태그 추가 / Add <br> tag after break
                    if i < segment_breaks.len() - 2 {
                        result.push_str("<br />");
                    }
                }
            }
        }
    }

    let trimmed_result = result.trim();
    if !trimmed_result.is_empty() {
        Some(trimmed_result.to_string())
    } else {
        None
    }
}

/// Apply HTML styles to text based on CharShape
/// CharShape에 따라 텍스트에 HTML 스타일 적용
fn apply_html_styles<'a>(
    text: &str,
    shape: &CharShape,
    css_prefix: &str,
    document: Option<&'a crate::document::HwpDocument>,
    start_pos: Option<usize>,
    end_pos: Option<usize>,
    line_segments: Option<&[crate::document::bodytext::LineSegmentInfo]>,
) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut result = String::from(text);

    // 스타일 적용 순서: 안쪽부터 바깥쪽으로 / Apply styles from innermost to outermost
    // 1. 기울임 (가장 안쪽) / Italic (innermost)
    if shape.attributes.italic {
        result = format!(r#"<em class="{}italic">{}</em>"#, css_prefix, result);
    }

    // 2. 진하게 / Bold
    if shape.attributes.bold {
        result = format!(r#"<strong class="{}bold">{}</strong>"#, css_prefix, result);
    }

    // 3. 밑줄 / Underline
    if shape.attributes.underline_type == 1 {
        // 글자 아래 밑줄 / Underline below
        let underline_class = match shape.attributes.underline_style {
            1 => format!("{}underline-solid", css_prefix),
            2 => format!("{}underline-dotted", css_prefix),
            3 => format!("{}underline-dashed", css_prefix),
            4 => format!("{}underline-dashed", css_prefix), // 파선 / long dash
            5 => format!("{}underline-dotted", css_prefix), // 일점쇄선 / one-dot dash
            6 => format!("{}underline-dotted", css_prefix), // 이점쇄선 / two-dot dash
            _ => format!("{}underline-solid", css_prefix),
        };
        result = format!(r#"<u class="{}">{}</u>"#, underline_class, result);
    } else if shape.attributes.underline_type == 2 {
        // 글자 위 밑줄 (윗줄) / Overline
        result = format!(r#"<span class="{}overline">{}</span>"#, css_prefix, result);
    }

    // 4. 취소선 / Strikethrough
    if shape.attributes.strikethrough != 0 {
        let strikethrough_class = match shape.attributes.strikethrough_style {
            1 => format!("{}strikethrough-solid", css_prefix),
            2 => format!("{}strikethrough-dotted", css_prefix),
            3 => format!("{}strikethrough-dashed", css_prefix),
            _ => format!("{}strikethrough-solid", css_prefix),
        };
        result = format!(r#"<s class="{}">{}</s>"#, strikethrough_class, result);
    }

    // 5. 위 첨자 / Superscript
    if shape.attributes.superscript {
        result = format!(r#"<sup class="{}superscript">{}</sup>"#, css_prefix, result);
    }

    // 6. 아래 첨자 / Subscript
    if shape.attributes.subscript {
        result = format!(r#"<sub class="{}subscript">{}</sub>"#, css_prefix, result);
    }

    // 7. 양각 / Emboss
    if shape.attributes.emboss {
        result = format!(r#"<span class="{}emboss">{}</span>"#, css_prefix, result);
    }

    // 8. 음각 / Engrave
    if shape.attributes.engrave {
        result = format!(r#"<span class="{}engrave">{}</span>"#, css_prefix, result);
    }

    // 9. 그림자 / Shadow (CSS로 처리)
    if shape.attributes.shadow_type != 0 {
        let shadow_x = shape.shadow_spacing_x as f32 / 100.0;
        let shadow_y = shape.shadow_spacing_y as f32 / 100.0;
        let shadow_color = format!(
            "rgba({}, {}, {}, {})",
            shape.shadow_color.r(),
            shape.shadow_color.g(),
            shape.shadow_color.b(),
            ((shape.shadow_color.0 >> 24) & 0xFF) as f32 / 255.0
        );
        result = format!(
            r#"<span style="text-shadow: {}px {}px 2px {};">{}</span>"#,
            shadow_x, shadow_y, shadow_color, result
        );
    }

    // 10. 외곽선 / Outline (CSS로 처리)
    if shape.attributes.outline_type != 0 {
        let text_color = format!(
            "rgb({}, {}, {})",
            shape.text_color.r(),
            shape.text_color.g(),
            shape.text_color.b()
        );
        result = format!(
            r#"<span style="-webkit-text-stroke: 1px {}; text-stroke: 1px {};">{}</span>"#,
            text_color, text_color, result
        );
    }

    // 11. 강조점 / Emphasis mark (CSS ::before/::after로 처리)
    if shape.attributes.emphasis_mark != 0 {
        let emphasis_class = format!("{}emphasis-{}", css_prefix, shape.attributes.emphasis_mark);
        result = format!(r#"<span class="{}">{}</span>"#, emphasis_class, result);
    }

    // 색상, 크기, 폰트 등은 클래스로 처리 / Handle color, size, font, etc. with classes
    let mut classes = Vec::new();

    // 폰트 패밀리 (font_ids를 사용하여 face_names에서 폰트 이름 가져오기)
    // Font family (get font name from face_names using font_ids)
    if let Some(doc) = document {
        // 한국어 폰트 ID 사용 (일반적으로 한글 문서에서 사용) / Use Korean font ID (typically used in Korean documents)
        let font_id = shape.font_ids.korean as usize;
        // font_id는 1-based이므로 0-based 인덱스로 변환 / font_id is 1-based, so convert to 0-based index
        if font_id > 0 && font_id <= doc.doc_info.face_names.len() {
            // face_names 인덱스는 0-based이므로 font_id - 1 사용 / face_names index is 0-based, so use font_id - 1
            let font_idx = font_id - 1;
            classes.push(format!("{}font-{}", css_prefix, font_idx));
        }
    }

    // 텍스트 색상 / Text color
    if shape.text_color.0 != 0 {
        let r = shape.text_color.r();
        let g = shape.text_color.g();
        let b = shape.text_color.b();
        // hex 색상 클래스 이름 생성 / Generate hex color class name
        classes.push(format!("{}color-{:02x}{:02x}{:02x}", css_prefix, r, g, b));
    }

    // 기준 크기 / Base size
    if shape.base_size > 0 {
        let size_pt = shape.base_size as f32 / 100.0;
        // 크기 클래스 이름 생성 (pt 값을 정수로 변환) / Generate size class name (convert pt to integer)
        let size_int = (size_pt * 100.0) as u32; // 13.00pt -> 1300
        classes.push(format!("{}size-{}", css_prefix, size_int));
    }

    // ParaLineSeg에서 해당 위치의 세그먼트 정보 찾기 / Find segment information for this position from ParaLineSeg
    let mut segment_styles = String::new();
    if let (Some(start), Some(segments)) = (start_pos, line_segments) {
        // start 위치에 해당하는 세그먼트 찾기 / Find segment corresponding to start position
        // text_start_position이 start보다 작거나 같은 세그먼트 중 가장 큰 것을 찾음
        // Find the largest segment where text_start_position <= start
        if let Some(segment) = segments
            .iter()
            .filter(|seg| seg.text_start_position as usize <= start)
            .max_by_key(|seg| seg.text_start_position)
        {
            let mut styles = Vec::new();

            // line-height: line_spacing을 line_height로 나누어 배수로 계산 / Calculate ratio by dividing line_spacing by line_height
            if segment.line_spacing != 0 && segment.line_height != 0 {
                let line_height_value = segment.line_spacing as f64 / segment.line_height as f64;
                styles.push(format!("line-height: {:.2}", line_height_value));
            }

            // height: line_height를 HWPUNIT에서 mm로 변환 / Convert line_height from HWPUNIT to mm
            // HWPUNIT: 1/7200 inch, 1 inch = 25.4 mm
            if segment.line_height != 0 {
                let height_mm = (segment.line_height as f64 / 7200.0) * 25.4;
                styles.push(format!("height: {:.2}mm", height_mm));
            }

            // font-size: text_height를 HWPUNIT에서 pt로 변환 / Convert text_height from HWPUNIT to pt
            // HWPUNIT: 1/7200 inch, 1 inch = 72 pt
            if segment.text_height != 0 {
                let font_size_pt = (segment.text_height as f64 / 7200.0) * 72.0;
                styles.push(format!("font-size: {:.2}pt", font_size_pt));
            }

            // vertical-align: baseline_distance를 사용하여 조정 / Adjust using baseline_distance
            // baseline_distance는 줄의 세로 위치에서 베이스라인까지 거리
            // baseline_distance is the distance from vertical position to baseline
            if segment.baseline_distance != 0 && segment.line_height != 0 {
                // baseline_distance를 line_height로 나누어 비율 계산 / Calculate ratio by dividing baseline_distance by line_height
                let baseline_ratio = segment.baseline_distance as f64 / segment.line_height as f64;
                // vertical-align을 percentage로 설정 (baseline 기준) / Set vertical-align as percentage (baseline reference)
                let vertical_align_value = (baseline_ratio * 100.0) - 100.0; // baseline을 0으로 맞추기 위해 조정 / Adjust to make baseline 0
                styles.push(format!("vertical-align: {:.2}%", vertical_align_value));
            }

            // width: segment_width를 HWPUNIT에서 mm로 변환 / Convert segment_width from HWPUNIT to mm
            if segment.segment_width != 0 {
                let width_mm = (segment.segment_width as f64 / 7200.0) * 25.4;
                styles.push(format!("width: {:.2}mm", width_mm));
            }

            if !styles.is_empty() {
                segment_styles = format!(r#" style="{}""#, styles.join("; "));
            }
        }
    }

    if !classes.is_empty() {
        // data-start, data-end 속성 추가 / Add data-start, data-end attributes
        let mut data_attrs = String::new();
        if let Some(start) = start_pos {
            data_attrs.push_str(&format!(r#" data-start="{}""#, start));
        }
        if let Some(end) = end_pos {
            data_attrs.push_str(&format!(r#" data-end="{}""#, end));
        }
        result = format!(
            r#"<span class="{classes}"{data_attrs}{segment_styles}>{result}</span>"#,
            classes = classes.join(" "),
            data_attrs = data_attrs,
            segment_styles = segment_styles,
            result = result
        );
    } else if start_pos.is_some() || end_pos.is_some() || !segment_styles.is_empty() {
        // 클래스가 없어도 position 정보나 세그먼트 스타일이 있으면 span으로 감싸기 / Wrap in span even without classes if position info or segment styles exist
        let mut data_attrs = String::new();
        if let Some(start) = start_pos {
            data_attrs.push_str(&format!(r#" data-start="{}""#, start));
        }
        if let Some(end) = end_pos {
            data_attrs.push_str(&format!(r#" data-end="{}""#, end));
        }
        result = format!(
            r#"<span{data_attrs}{segment_styles}>{result}</span>"#,
            data_attrs = data_attrs,
            segment_styles = segment_styles,
            result = result
        );
    }

    result
}
