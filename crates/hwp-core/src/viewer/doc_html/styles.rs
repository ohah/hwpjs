/// Document(hwp-model) 기반 CSS 스타일 생성
/// old viewer(viewer/html/styles.rs)와 동일한 클래스명(cs{N}, ps{N}, hpa, hls 등) 출력
use hwp_model::document::Document;
use hwp_model::resources::{CharShape, ParaShape};
use hwp_model::types::HAlign;

use crate::viewer::doc_utils;

/// noori_style.css 호환 레이아웃 CSS 생성
pub fn generate_layout_css(doc: &Document) -> String {
    let mut css = String::with_capacity(8192);

    // ── 기본 레이아웃 클래스 (noori_style.css) ──
    css.push_str("body {margin:0;padding-left:0;padding-right:0;padding-bottom:0;padding-top:2mm;}\n");
    css.push_str(".hce {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hme {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hhe {margin:0;padding:0;position:relative;}\n");
    css.push_str(".hhi {display:inline-block;margin:0;padding:0;position:relative;background-size:contain;}\n");
    css.push_str(".hls {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfS {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hcD {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hcI {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hcS {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfN {margin:0;padding:0;position:relative;}\n");
    css.push_str(".hmB {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hmO {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hmT {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hpN {display:inline-block;margin:0;padding:0;position:relative;white-space:nowrap;}\n");
    css.push_str(".htC {display:inline-block;margin:0;padding:0;position:relative;vertical-align:top;overflow:hidden;}\n");
    css.push_str(".haN {display:inline-block;margin:0;padding:0;position:relative;}\n");
    css.push_str(".hdu {margin:0;padding:0;position:relative;}\n");
    css.push_str(".hdS {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsC {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsR {margin:0;padding:0;position:absolute;background-size:100% 100%;}\n");
    css.push_str(".hsG {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsL {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsT {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hsE {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hsA {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hsP {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hsV {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hsO {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsU {margin:0;padding:0;position:absolute;overflow:hidden;}\n");
    css.push_str(".hpi {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hch {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hcG {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".heq {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".heG {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".htA {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hvi {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".htb {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".htG {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfJ {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfG {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfB {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfR {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfC {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfO {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfL {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfM {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hfE {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hpl {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hs {margin:0;padding:0;position:absolute;overflow:visible;}\n");
    css.push_str(".hpa {position:relative;padding:0;overflow:hidden;margin-left:2mm;margin-right:0mm;margin-bottom:2mm;margin-top:0mm;border:1px black solid;box-shadow:1mm 1mm 0 #AAAAAA;}\n");
    css.push_str(".hpa::after {content:'';position:absolute;margin:0;padding:0;left:0;right:0;top:0;bottom:0;background-color:white;z-index:-2;}\n");
    css.push_str(".hrt {display:inline-block;margin:0;padding:0;position:relative;white-space:inherit;vertical-align:middle;line-height:1.1;}\n");
    css.push_str(".hco {display:inline-block;margin:0;padding:0;position:relative;white-space:inherit;}\n");
    css.push_str(".hcc {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hls {clear:both;}\n");
    css.push_str("[onclick] {cursor:pointer;}\n");

    // ── CharShape 스타일 (cs0, cs1, ...) ──
    for (idx, cs) in doc.resources.char_shapes.iter().enumerate() {
        generate_char_shape_css(&mut css, idx, cs, &doc.resources.fonts);
    }

    // ── ParaShape 스타일 (ps0, ps1, ...) ──
    for (idx, ps) in doc.resources.para_shapes.iter().enumerate() {
        generate_para_shape_css(&mut css, idx, ps);
    }

    // ── Print media query ──
    css.push_str("@media print {\n");
    css.push_str(".hpa {margin:0;border:0 black none;box-shadow:none;}\n");
    css.push_str("body {padding:0;}\n");
    css.push_str("}\n");

    css
}

/// CharShape → .cs{N} CSS 클래스
fn generate_char_shape_css(
    css: &mut String,
    idx: usize,
    cs: &CharShape,
    fonts: &hwp_model::resources::FontFaces,
) {
    use std::fmt::Write;

    write!(css, ".cs{} {{\n", idx).ok();

    // font-size
    if cs.height != 0 {
        write!(css, "  font-size:{}pt;", cs.height as f64 / 100.0).ok();
    }

    // text color
    if let Some(color) = cs.text_color {
        let r = (color >> 16) & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = color & 0xFF;
        write!(css, "color:rgb({},{},{});", r, g, b).ok();
    }

    // font-family (한글 폰트 우선)
    let font_id = cs.font_ref.hangul as usize;
    if let Some(font) = fonts.hangul.get(font_id) {
        if !font.face.is_empty() {
            write!(
                css,
                "font-family:\"{}\";",
                doc_utils::escape_css_font_name(&font.face)
            )
            .ok();
        }
    }

    // bold/italic
    if cs.bold {
        css.push_str("font-weight:bold;");
    }
    if cs.italic {
        css.push_str("font-style:italic;");
    }

    // letter-spacing (hangul 우선, 없으면 다른 언어)
    let spacing = if cs.spacing.hangul != 0 {
        cs.spacing.hangul
    } else if cs.spacing.latin != 0 {
        cs.spacing.latin
    } else {
        0
    };
    if spacing != 0 {
        let em = (spacing as f64 / 2.0) / 100.0;
        write!(css, "letter-spacing:{:.2}em;", em).ok();
    }

    // shade color (background)
    if let Some(shade) = cs.shade_color {
        if shade != 0xFFFFFF && shade != 0 {
            let r = (shade >> 16) & 0xFF;
            let g = (shade >> 8) & 0xFF;
            let b = shade & 0xFF;
            write!(css, "background-color:#{:02X}{:02X}{:02X};", r, g, b).ok();
        }
    }

    css.push_str("\n}\n");
}

/// ParaShape → .ps{N} CSS 클래스
fn generate_para_shape_css(css: &mut String, idx: usize, ps: &ParaShape) {
    use std::fmt::Write;

    write!(css, ".ps{} {{\n", idx).ok();

    // 정렬
    let align = match ps.align.horizontal {
        HAlign::Left => "left",
        HAlign::Right => "right",
        HAlign::Center => "center",
        _ => "justify",
    };
    write!(css, "  text-align:{};", align).ok();

    css.push_str("\n}\n");
}

/// 시맨틱 모드용 간단한 CSS (레이아웃 아닌 경우)
pub fn generate_css(doc: &Document, prefix: &str) -> String {
    // 기존 시맨틱 모드 CSS (하위 호환)
    let mut css = String::new();
    css.push_str(&format!(
        ".{}body {{ font-family: '함초롬바탕', 'Malgun Gothic', serif; }}\n",
        prefix
    ));

    for (idx, cs) in doc.resources.char_shapes.iter().enumerate() {
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
                prefix, idx,
                props.join("; ")
            ));
        }
    }

    for (idx, ps) in doc.resources.para_shapes.iter().enumerate() {
        let align = match ps.align.horizontal {
            HAlign::Left => "left",
            HAlign::Center => "center",
            HAlign::Right => "right",
            HAlign::Justify => "justify",
            _ => "",
        };
        if !align.is_empty() {
            css.push_str(&format!(
                ".{}ps-{} {{ text-align: {} }}\n",
                prefix, idx, align
            ));
        }
    }

    css
}

// ── 단위 변환 유틸리티 ──

/// HwpUnit(1/7200인치) → mm 변환
pub fn hwpunit_to_mm(value: i32) -> f64 {
    (value as f64 / 7200.0) * 25.4
}

/// mm 값을 소수점 2자리로 반올림
pub fn round_mm(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// mm 값을 문자열로 포맷 (정수면 소수점 없이, old viewer 호환)
pub fn fmt_mm(value: f64) -> String {
    let rounded = round_mm(value);
    if (rounded - rounded.round()).abs() < 0.005 && rounded == rounded.round() {
        format!("{}mm", rounded as i64)
    } else {
        format!("{:.2}mm", rounded)
    }
}
