use crate::document::bodytext::page_def::PageDef;

/// PDF 페이지 설정 (mm 단위)
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PdfPageConfig {
    pub width_mm: f64,
    pub height_mm: f64,
    pub left_margin_mm: f64,
    pub right_margin_mm: f64,
    pub top_margin_mm: f64,
    pub bottom_margin_mm: f64,
    pub content_width_mm: f64,
    pub content_height_mm: f64,
}

impl PdfPageConfig {
    /// PageDef에서 PdfPageConfig 생성
    pub fn from_page_def(page_def: &PageDef) -> Self {
        let width_mm = page_def.effective_width_mm();
        let height_mm = page_def.effective_height_mm();
        let binding_mm = page_def.binding_margin.to_mm();
        let header_mm = page_def.header_margin.to_mm();
        let footer_mm = page_def.footer_margin.to_mm();

        // HTML 렌더러와 동일: left = left_margin + binding_margin
        let left_margin_mm = page_def.left_margin.to_mm() + binding_mm;
        let right_margin_mm = page_def.right_margin.to_mm();
        // HTML 렌더러와 동일: top = top_margin + header_margin
        let top_margin_mm = page_def.top_margin.to_mm() + header_mm;
        let bottom_margin_mm = page_def.bottom_margin.to_mm() + footer_mm;

        // content_height = height - top_margin - bottom_margin (HTML과 동일, header/footer 미포함)
        let content_width_mm = width_mm - left_margin_mm - right_margin_mm;
        let content_height_mm =
            height_mm - page_def.top_margin.to_mm() - page_def.bottom_margin.to_mm();

        Self {
            width_mm,
            height_mm,
            left_margin_mm,
            right_margin_mm,
            top_margin_mm,
            bottom_margin_mm,
            content_width_mm,
            content_height_mm,
        }
    }

    /// 기본 A4 페이지 (210×297mm, 여백 30/30/25/25)
    pub fn default_a4() -> Self {
        Self {
            width_mm: 210.0,
            height_mm: 297.0,
            left_margin_mm: 30.0,
            right_margin_mm: 30.0,
            top_margin_mm: 25.0,
            bottom_margin_mm: 25.0,
            content_width_mm: 150.0,
            content_height_mm: 247.0,
        }
    }

    pub fn format_summary(&self) -> String {
        format!(
            "{:.0}x{:.0}mm margins: {:.0}/{:.0}/{:.0}/{:.0}",
            self.width_mm,
            self.height_mm,
            self.left_margin_mm,
            self.right_margin_mm,
            self.top_margin_mm,
            self.bottom_margin_mm,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::bodytext::page_def::{
        BindingMethod, PageDefAttributes, PaperDirection,
    };
    use crate::types::HWPUNIT;

    #[test]
    fn default_a4_dimensions() {
        let config = PdfPageConfig::default_a4();
        assert!((config.width_mm - 210.0).abs() < 0.01);
        assert!((config.height_mm - 297.0).abs() < 0.01);
        assert!((config.content_width_mm - 150.0).abs() < 0.01);
        assert!((config.content_height_mm - 247.0).abs() < 0.01);
    }

    #[test]
    fn from_page_def_vertical() {
        let page_def = PageDef {
            paper_width: HWPUNIT::from_mm(210.0),
            paper_height: HWPUNIT::from_mm(297.0),
            left_margin: HWPUNIT::from_mm(30.0),
            right_margin: HWPUNIT::from_mm(30.0),
            top_margin: HWPUNIT::from_mm(25.0),
            bottom_margin: HWPUNIT::from_mm(25.0),
            header_margin: HWPUNIT::from_mm(10.0),
            footer_margin: HWPUNIT::from_mm(10.0),
            binding_margin: HWPUNIT(0),
            attributes: PageDefAttributes {
                paper_direction: PaperDirection::Vertical,
                binding_method: BindingMethod::SinglePage,
            },
        };
        let config = PdfPageConfig::from_page_def(&page_def);
        assert!((config.width_mm - 210.0).abs() < 1.0);
        assert!((config.height_mm - 297.0).abs() < 1.0);
        assert!((config.content_width_mm - 150.0).abs() < 1.0);
    }
}
