/// Table constants unit tests
/// 테이블 렌더링 상수 테스트
#[cfg(test)]
mod tests {
    use crate::viewer::html::ctrl_header::table::constants::SVG_PADDING_MM;

    #[test]
    fn test_svg_padding_mm_valid_value() {
        // SVG_PADDING_MM should be a positive value for proper padding
        assert!(SVG_PADDING_MM > 0.0);
        assert_eq!(SVG_PADDING_MM, 2.5);
    }

    #[test]
    fn test_svg_padding_mm_in_mm_units() {
        // Padding should be in millimeters as specified
        const EXPECTED_MM: f64 = 2.5;
        assert_eq!(SVG_PADDING_MM, EXPECTED_MM);
    }

    #[test]
    fn test_constants_not_zero() {
        // Ensure constant is non-zero
        assert_ne!(SVG_PADDING_MM, 0.0);
    }

    #[test]
    fn test_svg_padding_mm_two_point_five() {
        // Explicit verification of the exact value
        assert_eq!(SVG_PADDING_MM, 2.5_f64);
    }
}
