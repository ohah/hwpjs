/// Markdown converter for HWP documents
/// HWP 문서를 마크다운으로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to Markdown format.
/// 이 모듈은 HWP 문서를 마크다운 형식으로 변환하는 기능을 제공합니다.
use crate::document::{
    ColumnDivideType, CtrlHeader, CtrlHeaderData, HwpDocument, Paragraph, ParagraphRecord,
};

/// Convert HWP document to Markdown format
/// HWP 문서를 마크다운 형식으로 변환
///
/// # Arguments / 매개변수
/// * `document` - The HWP document to convert / 변환할 HWP 문서
///
/// # Returns / 반환값
/// Markdown string representation of the document / 문서의 마크다운 문자열 표현
pub fn to_markdown(document: &HwpDocument) -> String {
    let mut lines = Vec::new();

    // Add document title with version info / 문서 제목과 버전 정보 추가
    lines.push("# HWP 문서".to_string());
    lines.push(String::new());
    lines.push(format!("**버전**: {}", format_version(document)));
    lines.push(String::new());

    // Convert body text to markdown / 본문 텍스트를 마크다운으로 변환
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // Check if we need to add page break / 페이지 나누기가 필요한지 확인
            let has_page_break = paragraph
                .para_header
                .column_divide_type
                .iter()
                .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

            if has_page_break && !lines.is_empty() {
                // Only add page break if we have content before / 이전에 내용이 있을 때만 페이지 구분선 추가
                let last_line = lines.last().map(|s| s.as_str()).unwrap_or("");
                if !last_line.is_empty() && last_line != "---" {
                    lines.push("---".to_string());
                    lines.push(String::new());
                }
            }

            // Convert paragraph to markdown (includes text and controls) / 문단을 마크다운으로 변환 (텍스트와 컨트롤 포함)
            let markdown = convert_paragraph_to_markdown(paragraph);
            if !markdown.is_empty() {
                lines.push(markdown);
            }
        }
    }

    lines.join("\n")
}

/// Format version number to readable string
/// 버전 번호를 읽기 쉬운 문자열로 변환
fn format_version(document: &HwpDocument) -> String {
    let version = document.file_header.version;
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let build = version & 0xFF;

    format!("{}.{:02}.{:02}.{:02}", major, minor, patch, build)
}

/// Convert a paragraph to markdown
/// 문단을 마크다운으로 변환
fn convert_paragraph_to_markdown(paragraph: &Paragraph) -> String {
    if paragraph.records.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();

    // Process all records in order / 모든 레코드를 순서대로 처리
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText { text } => {
                // Clean up control characters and normalize whitespace / 제어 문자 제거 및 공백 정규화
                let cleaned = text
                    .chars()
                    .filter(|c| {
                        // Keep printable characters and common whitespace / 출력 가능한 문자와 일반 공백 유지
                        c.is_whitespace() || !c.is_control()
                    })
                    .collect::<String>();

                if !cleaned.trim().is_empty() {
                    parts.push(cleaned.trim().to_string());
                }
            }
            ParagraphRecord::CtrlHeader { header, children } => {
                // 컨트롤 헤더의 자식 레코드 처리 (레벨 2, 예: 테이블) / Process control header children (level 2, e.g., table)
                let mut has_table = false;
                for child in children {
                    match child {
                        ParagraphRecord::Table { table } => {
                            // 테이블을 마크다운으로 변환 / Convert table to markdown
                            let table_md = convert_table_to_markdown(table);
                            if !table_md.is_empty() {
                                parts.push(table_md);
                                has_table = true;
                            }
                        }
                        _ => {
                            // 기타 자식 레코드는 무시 / Ignore other child records
                        }
                    }
                }
                // Convert control header to markdown / 컨트롤 헤더를 마크다운으로 변환
                // 표가 이미 추출되었다면 메시지를 출력하지 않음 / Don't output message if table was already extracted
                let control_md = convert_control_to_markdown(header, has_table);
                if !control_md.is_empty() {
                    parts.push(control_md);
                }
            }
            _ => {
                // Other record types (char shape, line seg, etc.) are formatting info
                // 기타 레코드 타입 (글자 모양, 줄 세그먼트 등)은 서식 정보
                // Skip for now, but could be used for styling in the future
                // 현재는 건너뛰지만, 향후 스타일링에 사용할 수 있음
            }
        }
    }

    parts.join("\n\n")
}

