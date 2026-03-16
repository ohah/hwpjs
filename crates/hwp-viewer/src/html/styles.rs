use hwp_model::resources::Resources;
use hwp_model::types::*;

/// HWPUNIT → mm 변환
pub fn hwpunit_to_mm(value: HwpUnit) -> f64 {
    round_2dp((value as f64 / 7200.0) * 25.4)
}

/// HWPUNIT → pt 변환 (글자 크기용)
pub fn hwpunit_to_pt(value: HwpUnit) -> f64 {
    round_2dp(value as f64 / 100.0)
}

fn round_2dp(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Color → CSS 색상 문자열
pub fn color_to_css(color: Color) -> Option<String> {
    color.map(|c| {
        let r = (c >> 16) & 0xFF;
        let g = (c >> 8) & 0xFF;
        let b = c & 0xFF;
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    })
}

/// 기본 CSS
pub fn generate_base_css() -> String {
    r#"
body { margin: 0; padding: 20px; background: #eee; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; }
.hwp-section { background: #fff; margin: 0 auto 20px; box-shadow: 0 0 5px rgba(0,0,0,0.2); box-sizing: border-box; }
p { margin: 0; min-height: 1em; word-wrap: break-word; }
.hwp-table { border-collapse: collapse; }
.hwp-table td { border: 1px solid #000; padding: 2px 5px; vertical-align: top; }
.hwp-image { display: inline-block; }
.hwp-shape { position: relative; }
.hwp-header, .hwp-footer { color: #666; font-size: 0.9em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
.hwp-footer { border-bottom: none; border-top: 1px solid #ccc; padding-top: 4px; margin-top: 8px; }
.hwp-footnote-ref { vertical-align: super; font-size: 0.8em; color: #0066cc; }
.hwp-footnote-body { font-size: 0.9em; border-top: 1px solid #ccc; padding-top: 4px; margin-top: 8px; }
"#
    .to_string()
}

/// CharShape별 CSS 클래스 생성
pub fn generate_char_shape_css(resources: &Resources) -> String {
    let mut css = String::new();

    for cs in &resources.char_shapes {
        css.push_str(&format!(".cs{} {{ ", cs.id));

        // 글자 크기
        css.push_str(&format!("font-size: {}pt; ", hwpunit_to_pt(cs.height)));

        // 글자 색
        if let Some(ref color_str) = color_to_css(cs.text_color) {
            css.push_str(&format!("color: {}; ", color_str));
        }

        // 음영 색
        if let Some(ref color_str) = color_to_css(cs.shade_color) {
            css.push_str(&format!("background-color: {}; ", color_str));
        }

        // 진하게
        if cs.bold {
            css.push_str("font-weight: bold; ");
        }

        // 기울임
        if cs.italic {
            css.push_str("font-style: italic; ");
        }

        // 밑줄
        if cs.underline.is_some() {
            css.push_str("text-decoration: underline; ");
        }

        // 취소선
        if cs.strikeout.is_some() {
            css.push_str("text-decoration: line-through; ");
        }

        // 위첨자
        if cs.superscript {
            css.push_str("vertical-align: super; font-size: 0.8em; ");
        }

        // 아래첨자
        if cs.subscript {
            css.push_str("vertical-align: sub; font-size: 0.8em; ");
        }

        // 자간
        if cs.spacing.hangul != 0 {
            css.push_str(&format!(
                "letter-spacing: {}em; ",
                cs.spacing.hangul as f64 / 100.0
            ));
        }

        // 글꼴
        let font_id = cs.font_ref.hangul;
        if let Some(font) = resources.fonts.hangul.get(font_id as usize) {
            css.push_str(&format!("font-family: '{}'; ", font.face));
        }

        css.push_str("}\n");
    }

    css
}

/// ParaShape별 CSS 클래스 생성
pub fn generate_para_shape_css(resources: &Resources) -> String {
    let mut css = String::new();

    for ps in &resources.para_shapes {
        css.push_str(&format!(".ps{} {{ ", ps.id));

        // 정렬
        let align = match ps.align.horizontal {
            HAlign::Left => "left",
            HAlign::Right => "right",
            HAlign::Center => "center",
            HAlign::Justify => "justify",
            HAlign::Distribute | HAlign::DistributeSpace => "justify",
            _ => "left",
        };
        css.push_str(&format!("text-align: {}; ", align));

        // 왼쪽 여백
        if ps.margin.left.value != 0 {
            css.push_str(&format!(
                "margin-left: {}mm; ",
                hwpunit_to_mm(ps.margin.left.value)
            ));
        }

        // 오른쪽 여백
        if ps.margin.right.value != 0 {
            css.push_str(&format!(
                "margin-right: {}mm; ",
                hwpunit_to_mm(ps.margin.right.value)
            ));
        }

        // 들여쓰기
        if ps.margin.indent.value != 0 {
            css.push_str(&format!(
                "text-indent: {}mm; ",
                hwpunit_to_mm(ps.margin.indent.value)
            ));
        }

        // 문단 앞 간격
        if ps.margin.prev.value != 0 {
            css.push_str(&format!(
                "margin-top: {}mm; ",
                hwpunit_to_mm(ps.margin.prev.value)
            ));
        }

        // 문단 뒤 간격
        if ps.margin.next.value != 0 {
            css.push_str(&format!(
                "margin-bottom: {}mm; ",
                hwpunit_to_mm(ps.margin.next.value)
            ));
        }

        // 줄 간격
        match ps.line_spacing.spacing_type {
            LineSpacingType::Percent => {
                css.push_str(&format!("line-height: {}%; ", ps.line_spacing.value));
            }
            LineSpacingType::Fixed => {
                css.push_str(&format!(
                    "line-height: {}mm; ",
                    hwpunit_to_mm(ps.line_spacing.value)
                ));
            }
            _ => {}
        }

        css.push_str("}\n");
    }

    css
}
