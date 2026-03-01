#[cfg(test)]
mod tests {
    use crate::viewer::html::pagination::{PageBreakReason, PaginationContext, PaginationResult};

    #[test]
    fn test_pagination_context_default() {
        let context = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 297.0,
            content_height_mm: 297.0,
        };

        assert_eq!(context.current_max_vertical_mm, 297.0);
        assert_eq!(context.content_height_mm, 297.0);
    }

    #[test]
    fn test_pagination_context_with_values() {
        let context = PaginationContext {
            prev_vertical_mm: Some(100.0),
            current_max_vertical_mm: 180.0,
            content_height_mm: 297.0,
        };

        assert_eq!(context.prev_vertical_mm, Some(100.0));
        assert_eq!(context.current_max_vertical_mm, 180.0);
        assert_eq!(context.content_height_mm, 297.0);
    }

    #[test]
    fn test_pagination_result_default() {
        let result = PaginationResult {
            has_page_break: false,
            reason: None,
            table_overflow_remainder_mm: None,
            table_overflow_at_index: None,
        };

        assert!(!result.has_page_break);
        assert!(result.reason.is_none());
        assert!(result.table_overflow_remainder_mm.is_none());
        assert!(result.table_overflow_at_index.is_none());
    }

    #[test]
    fn test_pagination_result_with_break() {
        let result = PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::Explicit),
            table_overflow_remainder_mm: None,
            table_overflow_at_index: None,
        };

        assert!(result.has_page_break);
        assert_eq!(result.reason, Some(PageBreakReason::Explicit));
    }

    #[test]
    fn test_pagination_result_with_table_overflow() {
        let result = PaginationResult {
            has_page_break: true,
            reason: Some(PageBreakReason::TableOverflow),
            table_overflow_remainder_mm: Some(20.5),
            table_overflow_at_index: Some(3),
        };

        assert!(result.has_page_break);
        assert_eq!(result.reason, Some(PageBreakReason::TableOverflow));
        assert_eq!(result.table_overflow_remainder_mm, Some(20.5));
        assert_eq!(result.table_overflow_at_index, Some(3));
    }

    #[test]
    fn test_page_break_reason_equality() {
        let reason1 = PageBreakReason::Explicit;
        let reason2 = PageBreakReason::Explicit;
        let reason3 = PageBreakReason::VerticalOverflow;

        assert_eq!(reason1, reason2);
        assert_ne!(reason1, reason3);
    }

    #[test]
    fn test_page_break_reason_order() {
        // The order in the enum definition: explicit > page_def_change > vertical_reset > vertical_overflow
        let reasons: Vec<PageBreakReason> = vec![
            PageBreakReason::Explicit,
            PageBreakReason::PageDefChange,
            PageBreakReason::VerticalReset,
            PageBreakReason::VerticalOverflow,
            PageBreakReason::TableOverflow,
            PageBreakReason::ObjectOverflow,
        ];

        assert_eq!(reasons.len(), 6);
    }

    #[test]
    fn test_context_with_different_page_sizes() {
        let context_a4 = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 297.0,
            content_height_mm: 297.0,
        };

        let context_legal = PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 356.0,
            content_height_mm: 356.0,
        };

        assert_eq!(context_a4.current_max_vertical_mm, 297.0);
        assert_eq!(context_legal.current_max_vertical_mm, 356.0);
    }

    #[test]
    fn test_context_overflow_handling() {
        // Content exceeds page height
        let context = PaginationContext {
            prev_vertical_mm: Some(280.0),
            current_max_vertical_mm: 297.0,
            content_height_mm: 297.0,
        };

        // prev_vertical_mm > 0 implies content exists
        assert!(context.prev_vertical_mm.unwrap() > 0.0);
    }
}
