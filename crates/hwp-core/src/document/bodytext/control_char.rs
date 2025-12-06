/// Control character constants based on HWP 5.0 Specification Table 6
/// HWP 5.0 스펙 표 6 기반 제어 문자 상수
///
/// 표 6: 제어 문자 / Table 6: Control characters
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

pub struct ControlChar;

/// 제어 문자 위치 정보 / Control character position information
///
/// 문단 텍스트 내에서 제어 문자의 위치와 종류를 나타냅니다.
/// Represents the position and type of control characters within paragraph text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlCharPosition {
    /// 문자 인덱스 (텍스트 내 위치) / Character index (position in text)
    pub position: usize,
    /// 제어 문자 코드 (0-31) / Control character code (0-31)
    pub code: u8,
    /// 제어 문자 이름 (상수 이름) / Control character name (constant name)
    pub name: String,
}

/// INLINE 제어 문자 파라미터 / INLINE control character parameter
///
/// JSON으로 표현 가능한 의미 있는 값만 저장합니다.
/// Only stores meaningful values that can be expressed in JSON.
///
/// INLINE 타입 제어 문자는 제어 문자 1 WCHAR (2 bytes) + 파라미터 6 WCHAR (12 bytes) = 총 8 WCHAR (16 bytes)
/// INLINE type control characters: control char 1 WCHAR (2 bytes) + parameter 6 WCHAR (12 bytes) = total 8 WCHAR (16 bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InlineControlParam {
    /// TAB 제어 문자의 너비 (HWPUNIT, 1/7200인치) / Width for TAB control character (HWPUNIT, 1/7200 inch)
    /// TAB (0x09)의 경우 첫 4바이트를 UINT32로 읽어서 저장 / For TAB (0x09), first 4 bytes read as UINT32
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<crate::types::HWPUNIT>,
    /// 컨트롤 ID (4바이트 ASCII 문자열) / Control ID (4-byte ASCII string)
    /// 다른 INLINE 타입의 경우 첫 4바이트를 ASCII로 읽기 시도 / For other INLINE types, attempt to read first 4 bytes as ASCII
    /// 스펙 문서에 명시되지 않은 식별자로, 정확한 의미는 알 수 없음 / Unspecified identifier in spec document, exact meaning is unknown
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chid: Option<String>,
}

impl InlineControlParam {
    /// INLINE 제어 문자 파라미터를 바이트 배열에서 파싱합니다. / Parse INLINE control character parameter from byte array.
    ///
    /// # Arguments
    /// * `control_code` - 제어 문자 코드 / Control character code
    /// * `data` - 최소 12바이트의 데이터 (제어 문자 코드 이후의 데이터) / At least 12 bytes of data (data after control character code)
    ///
    /// # Returns
    /// 파싱된 InlineControlParam 구조체 / Parsed InlineControlParam structure
    pub fn parse(control_code: u8, data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("InlineControlParam", 12, data.len()));
        }

        let mut param = InlineControlParam {
            width: None,
            chid: None,
        };

        if control_code == ControlChar::TAB {
            // TAB의 경우: 첫 4바이트를 UINT32로 읽어서 width로 저장
            // For TAB: read first 4 bytes as UINT32 and store as width
            use crate::types::UINT32;
            let width_value = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            param.width = Some(crate::types::HWPUNIT::from(width_value));
        } else {
            // 다른 INLINE 타입의 경우: 첫 4바이트를 ASCII 문자열로 읽기 시도
            // For other INLINE types: attempt to read first 4 bytes as ASCII string
            // 스펙 문서에 파라미터 구조가 명시되지 않아 정확한 의미를 알 수 없는 식별자
            // Parameter structure not specified in spec document, exact meaning of identifier is unknown
            let chid_bytes = &data[0..4];
            // ASCII로 읽을 수 있는지 확인 (모든 바이트가 0x20-0x7E 범위이거나 0x00)
            // Check if can be read as ASCII (all bytes in range 0x20-0x7E or 0x00)
            if chid_bytes
                .iter()
                .all(|&b| b == 0 || (b >= 0x20 && b <= 0x7E))
            {
                let chid_str = String::from_utf8_lossy(chid_bytes)
                    .trim_end_matches('\0')
                    .to_string();
                if !chid_str.is_empty() {
                    param.chid = Some(chid_str);
                }
            }
        }

        Ok(param)
    }
}

impl ControlChar {
    // Char control characters / 문자 제어 문자
    /// NULL 문자 / NULL character
    /// 표 6에는 명시되지 않았지만 CHAR 타입으로 처리됨 / Not specified in Table 6 but handled as CHAR type
    pub const NULL: u8 = 0;

