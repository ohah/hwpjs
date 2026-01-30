use crate::document::bodytext::ctrl_header::{CtrlHeaderData, PageNumberPosition};
use crate::document::HwpDocument;
use crate::types::RoundTo2dp;
use crate::{document::bodytext::PageDef, INT32};
/// 페이지 렌더링 모듈 / Page rendering module

/// 페이지를 HTML로 렌더링 / Render page to HTML
pub fn render_page(
    page_number: usize,
    content: &str,
    tables: &[String],
    page_def: Option<&PageDef>,
    _first_segment_pos: Option<(INT32, INT32)>,
    hcd_position: Option<(f64, f64)>,
    page_number_position: Option<&CtrlHeaderData>,
    page_start_number: u16,
    document: &HwpDocument,
) -> String {
    let width_mm = page_def
        .map(|pd| pd.paper_width.to_mm().round_to_2dp())
        .unwrap_or(210.0); // A4 기본값 / A4 default
    let height_mm = page_def
        .map(|pd| pd.paper_height.to_mm().round_to_2dp())
        .unwrap_or(297.0); // A4 기본값 / A4 default

    // hcD 위치: PageDef 여백을 직접 사용 / hcD position: use PageDef margins directly
    let (left_mm, top_mm) = if let Some((left, top)) = hcd_position {
        (left.round_to_2dp(), top.round_to_2dp())
    } else {
        // hcd_position이 없으면 PageDef 여백 사용 / Use PageDef margins if hcd_position not available
        let left = page_def
            .map(|pd| (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp())
            .unwrap_or(20.0);
        let top = page_def
            .map(|pd| (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp())
            .unwrap_or(24.99);
        (left, top)
    };

    // 일반 내용은 hcD > hcI 안에 배치 / Place regular content in hcD > hcI
    let mut html = format!(
        r#"<div class="hpa" style="width:{}mm;height:{}mm;">"#,
        width_mm, height_mm
    );

    if !content.is_empty() {
        html.push_str(&format!(
            r#"<div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI">{}</div></div>"#,
            left_mm, top_mm, content
        ));
    }

    // 테이블은 hpa 레벨에 직접 배치 / Place tables directly at hpa level
    for table_html in tables {
        html.push_str(table_html);
    }

    // 쪽번호 렌더링 / Render page number
    if let Some(CtrlHeaderData::PageNumberPosition {
        flags,
        prefix,
        suffix,
        ..
    }) = page_number_position
    {
        if flags.position != PageNumberPosition::None {
            let actual_page_number = (page_start_number as usize + page_number - 1).to_string();

            // prefix/suffix에서 null 문자 제거 (null 문자는 빈 문자열로 처리) / Remove null characters from prefix/suffix (treat null as empty string)
            let prefix_clean: String = prefix.chars().filter(|c| *c != '\0').collect();
            let suffix_clean: String = suffix.chars().filter(|c| *c != '\0').collect();

            let page_number_text =
                format!("{}{}{}", prefix_clean, actual_page_number, suffix_clean);

            // 페이지 크기 계산 / Calculate page size
            let page_width_mm = page_def
                .map(|pd| pd.paper_width.to_mm().round_to_2dp())
                .unwrap_or(210.0);
            let page_height_mm = page_def
                .map(|pd| pd.paper_height.to_mm().round_to_2dp())
                .unwrap_or(297.0);

            // 쪽번호 위치 계산 (PageDef의 여백 정보 사용) / Calculate page number position (using PageDef margin information)
            let (left_mm, top_mm) = match flags.position {
                PageNumberPosition::BottomCenter => {
                    // 하단 중앙: 페이지 너비의 중앙, 하단 여백 기준 / Bottom center: center of page width, based on bottom margin
                    let left = (page_width_mm / 2.0).round_to_2dp();
                    let top = page_def
                        .map(|pd| {
                            // 페이지 높이 - 아래 여백 / Page height - bottom margin
                            (page_height_mm - pd.bottom_margin.to_mm()).round_to_2dp()
                        })
                        .unwrap_or_else(|| (page_height_mm - 10.0).round_to_2dp());
                    (left, top)
                }
                PageNumberPosition::BottomLeft => {
                    // 하단 왼쪽 / Bottom left
                    let left = page_def
                        .map(|pd| {
                            (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp()
                        })
                        .unwrap_or(20.0);
                    let top = page_def
                        .map(|pd| (page_height_mm - pd.bottom_margin.to_mm()).round_to_2dp())
                        .unwrap_or_else(|| (page_height_mm - 10.0).round_to_2dp());
                    (left, top)
                }
                PageNumberPosition::BottomRight => {
                    // 하단 오른쪽 / Bottom right
                    let left = page_def
                        .map(|pd| {
                            (page_width_mm - pd.right_margin.to_mm() - pd.binding_margin.to_mm())
                                .round_to_2dp()
                        })
                        .unwrap_or(190.0);
                    let top = page_def
                        .map(|pd| (page_height_mm - pd.bottom_margin.to_mm()).round_to_2dp())
                        .unwrap_or_else(|| (page_height_mm - 10.0).round_to_2dp());
                    (left, top)
                }
                PageNumberPosition::TopCenter => {
                    // 상단 중앙 / Top center
                    let left = (page_width_mm / 2.0).round_to_2dp();
                    let top = page_def
                        .map(|pd| pd.top_margin.to_mm().round_to_2dp())
                        .unwrap_or(10.0);
                    (left, top)
                }
                PageNumberPosition::TopLeft => {
                    // 상단 왼쪽 / Top left
                    let left = page_def
                        .map(|pd| {
                            (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp()
                        })
                        .unwrap_or(20.0);
                    let top = page_def
                        .map(|pd| pd.top_margin.to_mm().round_to_2dp())
                        .unwrap_or(10.0);
                    (left, top)
                }
                PageNumberPosition::TopRight => {
                    // 상단 오른쪽 / Top right
                    let left = page_def
                        .map(|pd| {
                            (page_width_mm - pd.right_margin.to_mm() - pd.binding_margin.to_mm())
                                .round_to_2dp()
                        })
                        .unwrap_or(190.0);
                    let top = page_def
                        .map(|pd| pd.top_margin.to_mm().round_to_2dp())
                        .unwrap_or(10.0);
                    (left, top)
                }
                _ => {
                    // 기타 위치는 기본값 사용 (하단 중앙) / Use default for other positions (bottom center)
                    let left = (page_width_mm / 2.0).round_to_2dp();
                    let top = page_def
                        .map(|pd| (page_height_mm - pd.bottom_margin.to_mm()).round_to_2dp())
                        .unwrap_or_else(|| (page_height_mm - 10.0).round_to_2dp());
                    (left, top)
                }
            };

            // CharShape 정보로 텍스트 크기 계산 / Calculate text size from CharShape
            // 원본 HTML에서 cs1 클래스를 사용하므로 shape_id 1 (0-based) 사용 / Use shape_id 1 (0-based) since original HTML uses cs1 class
            let char_shape_id = 1;
            let (width_mm, height_mm) = if char_shape_id < document.doc_info.char_shapes.len() {
                if let Some(char_shape) = document.doc_info.char_shapes.get(char_shape_id) {
                    // 폰트 크기 계산 (base_size는 1/100 pt 단위) / Calculate font size (base_size is in 1/100 pt units)
                    let font_size_pt = char_shape.base_size as f64 / 100.0;
                    let font_size_mm = font_size_pt * 0.352778; // 1pt = 0.352778mm

                    // 텍스트 너비 계산: 문자 수 * 폰트 크기 * 평균 문자 폭 비율 (약 0.6) / Calculate text width: char count * font size * average char width ratio (approx 0.6)
                    let char_count = page_number_text.chars().count() as f64;
                    let text_width_mm = (char_count * font_size_mm * 0.6).round_to_2dp();

                    // 텍스트 높이 계산: 폰트 크기 * line-height (약 1.2) / Calculate text height: font size * line-height (approx 1.2)
                    let text_height_mm = (font_size_mm * 1.2).round_to_2dp();

                    (text_width_mm, text_height_mm)
                } else {
                    // CharShape를 찾을 수 없는 경우 기본값 사용 / Use default if CharShape not found
                    (1.95, 3.53)
                }
            } else {
                // CharShape ID가 범위를 벗어난 경우 기본값 사용 / Use default if CharShape ID out of range
                (1.95, 3.53)
            };

            html.push_str(&format!(
                r#"<div class="hpN" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;"><span class="hrt cs1">{}</span></div>"#,
                left_mm, top_mm, width_mm, height_mm, page_number_text
            ));
        }
    }

    html.push_str("</div>");
    html
}
