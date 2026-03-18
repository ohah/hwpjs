/// Shared outline number logic for HTML and Markdown viewers
/// HTML·마크다운 뷰어 공통 개요 번호 로직
use crate::document::bodytext::ParaHeader;
use crate::document::docinfo::bullet::BulletAlignType;
use crate::document::docinfo::numbering::NumberType;
use crate::document::{HeaderShapeType, HwpDocument};

// ─── 상수 정의 ───

/// 개요 최대 레벨 수 (1~7) / Maximum outline levels
const MAX_OUTLINE_LEVELS: usize = 7;

/// 확장 레벨 시작점 (레벨 8~10) / Extended level start
const EXTENDED_LEVEL_START: u8 = 8;

/// 한글 가나다 음절 수 / Hangul syllable count for numbering
const HANGUL_SYLLABLE_COUNT: usize = 14;

/// 동그라미 숫자 최대값 (①~⑳) / Maximum circled number (Unicode)
const MAX_CIRCLED_NUMBER: u32 = 20;

/// 동그라미 숫자 유니코드 시작점 ① / Circled digit one Unicode codepoint
const CIRCLED_NUMBER_UNICODE_BASE: u32 = 0x2460;

/// 알파벳 문자 수 (A~Z) / Alphabet character count
const ALPHABET_COUNT: u32 = 26;

/// 마커 기본 높이 (mm) / Default marker height
pub(crate) const DEFAULT_MARKER_HEIGHT_MM: f64 = 3.53;

/// 글머리표 기본 너비 (mm) / Default bullet marker width
const DEFAULT_BULLET_WIDTH_MM: f64 = 5.29;

/// 마커 기본 폰트 크기 (pt) / Default marker font size
pub(crate) const DEFAULT_MARKER_FONT_SIZE_PT: f64 = 10.0;

/// line_spacing_old에서 ID 추출 비트 시프트 / Bit shift for ID extraction
const LINE_SPACING_ID_SHIFT: u32 = 16;

/// line_spacing_old에서 ID 추출 비트 마스크 / Bit mask for ID extraction
const LINE_SPACING_ID_MASK: u32 = 0xFFFF;

/// 개요 번호 추적 구조체 / Outline number tracking structure
/// 각 레벨별로 번호를 추적하여 개요 번호를 생성
#[derive(Debug, Clone)]
pub struct OutlineNumberTracker {
    /// 각 레벨별 번호 카운터 (인덱스는 레벨-1)
    counters: [u32; MAX_OUTLINE_LEVELS],
}

impl OutlineNumberTracker {
    /// 새로운 추적기 생성 / Create new tracker
    pub fn new() -> Self {
        Self {
            counters: [0; MAX_OUTLINE_LEVELS],
        }
    }

    /// 개요 레벨의 번호를 증가시키고 반환 / Increment and return number for outline level
    pub fn get_and_increment(&mut self, level: u8) -> u32 {
        if level >= EXTENDED_LEVEL_START {
            return 0;
        }
        let level_index = (level - 1) as usize;
        if level_index < MAX_OUTLINE_LEVELS {
            let is_same_level = self.counters[level_index] > 0;
            if is_same_level {
                for i in (level_index + 1)..MAX_OUTLINE_LEVELS {
                    self.counters[i] = 0;
                }
                self.counters[level_index] += 1;
            } else {
                for i in level_index..MAX_OUTLINE_LEVELS {
                    self.counters[i] = 0;
                }
                self.counters[level_index] = 1;
            }
            self.counters[level_index]
        } else {
            0
        }
    }
}

impl Default for OutlineNumberTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// 한글 개요 번호 형식 생성 / Generate outline number format string (level 1–7)
/// Renderer에서 HTML/Markdown 출력 시 사용
pub fn format_outline_number(level: u8, number: u32) -> String {
    match level {
        1 => format!("{}.", number),
        2 => format!("{}.", number_to_hangul(number)),
        3 => format!("{})", number),
        4 => format!("{})", number_to_hangul(number)),
        5 => format!("({})", number),
        6 => format!("({})", number_to_hangul(number)),
        7 => number_to_circled(number),
        _ => format!("{}.", number),
    }
}

pub fn number_to_hangul(number: u32) -> String {
    const HANGUL_SYLLABLES: [char; HANGUL_SYLLABLE_COUNT] = [
        '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
    ];
    if number == 0 {
        return String::new();
    }
    let index = ((number - 1) % HANGUL_SYLLABLE_COUNT as u32) as usize;
    HANGUL_SYLLABLES[index].to_string()
}

