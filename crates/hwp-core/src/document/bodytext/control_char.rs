/// Control character constants based on HWP 5.0 Specification Table 6
/// HWP 5.0 스펙 표 6 기반 제어 문자 상수
///
/// 표 6: 제어 문자 / Table 6: Control characters
pub struct ControlChar;

impl ControlChar {
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

    // Char control characters / 문자 제어 문자
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
    pub const HEADER_FOOTER: u8 = 16;
    /// 각주/미주 / Footnote/endnote
    pub const FOOTNOTE: u8 = 17;
    /// 자동번호(각주, 표 등) / Auto number (footnote, table, etc.)
    pub const AUTO_NUMBER: u8 = 18;
    /// 페이지 컨트롤(감추기, 새 번호로 시작 등) / Page control (hide, start new number, etc.)
    pub const PAGE_CONTROL: u8 = 21;
    /// 책갈피/찾아보기 표식 / Bookmark/find mark
    pub const BOOKMARK: u8 = 22;
    /// 덧말/글자 겹침 / Comment overlap
    pub const COMMENT_OVERLAP: u8 = 23;

    /// 제거해야 할 제어 문자인지 확인 / Check if control character should be removed
    ///
    /// Extended 타입과 예약된 제어 문자는 제거 / Extended type and reserved control characters are removed
    pub fn is_removable(code: u8) -> bool {
        matches!(
            code,
            // Extended 타입 - 이미 별도 레코드로 처리됨 / Extended type - already handled as separate records
            Self::SHAPE_OBJECT
            | Self::RESERVED_12
            | Self::RESERVED_14
            | Self::HIDDEN_DESC
            | Self::HEADER_FOOTER
            | Self::FOOTNOTE
            | Self::AUTO_NUMBER
            | Self::PAGE_CONTROL
            | Self::BOOKMARK
            | Self::COMMENT_OVERLAP
            // 예약된 제어 문자 / Reserved control characters
            | Self::RESERVED_5_7_START..=Self::RESERVED_5_7_END
            | Self::RESERVED_19_20_START..=Self::RESERVED_19_20_END
            | Self::RESERVED_25_29_START..=Self::RESERVED_25_29_END
            // 필드 끝 - 이미 필드로 처리됨 / Field end - already handled as field
            | Self::FIELD_END
            // title mark - 마크다운에서 표현 불가 / title mark - cannot be expressed in markdown
            | Self::TITLE_MARK
        )
    }

    /// 변환 가능한 제어 문자인지 확인 / Check if control character can be converted
    ///
    /// 텍스트로 표현 가능한 제어 문자 (텍스트에 유지됨) / Control characters that can be expressed as text (kept in text)
    pub fn is_convertible(code: u8) -> bool {
        matches!(
            code,
            Self::TAB | Self::LINE_BREAK | Self::PARA_BREAK | Self::HYPHEN | Self::BOUND_SPACE | Self::FIXED_SPACE
        )
    }

    /// 제어 문자를 텍스트 표현으로 변환 / Convert control character to text representation
    ///
    /// 변환 불가능한 경우 None 반환 / Returns None if conversion is not possible
    pub fn to_text(code: u8) -> Option<&'static str> {
        match code {
            Self::TAB => Some("\t"),         // 탭 문자 그대로 유지 / Keep tab character as-is
            Self::LINE_BREAK => Some("\n"), // 한 줄 끝(line break) / Line break
            Self::PARA_BREAK => Some("\n"), // 문단 끝(para break) - 줄바꿈으로 표현 / Paragraph break - expressed as line break
            Self::HYPHEN => Some("-"),      // 하이픈 / Hyphen
            Self::BOUND_SPACE => Some(" "), // 묶음 빈칸을 공백으로 변환 / Convert bound space to space
            Self::FIXED_SPACE => Some(" "), // 고정폭 빈칸을 공백으로 변환 / Convert fixed-width space to space
            _ => None,
        }
    }

    /// 제어 문자 타입에 따른 크기 반환 (WCHAR 단위) / Get size based on control character type (in WCHAR units)
    ///
    /// CHAR: 1 WCHAR (2 bytes)
    /// INLINE: 8 WCHAR (16 bytes) - 제어 문자 1 + 파라미터 6
    /// EXTENDED: 8 WCHAR (16 bytes) - 제어 문자 1 + 포인터 6
    pub fn get_size_by_code(code: u8) -> usize {
        if code <= 31 {
            // CHAR 타입: 1 WCHAR (2 bytes)
            // 표 6 참조: 10 (LINE_BREAK), 13 (PARA_BREAK), 24 (HYPHEN), 30 (BOUND_SPACE), 31 (FIXED_SPACE), 0 (NULL)
            if matches!(code, 0 | 10 | 13 | 24 | 30 | 31) {
                1
            }
            // INLINE 타입: 8 WCHAR (16 bytes)
            // 표 6 참조: 4 (FIELD_END), 5-7 (예약), 8 (TITLE_MARK), 9 (TAB), 19-20 (예약)
            else if matches!(code, 4 | 5 | 6 | 7 | 8 | 9 | 19 | 20) {
                8
            }
            // EXTENDED 타입: 8 WCHAR (16 bytes)
            // 표 6 참조: 1-3, 11-12, 14-18, 21-23
            else {
                8
            }
        } else {
            1 // 일반 문자
        }
    }
}
