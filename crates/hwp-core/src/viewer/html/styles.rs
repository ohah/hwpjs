/// CSS 스타일 생성 모듈 / CSS style generation module
/// noori_style.css 기반으로 CSS 생성
use crate::document::HwpDocument;
use crate::types::{COLORREF, INT32};
use std::collections::HashSet;

/// 문서에서 사용되는 스타일 정보 수집 / Collect style information used in document
pub struct StyleInfo {
    pub char_shapes: HashSet<usize>,
    pub para_shapes: HashSet<usize>,
    pub text_colors: HashSet<u32>,
}

impl StyleInfo {
    pub fn collect(document: &HwpDocument) -> Self {
        let mut char_shapes = HashSet::new();
        let mut para_shapes = HashSet::new();
        let mut text_colors = HashSet::new();

        // 문단에서 스타일 수집하는 헬퍼 함수 / Helper function to collect styles from paragraph
        let collect_from_paragraph = |paragraph: &crate::document::Paragraph,
                                      char_shapes: &mut HashSet<usize>,
                                      para_shapes: &mut HashSet<usize>,
                                      text_colors: &mut HashSet<u32>| {
            // ParaShape 수집 / Collect ParaShape
            let para_shape_id = paragraph.para_header.para_shape_id;
            // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
            if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
                para_shapes.insert(para_shape_id as usize);
            }

            // CharShape와 텍스트 색상 수집 / Collect CharShape and text colors
            for record in &paragraph.records {
                if let crate::document::bodytext::ParagraphRecord::ParaCharShape { shapes } =
                    record
                {
                    for shape_info in shapes {
                        let shape_id = shape_info.shape_id as usize;
                        // HWP 파일의 shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for shape_id
                        if shape_id < document.doc_info.char_shapes.len() {
                            // Store shape_id directly (0-based indexing to match XSL/XML)
                            char_shapes.insert(shape_id);

                            // shape_id is 0-based (matches XSL/XML format)
                            if let Some(char_shape) =
                                document.doc_info.char_shapes.get(shape_id)
                            {
                                if char_shape.text_color.0 != 0 {
                                    text_colors.insert(char_shape.text_color.0);
                                }
                            }
                        }
                    }
                }
            }
        };

        // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
        for section in &document.body_text.sections {
            for paragraph in &section.paragraphs {
                collect_from_paragraph(paragraph, &mut char_shapes, &mut para_shapes, &mut text_colors);

                // CtrlHeader의 paragraphs도 수집 / Also collect paragraphs from CtrlHeader
                for record in &paragraph.records {
                    if let crate::document::bodytext::ParagraphRecord::CtrlHeader {
                        paragraphs: ctrl_paragraphs,
                        ..
                    } = record
                    {
                        for ctrl_para in ctrl_paragraphs {
                            collect_from_paragraph(ctrl_para, &mut char_shapes, &mut para_shapes, &mut text_colors);
                        }
                    }
                }
            }
        }

        StyleInfo {
            char_shapes,
            para_shapes,
            text_colors,
        }
    }
}