pub fn number_to_circled(number: u32) -> String {
    if number == 0 || number > MAX_CIRCLED_NUMBER {
        return number.to_string();
    }
    let code = CIRCLED_NUMBER_UNICODE_BASE + number - 1;
    char::from_u32(code).unwrap_or(' ').to_string()
}

fn is_format_string_empty_or_null(format_string: &str) -> bool {
    if format_string.is_empty() {
        return false;
    }
    if format_string.chars().all(|c| c == '\u{0000}') {
        return true;
    }
    // 첫 번째 글자가 null이면 개요 번호 제거 가능 / First character is null, outline number can be removed
    if format_string.as_bytes().iter().all(|&b| b == 0) {
        return true;
    }
    false
}

/// format_string이 유효한 번호 형식인지 검증
/// ^N 플레이스홀더를 포함하고 제어 문자가 없어야 유효
fn is_format_string_valid(s: &str) -> bool {
    !s.is_empty() && s.contains('^') && !s.chars().any(|c| c.is_control() && c != '\t')
}

/// 문단이 개요 번호를 가질 경우 (level, number) 반환, 아니면 None
/// ParaShape·Numbering·format_string 검사 후 트래커로 번호 부여
pub fn compute_outline_number(
    para_header: &ParaHeader,
    document: &HwpDocument,
    tracker: &mut OutlineNumberTracker,
) -> Option<(u8, u32)> {
    let para_shape_id = para_header.para_shape_id as usize;
    let para_shape = document.doc_info.para_shapes.get(para_shape_id)?;
    if para_shape.attributes1.header_shape_type != HeaderShapeType::Outline {
        return None;
    }

    let base_level = para_shape.attributes1.paragraph_level + 1;
    let level = if base_level == 7 {
        if let Some(line_spacing) = para_shape.line_spacing {
            if (7..=10).contains(&line_spacing) {
                if let Some(style) = document
                    .doc_info
                    .styles
                    .get(para_header.para_style_id as usize)
                {
                    if style.local_name.starts_with("개요 ") {
                        if let Ok(style_level) = style.local_name[3..].trim().parse::<u8>() {
                            if (8..=10).contains(&style_level) {
                                style_level
                            } else {
                                (line_spacing + 1) as u8
                            }
                        } else {
                            (line_spacing + 1) as u8
                        }
                    } else {
                        (line_spacing + 1) as u8
                    }
                } else {
                    (line_spacing + 1) as u8
                }
            } else {
                base_level
            }
        } else {
            base_level
        }
    } else {
        base_level
    };

    let numbering_id = para_shape.number_bullet_id as usize;

    if level >= EXTENDED_LEVEL_START {
        if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
            let extended_index = (level - EXTENDED_LEVEL_START) as usize;
            if extended_index < numbering.extended_levels.len() {
                if let Some(extended_level) = numbering.extended_levels.get(extended_index) {
                    if is_format_string_empty_or_null(&extended_level.format_string) {
                        return None;
                    }
                }
            } else {
                return None;
            }
        } else {
            return None;
        }
    }

    if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
        let level_index = (level - 1) as usize;
        if let Some(level_info) = numbering.levels.get(level_index) {
            if is_format_string_empty_or_null(&level_info.format_string) {
                return None;
            }
        }
    }

    let number = tracker.get_and_increment(level);
    if level >= EXTENDED_LEVEL_START {
        return Some((level, 0));
    }
    Some((level, number))
}

// ─── NumberTracker (Number/Bullet 문단번호 추적) ───

/// 문단번호(Number) 추적 구조체 / Number paragraph tracking structure
/// numbering_id별로 독립적인 레벨 카운터를 유지
#[derive(Debug, Clone)]
pub struct NumberTracker {
    /// (numbering_id, level_counters) 쌍 목록
    entries: Vec<(usize, [u32; MAX_OUTLINE_LEVELS])>,
}

