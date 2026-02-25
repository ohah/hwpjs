#[cfg(test)]
mod tests {
    // Import the functions using the crate path
    use crate::viewer::html::styles::round_to_2dp;
    use crate::viewer::html::styles::int32_to_mm;

    #[test]
    fn test_round_to_2dp_integer() {
        assert_eq!(round_to_2dp(0.0), 0.0);
        assert_eq!(round_to_2dp(1.0), 1.0);
        assert_eq!(round_to_2dp(10.0), 10.0);
    }

    #[test]
    fn test_round_to_2dp_simple_decimal() {
        assert_eq!(round_to_2dp(0.01), 0.01);
        assert_eq!(round_to_2dp(0.05), 0.05);
        assert_eq!(round_to_2dp(0.1), 0.1);
        assert_eq!(round_to_2dp(0.5), 0.5);
    }

    #[test]
    fn test_round_to_2dp_negative() {
        assert_eq!(round_to_2dp(-0.01), -0.01);
        assert_eq!(round_to_2dp(-1.0), -1.0);
        assert_eq!(round_to_2dp(-10.0), -10.0);
    }

    #[test]
    fn test_round_to_2dp_round_down() {
        assert_eq!(round_to_2dp(0.001), 0.0);
        assert_eq!(round_to_2dp(0.1), 0.1); // Exactly representable
    }

    #[test]
    fn test_round_to_2dp_round_up() {
        assert_eq!(round_to_2dp(0.999), 1.0);
        assert_eq!(round_to_2dp(0.005), 0.01); // Standard rounding
    }

    #[test]
    fn test_round_to_2dp_zeros() {
        assert_eq!(round_to_2dp(0.00), 0.0);
        assert_eq!(round_to_2dp(0.0001), 0.0);
        assert_eq!(round_to_2dp(0.9999), 1.0);
    }

    #[test]
    fn test_int32_to_mm_zero() {
        assert_eq!(int32_to_mm(0), 0.0);
    }

    #[test]
    fn test_int32_to_mm_positive_small() {
        let result = int32_to_mm(1);
        assert_eq!(result, 25.4 / 7200.0);
    }

    #[test]
    fn test_int32_to_mm_large() {
        let result = int32_to_mm(7200);
        // 7200 / 7200 = 1 inch
        // 1 inch * 25.4 = 25.4 mm
        assert_eq!(result, 25.4);
    }

    #[test]
    fn test_int32_to_mm_negative() {
        let result = int32_to_mm(-1);
        assert_eq!(result, -25.4 / 7200.0);
    }

    #[test]
    fn test_int32_to_mm_half_inch() {
        // 0.5 inch = 25.4 / 2 = 12.7 mm
        // 12.7 mm * 7200 / 25.4 = 3600
        let result = int32_to_mm(3600);
        assert_eq!(result, 12.7);
    }

    #[test]
    fn test_int32_to_mm_edge_case() {
        // Test edge value exactly at half of 7200
        let result = int32_to_mm(3600);
        assert_eq!(result, 12.7); // Exact match
    }
}