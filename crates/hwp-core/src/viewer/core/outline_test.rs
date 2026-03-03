/// Viewer core (outline) unit tests
use crate::document::docinfo::numbering::NumberType;
pub use crate::viewer::core::outline::{
    format_outline_number, number_to_circled, number_to_hangul, OutlineNumberTracker,
};
use crate::viewer::core::outline::{
    estimate_marker_width, format_number_by_type, format_numbering_string,
    number_to_lower_alpha, number_to_lower_roman, number_to_upper_alpha,
    number_to_upper_roman, pua_to_bullet_info, MarkerInfo, NumberTracker,
};

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

    // Korean cycle: 15th → (15-1)%14 = 0 → 가, 16th → 1 → 나
    assert!(format_outline_number(2u8, 15u32).contains('가'));
    assert!(format_outline_number(2u8, 16u32).contains('나'));
}

#[test]
fn test_format_outline_number_brackets_levels() {
    // Level 3: number), Level 5: (number)
    assert_eq!(format_outline_number(3u8, 1u32), "1)");
    assert_eq!(format_outline_number(3u8, 10u32), "10)");
    assert_eq!(format_outline_number(5u8, 1u32), "(1)");
    assert_eq!(format_outline_number(5u8, 99u32), "(99)");
}

#[test]
fn test_format_outline_number_circled_level() {
    // Level 7 uses circled numbers (①, ②, ③...)
    let result = format_outline_number(7u8, 1u32);
    assert!(result.contains('\u{2460}'));

    // Level 7 number 2 = ② (U+2461)
    let result2 = format_outline_number(7u8, 2u32);
    assert!(result2.contains('\u{2461}'));

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
    const HANGUL_SYLLABLES: [char; 14] = [
        '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
    ];

    // Cycle through complete set
    for i in 0..14 {
        assert_eq!(
            format_outline_number(2u8, i as u32 + 1u32)
                .chars()
                .next()
                .unwrap(),
            HANGUL_SYLLABLES[i]
        );
        assert_eq!(
            format_outline_number(4u8, i as u32 + 1u32)
                .chars()
                .next()
                .unwrap(),
            HANGUL_SYLLABLES[i]
        );
    }

    // Test Korean cycle (15th = (15-1)%14 = 0 → 가)
    assert_eq!(
        format_outline_number(2u8, 15u32).chars().next().unwrap(),
        '가'
    );
    assert_eq!(
        format_outline_number(4u8, 15u32).chars().next().unwrap(),
        '가'
    );
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
    assert_eq!("21", crate::viewer::core::outline::number_to_circled(21u32)); // out of range, plain number
    assert_eq!("0", crate::viewer::core::outline::number_to_circled(0u32)); // 0 is out of circled range
}

// ─── NumberTracker 테스트 ───

#[test]
fn test_number_tracker_basic() {
    let mut tracker = NumberTracker::new();
    assert_eq!(tracker.get_and_increment(0, 1), 1);
    assert_eq!(tracker.get_and_increment(0, 1), 2);
    assert_eq!(tracker.get_and_increment(0, 1), 3);
}

#[test]
fn test_number_tracker_independent_ids() {
    let mut tracker = NumberTracker::new();
    assert_eq!(tracker.get_and_increment(0, 1), 1);
    assert_eq!(tracker.get_and_increment(1, 1), 1); // 다른 numbering_id는 독립
    assert_eq!(tracker.get_and_increment(0, 1), 2);
    assert_eq!(tracker.get_and_increment(1, 1), 2);
}

#[test]
fn test_number_tracker_level_reset() {
    let mut tracker = NumberTracker::new();
    assert_eq!(tracker.get_and_increment(0, 1), 1);
    assert_eq!(tracker.get_and_increment(0, 2), 1);
    assert_eq!(tracker.get_and_increment(0, 2), 2);
    // 레벨 1로 돌아가면 하위 레벨(2) 리셋
    assert_eq!(tracker.get_and_increment(0, 1), 2);
    assert_eq!(tracker.get_and_increment(0, 2), 1); // 리셋됨
}

#[test]
fn test_number_tracker_edge_cases() {
    let mut tracker = NumberTracker::new();
    // 유효하지 않은 레벨
    assert_eq!(tracker.get_and_increment(0, 0), 0);
    assert_eq!(tracker.get_and_increment(0, 8), 0);
    assert_eq!(tracker.get_and_increment(0, 255), 0);
    // 유효한 레벨은 정상 동작
    assert_eq!(tracker.get_and_increment(0, 7), 1);
}

// ─── 로마 숫자 변환 테스트 ───

#[test]
fn test_number_to_upper_roman() {
    assert_eq!(number_to_upper_roman(1), "I");
    assert_eq!(number_to_upper_roman(4), "IV");
    assert_eq!(number_to_upper_roman(9), "IX");
    assert_eq!(number_to_upper_roman(14), "XIV");
    assert_eq!(number_to_upper_roman(100), "C");
    assert_eq!(number_to_upper_roman(3999), "MMMCMXCIX");
}

#[test]
fn test_number_to_lower_roman() {
    assert_eq!(number_to_lower_roman(1), "i");
    assert_eq!(number_to_lower_roman(4), "iv");
    assert_eq!(number_to_lower_roman(14), "xiv");
}

