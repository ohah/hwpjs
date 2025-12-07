/// Utility functions for Markdown conversion
/// 마크다운 변환을 위한 유틸리티 함수들
use crate::document::{HeaderShapeType, HwpDocument};

/// 개요 번호 추적 구조체 / Outline number tracking structure
/// 각 레벨별로 번호를 추적하여 개요 번호를 생성
/// Tracks numbers per level to generate outline numbers
#[derive(Debug, Clone)]
pub(crate) struct OutlineNumberTracker {
    /// 각 레벨별 번호 카운터 (인덱스는 레벨-1) / Number counter per level (index is level-1)
    counters: [u32; 7],
}

impl OutlineNumberTracker {
    /// 새로운 추적기 생성 / Create new tracker
    pub(crate) fn new() -> Self {
        Self { counters: [0; 7] }
    }

    /// 개요 레벨의 번호를 증가시키고 반환 / Increment and return number for outline level
    pub(crate) fn get_and_increment(&mut self, level: u8) -> u32 {
        // 레벨 8 이상은 번호를 사용하지 않음 / Levels 8 and above don't use numbers
        // 카운터도 증가시키지 않음 / Don't increment counters either
        if level >= 8 {
            return 0;
        }
        let level_index = (level - 1) as usize;
        if level_index < 7 {
            // 현재 레벨의 카운터가 0이 아니면 같은 레벨이 연속으로 나오는 것
            // If current level counter is not 0, it means the same level is continuing
            let is_same_level = self.counters[level_index] > 0;

            if is_same_level {
                // 같은 레벨이 연속으로 나올 때: 현재 레벨만 증가, 하위 레벨만 초기화
                // When same level continues: only increment current level, reset only lower levels
                for i in (level_index + 1)..7 {
                    self.counters[i] = 0;
                }
                self.counters[level_index] += 1;
            } else {
                // 상위 레벨로 이동하거나 새로운 레벨: 현재 레벨과 하위 레벨 모두 초기화
                // Moving to higher level or new level: reset current level and lower levels
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

/// 버전 번호를 읽기 쉬운 문자열로 변환
/// Convert version number to readable string
pub(crate) fn format_version(document: &HwpDocument) -> String {
    let version = document.file_header.version;
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let build = version & 0xFF;

    format!("{}.{:02}.{:02}.{:02}", major, minor, patch, build)
}

/// 문서에서 첫 번째 PageDef 정보 추출 / Extract first PageDef information from document
pub(crate) fn extract_page_info(
    document: &HwpDocument,
) -> Option<&crate::document::bodytext::PageDef> {
    use crate::document::ParagraphRecord;
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                if let ParagraphRecord::PageDef { page_def } = record {
                    return Some(page_def);
                }
            }
        }
    }
    None
}

/// Check if a part is a text part (not a block element)
/// part가 텍스트인지 확인 (블록 요소가 아님)
pub(crate) fn is_text_part(part: &str) -> bool {
    !is_block_element(part)
}

/// Check if a part is a block element (image, table, etc.)
/// part가 블록 요소인지 확인 (이미지, 표 등)
pub(crate) fn is_block_element(part: &str) -> bool {
    part.starts_with("![이미지]")
        || part.starts_with("|") // 테이블 / table
        || part.starts_with("---") // 페이지 구분선 / page break
                                   // 개요 번호는 블록 요소가 아님 / Outline numbers are not block elements
}

/// Check if control header should be processed for markdown
/// 컨트롤 헤더가 마크다운 변환에서 처리되어야 하는지 확인
pub(crate) fn should_process_control_header(header: &crate::document::CtrlHeader) -> bool {
    use crate::document::CtrlId;
    match header.ctrl_id.as_str() {
        // 마크다운으로 표현 가능한 컨트롤만 처리 / Only process controls that can be expressed in markdown
        CtrlId::TABLE => true,
        CtrlId::SHAPE_OBJECT => true, // 이미지는 자식 레코드에서 처리 / Images are processed from child records
        CtrlId::HEADER => true,       // 머리말 처리 / Process header
        CtrlId::FOOTER => true,       // 꼬리말 처리 / Process footer
        CtrlId::FOOTNOTE => false, // 각주는 convert_bodytext_to_markdown에서 처리 / Footnotes are processed in convert_bodytext_to_markdown
        CtrlId::ENDNOTE => false, // 미주는 convert_bodytext_to_markdown에서 처리 / Endnotes are processed in convert_bodytext_to_markdown
        CtrlId::COLUMN_DEF => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => false, // 마크다운으로 표현 불가 / Cannot be expressed in markdown
        _ => false, // 기타 컨트롤도 마크다운으로 표현 불가 / Other controls also cannot be expressed in markdown
    }
}

/// 한글 개요 번호 형식 생성 / Generate Korean outline number format
/// 레벨에 따라 다른 번호 형식 사용 / Use different number format based on level
fn format_outline_number(level: u8, number: u32) -> String {
    match level {
        1 => format!("{}.", number),                    // 1.
        2 => format!("{}.", number_to_hangul(number)),  // 가.
        3 => format!("{})", number),                    // 1)
        4 => format!("{})", number_to_hangul(number)),  // 가)
        5 => format!("({})", number),                   // (1)
        6 => format!("({})", number_to_hangul(number)), // (가)
        7 => format!("{}", number_to_circled(number)),  // ①
        _ => format!("{}.", number),                    // 기본값 / default
    }
}

/// 숫자를 한글 자모로 변환 / Convert number to Korean syllable
/// 1 -> 가, 2 -> 나, 3 -> 다, ... / 1 -> 가, 2 -> 나, 3 -> 다, ...
fn number_to_hangul(number: u32) -> String {
    // 한글 자모 배열 (가, 나, 다, 라, 마, 바, 사, 아, 자, 차, 카, 타, 파, 하)
    // Korean syllable array (가, 나, 다, 라, 마, 바, 사, 아, 자, 차, 카, 타, 파, 하)
    const HANGUL_SYLLABLES: [char; 14] = [
        '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
    ];

    if number == 0 {
        return String::new();
    }

    let index = ((number - 1) % 14) as usize;
    HANGUL_SYLLABLES[index].to_string()
}

/// 숫자를 원 숫자로 변환 / Convert number to circled number
/// 1 -> ①, 2 -> ②, 3 -> ③, ... / 1 -> ①, 2 -> ②, 3 -> ③, ...
fn number_to_circled(number: u32) -> String {
    if number == 0 || number > 20 {
        return format!("{}", number);
    }
    // 원 숫자 유니코드 범위: 0x2460-0x2473 (①-⑳)
    // Circled number Unicode range: 0x2460-0x2473 (①-⑳)
    let code = 0x2460 + number - 1;
    char::from_u32(code).unwrap_or(' ').to_string()
}

/// format_string이 번호를 사용하지 않는지 확인
/// Check if format_string indicates no numbering should be used
fn is_format_string_empty_or_null(format_string: &str) -> bool {
    // 빈 문자열("")은 기본 형식 사용하므로 false 반환 (번호 표시)
    // Empty string ("") uses default format, so return false (show number)
    if format_string.is_empty() {
        return false;
    }
    // null 문자(\u0000)만 포함하거나 모든 문자가 null 문자인 경우만 번호 없음
    // Only null character (\u0000) or all characters are null means no number
    // UTF-16LE로 디코딩된 null 문자는 단일 바이트 0 또는 "\u{0000}" 문자열로 나타날 수 있음
    // Null character decoded from UTF-16LE may appear as single byte 0 or "\u{0000}" string

    // 모든 문자가 null 문자인지 확인 (가장 안전한 방법)
    // Check if all characters are null (safest method)
    if format_string.chars().all(|c| c == '\u{0000}') {
        return true;
    }

    // UTF-8 바이트가 모두 0인지 확인 (null 문자만 포함)
    // Check if all UTF-8 bytes are 0 (only null characters)
    if format_string.as_bytes().iter().all(|&b| b == 0) {
        return true;
    }

    // 단일 null 문자인지 확인
    // Check if it's a single null character
    if format_string.len() == 1 {
        // 문자로 확인
        // Check as character
        if format_string.chars().next() == Some('\u{0000}') {
            return true;
        }
        // UTF-8 바이트로 확인
        // Check as UTF-8 byte
        if format_string.as_bytes()[0] == 0 {
            return true;
        }
    }

    false
}

/// 개요 레벨이면 텍스트 앞에 개요 번호를 추가
/// Add outline number prefix to text if it's an outline level
pub(crate) fn convert_to_outline_with_number(
    text: &str,
    para_header: &crate::document::bodytext::ParaHeader,
    document: &HwpDocument,
    tracker: &mut OutlineNumberTracker,
) -> String {
    // ParaShape 찾기 (para_shape_id는 인덱스) / Find ParaShape (para_shape_id is index)
    let para_shape_id = para_header.para_shape_id as usize;
    if let Some(para_shape) = document.doc_info.para_shapes.get(para_shape_id) {
        // 개요 타입이면 개요 번호 추가 / If outline type, add outline number
        if para_shape.attributes1.header_shape_type == HeaderShapeType::Outline {
            // paragraph_level + 1 = 실제 레벨 (0=레벨1, 1=레벨2, 2=레벨3, ...)
            // paragraph_level + 1 = actual level (0=level1, 1=level2, 2=level3, ...)
            let base_level = para_shape.attributes1.paragraph_level + 1;

            // paragraph_level이 6이고 line_spacing이 7 이상이면 실제 레벨은 para_style_id를 사용하여 결정
            // If paragraph_level is 6 and line_spacing is 7 or higher, determine actual level using para_style_id
            let level = if base_level == 7 {
                // paragraph_level이 6이면 base_level은 7 / If paragraph_level is 6, base_level is 7
                // line_spacing이 7 이상이면 확장 레벨 (8-10) / If line_spacing >= 7, extended level (8-10)
                // para_style_id를 사용하여 스타일 이름에서 레벨 추출
                // Use para_style_id to extract level from style name
                if let Some(line_spacing) = para_shape.line_spacing {
                    if line_spacing >= 7 && line_spacing <= 10 {
                        // para_style_id로 스타일 찾기 / Find style by para_style_id
                        if let Some(style) = document
                            .doc_info
                            .styles
                            .get(para_header.para_style_id as usize)
                        {
                            // 스타일 이름에서 레벨 추출 (예: "개요 8" -> 8, "개요 9" -> 9, "개요 10" -> 10)
                            // Extract level from style name (e.g., "개요 8" -> 8, "개요 9" -> 9, "개요 10" -> 10)
                            if style.local_name.starts_with("개요 ") {
                                if let Ok(style_level) = style.local_name[3..].trim().parse::<u8>()
                                {
                                    if style_level >= 8 && style_level <= 10 {
                                        style_level
                                    } else {
                                        // 스타일 레벨이 범위를 벗어나면 line_spacing 기반 계산
                                        // If style level is out of range, calculate based on line_spacing
                                        (line_spacing + 1) as u8
                                    }
                                } else {
                                    // 스타일 이름 파싱 실패 시 line_spacing 기반 계산
                                    // If style name parsing fails, calculate based on line_spacing
                                    (line_spacing + 1) as u8
                                }
                            } else {
                                // 스타일 이름이 "개요 "로 시작하지 않으면 line_spacing 기반 계산
                                // If style name doesn't start with "개요 ", calculate based on line_spacing
                                (line_spacing + 1) as u8
                            }
                        } else {
                            // 스타일을 찾을 수 없으면 line_spacing 기반 계산
                            // If style cannot be found, calculate based on line_spacing
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

            // numbering_id로 numbering 정보 찾기 / Find numbering info by numbering_id
            let numbering_id = para_shape.number_bullet_id as usize;

            // 레벨 8-10인 경우 extended_levels의 format_string 확인
            // For levels 8-10, check format_string from extended_levels
            if level >= 8 {
                if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
                    // 레벨 8은 extended_levels[0], 레벨 9는 extended_levels[1], 레벨 10은 extended_levels[2]
                    // Level 8 is extended_levels[0], level 9 is extended_levels[1], level 10 is extended_levels[2]
                    let extended_index = (level - 8) as usize;
                    // extended_levels 배열 범위 확인
                    // Check extended_levels array bounds
                    if extended_index < numbering.extended_levels.len() {
                        if let Some(extended_level) = numbering.extended_levels.get(extended_index)
                        {
                            // format_string이 null 문자만 포함하면 번호 없이 텍스트만 반환
                            // If format_string contains only null character, return text only without number
                            if is_format_string_empty_or_null(&extended_level.format_string) {
                                return text.to_string();
                            }
                        }
                    } else {
                        // extended_levels 배열 범위를 벗어나면 넘버링 없이 텍스트만 반환
                        // If extended_levels array index is out of bounds, return text only without number
                        return text.to_string();
                    }
                    // extended_levels가 없으면 번호 생성 (기본 동작)
                    // If extended_levels don't exist, generate number (default behavior)
                } else {
                    // numbering이 없으면 넘버링 없이 텍스트만 반환 (레벨 8 이상은 numbering이 필요)
                    // If numbering doesn't exist, return text only without number (levels 8+ require numbering)
                    return text.to_string();
                }
            }

            // 레벨 1-7인 경우 format_string 확인 (빈 문자열이면 기본 형식 사용)
            // For levels 1-7, check format_string (empty string uses default format)
            if let Some(numbering) = document.doc_info.numbering.get(numbering_id) {
                let level_index = (level - 1) as usize;
                if let Some(level_info) = numbering.levels.get(level_index) {
                    // format_string이 null 문자만 포함하면 번호 없이 텍스트만 반환
                    // If format_string contains only null character, return text only without number
                    // 빈 문자열("")은 기본 형식 사용 (번호 표시)
                    // Empty string ("") uses default format (show number)
                    if is_format_string_empty_or_null(&level_info.format_string) {
                        return text.to_string();
                    }
                }
            }

            // format_string이 있으면 번호 생성 / Generate number if format_string exists
            let number = tracker.get_and_increment(level);
            let outline_number = format_outline_number(level, number);
            return format!("{} {}", outline_number, text);
        }
    }
    text.to_string()
}