impl NumberTracker {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// numbering_id와 level에 대해 번호를 증가시키고 반환
    pub fn get_and_increment(&mut self, numbering_id: usize, level: u8) -> u32 {
        if level == 0 || level as usize > MAX_OUTLINE_LEVELS {
            return 0;
        }
        let level_index = (level - 1) as usize;

        // 해당 numbering_id의 엔트리 찾기
        let entry = self.entries.iter_mut().find(|(id, _)| *id == numbering_id);

        if let Some((_, counters)) = entry {
            let is_same_level = counters[level_index] > 0;
            if is_same_level {
                // 하위 레벨 리셋
                counters[(level_index + 1)..MAX_OUTLINE_LEVELS].fill(0);
                counters[level_index] += 1;
            } else {
                counters[level_index..MAX_OUTLINE_LEVELS].fill(0);
                counters[level_index] = 1;
            }
            counters[level_index]
        } else {
            let mut counters = [0u32; MAX_OUTLINE_LEVELS];
            counters[level_index] = 1;
            self.entries.push((numbering_id, counters));
            1
        }
    }
}

impl Default for NumberTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ─── 번호 포맷 함수들 ───

/// 숫자를 대문자 로마 숫자로 변환 / Convert number to upper roman
pub fn number_to_upper_roman(mut n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    let mut out = String::new();
    let pairs = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ];
    for (v, s) in pairs {
        while n >= v {
            out.push_str(s);
            n -= v;
        }
    }
    out
}

/// 숫자를 소문자 로마 숫자로 변환 / Convert number to lower roman
pub fn number_to_lower_roman(n: u32) -> String {
    number_to_upper_roman(n).to_lowercase()
}

/// 숫자를 대문자 알파벳으로 변환 / Convert number to upper alpha (1->A, 2->B, ...)
pub fn number_to_upper_alpha(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    let index = ((n - 1) % ALPHABET_COUNT) as u8;
    ((b'A' + index) as char).to_string()
}

/// 숫자를 소문자 알파벳으로 변환 / Convert number to lower alpha (1->a, 2->b, ...)
pub fn number_to_lower_alpha(n: u32) -> String {
    if n == 0 {
        return String::new();
    }
    let index = ((n - 1) % ALPHABET_COUNT) as u8;
    ((b'a' + index) as char).to_string()
}

/// NumberType에 따라 숫자를 문자열로 변환
pub fn format_number_by_type(number: u32, number_type: NumberType) -> String {
    match number_type {
        NumberType::Arabic => number.to_string(),
        NumberType::CircledDigits => number_to_circled(number),
        NumberType::UpperRoman => number_to_upper_roman(number),
        NumberType::LowerRoman => number_to_lower_roman(number),
        NumberType::UpperAlpha => number_to_upper_alpha(number),
        NumberType::LowerAlpha => number_to_lower_alpha(number),
        NumberType::HangulGa | NumberType::HangulGaCycle => number_to_hangul(number),
    }
}

/// format_string의 ^N 플레이스홀더를 실제 번호로 치환
/// format_string: "^1.", "제^1장" 등
pub fn format_numbering_string(
    format_string: &str,
    number: u32,
    number_type: NumberType,
) -> String {
    let formatted_number = format_number_by_type(number, number_type);
    // ^1, ^2, ... ^7 플레이스홀더를 치환 (일반적으로 ^1만 사용)
    let mut result = format_string.to_string();
    for i in 1..=MAX_OUTLINE_LEVELS {
        let placeholder = format!("^{}", i);
        if result.contains(&placeholder) {
            result = result.replace(&placeholder, &formatted_number);
        }
    }
    // ^N 형식도 처리 (일부 파일에서 사용)
    if result.contains("^N") {
        result = result.replace("^N", &formatted_number);
    }
    result
}

// ─── PUA-to-Unicode 매핑 ───

/// PUA 문자를 bullet 문자와 폰트 크기로 매핑
/// Returns (bullet_char, font_size_pt)
pub fn pua_to_bullet_info(pua_char: u16) -> (char, f64) {
    match pua_char {
        // PUA Wingdings 매핑 (large variants: 6.67pt)
        0xF06C => ('●', 6.67), // large filled circle
        0xF06E => ('■', 6.67), // large filled square
        0xF075 => ('◆', 6.67), // large filled diamond
        0xF0B7 => ('●', 6.67), // standard bullet
        // PUA Wingdings 매핑 (small variants: 3.33pt)
        0xF09F => ('●', 3.33), // small filled circle
        0xF077 => ('◆', 3.33), // small filled diamond
        0xF0A7 => ('■', 3.33), // small filled square
        0xF0A8 => ('◆', 3.33), // small filled diamond (alternate)
        // PUA Wingdings 매핑 (10pt — 장식 심볼)
        0xF046 => ('☞', 10.0), // pointing hand
        0xF06F => ('□', 10.0), // open square
        0xF076 => ('❖', 10.0), // four-pointed star
        0xF0A1 => ('◯', 10.0), // large circle
        0xF0A4 => ('⊙', 10.0), // circled dot
        0xF0AB => ('★', 10.0), // black star
        0xF0FC => ('✓', 10.0), // check mark
        0xF0FE => ('☑', 10.0), // ballot box with check
        // 비PUA 유니코드: 직접 사용 + 10pt
        _ => {
            if let Some(ch) = char::from_u32(pua_char as u32) {
                (ch, 10.0)
            } else {
                ('●', 6.67) // fallback
            }
        }
    }
}

