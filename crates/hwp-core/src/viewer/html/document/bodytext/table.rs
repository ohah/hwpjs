/// Table conversion to HTML
/// 테이블을 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, TABLE (HWPTAG_BEGIN + 61)
/// Spec mapping: Table 57 - BodyText data records, TABLE (HWPTAG_BEGIN + 61)
use crate::document::{bodytext::Table, HwpDocument};

/// Cell data structure for table grid
/// 테이블 그리드를 위한 셀 데이터 구조
#[derive(Clone)]
struct CellData {
    content: String,
    border_fill_id: u16,
    col_span: u16,
    row_span: u16,
}

/// Convert table to HTML format
/// 테이블을 HTML 형식으로 변환
pub fn convert_table_to_html(
    table: &Table,
    document: &HwpDocument,
    options: &crate::viewer::html::HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> String {
    let row_count = table.attributes.row_count as usize;
    let col_count = table.attributes.col_count as usize;
    let css_prefix = &options.css_class_prefix;

    if row_count == 0 || col_count == 0 {
        return format!(
            r#"<table class="{}table"><tr><td>[Table: {}x{}]</td></tr></table>"#,
            css_prefix, row_count, col_count
        );
    }

    // 2D 배열로 셀 정렬 (행/열 위치 기준) / Arrange cells in 2D array (by row/column position)
    // 각 셀은 (내용, border_fill_id, col_span, row_span)을 저장
    // Each cell stores (content, border_fill_id, col_span, row_span)
    let mut grid: Vec<Vec<Option<CellData>>> = vec![vec![None; col_count]; row_count];

    // row_address와 col_address의 최소값 찾기 / Find minimum values of row_address and col_address
    let min_row = table
        .cells
        .iter()
        .map(|c| c.cell_attributes.row_address)
        .min()
        .unwrap_or(1);
    let min_col = table
        .cells
        .iter()
        .map(|c| c.cell_attributes.col_address)
        .min()
        .unwrap_or(1);

    // row_address가 모두 같다면, 셀의 순서를 사용하여 행을 구분
    // If all row_address values are the same, use cell order to distinguish rows
    let all_same_row = table
        .cells
        .iter()
        .all(|c| c.cell_attributes.row_address == min_row);

    // 셀을 row_address, col_address 순서로 정렬 / Sort cells by row_address, then col_address
    let mut sorted_cells: Vec<_> = table.cells.iter().enumerate().collect();
    sorted_cells.sort_by_key(|(_, cell)| {
        (
            cell.cell_attributes.row_address,
            cell.cell_attributes.col_address,
        )
    });

    if all_same_row {
        // 셀을 원래 순서대로 처리하되, col_address가 0으로 돌아가면 새 행으로 간주
        // Process cells in original order, but consider it a new row when col_address returns to 0
        let mut row_index = 0;
        let mut last_col = u16::MAX;

        for (_original_idx, cell) in sorted_cells {
            let col = (cell.cell_attributes.col_address.saturating_sub(min_col)) as usize;

            if cell.cell_attributes.col_address <= last_col && last_col != u16::MAX {
                row_index += 1;
                if row_index >= row_count {
                    row_index = row_count - 1;
                }
            }
            last_col = cell.cell_attributes.col_address;

            let row = row_index;

            if col < col_count {
                fill_cell_content(
                    &mut grid, cell, row, col, row_count, col_count, document, options, tracker,
                );
            }
        }
    } else {
        // row_address가 다르면 정상적으로 사용
        // If row_address differ, use them normally
        for cell in &table.cells {
            let row = (cell.cell_attributes.row_address.saturating_sub(min_row)) as usize;
            let col = (cell.cell_attributes.col_address.saturating_sub(min_col)) as usize;

            if row < row_count && col < col_count {
                fill_cell_content(
                    &mut grid, cell, row, col, row_count, col_count, document, options, tracker,
                );
            }
        }
    }

    // HTML 테이블 형식으로 변환 / Convert to HTML table format
    let mut html = String::new();
    html.push_str(&format!(r#"<table class="{}table">"#, css_prefix));

    // 첫 번째 행을 thead로 처리 (일반적으로 헤더 행) / Process first row as thead (typically header row)
    let mut has_thead = false;
    if row_count > 0 {
        // 첫 번째 행이 헤더인지 확인 (모든 셀이 비어있지 않고, 스타일이 다를 수 있음)
        // Check if first row is header (all cells not empty, may have different styles)
        let first_row_has_content = grid[0].iter().any(|cell| {
            cell.as_ref()
                .map(|c| !c.content.trim().is_empty())
                .unwrap_or(false)
        });
        if first_row_has_content {
            has_thead = true;
            html.push_str("<thead>");
            html.push_str("<tr>");
            let mut col = 0;
            while col < col_count {
                if let Some(cell_data) = &grid[0][col] {
                    // colspan, rowspan 처리 / Handle colspan, rowspan
                    let mut attrs = Vec::new();
                    if cell_data.col_span > 1 {
                        attrs.push(format!(r#"colspan="{}""#, cell_data.col_span));
                    }
                    if cell_data.row_span > 1 {
                        attrs.push(format!(r#"rowspan="{}""#, cell_data.row_span));
                    }

                    // 일단 모든 border를 1px solid black으로 설정 / For now, set all borders to 1px solid black
                    // TODO: 나중에 border_fill 속성 제대로 구현 / TODO: Implement border_fill properties properly later

                    let attrs_str = if attrs.is_empty() {
                        String::new()
                    } else {
                        format!(" {}", attrs.join(" "))
                    };

                    html.push_str(&format!(r#"<th{}>{}</th>"#, attrs_str, cell_data.content));

                    // 병합된 열 건너뛰기 / Skip merged columns
                    col += cell_data.col_span as usize;
                } else {
                    html.push_str("<th>&nbsp;</th>");
                    col += 1;
                }
            }
            html.push_str("</tr>");
            html.push_str("</thead>");
        }
    }

    // tbody 시작 / Start tbody
    html.push_str("<tbody>");

    // 나머지 행들을 tbody에 추가 / Add remaining rows to tbody
    let start_row = if has_thead { 1 } else { 0 };
    for row_idx in start_row..row_count {
        html.push_str("<tr>");
        let mut col = 0;
        while col < col_count {
            // 이 위치가 병합된 셀의 일부인지 확인 (이전 행에서 rowspan으로 병합된 경우)
            // Check if this position is part of a merged cell (merged by rowspan from previous row)
            let mut is_merged = false;
            for prev_row in start_row..row_idx {
                if let Some(prev_cell) = &grid[prev_row][col] {
                    if prev_cell.row_span > 1 {
                        let span_rows = prev_cell.row_span as usize;
                        if row_idx < prev_row + span_rows {
                            is_merged = true;
                            break;
                        }
                    }
                }
            }

            if is_merged {
                // 병합된 셀은 건너뛰기 / Skip merged cell
                col += 1;
                continue;
            }

            if let Some(cell_data) = &grid[row_idx][col] {
                // colspan, rowspan 처리 / Handle colspan, rowspan
                let mut attrs = Vec::new();
                if cell_data.col_span > 1 {
                    attrs.push(format!(r#"colspan="{}""#, cell_data.col_span));
                }
                if cell_data.row_span > 1 {
                    attrs.push(format!(r#"rowspan="{}""#, cell_data.row_span));
                }

                // 일단 모든 border를 1px solid black으로 설정 / For now, set all borders to 1px solid black
                // TODO: 나중에 border_fill 속성 제대로 구현 / TODO: Implement border_fill properties properly later

                let attrs_str = if attrs.is_empty() {
                    String::new()
                } else {
                    format!(" {}", attrs.join(" "))
                };

                html.push_str(&format!(r#"<td{}>{}</td>"#, attrs_str, cell_data.content));

                // 병합된 열 건너뛰기 / Skip merged columns
                col += cell_data.col_span as usize;
            } else {
                html.push_str("<td>&nbsp;</td>");
                col += 1;
            }
        }
        html.push_str("</tr>");
    }

    html.push_str("</tbody>");
    html.push_str("</table>");

    html
}

/// Fill cell content and handle cell merging
/// 셀 내용을 채우고 셀 병합을 처리
fn fill_cell_content(
    grid: &mut [Vec<Option<CellData>>],
    cell: &crate::document::bodytext::TableCell,
    row: usize,
    col: usize,
    row_count: usize,
    col_count: usize,
    document: &HwpDocument,
    options: &crate::viewer::html::HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) {
    // 셀 내용을 HTML로 변환 / Convert cell content to HTML
    let mut cell_parts = Vec::new();

    // 셀 내부의 문단들을 HTML로 변환 / Convert paragraphs inside cell to HTML
    for (idx, para) in cell.paragraphs.iter().enumerate() {
        // 문단을 HTML로 변환 / Convert paragraph to HTML
        let para_html =
            crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html(
                para, document, options, tracker,
            );

        if !para_html.trim().is_empty() {
            cell_parts.push(para_html);
        }

        // 마지막 문단이 아니면 문단 사이 공백 추가
        // If not last paragraph, add space between paragraphs
        if idx < cell.paragraphs.len() - 1 {
            cell_parts.push(" ".to_string());
        }
    }

    // 셀 내용을 하나의 문자열로 결합 / Combine cell parts into a single string
    let cell_content = if cell_parts.is_empty() {
        "&nbsp;".to_string() // 빈 셀은 &nbsp;로 표시 / Empty cell shows as &nbsp;
    } else {
        cell_parts.join("")
    };

    // 셀에 이미 내용이 있으면 덮어쓰지 않음 (병합 셀 처리)
    // Don't overwrite if cell already has content (handle merged cells)
    if grid[row][col].is_none() {
        let cell_data = CellData {
            content: cell_content,
            border_fill_id: cell.cell_attributes.border_fill_id,
            col_span: cell.cell_attributes.col_span,
            row_span: cell.cell_attributes.row_span,
        };
        grid[row][col] = Some(cell_data);
    }
}

/// Generate border fill CSS classes
/// BorderFill을 CSS 클래스로 생성
/// 정의된 모든 border_fill에 대해 CSS 생성 (사용 여부와 관계없이) / Generate CSS for all defined border_fills (regardless of usage)
/// 이제 border-fill-{id} 클래스는 테두리 스타일만 설정하고, 색상과 두께는 개별 클래스로 처리
/// Now border-fill-{id} class only sets border style, colors and widths are handled by individual classes
pub fn generate_border_fill_css(document: &HwpDocument, css_prefix: &str) -> String {
    let mut css = String::new();

    for (idx, border_fill) in document.doc_info.border_fill.iter().enumerate() {
        let border_fill_id = idx + 1; // border_fill_id는 1-based
        let class_name = format!("{}border-fill-{}", css_prefix, border_fill_id);

        css.push_str(&format!("    .{} {{\n", class_name));

        // 테두리 스타일 및 두께 설정 (색상은 개별 클래스로 처리) / Set border style and width (colors handled by individual classes)
        // 조건 제거: 모든 border에 대해 CSS 생성 (line_type=0도 실선, width=0도 0.1mm이므로 모두 유효)
        // Remove condition: Generate CSS for all borders (line_type=0 is solid, width=0 is 0.1mm, so all are valid)
        // [Left, Right, Top, Bottom]
        let border_names = ["left", "right", "top", "bottom"];
        for (idx, border) in border_fill.borders.iter().enumerate() {
            // line_type에 따른 스타일 매핑 (레거시 코드 참고) / Map line_type to style (reference legacy code)
            // 레거시 코드의 BorderStyle() 함수를 참고하여 매핑 / Reference legacy BorderStyle() function for mapping
            // case 0: 빈 문자열 반환 (하지만 모든 border에 대해 CSS 생성하므로 solid로 처리) / Returns empty string (but treat as solid since we generate CSS for all borders)
            // case 1: "solid" (스펙상 "긴 점선"이지만 레거시에서는 solid로 처리) / "solid" (spec says "long dash" but legacy treats as solid)
            let line_style = match border.line_type {
                0 => "solid", // 실선 (레거시는 빈 문자열이지만 모든 border에 대해 CSS 생성하므로 solid) / Solid (legacy returns empty but we treat as solid)
                1 => "solid", // solid (레거시 코드 참고) / solid (reference legacy code)
                2 => "dashed", // dashed
                3 => "dotted", // dotted
                4 => "solid", // solid
                5 => "dashed", // dashed
                6 => "dotted", // dotted
                7 => "double", // double
                8 => "double", // double
                9 => "double", // double
                10 => "double", // double
                11 => "solid", // solid
                12 => "double", // double
                13 => "solid", // solid
                14 => "solid", // solid
                15 => "solid", // solid
                16 => "solid", // solid
                _ => "solid", // 기본값 solid / Default solid
            };

            // 테두리 스타일만 설정 (색상과 두께는 개별 클래스로 처리) / Only set border style (colors and widths handled by individual classes)
            css.push_str(&format!(
                "        border-{}-style: {};\n",
                border_names[idx], line_style
            ));
        }

        css.push_str("    }\n\n");
    }

    css
}

/// Format COLORREF as CSS color
/// COLORREF를 CSS 색상으로 포맷
fn format_colorref(color: &crate::types::COLORREF) -> String {
    let r = color.r();
    let g = color.g();
    let b = color.b();
    format!("rgb({}, {}, {})", r, g, b)
}
