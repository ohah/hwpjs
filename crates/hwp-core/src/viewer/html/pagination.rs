/// 페이지네이션 모듈 / Pagination module
///
/// HTML 뷰어의 페이지 나누기 로직을 담당합니다.
/// Handles page break logic for HTML viewer.
use crate::document::bodytext::{ColumnDivideType, PageDef, ParagraphRecord};
use crate::document::Paragraph;

/// 페이지네이션 컨텍스트 / Pagination context
pub struct PaginationContext {
    /// 이전 문단의 vertical_position (mm)
    pub prev_vertical_mm: Option<f64>,
    /// 현재 페이지의 최대 vertical_position (mm)
    pub current_max_vertical_mm: f64,
    /// 콘텐츠 영역 높이 (mm)
    pub content_height_mm: f64,
}

/// 페이지네이션 결과 / Pagination result
pub struct PaginationResult {
    /// 페이지 나누기 여부
    pub has_page_break: bool,
    /// 페이지 나누기 원인
    pub reason: Option<PageBreakReason>,
}

/// 페이지 나누기 원인 / Page break reason
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageBreakReason {
    /// 명시적 페이지 나누기 (column_divide_type)
    Explicit,
    /// PageDef 변경 (새 페이지 설정)
    PageDefChange,
    /// vertical_position 리셋
    VerticalReset,
    /// vertical_position 오버플로우
    VerticalOverflow,
    /// 테이블 오버플로우 (테이블이 페이지 높이를 초과)
    TableOverflow,
    /// 이미지/모양 객체 오버플로우 (객체가 페이지 높이를 초과)
    ObjectOverflow,
}

/// 페이지 나누기 여부 확인 (문단) / Check if page break is needed (paragraph)
/// 모든 전략을 조합하여 확인: explicit > page_def_change > vertical_reset > vertical_overflow
/// Checks all strategies combined: explicit > page_def_change > vertical_reset > vertical_overflow
pub fn check_paragraph_page_break(
    paragraph: &Paragraph,
    context: &PaginationContext,
    current_page_def: Option<&PageDef>,
) -> PaginationResult {
    // 1. 첫 번째 LineSegment의 vertical_position 추출
    let first_vertical_mm = extract_first_vertical_position(paragraph);

    // 2. PageDef 변경 확인
    let has_page_def_change = check_page_def_change(paragraph, current_page_def);

    // 3. 모든 전략 확인 (우선순위: explicit > page_def_change > vertical_reset > vertical_overflow)
    let has_explicit = check_explicit_page_break(paragraph);
    let has_vertical_reset = check_vertical_reset(context.prev_vertical_mm, first_vertical_mm);
    let has_vertical_overflow = check_vertical_overflow(
        first_vertical_mm,
        context.content_height_mm,
        context.current_max_vertical_mm,
    );

    // 우선순위에 따라 첫 번째 true인 원인을 반환
    if has_explicit {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::Explicit),
        }
    } else if has_page_def_change {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::PageDefChange),
        }
    } else if has_vertical_reset {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::VerticalReset),
        }
    } else if has_vertical_overflow {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::VerticalOverflow),
        }
    } else {
        PaginationResult {
            has_page_break: false,
            reason: None,
        }
    }
}

/// 테이블 페이지 나누기 확인 / Check if table causes page break
/// 테이블의 top과 height를 받아서 페이지를 넘어가는지 확인
pub fn check_table_page_break(
    table_top_mm: f64,
    table_height_mm: f64,
    context: &PaginationContext,
) -> PaginationResult {
    let table_bottom_mm = table_top_mm + table_height_mm;
    if table_bottom_mm > context.content_height_mm && context.current_max_vertical_mm > 0.0 {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::TableOverflow),
        }
    } else {
        PaginationResult {
            has_page_break: false,
            reason: None,
        }
    }
}

/// 이미지/모양 객체 페이지 나누기 확인 / Check if image/shape object causes page break
pub fn check_object_page_break(
    object_top_mm: f64,
    object_height_mm: f64,
    context: &PaginationContext,
) -> PaginationResult {
    let object_bottom_mm = object_top_mm + object_height_mm;
    if object_bottom_mm > context.content_height_mm && context.current_max_vertical_mm > 0.0 {
        PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::ObjectOverflow),
        }
    } else {
        PaginationResult {
            has_page_break: false,
            reason: None,
        }
    }
}

/// 첫 번째 LineSegment의 vertical_position 추출 / Extract first LineSegment's vertical_position
fn extract_first_vertical_position(paragraph: &Paragraph) -> Option<f64> {
    for record in &paragraph.records {
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            if let Some(first_segment) = segments.first() {
                return Some(first_segment.vertical_position as f64 * 25.4 / 7200.0);
            }
        }
    }
    None
}

/// 명시적 페이지 나누기 확인 / Check explicit page break
fn check_explicit_page_break(paragraph: &Paragraph) -> bool {
    paragraph
        .para_header
        .column_divide_type
        .iter()
        .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section))
}

