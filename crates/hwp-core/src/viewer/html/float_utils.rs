/// Floating point number formatting utilities
///
/// This module provides utilities for formatting floating point numbers.
/// This file is a simple placeholder to define rounding helper functions.
/// The actual implementation may use the standard round() method with rounding strategies.
///
/// Round a float to 2 decimal places
/// This is typically done via format! with rounding
#[allow(dead_code)]
pub trait RoundTo2dpExt {
    fn round_to_2dp(self) -> Self;
}

impl RoundTo2dpExt for f64 {
    fn round_to_2dp(self) -> Self {
        (self * 100.0).round() / 100.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_to_2dp() {
        assert_eq!(1.234.round_to_2dp(), 1.23);
        assert_eq!(1.235.round_to_2dp(), 1.24);
        assert_eq!(1.245.round_to_2dp(), 1.25);
        assert_eq!(1.2355.round_to_2dp(), 1.24);
        assert_eq!(0.0.round_to_2dp(), 0.0);
        assert_eq!(-12.345.round_to_2dp(), -12.35);
    }
}