#[test]
fn test_number_to_upper_roman_zero() {
    assert_eq!(number_to_upper_roman(0), "");
}

// ─── 알파벳 변환 테스트 ───

#[test]
fn test_number_to_upper_alpha() {
    assert_eq!(number_to_upper_alpha(1), "A");
    assert_eq!(number_to_upper_alpha(26), "Z");
    assert_eq!(number_to_upper_alpha(27), "A"); // cycle
}

#[test]
fn test_number_to_lower_alpha() {
    assert_eq!(number_to_lower_alpha(1), "a");
    assert_eq!(number_to_lower_alpha(26), "z");
    assert_eq!(number_to_lower_alpha(27), "a"); // cycle
}

#[test]
fn test_number_to_alpha_zero() {
    assert_eq!(number_to_upper_alpha(0), "");
    assert_eq!(number_to_lower_alpha(0), "");
}

// ─── format_numbering_string 테스트 ───

#[test]
fn test_format_numbering_string_arabic() {
    assert_eq!(format_numbering_string("^1.", 1, NumberType::Arabic), "1.");
    assert_eq!(format_numbering_string("^1.", 42, NumberType::Arabic), "42.");
}

#[test]
fn test_format_numbering_string_roman() {
    assert_eq!(format_numbering_string("^1.", 1, NumberType::UpperRoman), "I.");
    assert_eq!(format_numbering_string("^1.", 4, NumberType::UpperRoman), "IV.");
}

#[test]
fn test_format_numbering_string_hangul() {
    assert_eq!(format_numbering_string("^1.", 1, NumberType::HangulGa), "가.");
}

#[test]
fn test_format_numbering_string_complex() {
    assert_eq!(format_numbering_string("제^1장", 1, NumberType::Arabic), "제1장");
    assert_eq!(format_numbering_string("제^1장", 3, NumberType::Arabic), "제3장");
}

#[test]
fn test_format_numbering_string_no_placeholder() {
    // 플레이스홀더가 없으면 원본 그대로 반환
    assert_eq!(format_numbering_string("ABC", 1, NumberType::Arabic), "ABC");
}

// ─── format_number_by_type 테스트 ───

#[test]
fn test_format_number_by_type_all_types() {
    assert_eq!(format_number_by_type(1, NumberType::Arabic), "1");
    assert_eq!(format_number_by_type(4, NumberType::UpperRoman), "IV");
    assert_eq!(format_number_by_type(4, NumberType::LowerRoman), "iv");
    assert_eq!(format_number_by_type(1, NumberType::UpperAlpha), "A");
    assert_eq!(format_number_by_type(1, NumberType::LowerAlpha), "a");
    assert_eq!(format_number_by_type(1, NumberType::HangulGa), "가");
    assert_eq!(format_number_by_type(1, NumberType::HangulGaCycle), "가");
}

// ─── pua_to_bullet_info 테스트 ───

#[test]
fn test_pua_to_bullet_info_known_chars() {
    let (ch, size) = pua_to_bullet_info(0xF06C);
    assert_eq!(ch, '●');
    assert!((size - 6.67).abs() < 0.01);

    let (ch, size) = pua_to_bullet_info(0xF09F);
    assert_eq!(ch, '●');
    assert!((size - 3.33).abs() < 0.01);

    let (ch, _) = pua_to_bullet_info(0xF06E);
    assert_eq!(ch, '◆');

    let (ch, _) = pua_to_bullet_info(0xF075);
    assert_eq!(ch, '■');
}

#[test]
fn test_pua_to_bullet_info_default() {
    let (ch, size) = pua_to_bullet_info(0x0000);
    assert_eq!(ch, '●');
    assert!((size - 6.67).abs() < 0.01);
}

// ─── estimate_marker_width 테스트 ───

#[test]
fn test_estimate_marker_width_bullet() {
    let width = estimate_marker_width("●", Some(10.0));
    assert!((width - 5.29).abs() < 0.01);
}

#[test]
fn test_estimate_marker_width_ascii() {
    // "I." → 1.74 + 1.46 = 3.20
    let width = estimate_marker_width("I.", Some(10.0));
    assert!((width - 3.20).abs() < 0.01);
}

#[test]
fn test_estimate_marker_width_hangul() {
    // "가." → 4.86 + 1.46 = 6.32
    let width = estimate_marker_width("가.", Some(10.0));
    assert!((width - 6.32).abs() < 0.01);
}

#[test]
fn test_estimate_marker_width_complex() {
    // "제1장" → 4.86 + 3.44 + 4.86 = 13.16
    let width = estimate_marker_width("제1장", Some(10.0));
    assert!((width - 13.16).abs() < 0.01);
}

// ─── MarkerInfo 구조체 테스트 ───

#[test]
fn test_marker_info_creation() {
    let marker = MarkerInfo {
        marker_text: "1.".to_string(),
        width_mm: 3.20,
        height_mm: 3.53,
        margin_left_mm: 0.0,
        font_size_pt: Some(10.0),
        char_shape_class: "cs1".to_string(),
    };
    assert_eq!(marker.marker_text, "1.");
    assert!((marker.width_mm - 3.20).abs() < 0.01);
    assert!((marker.height_mm - 3.53).abs() < 0.01);
    assert_eq!(marker.font_size_pt, Some(10.0));
    assert_eq!(marker.char_shape_class, "cs1");
}