/// vertical_position 리셋 확인 / Check vertical_position reset
fn check_vertical_reset(prev_vertical_mm: Option<f64>, current_vertical_mm: Option<f64>) -> bool {
    if let (Some(prev), Some(current)) = (prev_vertical_mm, current_vertical_mm) {
        current < 0.1 || (prev > 0.1 && current < prev - 0.1)
    } else if let Some(current) = current_vertical_mm {
        current < 0.1 && prev_vertical_mm.is_some()
    } else {
        false
    }
}

/// vertical_position 오버플로우 확인 / Check vertical_position overflow
fn check_vertical_overflow(
    current_vertical_mm: Option<f64>,
    content_height_mm: f64,
    current_max_vertical_mm: f64,
) -> bool {
    if let Some(current) = current_vertical_mm {
        current > content_height_mm && current_max_vertical_mm > 0.0
    } else {
        false
    }
}

/// PageDef 변경 확인 / Check if PageDef changed
fn check_page_def_change(paragraph: &Paragraph, current_page_def: Option<&PageDef>) -> bool {
    // 문단의 레코드에서 PageDef 찾기 / Find PageDef in paragraph records
    for record in &paragraph.records {
        if let ParagraphRecord::PageDef { page_def } = record {
            // PageDef가 있고, 현재 PageDef와 다르면 새 페이지 / If PageDef exists and differs from current, new page
            // 포인터 비교로 변경 여부 확인 / Check change by pointer comparison
            return current_page_def
                .map(|pd| !std::ptr::eq(pd as *const _, page_def as *const _))
                .unwrap_or(true);
        }
        // CtrlHeader의 children에서도 확인 / Also check in CtrlHeader's children
        if let ParagraphRecord::CtrlHeader { children, .. } = record {
            for child in children {
                if let ParagraphRecord::PageDef { page_def } = child {
                    return current_page_def
                        .map(|pd| !std::ptr::eq(pd as *const _, page_def as *const _))
                        .unwrap_or(true);
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::bodytext::ParaHeader;

    fn create_test_paragraph() -> Paragraph {
        let mut para_header = ParaHeader::default();
        para_header.para_shape_id = 0;
        para_header.column_divide_type = vec![];
        para_header.control_mask = crate::document::bodytext::ControlMask::new(0);
        para_header.text_char_count = 0;

        Paragraph {
            para_header,
            records: vec![],
        }
    }

    #[test]
    fn test_check_explicit_page_break() {
        let mut para = create_test_paragraph();
        para.para_header.column_divide_type = vec![ColumnDivideType::Page];

        assert!(check_explicit_page_break(&para));

        para.para_header.column_divide_type = vec![ColumnDivideType::Section];
        assert!(check_explicit_page_break(&para));

        para.para_header.column_divide_type = vec![];
        assert!(!check_explicit_page_break(&para));
    }

    #[test]
    fn test_check_vertical_reset() {
        // prev가 있고 current가 0이면 리셋
        assert!(check_vertical_reset(Some(10.0), Some(0.05)));

        // prev가 있고 current가 prev보다 작으면 리셋
        assert!(check_vertical_reset(Some(10.0), Some(9.8)));

        // prev가 없고 current가 0이면 리셋 아님 (첫 문단)
        assert!(!check_vertical_reset(None, Some(0.05)));

        // prev가 있고 current가 prev보다 크면 리셋 아님
        assert!(!check_vertical_reset(Some(10.0), Some(10.5)));
    }

    #[test]
    fn test_check_vertical_overflow() {
        let content_height = 250.0;

        // current가 content_height를 초과하고 current_max가 있으면 오버플로우
        assert!(check_vertical_overflow(Some(260.0), content_height, 10.0));

        // current가 content_height를 초과하지만 current_max가 0이면 오버플로우 아님
        assert!(!check_vertical_overflow(Some(260.0), content_height, 0.0));

        // current가 content_height를 초과하지 않으면 오버플로우 아님
        assert!(!check_vertical_overflow(Some(240.0), content_height, 10.0));
    }

    #[test]
    fn test_check_table_page_break() {
        let context = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 10.0,
            content_height_mm: 250.0,
        };

        // 테이블이 페이지를 넘어가면 페이지 나누기
        let result = check_table_page_break(240.0, 20.0, &context);
        assert!(result.has_page_break);
        assert_eq!(result.reason, Some(PageBreakReason::TableOverflow));

        // 테이블이 페이지를 넘어가지 않으면 페이지 나누기 아님
        let result = check_table_page_break(240.0, 5.0, &context);
        assert!(!result.has_page_break);

        // current_max_vertical_mm이 0이면 페이지 나누기 아님
        let context_empty = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 0.0,
            content_height_mm: 250.0,
        };
        let result = check_table_page_break(240.0, 20.0, &context_empty);
        assert!(!result.has_page_break);
    }

    #[test]
    fn test_check_object_page_break() {
        let context = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 10.0,
            content_height_mm: 250.0,
        };

        // 객체가 페이지를 넘어가면 페이지 나누기
        let result = check_object_page_break(240.0, 20.0, &context);
        assert!(result.has_page_break);
        assert_eq!(result.reason, Some(PageBreakReason::ObjectOverflow));

        // 객체가 페이지를 넘어가지 않으면 페이지 나누기 아님
        let result = check_object_page_break(240.0, 5.0, &context);
        assert!(!result.has_page_break);
    }
}
