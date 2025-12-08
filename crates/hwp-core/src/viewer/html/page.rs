/// 페이지 렌더링 모듈 / Page rendering module

/// 페이지를 HTML로 렌더링 / Render page to HTML
pub fn render_page(
    page_number: usize,
    content: &str,
    page_def: Option<&crate::document::bodytext::PageDef>,
) -> String {
    let width_mm = page_def.map(|pd| pd.paper_width.to_mm()).unwrap_or(210.0); // A4 기본값 / A4 default
    let height_mm = page_def.map(|pd| pd.paper_height.to_mm()).unwrap_or(297.0); // A4 기본값 / A4 default

    // 여백 계산 / Calculate margins
    let left_margin_mm = page_def.map(|pd| pd.left_margin.to_mm()).unwrap_or(20.0); // 기본값 20mm / Default 20mm
    let top_margin_mm = page_def.map(|pd| pd.top_margin.to_mm()).unwrap_or(24.99); // 기본값 24.99mm / Default 24.99mm
    let bottom_margin_mm = page_def.map(|pd| pd.bottom_margin.to_mm()).unwrap_or(10.0); // 기본값 10mm / Default 10mm

    // 페이지 번호 위치 계산 (하단 중앙) / Calculate page number position (bottom center)
    // 페이지 번호 너비를 고려하여 정확히 중앙에 배치 / Place page number exactly in center considering its width
    let page_number_width_mm = 1.95; // 페이지 번호 너비 / Page number width
    let page_number_left = width_mm / 2.0 - page_number_width_mm / 2.0; // 정확히 중앙 / Exactly center
    let page_number_top = height_mm - bottom_margin_mm; // 하단 여백 고려 / Consider bottom margin

    format!(
        r#"<div class="hpa" style="width:{}mm;height:{}mm;"><div class="hpN" style="left:{}mm;top:{}mm;width:1.95mm;height:3.53mm;"><span class="hrt cs1">{}</span></div><div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI">{}</div></div></div>"#,
        width_mm,
        height_mm,
        page_number_left,
        page_number_top,
        page_number,
        left_margin_mm,
        top_margin_mm,
        content
    )
}