// ─── MarkerInfo (Bullet/Number/Outline 마커 정보) ───

/// 문단 머리 마커 정보 / Paragraph header marker info
#[derive(Debug, Clone)]
pub struct MarkerInfo {
    /// 마커 텍스트: "●", "1.", "가.", "제1장" 등
    pub marker_text: String,
    /// hhe div 너비 (mm)
    pub width_mm: f64,
    /// hhe div 높이 (mm) - 항상 3.53mm
    pub height_mm: f64,
    /// 정렬에 따른 margin-left (mm)
    pub margin_left_mm: f64,
    /// 글머리표 폰트 크기 (pt). None이면 기본 10pt
    pub font_size_pt: Option<f64>,
    /// CharShape class name (e.g. "cs1")
    pub char_shape_class: String,
}

/// 마커 텍스트 너비 근사값 계산 (mm)
/// fixture에서 역산한 개별 문자 너비 사용
pub(crate) fn estimate_marker_width(text: &str, font_size_pt: Option<f64>) -> f64 {
    let pt = font_size_pt.unwrap_or(DEFAULT_MARKER_FONT_SIZE_PT);
    let mut width = 0.0;
    for ch in text.chars() {
        if ch == '●' || ch == '◆' || ch == '■' || ch == '□' || ch == '◈' || ch == '○' {
            // bullet char width ~ 5.29mm at 10pt, 2.65mm at 6.67pt
            width += DEFAULT_BULLET_WIDTH_MM * pt / DEFAULT_MARKER_FONT_SIZE_PT;
        } else if ch.is_ascii() {
            // ASCII 문자 너비 근사값 (fixture 역산 기반)
            match ch {
                'I' => width += 1.74, // narrow
                '.' => width += 1.46,
                ')' | '(' => width += 1.75, // fixture: 1) = 5.19, 1 = 3.44, ) = 1.75
                'V' | 'X' | 'A' | 'B' | 'C' | 'D' => width += 3.46,
                '0'..='9' => width += 3.44, // fixture: 1. = 4.90, . = 1.46, 1 = 3.44
                _ => width += 3.44,         // default ASCII width
            }
        } else {
            // 한글 등 wide 문자 (fixture 역산: 가. = 6.32, . = 1.46, 가 = 4.86)
            width += 4.86;
        }
    }
    // 소수점 2자리 반올림
    (width * 100.0).round() / 100.0
}

/// line_spacing_old의 상위 16비트에서 실제 numbering/bullet ID 추출 (1-based)
/// HWP에서 Number/Bullet 타입 문단의 경우, line_spacing_old 상위 16비트에
/// 참조할 Numbering/Bullet 정의의 1-based 인덱스가 인코딩됨
/// 0이면 기본값 사용, >0이면 해당 정의[id-1] 참조
fn extract_numbering_id_from_line_spacing(
    para_shape: &crate::document::docinfo::para_shape::ParaShape,
) -> usize {
    let raw = para_shape.line_spacing_old as u32;
    ((raw >> LINE_SPACING_ID_SHIFT) & LINE_SPACING_ID_MASK) as usize
}

/// 문단의 마커 정보를 계산 / Compute paragraph marker info
/// section_outline_numbering_id: 현재 섹션의 개요 번호 정의 ID (1-based, from SectionDefinition)
pub fn compute_paragraph_marker(
    para_header: &ParaHeader,
    document: &HwpDocument,
    outline_tracker: &mut OutlineNumberTracker,
    number_tracker: &mut NumberTracker,
    section_outline_numbering_id: u16,
) -> Option<MarkerInfo> {
    compute_paragraph_marker_with_char_shape(
        para_header,
        document,
        outline_tracker,
        number_tracker,
        section_outline_numbering_id,
        None,
    )
}

