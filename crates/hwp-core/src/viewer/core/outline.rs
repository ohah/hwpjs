/// Shared outline number logic for HTML and Markdown viewers
/// HTML·마크다운 뷰어 공통 개요 번호 로직
use crate::document::bodytext::ParaHeader;
use crate::document::{HeaderShapeType, HwpDocument};

/// 개요 번호 추적 구조체 / Outline number tracking structure
/// 각 레벨별로 번호를 추적하여 개요 번호를 생성
#[derive(Debug, Clone)]
pub struct OutlineNumberTracker {
    /// 각 레벨별 번호 카운터 (인덱스는 레벨-1)
    counters: [u32; 7],
}

impl OutlineNumberTracker {
    /// 새로운 추적기 생성 / Create new tracker
    pub fn new() -> Self {
        Self { counters: [0; 7] }
    }

    /// 개요 레벨의 번호를 증가시키고 반환 / Increment and return number for outline level
    pub fn get_and_increment(&mut self, level: u8) -> u32 {
        if level >= 8 {
            return 0;
        }
        let level_index = (level - 1) as usize;
        if level_index < 7 {
            let is_same_level = self.counters[level_index] > 0;
            if is_same_level {
                for i in (level_index + 1)..7 {
                    self.counters[i] = 0;
                }
                self.counters[level_index] += 1;
            } else {
                for i in level_index..7 {
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

fn number_to_hangul(number: u32) -> String {
    const HANGUL_SYLLABLES: [char; 14] = [
        '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
    ];
    if number == 0 {
        return String::new();
    }
    let index = ((number - 1) % 14) as usize;
    HANGUL_SYLLABLES[index].to_string()
}

fn number_to_circled(number: u32) -> String {
    if number == 0 || number > 20 {
        return number.to_string();
    }
    let code = 0x2460 + number - 1;
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

    if level >= 8 {
        if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
            let extended_index = (level - 8) as usize;
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
    if level >= 8 {
        return Some((level, 0));
    }
    Some((level, number))
}
