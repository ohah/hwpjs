/// Document 기반 텍스트 렌더링 (old viewer text.rs 포팅)
/// CharShape-segmented `<span class="hrt cs{N}">` 출력
use super::flat_text::FlatCharShapeInfo;
use hwp_model::resources::{CharShape, Resources};

/// 연속 공백 변환: leading 공백과 연속 공백을 &nbsp;로 변환
pub fn convert_consecutive_spaces(text: &str) -> String {
    let mut result = String::with_capacity(text.len() * 2);
    let mut space_count = 0u32;
    let mut has_non_space = false;

    for ch in text.chars() {
        if ch == ' ' {
            space_count += 1;
            if !has_non_space {
                result.push_str("&nbsp;");
            } else if space_count == 1 {
                result.push(' ');
            } else {
                result.push_str("&nbsp;");
            }
        } else {
            has_non_space = true;
            space_count = 0;
            result.push(ch);
        }
    }

    if result.ends_with(' ') && !result.ends_with("&nbsp;") {
        result.pop();
        result.push_str("&nbsp;");
    }

    result
}

/// flat text를 CharShape 구간별로 분할하여 `<span class="hrt cs{N}">` 렌더링
pub fn render_layout_text(
    text: &str,
    char_shapes: &[FlatCharShapeInfo],
    resources: &Resources,
) -> String {
    if text.is_empty() {
        return String::new();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();

    // CharShape 구간 계산
    let mut positions = vec![0usize];
    for cs in char_shapes {
        let pos = cs.position as usize;
        if pos <= text_len {
            positions.push(pos);
        }
    }
    positions.push(text_len);
    positions.sort();
    positions.dedup();

    let mut result = String::new();

    for i in 0..positions.len() - 1 {
        let start = positions[i];
        let end = positions[i + 1];
        if start >= end {
            continue;
        }

        let segment_text: String = text_chars[start..end].iter().collect();
        if segment_text.is_empty() {
            continue;
        }

        // 이 구간의 CharShape ID
        let shape_id = char_shapes
            .iter()
            .rev()
            .find(|cs| (cs.position as usize) <= start)
            .map(|cs| cs.shape_id as usize);

        let cs_opt = shape_id.and_then(|id| resources.char_shapes.get(id));

        // 탭 문자 처리
        if segment_text.contains('\t') {
            let class_name = shape_id
                .map(|id| format!("cs{}", id))
                .unwrap_or_default();
            for part in segment_text.split('\t') {
                if !part.is_empty() {
                    let styled = convert_consecutive_spaces(part);
                    if class_name.is_empty() {
                        result.push_str(&format!(r#"<span class="hrt">{}</span>"#, styled));
                    } else {
                        result.push_str(&format!(
                            r#"<span class="hrt {}">{}</span>"#,
                            class_name, styled
                        ));
                    }
                }
                result.push_str(
                    r#"<span class="htC" style="width:12.35mm;height:100%;"></span>"#,
                );
            }
            // 마지막 여분 htC 제거
            let htc = r#"<span class="htC" style="width:12.35mm;height:100%;"></span>"#;
            if result.ends_with(htc) {
                result.truncate(result.len() - htc.len());
            }
            continue;
        }

        let text_html = convert_consecutive_spaces(&segment_text);

        if let Some(cs) = cs_opt {
            let class_name = format!("cs{}", shape_id.unwrap());
            let styled = apply_inline_styles(&text_html, cs);
            result.push_str(&format!(
                r#"<span class="hrt {}">{}</span>"#,
                class_name, styled
            ));
        } else {
            result.push_str(&format!(r#"<span class="hrt">{}</span>"#, text_html));
        }
    }

    result
}

/// CharShape의 인라인 스타일 태그 적용 (bold/italic/underline/strikethrough/super/sub)
fn apply_inline_styles(text: &str, cs: &CharShape) -> String {
    let mut result = text.to_string();

    if cs.italic {
        result = format!("<em>{}</em>", result);
    }

    // underline: Center(취소선), Bottom/Top(밑줄)
    if let Some(ref ul) = cs.underline {
        if ul.underline_type == hwp_model::types::UnderlineType::Center {
            result = format!("<s>{}</s>", result);
        } else if ul.underline_type == hwp_model::types::UnderlineType::Bottom {
            result = format!("<u>{}</u>", result);
        }
    }

    if cs.strikeout.is_some() {
        result = format!("<s>{}</s>", result);
    }

    if cs.superscript {
        result = format!("<sup>{}</sup>", result);
    }
    if cs.subscript {
        result = format!("<sub>{}</sub>", result);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_consecutive_spaces() {
        assert_eq!(convert_consecutive_spaces("hello"), "hello");
        assert_eq!(convert_consecutive_spaces("a b"), "a b");
        assert_eq!(convert_consecutive_spaces("a  b"), "a &nbsp;b");
        assert_eq!(convert_consecutive_spaces(" a"), "&nbsp;a");
        assert_eq!(convert_consecutive_spaces("a "), "a&nbsp;");
    }

    #[test]
    fn test_render_layout_text_simple() {
        let resources = Resources::default();
        let shapes = vec![FlatCharShapeInfo {
            position: 0,
            shape_id: 0,
        }];
        let html = render_layout_text("hello", &shapes, &resources);
        assert!(html.contains(r#"class="hrt"#));
        assert!(html.contains("hello"));
    }
}