/// Convert control header to markdown
/// 컨트롤 헤더를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
fn convert_control_to_markdown(header: &CtrlHeader, has_table: bool) -> String {
    match header.ctrl_id.as_str() {
        "tbl " => {
            // 표 (Table) / Table
            // 표가 이미 추출되었다면 메시지를 출력하지 않음 / Don't output message if table was already extracted
            if has_table {
                return String::new();
            }
            let mut md = String::from("**표**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[표 내용은 추출되지 않았습니다]*");
            md
        }
        "gso " => {
            // 그리기 개체 (Shape Object) - 글상자, 그림 등
            // Shape Object - text boxes, images, etc.
            let mut md = String::from("**그리기 개체**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[개체 내용은 추출되지 않았습니다]*");
            md
        }
        "head" => {
            // 머리말 (Header) / Header
            String::from("*[머리말]*")
        }
        "foot" => {
            // 꼬리말 (Footer) / Footer
            String::from("*[꼬리말]*")
        }
        "cold" => {
            // 단 정의 (Column Definition) / Column Definition
            String::from("*[단 정의]*")
        }
        _ => {
            // 기타 컨트롤 / Other controls
            format!("*[컨트롤: {}]*", header.ctrl_id.trim())
        }
    }
}

/// Convert table to markdown format
/// 테이블을 마크다운 형식으로 변환
fn convert_table_to_markdown(table: &crate::document::bodytext::Table) -> String {
    let row_count = table.attributes.row_count as usize;
    let col_count = table.attributes.col_count as usize;

    if row_count == 0 || col_count == 0 {
        return format!("\n\n[Table: {}x{}]\n\n", row_count, col_count);
    }

    // 셀이 비어있어도 표 형식으로 출력 / Output table format even if cells are empty
    if table.cells.is_empty() {
        // 빈 표 형식으로 출력 / Output empty table format
        let mut lines = Vec::new();
        lines.push(String::new());
        let empty_row: Vec<String> = (0..col_count).map(|_| " ".to_string()).collect();
        lines.push(format!("| {} |", empty_row.join(" | ")));
        lines.push(format!(
            "|{}|",
            (0..col_count).map(|_| "---").collect::<Vec<_>>().join("|")
        ));
        for _ in 1..row_count {
            lines.push(format!("| {} |", empty_row.join(" | ")));
        }
        lines.push(String::new());
        return lines.join("\n");
    }

    // 2D 배열로 셀 정렬 (행/열 위치 기준) / Arrange cells in 2D array (by row/column position)
    // row_address와 col_address는 1부터 시작하므로 0-based 인덱스로 변환 필요
    // row_address and col_address start from 1, so need to convert to 0-based index
    let mut grid: Vec<Vec<Option<String>>> = vec![vec![None; col_count]; row_count];

    // row_address와 col_address의 최소값 찾기 (일반적으로 1부터 시작하지만 확인 필요)
    // Find minimum values of row_address and col_address (usually start from 1, but need to verify)
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

    // row_address가 모두 같다면, 셀의 순서를 사용하여 행을 구분
    // If all row_address are the same, use cell order to distinguish rows
    if all_same_row {
        // 셀을 원래 순서대로 처리하되, col_address가 0으로 돌아가면 새 행으로 간주
        // Process cells in original order, but consider it a new row when col_address returns to 0
        let mut row_index = 0;
        let mut last_col = u16::MAX;

        for (original_idx, cell) in sorted_cells {
            let col = (cell.cell_attributes.col_address.saturating_sub(min_col)) as usize;

            // col_address가 이전보다 작거나 같으면 새 행으로 간주
            // If col_address is less than or equal to previous, consider it a new row
            if cell.cell_attributes.col_address <= last_col && last_col != u16::MAX {
                row_index += 1;
                if row_index >= row_count {
                    row_index = row_count - 1;
                }
            }
            last_col = cell.cell_attributes.col_address;

            let row = row_index;

            if col < col_count {
                // 셀 내용을 텍스트로 변환 / Convert cell content to text
                let cell_text = cell
                    .paragraphs
                    .iter()
                    .map(|para| {
                        para.records
                            .iter()
                            .filter_map(|rec| {
                                if let ParagraphRecord::ParaText { text } = rec {
                                    // 제어 문자 제거 및 공백 정규화 / Remove control characters and normalize whitespace
                                    let cleaned = text
                                        .chars()
                                        .filter(|c| c.is_whitespace() || !c.is_control())
                                        .collect::<String>();
                                    Some(cleaned.trim().to_string())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");

                // 마크다운 표에서 파이프 문자 이스케이프 처리 / Escape pipe characters in markdown table
                let cell_content = if cell_text.is_empty() {
                    " ".to_string() // 빈 셀은 공백으로 표시 / Empty cell shows as space
                } else {
                    cell_text.replace('|', "\\|") // 파이프 문자 이스케이프 / Escape pipe character
                };

                // 셀에 이미 내용이 있으면 덮어쓰지 않음 (병합 셀 처리)
                // Don't overwrite if cell already has content (handle merged cells)
                if grid[row][col].is_none() {
                    grid[row][col] = Some(cell_content);

                    // 셀 병합 처리: col_span과 row_span에 따라 병합된 셀을 빈 셀로 채움
                    // Handle cell merging: fill merged cells with empty cells based on col_span and row_span
                    let col_span = cell.cell_attributes.col_span as usize;
                    let row_span = cell.cell_attributes.row_span as usize;

                    // 병합된 열을 빈 셀로 채움 (마크다운에서는 병합을 직접 표현할 수 없으므로 빈 셀로 처리)
                    // Fill merged columns with empty cells (markdown doesn't support cell merging directly)
                    for c in (col + 1)..(col + col_span).min(col_count) {
                        if grid[row][c].is_none() {
                            grid[row][c] = Some(" ".to_string());
                        }
                    }

                    // 병합된 행을 빈 셀로 채움
                    // Fill merged rows with empty cells
                    for r in (row + 1)..(row + row_span).min(row_count) {
                        for c in col..(col + col_span).min(col_count) {
                            if grid[r][c].is_none() {
                                grid[r][c] = Some(" ".to_string());
                            }
                        }
                    }
                }
            }
        }
    } else {
        // row_address가 다르면 정상적으로 사용
        // If row_address differ, use them normally
        for cell in &table.cells {
            let row = (cell.cell_attributes.row_address.saturating_sub(min_row)) as usize;
            let col = (cell.cell_attributes.col_address.saturating_sub(min_col)) as usize;

            if row < row_count && col < col_count {
                // 셀 내용을 텍스트로 변환 / Convert cell content to text
                let cell_text = cell
                    .paragraphs
                    .iter()
                    .map(|para| {
                        para.records
                            .iter()
                            .filter_map(|rec| {
                                if let ParagraphRecord::ParaText { text } = rec {
                                    // 제어 문자 제거 및 공백 정규화 / Remove control characters and normalize whitespace
                                    let cleaned = text
                                        .chars()
                                        .filter(|c| c.is_whitespace() || !c.is_control())
                                        .collect::<String>();
                                    Some(cleaned.trim().to_string())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");

                // 마크다운 표에서 파이프 문자 이스케이프 처리 / Escape pipe characters in markdown table
                let cell_content = if cell_text.is_empty() {
                    " ".to_string() // 빈 셀은 공백으로 표시 / Empty cell shows as space
                } else {
                    cell_text.replace('|', "\\|") // 파이프 문자 이스케이프 / Escape pipe character
                };

                // 셀에 이미 내용이 있으면 덮어쓰지 않음 (병합 셀 처리)
                // Don't overwrite if cell already has content (handle merged cells)
                if grid[row][col].is_none() {
                    grid[row][col] = Some(cell_content);

                    // 셀 병합 처리: col_span과 row_span에 따라 병합된 셀을 빈 셀로 채움
                    // Handle cell merging: fill merged cells with empty cells based on col_span and row_span
                    let col_span = cell.cell_attributes.col_span as usize;
                    let row_span = cell.cell_attributes.row_span as usize;

                    // 병합된 열을 빈 셀로 채움 (마크다운에서는 병합을 직접 표현할 수 없으므로 빈 셀로 처리)
                    // Fill merged columns with empty cells (markdown doesn't support cell merging directly)
                    for c in (col + 1)..(col + col_span).min(col_count) {
                        if grid[row][c].is_none() {
                            grid[row][c] = Some(" ".to_string());
                        }
                    }

                    // 병합된 행을 빈 셀로 채움
                    // Fill merged rows with empty cells
                    for r in (row + 1)..(row + row_span).min(row_count) {
                        for c in col..(col + col_span).min(col_count) {
                            if grid[r][c].is_none() {
                                grid[r][c] = Some(" ".to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // 마크다운 표 형식으로 변환 / Convert to markdown table format
    let mut lines = Vec::new();
    lines.push(String::new()); // 빈 줄 추가 / Add empty line

    // 모든 행을 순서대로 출력 / Output all rows in order
    for row_idx in 0..row_count {
        let row_data: Vec<String> = (0..col_count)
            .map(|col| {
                grid[row_idx][col]
                    .as_ref()
                    .map(|s| s.clone())
                    .unwrap_or_else(|| " ".to_string())
            })
            .collect();
        lines.push(format!("| {} |", row_data.join(" | ")));

        // 첫 번째 행 다음에 구분선 추가 / Add separator line after first row
        if row_idx == 0 {
            lines.push(format!(
                "|{}|",
                (0..col_count).map(|_| "---").collect::<Vec<_>>().join("|")
            ));
        }
    }

    lines.push(String::new()); // 빈 줄 추가 / Add empty line

    lines.join("\n")
}
