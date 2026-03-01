/// Table constants unit tests
/// 테이블 렌더링 상수 테스트

#[cfg(test)]
mod tests {
    use crate::viewer::html::ctrl_header::table::constants::{BORDER_OFFSET_MM, SVG_PADDING_MM};

    #[test]
    fn test_svg_padding_mm_valid_value() {
        // SVG_PADDING_MM should be a positive value for proper padding
        assert!(SVG_PADDING_MM > 0.0);
        assert_eq!(SVG_PADDING_MM, 2.5);
    }

    #[test]
    fn test_border_offset_mm_valid_value() {
        // BORDER_OFFSET_MM should be a positive, small value
        assert!(BORDER_OFFSET_MM > 0.0);
        // The value 0.06 is explicitly documented as a small offset
        assert_eq!(BORDER_OFFSET_MM, 0.06);
    }

    #[test]
    fn test_svg_padding_mm_in_mm_units() {
        // Padding should be in millimeters as specified
        const EXPECTED_MM: f64 = 2.5;
        assert_eq!(SVG_PADDING_MM, EXPECTED_MM);
    }

    #[test]
    fn test_border_offset_mm_small_value() {
        // Border offset is intentionally small (0.06mm)
        // This small value should be positive
        assert!(BORDER_OFFSET_MM > 0.0);
        assert!(BORDER_OFFSET_MM < 1.0);
    }

    #[test]
    fn test_constants_not_zero() {
        // Ensure both constants are non-zero
        assert_ne!(SVG_PADDING_MM, 0.0);
        assert_ne!(BORDER_OFFSET_MM, 0.0);
    }

    #[test]
    fn test_svg_padding_mm_two_point_five() {
        // Explicit verification of the exact value
        assert_eq!(SVG_PADDING_MM, 2.5_f64);
    }

    #[test]
    fn test_border_offset_mm_zero_point_zero_six() {
        // Explicit verification of the exact value
        assert_eq!(BORDER_OFFSET_MM, 0.06_f64);
    }
}
