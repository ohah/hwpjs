/// 페이지 렌더링 모듈 / Page rendering module

/// 페이지를 HTML로 렌더링 / Render page to HTML
pub fn render_page(
    _page_number: usize,
    content: &str,
    tables: &[String],
    page_def: Option<&crate::document::bodytext::PageDef>,
    _first_segment_pos: Option<(crate::types::INT32, crate::types::INT32)>,
    hcd_position: Option<(f64, f64)>,
) -> String {
    use crate::types::RoundTo2dp;
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
    // #region agent log
    use std::fs::OpenOptions;
    use std::io::Write;
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(r"d:\ohah\hwpjs\.cursor\debug.log")
    {
        let _ = writeln!(
            file,
            r#"{{"id":"log_page_render_tables","timestamp":{},"location":"html/page.rs:render_page","message":"rendering tables","data":{{"tables_count":{},"first_table_contains_htg":{}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"G"}}"#,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            tables.len(),
            tables.first().map(|t| t.contains("htG")).unwrap_or(false)
        );
    }
    // #endregion
    for (idx, table_html) in tables.iter().enumerate() {
        // #region agent log
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(r"d:\ohah\hwpjs\.cursor\debug.log")
        {
            let _ = writeln!(
                file,
                r#"{{"id":"log_page_render_table_add","timestamp":{},"location":"html/page.rs:render_page","message":"adding table to html","data":{{"table_index":{},"html_length":{},"contains_htg":{},"html_preview":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"J"}}"#,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis(),
                idx,
                table_html.len(),
                table_html.contains("htG"),
                // HTML 미리보기 제거 (디버그 로그가 너무 길어짐) / Remove HTML preview (debug log too long)
                ""
            );
        }
        // #endregion
        html.push_str(table_html);
    }

    html.push_str("</div>");
    // #region agent log
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(r"d:\ohah\hwpjs\.cursor\debug.log")
    {
        let htg_count = html.matches("htG").count();
        let htb_count = html.matches("htb").count();
        let _ = writeln!(
            file,
            r#"{{"id":"log_page_render_result","timestamp":{},"location":"html/page.rs:render_page","message":"render_page result","data":{{"html_length":{},"contains_htg":{},"htg_count":{},"htb_count":{},"html_preview":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"K"}}"#,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            html.len(),
            html.contains("htG"),
            htg_count,
            htb_count,
            // HTML 미리보기 제거 (디버그 로그가 너무 길어짐) / Remove HTML preview (debug log too long)
            ""
        );
    }
    // #endregion
    html
}
