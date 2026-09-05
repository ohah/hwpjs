#[cfg(test)]
mod tests {
    // Import the functions using the crate path
    use crate::types::INT32;
    use crate::viewer::html::styles::int32_to_mm;
    use crate::viewer::html::styles::round_to_2dp;

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

    // ========== Additional Edge Case Tests ==========

    #[test]
    fn test_round_to_2dp_large_values() {
        // Test large integer values
        assert_eq!(round_to_2dp(1000000.0), 1000000.0);
        assert_eq!(round_to_2dp(-1000000.0), -1000000.0);

        // Test very large values with decimals
        assert_eq!(round_to_2dp(1234567.89), 1234567.89);
    }

    #[test]
    fn test_round_to_2dp_extremely_small_values() {
        // Test values with many decimal places
        assert_eq!(round_to_2dp(0.00001), 0.0);
        assert_eq!(round_to_2dp(0.00005), 0.0);
        assert_eq!(round_to_2dp(0.0001), 0.0);

        // Sub-millimeter precision tests
        assert_eq!(round_to_2dp(0.00001), 0.0);
        assert_eq!(round_to_2dp(0.00000999), 0.0);
        assert_eq!(round_to_2dp(0.00001001), 0.0);
    }

    #[test]
    fn test_round_to_2dp_boundary_conditions() {
        // Test boundaries just below rounding threshold
        assert_eq!(round_to_2dp(0.005), 0.01); // Exactly at half, rounds up
        assert_eq!(round_to_2dp(0.00499), 0.0); // Just below half, rounds down
        assert_eq!(round_to_2dp(0.00501), 0.01); // Just above half, rounds up

        // Negative boundary
        assert_eq!(round_to_2dp(-0.005), -0.01); // Exactly at half, rounds down (toward zero) or up (away from zero)
        assert_eq!(round_to_2dp(-0.00499), 0.0); // Just below half, rounds up to zero
        assert_eq!(round_to_2dp(0.005), 0.01); // Positive boundary always rounds up
    }

    #[test]
    fn test_int32_to_mm_boundary_maximum() {
        // INT32_MAX = 2,147,483,647 / 7200 * 25.4 ≈ 7,580.00 mm
        let max_val = i32::MAX as INT32;
        let expected = (max_val as f64 / 7200.0) * 25.4;
        let result = int32_to_mm(max_val);
        assert!((result - expected).abs() < 0.001);
    }

    #[test]
    fn test_int32_to_mm_boundary_minimum() {
        // INT32_MIN = -2,147,483,648 / 7200 * 25.4 ≈ -7,580.00 mm
        let min_val = i32::MIN as INT32;
        let expected = (min_val as f64 / 7200.0) * 25.4;
        let result = int32_to_mm(min_val);
        assert!((result - expected).abs() < 0.001);
    }

    #[test]
    fn test_int32_to_mm_half_unit_edges() {
        // Test values that are half of the unit at 1/4 inch, 1/8 inch, etc.
        // 1/4 inch = 6.35 mm
        // 6.35 * 7200 / 25.4 = 1800
        assert_eq!(int32_to_mm(1800), 6.35);

        // 1/8 inch = 3.175 mm
        // 3.175 * 7200 / 25.4 = 900
        assert_eq!(int32_to_mm(900), 3.175);

        // 1/16 inch = 1.5875 mm
        // 1.5875 * 7200 / 25.4 = 450
        assert_eq!(int32_to_mm(450), 1.5875);
    }

    #[test]
    fn test_int32_to_mm_rational_approximation() {
        // Test values that produce repeating decimals
        // 1/12 inch ≈ 2.1167 mm
        // 2.1167 * 7200 / 25.4 = 600
        let result = int32_to_mm(600);
        assert!((result - 2.1167).abs() < 0.0001);
    }
}
