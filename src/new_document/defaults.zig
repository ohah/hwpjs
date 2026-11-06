//! Authored new-document policy shared by both serializers, in HWPUNIT.
//! Values do not come from reader missing-field fallbacks or local environment.
pub const page_width: u32 = 59528; // round(210mm * 7200 / 25.4)
pub const page_height: u32 = 84189; // round(297mm * 7200 / 25.4)
pub const page_margin: u32 = 5669; // 20mm
pub const header_footer_margin: u32 = 2835; // 10mm
pub const font_name = "함초롬바탕";
pub const font_height: u32 = 1100; // 11pt, 1/100pt
pub const font_scale: u8 = 100;
pub const language_id: u16 = 1042;
pub const locale = "ko-KR";
pub const font_languages = [_][]const u8{ "HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER" };
pub const style_name = "바탕글";
pub const style_english_name = "Normal";
pub const line_spacing: u32 = 160; // percent
pub const tab_spacing: u32 = 4000; // 40pt
pub const first_number: u16 = 1;
pub const alignment: enum { left } = .left;
