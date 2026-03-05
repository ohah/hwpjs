use crate::document::docinfo::char_shape::CharShape;
use crate::document::HwpDocument;

/// PDF 텍스트 스타일 (CharShape에서 변환)
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PdfTextStyle {
    pub font_size_pt: f64,
    pub color_r: u8,
    pub color_g: u8,
    pub color_b: u8,
    pub font_name: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    pub letter_spacing_em: f64,
}

impl Default for PdfTextStyle {
    fn default() -> Self {
        Self {
            font_size_pt: 10.0,
            color_r: 0,
            color_g: 0,
            color_b: 0,
            font_name: String::new(),
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            letter_spacing_em: 0.0,
        }
    }
}

impl PdfTextStyle {
    /// CharShape + document에서 PdfTextStyle 생성
    pub fn from_char_shape(char_shape: &CharShape, document: &HwpDocument) -> Self {
        let font_size_pt = char_shape.base_size as f64 / 100.0;

        let color_r = char_shape.text_color.r();
        let color_g = char_shape.text_color.g();
        let color_b = char_shape.text_color.b();

        let font_id = char_shape.font_ids.korean as usize;
        let font_name = if font_id < document.doc_info.face_names.len() {
            document.doc_info.face_names[font_id].name.clone()
        } else {
            "함초롬바탕".to_string()
        };

        let bold = char_shape.attributes.bold;
        let italic = char_shape.attributes.italic;

        // underline_type=1: 글자 아래, underline_type=2: 글자 위(취소선으로 표시)
        let effective_underline = char_shape.attributes.underline_type == 1;
        let effective_strikethrough =
            char_shape.attributes.strikethrough > 0 || (char_shape.attributes.underline_type == 2);

        // 자간: 한글 우선, 기타 언어 중 0이 아닌 첫 값
        let letter_spacing = if char_shape.letter_spacing.korean != 0 {
            char_shape.letter_spacing.korean
        } else if char_shape.letter_spacing.english != 0 {
            char_shape.letter_spacing.english
        } else if char_shape.letter_spacing.chinese != 0 {
            char_shape.letter_spacing.chinese
        } else if char_shape.letter_spacing.japanese != 0 {
            char_shape.letter_spacing.japanese
        } else if char_shape.letter_spacing.other != 0 {
            char_shape.letter_spacing.other
        } else if char_shape.letter_spacing.symbol != 0 {
            char_shape.letter_spacing.symbol
        } else if char_shape.letter_spacing.user != 0 {
            char_shape.letter_spacing.user
        } else {
            0
        };
        let letter_spacing_em = (letter_spacing as f64 / 2.0) / 100.0;

        Self {
            font_size_pt,
            color_r,
            color_g,
            color_b,
            font_name,
            bold,
            italic,
            underline: effective_underline,
            strikethrough: effective_strikethrough,
            letter_spacing_em,
        }
    }

    /// 요약 문자열 (스냅샷용)
    pub fn summary(&self, shape_id: usize) -> String {
        let mut parts = Vec::new();
        parts.push(format!("cs{}", shape_id));
        if self.bold {
            parts.push("bold".to_string());
        }
        if self.italic {
            parts.push("italic".to_string());
        }
        parts.push(format!("{:.0}pt", self.font_size_pt));
        parts.push(format!(
            "rgb({},{},{})",
            self.color_r, self.color_g, self.color_b
        ));
        format!("[{}]", parts.join(" "))
    }
}

// ============================================================
// PdfParaStyle: ParaShape 기반 문단 스타일
// ============================================================

use crate::document::docinfo::para_shape::{LineSpacingType, ParaShape, ParagraphAlignment};

/// PDF 문단 스타일 (ParaShape에서 변환)
#[derive(Debug, Clone)]
pub struct PdfParaStyle {
    pub left_margin_mm: f64,
    pub right_margin_mm: f64,
    pub indent_mm: f64,
    pub top_spacing_mm: f64,
    pub bottom_spacing_mm: f64,
    pub line_spacing_value: f64,
    pub line_spacing_type: LineSpacingType,
    pub align: ParagraphAlignment,
}

impl Default for PdfParaStyle {
    fn default() -> Self {
        Self {
            left_margin_mm: 0.0,
            right_margin_mm: 0.0,
            indent_mm: 0.0,
            top_spacing_mm: 0.0,
            bottom_spacing_mm: 0.0,
            line_spacing_value: 160.0,
            line_spacing_type: LineSpacingType::ByCharacter,
            align: ParagraphAlignment::Justify,
        }
    }
}

