/// Document의 CharShape/ParaShape/BorderFill 기반 CSS 생성
use hwp_model::document::Document;

/// 문서 리소스 기반 CSS 스타일 생성
pub fn generate_css(doc: &Document, prefix: &str) -> String {
    let mut css = String::new();

    // 기본 스타일
    css.push_str(&format!(
        ".{}body {{ font-family: '함초롬바탕', 'Malgun Gothic', serif; }}\n",
        prefix
    ));

    // CharShape 기반 클래스 생성
    for cs in &doc.resources.char_shapes {
        let mut props = Vec::new();
        if cs.height != 0 {
            props.push(format!("font-size: {:.1}pt", cs.height as f64 / 100.0));
        }
        if cs.bold {
            props.push("font-weight: bold".to_string());
        }
        if cs.italic {
            props.push("font-style: italic".to_string());
        }
        if let Some(color) = cs.text_color {
            if color != 0 {
                let r = (color >> 16) & 0xFF;
                let g = (color >> 8) & 0xFF;
                let b = color & 0xFF;
                props.push(format!("color: rgb({},{},{})", r, g, b));
            }
        }
        if !props.is_empty() {
            css.push_str(&format!(
                ".{}cs-{} {{ {} }}\n",
                prefix,
                cs.id,
                props.join("; ")
            ));
        }
    }

    // ParaShape 기반 클래스 생성
    for ps in &doc.resources.para_shapes {
        let mut props = Vec::new();
        let align = match ps.align.horizontal {
            hwp_model::types::HAlign::Left => "left",
            hwp_model::types::HAlign::Center => "center",
            hwp_model::types::HAlign::Right => "right",
            hwp_model::types::HAlign::Justify => "justify",
            _ => "",
        };
        if !align.is_empty() {
            props.push(format!("text-align: {}", align));
        }
        if ps.line_spacing.spacing_type == hwp_model::types::LineSpacingType::Percent {
            props.push(format!("line-height: {}%", ps.line_spacing.value));
        }
        if !props.is_empty() {
            css.push_str(&format!(
                ".{}ps-{} {{ {} }}\n",
                prefix,
                ps.id,
                props.join("; ")
            ));
        }
    }

    css
}