/// CSS 스타일 생성 / Generate CSS styles
pub fn generate_css_styles(document: &HwpDocument, style_info: &StyleInfo) -> String {
    let mut css = String::new();

    // 기본 스타일 (noori_style.css 기반) / Base styles (based on noori_style.css)
    css.push_str(
        "body {margin:0;padding-left:0;padding-right:0;padding-bottom:0;padding-top:2mm;}\n",
    );
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
    css.push_str(
        ".hpN {display:inline-block;margin:0;padding:0;position:relative;white-space:nowrap;}\n",
    );
    css.push_str(".htC {display:inline-block;margin:0;padding:0;position:relative;vertical-align:top;overflow:hidden;}\n");
    css.push_str(".haN {display:inline-block;margin:0;padding:0;position:relative;}\n");
    css.push_str(".hdu {margin:0;padding:0;position:relative;}\n");
    css.push_str(".hdS {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsC {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hsR {margin:0;padding:0;position:absolute;}\n");
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
    css.push_str(
        ".hco {display:inline-block;margin:0;padding:0;position:relative;white-space:inherit;}\n",
    );
    css.push_str(".hcc {margin:0;padding:0;position:absolute;}\n");
    css.push_str(".hls {clear:both;}\n");
    css.push_str("[onclick] {cursor:pointer;}\n");

    // CharShape 스타일 생성 (cs1, cs2, ...) / Generate CharShape styles (cs1, cs2, ...) - 1-based indexing to match original HTML
    let mut char_shape_ids: Vec<usize> = style_info.char_shapes.iter().copied().collect();
    char_shape_ids.sort();

    for &shape_id in &char_shape_ids {
        // shape_id is 0-based (matches XSL/XML format)
        if let Some(char_shape) = document.doc_info.char_shapes.get(shape_id) {
            // Use 0-based shape_id for class name to match XSL/XML format (cs0, cs1, cs2, ...)
            let class_name = format!("cs{}", shape_id);

            css.push_str(&format!(".{} {{\n", class_name));

            // 폰트 크기 / Font size
            let size_pt = char_shape.base_size as f64 / 100.0;

            css.push_str(&format!("  font-size:{}pt;", size_pt));

            // 텍스트 색상 / Text color
            let color = &char_shape.text_color;
            css.push_str(&format!(
                "color:rgb({},{},{});",
                color.r(),
                color.g(),
                color.b()
            ));

            // 폰트 패밀리 / Font family
            // CharShape의 font_ids에서 한글 폰트 ID를 가져와서 face_names에서 폰트 이름 찾기
            // Get Korean font ID from CharShape's font_ids and find font name from face_names
            // HWP 파일의 font_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for font_id
            let font_id = char_shape.font_ids.korean as usize;
            let font_name = if font_id < document.doc_info.face_names.len() {
                &document.doc_info.face_names[font_id].name
            } else {
                "함초롬바탕" // 기본값 / Default
            };

            css.push_str(&format!("font-family:\"{}\";", font_name));

            // 속성 / Attributes
            if char_shape.attributes.bold {
                css.push_str("font-weight:bold;");
            }
            if char_shape.attributes.italic {
                css.push_str("font-style:italic;");
            }

            css.push_str("\n}\n");
        }
    }

    // ParaShape 스타일 생성 (ps0, ps1, ...) / Generate ParaShape styles (ps0, ps1, ...)
    let mut para_shape_indices: Vec<usize> = style_info.para_shapes.iter().copied().collect();
    para_shape_indices.sort();
    for &idx in &para_shape_indices {
        if let Some(para_shape) = document.doc_info.para_shapes.get(idx) {
            let class_name = format!("ps{}", idx);
            css.push_str(&format!(".{} {{\n", class_name));

            // 정렬 / Alignment
            match para_shape.attributes1.align {
                crate::document::docinfo::para_shape::ParagraphAlignment::Left => {
                    css.push_str("  text-align:left;");
                }
                crate::document::docinfo::para_shape::ParagraphAlignment::Right => {
                    css.push_str("  text-align:right;");
                }
                crate::document::docinfo::para_shape::ParagraphAlignment::Center => {
                    css.push_str("  text-align:center;");
                }
                crate::document::docinfo::para_shape::ParagraphAlignment::Justify => {
                    css.push_str("  text-align:justify;");
                }
                _ => {
                    css.push_str("  text-align:justify;");
                }
            }

            css.push_str("\n}\n");
        }
    }

    // Print media query / Print media query
    css.push_str("@media print {\n");
    css.push_str(".hpa {margin:0;border:0 black none;box-shadow:none;}\n");
    css.push_str("body {padding:0;}\n");
    css.push_str("}\n");

    css
}

/// INT32를 mm 단위로 변환 / Convert INT32 to millimeters
/// 값을 소수점 2자리로 반올림 / Round value to 2 decimal places
pub fn round_to_2dp(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

pub fn int32_to_mm(value: INT32) -> f64 {
    // INT32는 1/7200인치 단위 (SHWPUNIT와 동일)
    (value as f64 / 7200.0) * 25.4
}

/// mm를 INT32 단위로 변환 / Convert millimeters to INT32
pub fn mm_to_int32(value_mm: f64) -> INT32 {
    // INT32는 1/7200인치 단위 (SHWPUNIT와 동일)
    // 1 inch = 25.4 mm, 따라서 1 mm = 7200 / 25.4 INT32
    ((value_mm / 25.4) * 7200.0) as INT32
}

/// COLORREF를 RGB 문자열로 변환 / Convert COLORREF to RGB string
pub fn colorref_to_rgb(color: COLORREF) -> String {
    format!("rgb({},{},{})", color.r(), color.g(), color.b())
}
