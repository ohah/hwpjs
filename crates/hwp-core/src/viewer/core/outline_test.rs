/// Viewer core (outline) unit tests
pub use crate::viewer::core::outline::{OutlineNumberTracker, format_outline_number, number_to_circled, number_to_hangul};

#[test]
fn test_outline_tracker_new() {
    let mut tracker = OutlineNumberTracker::new();
    // Test basic functionality without accessing internal state
    assert_eq!(tracker.get_and_increment(1u8), 1);
}

#[test]
fn test_outline_tracker_basic_increment() {
    let mut tracker = OutlineNumberTracker::new();

    // Level 1 counters should start correctly
    assert_eq!(tracker.get_and_increment(1u8), 1);

    // Level 2 shouldn't affect level 1 yet
    assert_eq!(tracker.get_and_increment(2u8), 1);

    // Continue level 1
    assert_eq!(tracker.get_and_increment(1u8), 2);
}

#[test]
fn test_outline_tracker_same_level_reset() {
    let mut tracker = OutlineNumberTracker::new();

    // Increment level 1 once
    let num1 = tracker.get_and_increment(1u8);
    assert_eq!(num1, 1);

    // Increment level 2 once (should reset level 1)
    let num2 = tracker.get_and_increment(2u8);
    assert_eq!(num2, 1);

    // Continue level 1 again
    let num3 = tracker.get_and_increment(1u8);
    assert_eq!(num3, 2);
}

#[test]
fn test_outline_tracker_different_levels() {
    let mut tracker = OutlineNumberTracker::new();

    // Create nested structure
    let r1a = tracker.get_and_increment(1u8);
    let r1b = tracker.get_and_increment(1u8);

    let r2a = tracker.get_and_increment(2u8); // r1a will have 1 number, r1b has same level, should reset
    let r2b = tracker.get_and_increment(2u8);

    let r1c = tracker.get_and_increment(1u8);

    // Verify the structure works correctly
    assert_eq!(r1a, 1);
    assert_eq!(r1b, 2);
    assert_eq!(r2a, 1); // Nested level resets parent level
    assert_eq!(r2b, 2);
    assert_eq!(r1c, 3); // Continue level 1
}

#[test]
fn test_format_outline_number_level_1() {
    assert_eq!(format_outline_number(1u8, 1u32), "1.");
    assert_eq!(format_outline_number(1u8, 42u32), "42.");
}

#[test]
fn test_format_outline_number_korean_levels() {
    // Level 2 and 4 use Korean (가나다라...)
    assert!(format_outline_number(2u8, 1u32).contains('가'));
    assert!(format_outline_number(2u8, 2u32).contains('나'));
    assert!(format_outline_number(4u8, 1u32).contains('가'));
    assert!(format_outline_number(4u8, 2u32).contains('나'));

    // Korean numbers cycles
    assert!(format_outline_number(2u8, 15u32).contains('다')); // 15th = 15-1 = 14 → 다
    assert!(format_outline_number(2u8, 16u32).contains('라')); // 16th = 16-1 = 15 → 라
}

#[test]
fn test_format_outline_number_brackets_levels() {
    // Level 3 and 5 use parentheses
    assert_eq!(format_outline_number(3u8, 1u32), "1)");
    assert_eq!(format_outline_number(3u8, 10u32), "10)");
    assert_eq!(format_outline_number(5u8, 1u32), "1)");
    assert_eq!(format_outline_number(5u8, 99u32), "99)");
}

#[test]
fn test_format_outline_number_circled_level() {
    // Level 7 uses circled numbers (①, ②, ③...)
    let result = format_outline_number(7u8, 1u32);
    assert!(result.contains('\u{2460}'));

    // Korean numbers also possible for level 7
    let result2 = format_outline_number(7u8, 2u32);
    assert!(result2.contains('가') || result2.contains('나')); // 0x2461 또는 한글

    // Large numbers beyond circled range
    assert!(format_outline_number(7u8, 21u32).contains('1')); // 21번 이상은 일반 숫자로 표시
}

#[test]
fn test_format_outline_number_levels_6_and_7_hangul() {
    // Level 6 also uses Korean
    assert!(format_outline_number(6u8, 1u32).contains('가'));
    assert!(format_outline_number(6u8, 1u32).contains('('));
}

#[test]
fn test_format_outline_number_invalid_level() {
    // Handle invalid levels gracefully
    let result = format_outline_number(0u8, 1u32);
    assert_eq!(result, "1."); // Fallback to level 1 format

    let result2 = format_outline_number(8u8, 1u32);
    assert_eq!(result2, "1."); // Unknown level also defaults to level 1 format
}

#[test]
fn test_format_outline_number_leading_zeros() {
    // Numbers with multiple digits
    assert_eq!(format_outline_number(1u8, 10u32), "10.");
    assert_eq!(format_outline_number(1u8, 100u32), "100.");
    assert_eq!(format_outline_number(3u8, 100u32), "100)");
}

#[test]
fn test_format_outline_number_korean_cycles() {
    // Test Korean character cycles (가나다라가...)
    const HANGUL_SYLLABLES: [char; 14] = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

    // Cycle through complete set
    for i in 0..14 {
        assert_eq!(format_outline_number(2u8, i as u32 + 1u32).chars().next().unwrap(), HANGUL_SYLLABLES[i]);
        assert_eq!(format_outline_number(4u8, i as u32 + 1u32).chars().next().unwrap(), HANGUL_SYLLABLES[i]);
    }

    // Test Korean overflow (15th should go to 다)
    assert_eq!(format_outline_number(2u8, 15u32).chars().next().unwrap(), '다');
    assert_eq!(format_outline_number(4u8, 15u32).chars().next().unwrap(), '다');
}

#[test]
fn test_outline_tracker_edge_cases() {
    let mut tracker = OutlineNumberTracker::new();

    // Test high levels (should be ignored)
    assert_eq!(tracker.get_and_increment(8u8), 0);
    assert_eq!(tracker.get_and_increment(9u8), 0);

    // Test reset at level 8 or 9 shouldn't affect other counters
    assert_eq!(tracker.get_and_increment(1u8), 1);
}

#[test]
fn test_format_outline_number_number_to_hangul() {
    assert_eq!("가", crate::viewer::core::outline::number_to_hangul(1u32));
    assert_eq!("나", crate::viewer::core::outline::number_to_hangul(2u32));
    assert_eq!("다", crate::viewer::core::outline::number_to_hangul(3u32));
    assert_eq!("가", crate::viewer::core::outline::number_to_hangul(15u32)); // overflow
    assert_eq!("하", crate::viewer::core::outline::number_to_hangul(14u32));
    assert_eq!("", crate::viewer::core::outline::number_to_hangul(0u32));
}

#[test]
fn test_format_outline_number_number_to_circled() {
    assert_eq!("①", crate::viewer::core::outline::number_to_circled(1u32));
    assert_eq!("②", crate::viewer::core::outline::number_to_circled(2u32));
    assert_eq!("⑩", crate::viewer::core::outline::number_to_circled(10u32));
    assert_eq!("⑪", crate::viewer::core::outline::number_to_circled(11u32));
    assert_eq!("(20)", crate::viewer::core::outline::number_to_circled(21u32)); // out of range, uses parentheses
    assert_eq!("", crate::viewer::core::outline::number_to_circled(0u32));
}