    // Extended control characters / 확장 제어 문자
    /// 예약 (1-3) / Reserved (1-3)
    /// 표 6에는 명시되지 않았지만 EXTENDED 타입으로 처리됨 / Not specified in Table 6 but handled as EXTENDED type
    pub const RESERVED_1_3_START: u8 = 1;
    pub const RESERVED_1_3_END: u8 = 3;

    // Inline control characters / 인라인 제어 문자
    /// 필드 끝 / Field end
    pub const FIELD_END: u8 = 4;
    /// 예약 (5-7) / Reserved (5-7)
    pub const RESERVED_5_7_START: u8 = 5;
    pub const RESERVED_5_7_END: u8 = 7;
    /// title mark
    pub const TITLE_MARK: u8 = 8;
    /// 탭 / Tab
    pub const TAB: u8 = 9;
    /// 예약 (19-20) / Reserved (19-20)
    pub const RESERVED_19_20_START: u8 = 19;
    pub const RESERVED_19_20_END: u8 = 20;

    // Char control characters (continued) / 문자 제어 문자 (계속)
    /// 한 줄 끝(line break) / Line break
    pub const LINE_BREAK: u8 = 10;
    /// 문단 끝(para break) / Paragraph break
    pub const PARA_BREAK: u8 = 13;
    /// 하이픈 / Hyphen
    pub const HYPHEN: u8 = 24;
    /// 예약 (25-29) / Reserved (25-29)
    pub const RESERVED_25_29_START: u8 = 25;
    pub const RESERVED_25_29_END: u8 = 29;
    /// 묶음 빈칸 / Bound space
    pub const BOUND_SPACE: u8 = 30;
    /// 고정폭 빈칸 / Fixed-width space
    pub const FIXED_SPACE: u8 = 31;

    // Extended control characters / 확장 제어 문자
    /// 그리기 개체/표 / Drawing object/table
    pub const SHAPE_OBJECT: u8 = 11;
    /// 예약 (12) / Reserved (12)
    pub const RESERVED_12: u8 = 12;
    /// 예약 (14) / Reserved (14)
    pub const RESERVED_14: u8 = 14;
    /// 숨은 설명 / Hidden description
    pub const HIDDEN_DESC: u8 = 15;
    /// 머리말/꼬리말 / Header/footer
    /// 제어 문자 코드는 16으로 동일하며, 실제 구분은 컨트롤 헤더의 컨트롤 ID로 이루어짐 ("head" = 머리말, "foot" = 꼬리말)
    /// Control character code is 16 for both, actual distinction is made by control ID in control header ("head" = header, "foot" = footer)
    pub const HEADER_FOOTER: u8 = 16;
    /// 각주/미주 / Footnote/endnote
    /// 제어 문자 코드는 17로 동일하지만, 실제 컨트롤 ID로 구분됨 ("fn  " = 각주, "en  " = 미주)
    /// Control character code is 17 for both, but distinguished by control ID ("fn  " = footnote, "en  " = endnote)
    pub const FOOTNOTE: u8 = 17;
    /// 자동번호(각주, 표 등) / Auto number (footnote, table, etc.)
    pub const AUTO_NUMBER: u8 = 18;
    /// 페이지 컨트롤(감추기, 새 번호로 시작 등) / Page control (hide, start new number, etc.)
    pub const PAGE_CONTROL: u8 = 21;
    /// 책갈피/찾아보기 표식 / Bookmark/find mark
    pub const BOOKMARK: u8 = 22;
    /// 덧말/글자 겹침 / Comment overlap
    pub const COMMENT_OVERLAP: u8 = 23;

    /// 변환 가능한 제어 문자인지 확인 / Check if control character can be converted
    ///
    /// 텍스트로 표현 가능한 제어 문자 (텍스트에 유지됨) / Control characters that can be expressed as text (kept in text)
    pub fn is_convertible(code: u8) -> bool {
        matches!(
            code,
            Self::TAB
                | Self::LINE_BREAK
                | Self::PARA_BREAK
                | Self::HYPHEN
                | Self::BOUND_SPACE
                | Self::FIXED_SPACE
        )
    }