/// `fallback_char_shape_id`: bullet의 char_shape_id == -1일 때 문단의 첫 번째 CharShape ID를 사용
pub fn compute_paragraph_marker_with_char_shape(
    para_header: &ParaHeader,
    document: &HwpDocument,
    outline_tracker: &mut OutlineNumberTracker,
    number_tracker: &mut NumberTracker,
    section_outline_numbering_id: u16,
    fallback_char_shape_id: Option<u32>,
) -> Option<MarkerInfo> {
    let para_shape_id = para_header.para_shape_id as usize;
    let para_shape = document.doc_info.para_shapes.get(para_shape_id)?;

    match para_shape.attributes1.header_shape_type {
        HeaderShapeType::Bullet => {
            compute_bullet_marker(para_shape, document, fallback_char_shape_id)
        }
        HeaderShapeType::Number => {
            compute_number_marker(para_shape, para_header, document, number_tracker)
        }
        HeaderShapeType::Outline => compute_outline_marker(
            para_shape,
            para_header,
            document,
            outline_tracker,
            section_outline_numbering_id,
        ),
        HeaderShapeType::None => None,
    }
}

fn compute_bullet_marker(
    para_shape: &crate::document::docinfo::para_shape::ParaShape,
    document: &HwpDocument,
    fallback_char_shape_id: Option<u32>,
) -> Option<MarkerInfo> {
    let actual_id = extract_numbering_id_from_line_spacing(para_shape);
    let bullet_id = if actual_id > 0 {
        actual_id - 1
    } else {
        para_shape.number_bullet_id as usize
    };
    let bullet = document.doc_info.bullets.get(bullet_id)?;

    let (bullet_char, font_size) = pua_to_bullet_info(bullet.bullet_char);
    let marker_text = bullet_char.to_string();

    // char_shape_id == -1일 때 문단의 첫 번째 CharShape를 fallback으로 사용
    let (char_shape_class, font_size, width_mm, height_mm) = if bullet.char_shape_id >= 0 {
        let cs_id = bullet.char_shape_id as usize;
        let class = if cs_id < document.doc_info.char_shapes.len() {
            format!("cs{}", cs_id)
        } else {
            "cs0".to_string()
        };
        let w = if bullet.width > 0 {
            match bullet.attributes.align_type {
                BulletAlignType::Right => DEFAULT_BULLET_WIDTH_MM,
                _ => {
                    let w_mm = bullet.width as f64 * 25.4 / 7200.0;
                    let total = w_mm + w_mm.min(DEFAULT_BULLET_WIDTH_MM);
                    (total * 100.0).round() / 100.0
                }
            }
        } else {
            DEFAULT_BULLET_WIDTH_MM
        };
        (class, font_size, w, DEFAULT_MARKER_HEIGHT_MM)
    } else if let Some(fb_id) = fallback_char_shape_id {
        // char_shape_id == -1: 문단의 CharShape에서 폰트 크기와 클래스를 가져옴
        let cs_id = fb_id as usize;
        if cs_id < document.doc_info.char_shapes.len() {
            let cs = &document.doc_info.char_shapes[cs_id];
            let pt = cs.base_size as f64 / 100.0; // base_size is in 1/100 pt
            let size_mm = (pt * 0.352778 * 100.0).round() / 100.0; // pt to mm
            (format!("cs{}", cs_id), pt, size_mm, size_mm)
        } else {
            (
                "cs0".to_string(),
                font_size,
                DEFAULT_BULLET_WIDTH_MM,
                DEFAULT_MARKER_HEIGHT_MM,
            )
        }
    } else {
        let w = if bullet.width > 0 {
            match bullet.attributes.align_type {
                BulletAlignType::Right => DEFAULT_BULLET_WIDTH_MM,
                _ => {
                    let w_mm = bullet.width as f64 * 25.4 / 7200.0;
                    let total = w_mm + w_mm.min(DEFAULT_BULLET_WIDTH_MM);
                    (total * 100.0).round() / 100.0
                }
            }
        } else {
            DEFAULT_BULLET_WIDTH_MM
        };
        ("cs0".to_string(), font_size, w, DEFAULT_MARKER_HEIGHT_MM)
    };

    let margin_left_mm = match bullet.attributes.align_type {
        BulletAlignType::Left => 0.0,
        BulletAlignType::Center => height_mm / 2.0,
        BulletAlignType::Right => height_mm,
    };

    Some(MarkerInfo {
        width_mm,
        height_mm,
        margin_left_mm,
        font_size_pt: Some(font_size),
        char_shape_class,
        marker_text,
    })
}