impl PdfParaStyle {
    /// HWPUNIT(1/7200 inch) → mm
    fn to_mm(v: i32) -> f64 {
        v as f64 / 7200.0 * 25.4
    }

    /// ParaShape에서 PdfParaStyle 생성
    pub fn from_para_shape(ps: &ParaShape) -> Self {
        let spacing_type = ps
            .attributes3
            .as_ref()
            .map(|a| a.line_spacing_type)
            .unwrap_or(LineSpacingType::ByCharacter);

        // line_spacing (5.0.2.5+) 우선, 없으면 line_spacing_old 사용
        // line_spacing_old 상위 16비트는 번호/글머리기호 ID이므로 하위 16비트만 사용
        let raw_new = ps.line_spacing.unwrap_or(0);
        let raw_old = ps.line_spacing_old & 0xFFFF;
        let raw_spacing = match spacing_type {
            LineSpacingType::ByCharacter => {
                // ByCharacter 타입에서 값은 % (예: 160 = 160%)
                // 새 필드가 10 이하면 old 값 사용, old도 작으면 기본 160
                if raw_new > 10 {
                    raw_new
                } else if raw_old > 10 {
                    raw_old
                } else {
                    160 // 기본 행간 160%
                }
            }
            _ => {
                // Fixed/Minimum/MarginOnly: HWPUNIT 값
                if raw_new != 0 {
                    raw_new
                } else {
                    raw_old
                }
            }
        };

        Self {
            left_margin_mm: Self::to_mm(ps.left_margin),
            right_margin_mm: Self::to_mm(ps.right_margin),
            indent_mm: Self::to_mm(ps.indent),
            top_spacing_mm: Self::to_mm(ps.top_spacing),
            bottom_spacing_mm: Self::to_mm(ps.bottom_spacing),
            line_spacing_value: raw_spacing as f64,
            line_spacing_type: spacing_type,
            align: ps.attributes1.align,
        }
    }

    /// 스냅샷용 요약 문자열
    pub fn summary(&self) -> String {
        let align_str = match self.align {
            ParagraphAlignment::Justify => "justify",
            ParagraphAlignment::Left => "left",
            ParagraphAlignment::Right => "right",
            ParagraphAlignment::Center => "center",
            ParagraphAlignment::Distribute => "distribute",
            ParagraphAlignment::Divide => "divide",
        };
        let mut parts = vec![align_str.to_string()];
        if self.left_margin_mm.abs() > 0.01 {
            parts.push(format!("lm={:.1}mm", self.left_margin_mm));
        }
        if self.right_margin_mm.abs() > 0.01 {
            parts.push(format!("rm={:.1}mm", self.right_margin_mm));
        }
        if self.indent_mm.abs() > 0.01 {
            parts.push(format!("ind={:.1}mm", self.indent_mm));
        }
        parts.push(format!("ls={:.0}%", self.line_spacing_value));
        parts.join(" ")
    }
}

/// ParaShape 기반 행간 계산
pub fn compute_line_height(para: &PdfParaStyle, font_height_mm: f64) -> f64 {
    match para.line_spacing_type {
        LineSpacingType::ByCharacter => {
            let pct = para.line_spacing_value / 100.0;
            font_height_mm * pct.max(1.0)
        }
        LineSpacingType::Fixed => {
            let h = para.line_spacing_value / 7200.0 * 25.4;
            h.max(font_height_mm)
        }
        LineSpacingType::Minimum => {
            let h = para.line_spacing_value / 7200.0 * 25.4;
            h.max(font_height_mm)
        }
        LineSpacingType::MarginOnly => font_height_mm + para.line_spacing_value / 7200.0 * 25.4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_style() {
        let style = PdfTextStyle::default();
        assert!((style.font_size_pt - 10.0).abs() < 0.01);
        assert!(!style.bold);
        assert!(!style.italic);
        assert!(!style.underline);
        assert!(!style.strikethrough);
    }

    #[test]
    fn summary_format() {
        let style = PdfTextStyle {
            font_size_pt: 12.0,
            bold: true,
            color_r: 0,
            color_g: 0,
            color_b: 0,
            ..PdfTextStyle::default()
        };
        assert_eq!(style.summary(2), "[cs2 bold 12pt rgb(0,0,0)]");
    }
}
