/// Table conversion to Markdown
/// 테이블을 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, TABLE (HWPTAG_BEGIN + 61)
/// Spec mapping: Table 57 - BodyText data records, TABLE (HWPTAG_BEGIN + 61)
use crate::document::{bodytext::Table, HwpDocument, ParagraphRecord};
use crate::viewer::markdown::convert_paragraph_to_markdown;

/// Convert table to markdown format
/// 테이블을 마크다운 형식으로 변환
pub fn convert_table_to_markdown(
    table: &Table,
    document: &HwpDocument,
    image_output_dir: Option<&str>,
) -> String {
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

        for (_original_idx, cell) in sorted_cells {
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
                fill_cell_content(
                    &mut grid,
                    cell,
                    row,
                    col,
                    row_count,
                    col_count,
                    document,
                    image_output_dir,
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
                    &mut grid,
                    cell,
                    row,
                    col,
                    row_count,
                    col_count,
                    document,
                    image_output_dir,
                );
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

/// Fill cell content and handle cell merging
/// 셀 내용을 채우고 셀 병합을 처리
fn fill_cell_content(
    grid: &mut [Vec<Option<String>>],
    cell: &crate::document::bodytext::TableCell,
    row: usize,
    col: usize,
    row_count: usize,
    col_count: usize,
    document: &HwpDocument,
    image_output_dir: Option<&str>,
) {
    // 셀 내용을 텍스트와 이미지로 변환 / Convert cell content to text and images
    let mut cell_parts = Vec::new();
    let mut has_image = false;

    // 먼저 이미지가 있는지 확인 / First check if image exists
    for para in &cell.paragraphs {
        for rec in &para.records {
            if matches!(rec, ParagraphRecord::ShapeComponentPicture { .. }) {
                has_image = true;
                break;
            }
        }
        if has_image {
            break;
        }
    }

    // 셀 내부의 문단들을 마크다운으로 변환 / Convert paragraphs inside cell to markdown
    for (idx, para) in cell.paragraphs.iter().enumerate() {
        let para_md = convert_paragraph_to_markdown(para, document, image_output_dir);
        if !para_md.is_empty() {
            // 이미지가 포함되어 있는지 확인 / Check if image is included
            if para_md.contains("![이미지]") {
                has_image = true;
            }
            // 문단 마크다운에서 개행을 공백으로 변환 (표 셀 내부에서는 개행을 표현할 수 없음)
            // Convert line breaks to spaces in paragraph markdown (line breaks cannot be expressed in table cells)
            let para_md_cleaned = para_md
                .replace("  \n", " ")
                .replace("\n\n", " ")
                .replace('\n', " ");
            cell_parts.push(para_md_cleaned);

            // 마지막 문단이 아니면 문단 사이 공백 추가
            // If not last paragraph, add space between paragraphs
            if idx < cell.paragraphs.len() - 1 {
                cell_parts.push(" ".to_string());
            }
        }
    }

    // 셀 내용을 하나의 문자열로 결합 / Combine cell parts into a single string
    // 표 셀 내부에서는 개행을 공백으로 변환 (마크다운 표는 한 줄로 표시)
    // In table cells, convert line breaks to spaces (markdown tables are displayed in one line)
    let cell_text = cell_parts.join("");

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