fn compute_number_marker(
    para_shape: &crate::document::docinfo::para_shape::ParaShape,
    _para_header: &ParaHeader,
    document: &HwpDocument,
    tracker: &mut NumberTracker,
) -> Option<MarkerInfo> {
    let actual_id = extract_numbering_id_from_line_spacing(para_shape);
    let numbering_id = if actual_id > 0 {
        actual_id - 1
    } else {
        para_shape.number_bullet_id as usize
    };

    let level = para_shape.attributes1.paragraph_level + 1;
    let level_index = (level - 1) as usize;

    // numbering_id를 tracker 키로 사용 (독립적 카운터 유지)
    let number = tracker.get_and_increment(numbering_id, level);

    // Numbering 정의에서 format_string 사용, 없으면 format_outline_number fallback
    let marker_text = if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
        if let Some(level_info) = numbering.levels.get(level_index) {
            let fs = &level_info.format_string;
            let nt = level_info.attributes.number_type;
            if is_format_string_empty_or_null(fs) {
                return None;
            } else if is_format_string_valid(fs) {
                format_numbering_string(fs, number, nt)
            } else {
                format_outline_number(level, number)
            }
        } else {
            format_outline_number(level, number)
        }
    } else {
        format_outline_number(level, number)
    };

    let char_shape_class = if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
        if let Some(level_info) = numbering.levels.get(level_index) {
            let cs_id = level_info.char_shape_id as usize;
            if cs_id < document.doc_info.char_shapes.len() {
                format!("cs{}", cs_id)
            } else {
                "cs1".to_string()
            }
        } else {
            "cs1".to_string()
        }
    } else {
        "cs1".to_string()
    };

    let width_mm = estimate_marker_width(&marker_text, Some(DEFAULT_MARKER_FONT_SIZE_PT));

    Some(MarkerInfo {
        marker_text,
        width_mm,
        height_mm: DEFAULT_MARKER_HEIGHT_MM,
        margin_left_mm: 0.0,
        font_size_pt: Some(DEFAULT_MARKER_FONT_SIZE_PT),
        char_shape_class,
    })
}