    /// 제어 문자를 텍스트 표현으로 변환 / Convert control character to text representation
    ///
    /// 변환 불가능한 경우 None 반환 / Returns None if conversion is not possible
    pub fn to_text(code: u8) -> Option<&'static str> {
        match code {
            Self::TAB => Some("\t"), // 탭 문자 그대로 유지 / Keep tab character as-is
            Self::LINE_BREAK => Some("\n"), // 한 줄 끝(line break) / Line break
            Self::PARA_BREAK => Some("\n"), // 문단 끝(para break) - 줄바꿈으로 표현 / Paragraph break - expressed as line break
            Self::HYPHEN => Some("-"),      // 하이픈 / Hyphen
            Self::BOUND_SPACE => Some(" "), // 묶음 빈칸을 공백으로 변환 / Convert bound space to space
            Self::FIXED_SPACE => Some(" "), // 고정폭 빈칸을 공백으로 변환 / Convert fixed-width space to space
            _ => None,
        }
    }

    /// 제어 문자 코드를 이름으로 변환 / Convert control character code to name
    ///
    /// # Arguments
    /// * `code` - 제어 문자 코드 (0-31) / Control character code (0-31)
    ///
    /// # Returns
    /// 제어 문자 상수 이름 (예: "FOOTNOTE", "AUTO_NUMBER") / Control character constant name (e.g., "FOOTNOTE", "AUTO_NUMBER")
    pub fn to_name(code: u8) -> String {
        match code {
            Self::NULL => "NULL".to_string(),
            Self::RESERVED_1_3_START..=Self::RESERVED_1_3_END => {
                format!("RESERVED_{}", code)
            }
            Self::FIELD_END => "FIELD_END".to_string(),
            Self::RESERVED_5_7_START..=Self::RESERVED_5_7_END => {
                format!("RESERVED_{}", code)
            }
            Self::TITLE_MARK => "TITLE_MARK".to_string(),
            Self::TAB => "TAB".to_string(),
            Self::LINE_BREAK => "LINE_BREAK".to_string(),
            Self::SHAPE_OBJECT => "SHAPE_OBJECT".to_string(),
            Self::RESERVED_12 => "RESERVED_12".to_string(),
            Self::PARA_BREAK => "PARA_BREAK".to_string(),
            Self::RESERVED_14 => "RESERVED_14".to_string(),
            Self::HIDDEN_DESC => "HIDDEN_DESC".to_string(),
            Self::HEADER_FOOTER => "HEADER_FOOTER".to_string(),
            Self::FOOTNOTE => "FOOTNOTE".to_string(),
            Self::AUTO_NUMBER => "AUTO_NUMBER".to_string(),
            Self::RESERVED_19_20_START..=Self::RESERVED_19_20_END => {
                format!("RESERVED_{}", code)
            }
            Self::PAGE_CONTROL => "PAGE_CONTROL".to_string(),
            Self::BOOKMARK => "BOOKMARK".to_string(),
            Self::COMMENT_OVERLAP => "COMMENT_OVERLAP".to_string(),
            Self::HYPHEN => "HYPHEN".to_string(),
            Self::RESERVED_25_29_START..=Self::RESERVED_25_29_END => {
                format!("RESERVED_{}", code)
            }
            Self::BOUND_SPACE => "BOUND_SPACE".to_string(),
            Self::FIXED_SPACE => "FIXED_SPACE".to_string(),
            _ => format!("UNKNOWN_{}", code),
        }
    }

    /// 제어 문자 타입에 따른 크기 반환 (WCHAR 단위) / Get size based on control character type (in WCHAR units)
    ///
    /// CHAR: 1 WCHAR (2 bytes)
    /// INLINE: 8 WCHAR (16 bytes) - 제어 문자 1 + 파라미터 6
    /// EXTENDED: 8 WCHAR (16 bytes) - 제어 문자 1 + 포인터 6
    #[allow(clippy::if_same_then_else)]
    pub fn get_size_by_code(code: u8) -> usize {
        if code <= 31 {
            // CHAR 타입: 1 WCHAR (2 bytes)
            // 표 6 참조: 10 (LINE_BREAK), 13 (PARA_BREAK), 24 (HYPHEN), 30 (BOUND_SPACE), 31 (FIXED_SPACE)
            // 표 6 미명시: 0 (NULL) - CHAR 타입으로 처리
            if matches!(
                code,
                Self::NULL
                    | Self::LINE_BREAK
                    | Self::PARA_BREAK
                    | Self::HYPHEN
                    | Self::BOUND_SPACE
                    | Self::FIXED_SPACE
            ) {
                1
            }
            // INLINE 타입: 8 WCHAR (16 bytes)
            // 표 6 참조: 4 (FIELD_END), 5-7 (예약), 8 (TITLE_MARK), 9 (TAB), 19-20 (예약)
            else if matches!(
                code,
                Self::FIELD_END
                    | Self::RESERVED_5_7_START..=Self::RESERVED_5_7_END
                    | Self::TITLE_MARK
                    | Self::TAB
                    | Self::RESERVED_19_20_START..=Self::RESERVED_19_20_END
            ) {
                8
            }
            // EXTENDED 타입: 8 WCHAR (16 bytes)
            // 표 6 참조: 11-12, 14-18, 21-23
            // 표 6 미명시: 1-3 - EXTENDED 타입으로 처리
            // INLINE과 동일한 크기(8)이지만 의미적으로 다른 타입임 / Same size (8) as INLINE but semantically different type
            else {
                8
            }
        } else {
            1 // 일반 문자
        }
    }
}
