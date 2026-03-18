/// Document 기반 페이지 구조 렌더링 (old viewer page.rs 포팅)
/// hpa > hcD > hcI 구조로 콘텐츠 배치
use super::styles::{hwpunit_to_mm, round_mm};
use hwp_model::section::PageDef;

/// 페이지 내 콘텐츠 블록
pub struct PageBlock {
    pub html: String,
}

/// 페이지를 hpa div로 렌더링
pub fn render_page(
    blocks: &[PageBlock],
    page_def: &PageDef,
    header_html: Option<&str>,
    footer_html: Option<&str>,
) -> String {
    let width_mm = round_mm(hwpunit_to_mm(page_def.width));
    let height_mm = round_mm(hwpunit_to_mm(page_def.height));

    // Landscape 보정
    let (width_mm, height_mm) = match page_def.landscape {
        hwp_model::types::Landscape::Landscape => (height_mm, width_mm),
        _ => (width_mm, height_mm),
    };

    // hcD 위치: 여백 기준
    let left_mm = round_mm(
        hwpunit_to_mm(page_def.margin.left) + hwpunit_to_mm(page_def.margin.gutter),
    );
    let top_mm = round_mm(
        hwpunit_to_mm(page_def.margin.top) + hwpunit_to_mm(page_def.margin.header),
    );

    let header_top_mm = round_mm(hwpunit_to_mm(page_def.margin.top));
    let footer_top_mm = round_mm(
        height_mm
            - hwpunit_to_mm(page_def.margin.bottom)
            - hwpunit_to_mm(page_def.margin.footer),
    );

    let mut html = format!(
        r#"<div class="hpa" style="width:{};height:{};">"#,
        super::styles::fmt_mm(width_mm),
        super::styles::fmt_mm(height_mm),
    );

    use super::styles::fmt_mm;

    // 머리말
    if let Some(h) = header_html {
        if !h.is_empty() {
            html.push_str(&format!(
                r#"<div class="hcD" style="left:{};top:{};"><div class="hcI">{}</div></div>"#,
                fmt_mm(left_mm), fmt_mm(header_top_mm), h
            ));
        }
    }

    // 꼬리말
    if let Some(f) = footer_html {
        if !f.is_empty() {
            html.push_str(&format!(
                r#"<div class="hcD" style="left:{};top:{};"><div class="hcI">{}</div></div>"#,
                fmt_mm(left_mm), fmt_mm(footer_top_mm), f
            ));
        }
    }

    // 본문 콘텐츠
    let has_content = blocks.iter().any(|b| !b.html.is_empty());
    if has_content {
        html.push_str(&format!(
            r#"<div class="hcD" style="left:{};top:{};"><div class="hcI">"#,
            fmt_mm(left_mm), fmt_mm(top_mm)
        ));
        for block in blocks {
            if !block.html.is_empty() {
                html.push_str(&block.html);
            }
        }
        html.push_str("</div></div>");
    }

    html.push_str("</div>");
    html
}

/// 콘텐츠 영역 너비 (mm): 페이지 폭 - 좌우 여백 - 제본 여백
pub fn content_width_mm(page_def: &PageDef) -> f64 {
    let width = match page_def.landscape {
        hwp_model::types::Landscape::Landscape => hwpunit_to_mm(page_def.height),
        _ => hwpunit_to_mm(page_def.width),
    };
    width
        - hwpunit_to_mm(page_def.margin.left)
        - hwpunit_to_mm(page_def.margin.right)
        - hwpunit_to_mm(page_def.margin.gutter)
}

/// 콘텐츠 영역 좌측 오프셋 (mm)
pub fn content_left_mm(page_def: &PageDef) -> f64 {
    0.0 // hcD 내부에서의 상대 좌표이므로 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a4_page_def() -> PageDef {
        PageDef {
            width: 59528,  // A4: 210mm = 59528 HwpUnit
            height: 84188, // A4: 297mm
            margin: hwp_model::section::PageMargin {
                left: 8504,  // 30mm
                right: 8504,
                top: 5669,   // 20mm
                bottom: 4252,
                header: 4252,
                footer: 4252,
                gutter: 0,
            },
            ..Default::default()
        }
    }

    #[test]
    fn test_render_page_basic() {
        let blocks = vec![PageBlock {
            html: "<div>content</div>".to_string(),
        }];
        let html = render_page(&blocks, &a4_page_def(), None, None);
        assert!(html.contains(r#"class="hpa""#));
        assert!(html.contains(r#"class="hcD""#));
        assert!(html.contains(r#"class="hcI""#));
        assert!(html.contains("content"));
    }

    #[test]
    fn test_render_page_with_header_footer() {
        let blocks = vec![PageBlock {
            html: "<div>body</div>".to_string(),
        }];
        let html = render_page(
            &blocks,
            &a4_page_def(),
            Some("<p>Header</p>"),
            Some("<p>Footer</p>"),
        );
        assert!(html.contains("Header"));
        assert!(html.contains("Footer"));
        assert!(html.contains("body"));
    }

    #[test]
    fn test_content_width_mm() {
        let pd = a4_page_def();
        let w = content_width_mm(&pd);
        // 210mm - 30mm - 30mm = 150mm
        assert!((w - 150.0).abs() < 0.5);
    }
}