fn compute_outline_marker(
    para_shape: &crate::document::docinfo::para_shape::ParaShape,
    para_header: &ParaHeader,
    document: &HwpDocument,
    tracker: &mut OutlineNumberTracker,
    section_outline_numbering_id: u16,
) -> Option<MarkerInfo> {
    // compute_outline_number와 동일한 level 계산 로직 사용
    let base_level = para_shape.attributes1.paragraph_level + 1;
    let level = if base_level == 7 {
        if let Some(line_spacing) = para_shape.line_spacing {
            if (7..=10).contains(&line_spacing) {
                if let Some(style) = document
                    .doc_info
                    .styles
                    .get(para_header.para_style_id as usize)
                {
                    if style.local_name.starts_with("개요 ") {
                        if let Ok(style_level) = style.local_name[3..].trim().parse::<u8>() {
                            if (8..=10).contains(&style_level) {
                                style_level
                            } else {
                                (line_spacing + 1) as u8
                            }
                        } else {
                            (line_spacing + 1) as u8
                        }
                    } else {
                        (line_spacing + 1) as u8
                    }
                } else {
                    (line_spacing + 1) as u8
                }
            } else {
                base_level
            }
        } else {
            base_level
        }
    } else {
        base_level
    };

    let actual_id = extract_numbering_id_from_line_spacing(para_shape);
    // actual_id > 0이면 line_spacing_old에서 추출한 ID 사용,
    // 아니면 section의 outline numbering ID 사용 (1-based)
    let effective_id = if actual_id > 0 {
        actual_id
    } else if section_outline_numbering_id > 0 {
        section_outline_numbering_id as usize
    } else {
        0
    };
    let numbering_id = if effective_id > 0 {
        effective_id - 1
    } else {
        para_shape.number_bullet_id as usize
    };

    // format_string이 비어있는지 확인
    if level >= EXTENDED_LEVEL_START {
        if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
            let extended_index = (level - EXTENDED_LEVEL_START) as usize;
            if extended_index < numbering.extended_levels.len() {
                if let Some(extended_level) = numbering.extended_levels.get(extended_index) {
                    if is_format_string_empty_or_null(&extended_level.format_string) {
                        return None;
                    }
                }
            } else {
                return None;
            }
        } else {
            return None;
        }
    } else if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
        let level_index = (level - 1) as usize;
        if let Some(level_info) = numbering.levels.get(level_index) {
            if is_format_string_empty_or_null(&level_info.format_string) {
                return None;
            }
        }
    }

    let number = tracker.get_and_increment(level);
    if level >= EXTENDED_LEVEL_START {
        return None; // 확장 레벨은 아직 미구현
    }

    // effective_id > 0이면 해당 Numbering format_string 사용, 아니면 기본 format_outline_number
    let use_numbering_format = effective_id > 0;
    let marker_text = if use_numbering_format {
        if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
            let level_index = (level - 1) as usize;
            if let Some(level_info) = numbering.levels.get(level_index) {
                let fs = &level_info.format_string;
                let nt = level_info.attributes.number_type;
                if is_format_string_valid(fs) {
                    format_numbering_string(fs, number, nt)
                } else {
                    format_outline_number(level, number)
                }
            } else {
                format_outline_number(level, number)
            }
        } else {
            format_outline_number(level, number)
        }
    } else {
        format_outline_number(level, number)
    };

    let char_shape_class = if use_numbering_format {
        if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
            let level_index = (level - 1) as usize;
            if let Some(level_info) = numbering.levels.get(level_index) {
                let cs_id = level_info.char_shape_id as usize;
                if cs_id < document.doc_info.char_shapes.len() {
                    format!("cs{}", cs_id)
                } else {
                    "cs1".to_string()
                }
            } else {
                "cs1".to_string()
            }
        } else {
            "cs1".to_string()
        }
    } else {
        "cs1".to_string()
    };

    let width_mm = estimate_marker_width(&marker_text, Some(DEFAULT_MARKER_FONT_SIZE_PT));

    Some(MarkerInfo {
        marker_text,
        width_mm,
        height_mm: DEFAULT_MARKER_HEIGHT_MM,
        margin_left_mm: 0.0,
        font_size_pt: Some(DEFAULT_MARKER_FONT_SIZE_PT),
        char_shape_class,
    })
}

// ─── Document(hwp-model) 기반 numbering 공용 함수 ───

/// hwp_model NumberType2 → HwpDocument NumberType 변환
pub fn convert_num_format(
    nf: &hwp_model::types::NumberType2,
) -> NumberType {
    match nf {
        hwp_model::types::NumberType2::Digit => NumberType::Arabic,
        hwp_model::types::NumberType2::CircledDigit => NumberType::CircledDigits,
        hwp_model::types::NumberType2::RomanCapital => NumberType::UpperRoman,
        hwp_model::types::NumberType2::RomanSmall => NumberType::LowerRoman,
        hwp_model::types::NumberType2::LatinCapital => NumberType::UpperAlpha,
        hwp_model::types::NumberType2::LatinSmall => NumberType::LowerAlpha,
        hwp_model::types::NumberType2::HangulSyllable => NumberType::HangulGa,
        hwp_model::types::NumberType2::HangulJamo => NumberType::HangulGaCycle,
        _ => NumberType::Arabic,
    }
}

/// Numbering format_string을 사용하여 번호 포맷
/// id_ref: numbering ID (1-based, 0이면 기본 outline 형식)
pub fn format_with_numbering(
    id_ref: u16,
    level: u8,
    number: u32,
    resources: &hwp_model::resources::Resources,
) -> String {
    let numbering_id = if id_ref > 0 {
        (id_ref - 1) as usize
    } else {
        return format_outline_number(level, number);
    };
    if let Some(numbering) = resources.numberings.get(numbering_id) {
        let level_index = (level.saturating_sub(1)) as usize;
        if let Some(level_info) = numbering.levels.get(level_index) {
            let fs = &level_info.format_string;
            if !fs.is_empty()
                && fs.contains('^')
                && !fs.chars().any(|c| c.is_control() && c != '\t')
            {
                let formatted = format_numbering_string(
                    fs,
                    number,
                    convert_num_format(&level_info.num_format),
                );
                return formatted;
            }
        }
    }
    format_outline_number(level, number)
}
