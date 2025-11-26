/// CtrlHeader 구조체 / CtrlHeader structure
///
/// 스펙 문서 매핑: 표 64 - 컨트롤 헤더 / Spec mapping: Table 64 - Control header
use crate::types::{
    decode_utf16le, HWPUNIT, HWPUNIT16, INT32, INT8, SHWPUNIT, UINT16, UINT32, UINT8,
};
use serde::{Deserialize, Serialize};

/// 컨트롤 ID 상수 정의 / Control ID constants definition
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, 표 128 - 필드 컨트롤 ID
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, Table 128 - Field Control IDs
pub struct CtrlId;

impl CtrlId {
    // 개체 컨트롤 ID / Object Control IDs
    /// 테이블 컨트롤 / Table control
    /// 개체 공통 속성을 가지는 컨트롤 ID / Control ID with object common properties
    pub const TABLE: &str = "tbl ";
    /// 일반 그리기 개체 / General shape object
    /// 개체 공통 속성을 가지는 컨트롤 ID / Control ID with object common properties
    pub const SHAPE_OBJECT: &str = "gso ";

    // 표 127: 개체 이외의 컨트롤과 컨트롤 ID / Table 127: Controls other than objects and Control IDs
    /// 구역 정의 / Section definition
    /// 스펙 문서: 표 127, 표 129 참조 / Spec: See Table 127, Table 129
    pub const SECTION_DEF: &str = "secd";
    /// 단 정의 / Column definition
    pub const COLUMN_DEF: &str = "cold";
    /// 머리말/꼬리말 / Header/Footer
    pub const HEADER_FOOTER: &str = "head";
    /// 각주/미주 / Footnote/Endnote
    pub const FOOTNOTE: &str = "foot";
    /// 자동번호 / Auto numbering
    /// 스펙 문서: 표 127, 표 142 참조 / Spec: See Table 127, Table 142
    pub const AUTO_NUMBER: &str = "autn";
    /// 새 번호 지정 / New number specification
    /// 스펙 문서: 표 127, 표 144 참조 / Spec: See Table 127, Table 144
    pub const NEW_NUMBER: &str = "newn";
    /// 감추기 / Hide
    /// 스펙 문서: 표 127, 표 145 참조 / Spec: See Table 127, Table 145
    pub const HIDE: &str = "pghd";
    /// 홀/짝수 조정 / Odd/Even page adjustment
    /// 스펙 문서: 표 127, 표 146 참조 / Spec: See Table 127, Table 146
    pub const PAGE_ADJUST: &str = "pgad";
    /// 쪽 번호 위치 / Page number position
    pub const PAGE_NUMBER: &str = "pgno";
    /// 쪽 번호 위치 (pgnp) / Page number position (pgnp)
    /// 실제 파일에서는 'pgnp'로 저장되는 경우가 있음 / Some files store this as 'pgnp'
    pub const PAGE_NUMBER_POS: &str = "pgnp";
    /// 찾아보기 표식 / Bookmark marker
    /// 스펙 문서: 표 127, 표 149 참조 / Spec: See Table 127, Table 149
    pub const BOOKMARK_MARKER: &str = "bkmk";
    /// 글자 겹침 / Character overlap
    /// 스펙 문서: 표 127, 표 150 참조 / Spec: See Table 127, Table 150
    pub const OVERLAP: &str = "over";
    /// 덧말 / Comment
    /// 스펙 문서: 표 127, 표 151 참조 / Spec: See Table 127, Table 151
    pub const COMMENT: &str = "cmtt";
    /// 숨은 설명 / Hidden description
    /// 스펙 문서: 표 127 참조 / Spec: See Table 127
    pub const HIDDEN_DESC: &str = "hide";
    /// 필드 시작 / Field start
    /// 스펙 문서: 표 127, 표 152 참조 / Spec: See Table 127, Table 152
    ///
    /// 사용 방법 / Usage:
    /// 1. 필드 시작("%%%%") 컨트롤 헤더가 있음 / Field start ("%%%%") control header exists
    /// 2. 그 이후에 필드 데이터(표 152 구조)가 오는데, 첫 4바이트가 필드 타입(표 128의 필드 컨트롤 ID)
    ///    / Field data (Table 152 structure) follows, first 4 bytes are field type (Table 128 field control IDs)
    /// 3. 필드 끝(제어 문자 코드 4)이 있음 / Field end (control character code 4) exists
    /// 즉, 표 128의 필드 컨트롤 ID들은 필드 데이터의 첫 4바이트에 저장되는 필드 타입 식별자입니다.
    /// Field control IDs from Table 128 are field type identifiers stored in the first 4 bytes of field data.
    pub const FIELD_START: &str = "%%%%";

    // 표 128: 필드 컨트롤 ID / Table 128: Field Control IDs
    ///
    /// 이 상수들은 필드 시작("%%%%") 컨트롤 헤더 이후에 오는 필드 데이터(표 152)의 첫 4바이트에 저장되는 필드 타입을 나타냅니다.
    /// These constants represent field types stored in the first 4 bytes of field data (Table 152) that follows the field start ("%%%%") control header.
    ///
    /// 필드 데이터 구조 (표 152): / Field data structure (Table 152):
    /// - UINT32 ctrl ID (4 bytes) - 표 128의 필드 컨트롤 ID / Field control ID from Table 128
    /// - UINT 속성 (4 bytes) / Attribute (4 bytes)
    /// - BYTE 기타 속성 (1 byte) / Other attributes (1 byte)
    /// - WORD command 길이 (2 bytes) / Command length (2 bytes)
    /// - WCHAR array[len] command (2×len bytes) / Command (2×len bytes)
    /// - UINT32 id (4 bytes) / ID (4 bytes)
    ///
    /// 필드: 알 수 없음 / Field: Unknown
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_UNKNOWN: &str = "%unk";
    /// 필드: 날짜 / Field: Date
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_DATE: &str = "%dte";
    /// 필드: 문서 날짜 / Field: Document date
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_DOC_DATE: &str = "%ddt";
    /// 필드: 경로 / Field: Path
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_PATH: &str = "%pat";
    /// 필드: 책갈피 / Field: Bookmark
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_BOOKMARK: &str = "%bkm";
    /// 필드: 메일 머지 / Field: Mail merge
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_MAILMERGE: &str = "%mmg";
    /// 필드: 상호 참조 / Field: Cross reference
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_CROSSREF: &str = "%crf";
    /// 필드: 수식 / Field: Formula
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_FORMULA: &str = "%fml";
    /// 필드: 하이퍼링크 / Field: Hyperlink
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_HYPERLINK: &str = "%hlk";
    /// 필드: 변경 추적 서명 / Field: Revision sign
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_SIGN: &str = "%%sg";
    /// 필드: 변경 추적 삭제 / Field: Revision delete
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_DELETE: &str = "%%de";
    /// 필드: 변경 추적 삽입 / Field: Revision insert
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_INSERT: &str = "%%in";
    /// 필드: 변경 추적 변경 / Field: Revision change
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_CHANGE: &str = "%%ch";
    /// 필드: 변경 추적 첨부 / Field: Revision attach
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_ATTACH: &str = "%%at";
    /// 필드: 변경 추적 하이퍼링크 / Field: Revision hyperlink
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_HYPERLINK: &str = "%%h";
    /// 필드: 변경 추적 줄 첨부 / Field: Revision line attach
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_LINE_ATTACH: &str = "%%A";
    /// 필드: 변경 추적 줄 링크 / Field: Revision line link
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_LINE_LINK: &str = "%%l";
    /// 필드: 변경 추적 줄 전송 / Field: Revision line transfer
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_REVISION_LINE_TRANSFER: &str = "%%t";
    /// 필드: 메모 / Field: Memo
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_MEMO: &str = "%%me";
    /// 필드: 개인정보 보안 / Field: Private info security
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_PRIVATE_INFO_SECURITY: &str = "%cpr";
    /// 필드: 목차 / Field: Table of contents
    /// 스펙 문서: 표 128 참조 / Spec: See Table 128
    /// 필드 시작("%%%%") 이후 필드 데이터의 첫 4바이트에 저장되는 필드 타입 / Field type stored in first 4 bytes of field data after field start ("%%%%")
    pub const FIELD_TABLE_OF_CONTENTS: &str = "%oc";
}

/// 컨트롤 헤더 / Control header
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtrlHeader {
    /// 컨트롤 ID (4바이트, ASCII 문자열로 해석 가능) / Control ID (4 bytes, can be interpreted as ASCII string)
    pub ctrl_id: String,
    /// 컨트롤 ID 값 (UINT32) / Control ID value (UINT32)
    pub ctrl_id_value: UINT32,
    /// 컨트롤 ID 이후의 데이터 (CtrlID에 따라 다름) / Data after control ID (varies by CtrlID)
    #[serde(flatten)]
    pub data: CtrlHeaderData,
}

/// 컨트롤 헤더 데이터 (컨트롤 ID별 구조) / Control header data (structure varies by CtrlID)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "data_type", rename_all = "snake_case")]
pub enum CtrlHeaderData {
    /// 개체 공통 속성 (표, 그리기 개체) / Object common properties (table, shape object)
    ObjectCommon {
        /// 속성 (표 70 참조) / Attribute (see Table 70)
        attribute: ObjectAttribute,
        /// 세로 오프셋 값 / Vertical offset value
        /// 주의: 스펙 문서(표 69)에서는 HWPUNIT (unsigned)로 명시되어 있지만, 실제 파일에서는 SHWPUNIT (signed)로 파싱해야 합니다.
        /// Note: Spec (Table 69) specifies HWPUNIT (unsigned), but actual files require SHWPUNIT (signed) parsing.
        /// 참고: pyhwp는 DIFFSPEC으로 표시하고 SHWPUNIT을 사용합니다.
        /// Reference: pyhwp marks this as DIFFSPEC and uses SHWPUNIT.
        offset_y: SHWPUNIT,
        /// 가로 오프셋 값 / Horizontal offset value
        /// 주의: 스펙 문서(표 69)에서는 HWPUNIT (unsigned)로 명시되어 있지만, 실제 파일에서는 SHWPUNIT (signed)로 파싱해야 합니다.
        /// Note: Spec (Table 69) specifies HWPUNIT (unsigned), but actual files require SHWPUNIT (signed) parsing.
        /// 참고: pyhwp는 DIFFSPEC으로 표시하고 SHWPUNIT을 사용합니다.
        /// Reference: pyhwp marks this as DIFFSPEC and uses SHWPUNIT.
        offset_x: SHWPUNIT,
        /// 오브젝트의 폭 / Object width
        width: HWPUNIT,
        /// 오브젝트의 높이 / Object height
        height: HWPUNIT,
        /// z-order / z-order
        z_order: INT32,
        /// 오브젝트의 바깥 4방향 여백 / Object outer margins (4 directions)
        margin: Margin,
        /// 문서 내 각 개체에 대한 고유 아이디 / Unique ID for each object in document
        instance_id: UINT32,
        /// 쪽나눔 방지 on(1) / off(0) / Page break prevention on(1) / off(0)
        page_divide: INT32,
        /// 개체 설명문 / Object description text
        description: Option<String>,
    },
    /// 단 정의 / Column definition
    ColumnDefinition,
    /// 머리말/꼬리말 / Header/Footer
    HeaderFooter,
    /// 쪽 번호 위치 / Page number position
    PageNumberPosition {
        /// 속성 (표 148 참조) / Attribute (see Table 148)
        flags: PageNumberPositionFlags,
        /// 사용자 기호 / User symbol
        user_symbol: String,
        /// 앞 장식 문자 / Prefix decoration character
        prefix: String,
        /// 뒤 장식 문자 / Suffix decoration character
        suffix: String,
    },
    /// 필드 (표 152) / Field (Table 152)
    Field {
        /// 필드 타입 (표 128의 필드 컨트롤 ID) / Field type (field control ID from Table 128)
        field_type: String,
        /// 속성 (표 153 참조) / Attribute (see Table 153)
        attribute: UINT32,
        /// 기타 속성 / Other attributes
        other_attr: UINT8,
        /// command 길이 / Command length
        command_len: UINT16,
        /// command (각 필드 종류마다 처리해야할 고유 정보) / Command (unique information for each field type)
        command: String,
        /// 문서 내 고유 아이디 / Unique ID in document
        id: UINT32,
    },
    /// 구역 정의 (표 129) / Section definition (Table 129)
    SectionDefinition {
        /// 속성 (표 130 참조) / Attribute (see Table 130)
        attribute: UINT32,
        /// 동일한 페이지에서 서로 다른 단 사이의 간격 / Spacing between different columns on the same page
        column_spacing: HWPUNIT16,
        /// 세로로 줄맞춤을 할지 여부 / Vertical alignment (0=off, 1-n = spacing in HWPUNIT)
        vertical_alignment: HWPUNIT16,
        /// 가로로 줄맞춤을 할지 여부 / Horizontal alignment (0=off, 1-n = spacing in HWPUNIT)
        horizontal_alignment: HWPUNIT16,
        /// 기본 팁 간격 / Default tip spacing
        default_tip_spacing: HWPUNIT,
        /// 번호 문단 모양 ID / Number paragraph shape ID
        number_para_shape_id: UINT16,
        /// 쪽 번호 (0 = 앞 구역에 이어, n = 임의의 번호로 시작) / Page number (0 = continue from previous section, n = start with arbitrary number)
        page_number: UINT16,
        /// 그림, 표, 수식 번호 / Figure, table, equation numbers
        figure_number: UINT16,
        table_number: UINT16,
        equation_number: UINT16,
        /// 대표 Language / Representative Language
        language: UINT16,
    },
    /// 자동번호 (표 142) / Auto number (Table 142)
    AutoNumber {
        /// 속성 (표 143 참조) / Attribute (see Table 143)
        attribute: UINT32,
        /// 번호 / Number
        number: UINT16,
        /// 사용자 기호 / User symbol
        user_symbol: String,
        /// 앞 장식 문자 / Prefix decoration character
        prefix: String,
        /// 뒤 장식 문자 / Suffix decoration character
        suffix: String,
    },
    /// 새 번호 지정 (표 144) / New number specification (Table 144)
    NewNumber {
        /// 속성 (bit 0-3: 번호 종류, 표 143 참조) / Attribute (bit 0-3: number type, see Table 143)
        attribute: UINT32,
        /// 번호 / Number
        number: UINT16,
    },
    /// 감추기 (표 145) / Hide (Table 145)
    Hide {
        /// 속성 (감출 대상) / Attribute (hide target)
        attribute: UINT16,
    },
    /// 홀/짝수 조정 (표 146) / Page adjustment (Table 146)
    PageAdjust {
        /// 속성 (bit 0-1: 홀/짝수 구분) / Attribute (bit 0-1: odd/even page distinction)
        attribute: UINT32,
    },
    /// 찾아보기 표식 (표 149) / Bookmark marker (Table 149)
    BookmarkMarker {
        /// 첫 번째 키워드 / First keyword
        keyword1: String,
        /// 두 번째 키워드 / Second keyword
        keyword2: String,
    },
    /// 글자 겹침 (표 150) / Character overlap (Table 150)
    Overlap {
        /// ctrl ID / Control ID
        ctrl_id: String,
        /// 겹칠 글자 / Overlapping text
        text: String,
        /// 테두리 타입 / Border type
        border_type: UINT8,
        /// 내부 글자 크기 / Internal text size
        internal_text_size: INT8,
        /// 테두리 내부 글자 펼침 / Border internal text spread
        border_internal_text_spread: UINT8,
        /// 테두리 내부 글자 속성 아이디 배열 / Border internal text attribute ID array
        char_shape_ids: Vec<UINT32>,
    },
    /// 덧말 (표 151) / Comment (Table 151)
    Comment {
        /// main Text / Main text
        main_text: String,
        /// sub Text / Sub text
        sub_text: String,
        /// 댓말의 위치 (0: 위, 1: 아래, 2: 가운데) / Comment position (0: top, 1: bottom, 2: center)
        position: UINT32,
        /// Fsizeratio / Font size ratio
        fsize_ratio: UINT32,
        /// Option / Option
        option: UINT32,
        /// Style number / Style number
        style_number: UINT32,
        /// 정렬 기준 (0: 양쪽, 1: 왼쪽, 2: 오른쪽, 3: 가운데, 4: 배분, 5: 나눔) / Alignment (0: both, 1: left, 2: right, 3: center, 4: distribute, 5: divide)
        alignment: UINT32,
    },
    /// 숨은 설명 / Hidden description
    HiddenDescription,
    /// 기타 컨트롤 / Other controls
    Other,
}

/// 개체 속성 / Object attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectAttribute {
    /// 글자처럼 취급 여부 / Treat as character
    pub like_letters: bool,
    /// 줄 간격에 영향을 줄지 여부 / Affect line spacing
    pub affect_line_spacing: bool,
    /// 세로 위치의 기준 / Vertical position reference
    pub vert_rel_to: VertRelTo,
    /// 세로 위치의 기준에 대한 상대적인 배열 방식 / Vertical alignment relative to reference
    pub vert_relative: UINT8,
    /// 가로 위치의 기준 / Horizontal position reference
    pub horz_rel_to: HorzRelTo,
    /// 가로 위치의 기준에 대한 상대적인 배열 방식 / Horizontal alignment relative to reference
    pub horz_relative: UINT8,
    /// VertRelTo이 'para'일 때 오브젝트의 세로 위치를 본문 영역으로 제한할지 여부 / Limit vertical position to body area when VertRelTo is 'para'
    pub vert_rel_to_para_limit: bool,
    /// 다른 오브젝트와 겹치는 것을 허용할지 여부 / Allow overlap with other objects
    pub overlap: bool,
    /// 오브젝트 폭의 기준 / Object width reference
    pub object_width_standard: ObjectWidthStandard,
    /// 오브젝트 높이의 기준 / Object height reference
    pub object_height_standard: ObjectHeightStandard,
    /// 오브젝트 텍스트 옵션 / Object text option
    pub object_text_option: ObjectTextOption,
    /// 오브젝트 텍스트 위치 옵션 / Object text position option
    pub object_text_position_option: ObjectTextPositionOption,
    /// 오브젝트 카테고리 / Object category
    pub object_category: ObjectCategory,
    /// 크기 보호 / Size protection
    pub size_protect: bool,
}

/// 세로 위치의 기준 / Vertical position reference
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VertRelTo {
    Paper,
    Page,
    Para,
}

/// 가로 위치의 기준 / Horizontal position reference
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HorzRelTo {
    Page,
    Column,
    Para,
}

/// 오브젝트 폭의 기준 / Object width reference
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectWidthStandard {
    Paper,
    Page,
    Column,
    Para,
    Absolute,
}

/// 오브젝트 높이의 기준 / Object height reference
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectHeightStandard {
    Paper,
    Page,
    Absolute,
}

/// 오브젝트 텍스트 옵션 / Object text option
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectTextOption {
    Square,
    Tight,
    Through,
    TopAndBottom,
    BehindText,
    InFrontOfText,
}

/// 오브젝트 텍스트 위치 옵션 / Object text position option
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectTextPositionOption {
    BothSides,
    LeftOnly,
    RightOnly,
    LargestOnly,
}

/// 오브젝트 카테고리 / Object category
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectCategory {
    None,
    Figure,
    Table,
    Equation,
}

/// 오브젝트의 바깥 4방향 여백 / Object outer margins (4 directions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Margin {
    /// 위쪽 여백 / Top margin
    pub top: HWPUNIT16,
    /// 오른쪽 여백 / Right margin
    pub right: HWPUNIT16,
    /// 아래쪽 여백 / Bottom margin
    pub bottom: HWPUNIT16,
    /// 왼쪽 여백 / Left margin
    pub left: HWPUNIT16,
}

/// 쪽 번호 위치 속성 (표 148) / Page number position attributes (Table 148)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageNumberPositionFlags {
    /// 번호 모양 (bit 0-7, 표 143 참조) / Number shape (bit 0-7, see Table 143)
    pub shape: u8,
    /// 번호의 표시 위치 (bit 8-11) / Number display position (bit 8-11)
    pub position: PageNumberPosition,
}

/// 쪽 번호의 표시 위치 / Page number display position
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageNumberPosition {
    /// 쪽 번호 없음 / No page number
    None,
    /// 왼쪽 위 / Top left
    TopLeft,
    /// 가운데 위 / Top center
    TopCenter,
    /// 오른쪽 위 / Top right
    TopRight,
    /// 왼쪽 아래 / Bottom left
    BottomLeft,
    /// 가운데 아래 / Bottom center
    BottomCenter,
    /// 오른쪽 아래 / Bottom right
    BottomRight,
    /// 바깥쪽 위 / Outside top
    OutsideTop,
    /// 바깥쪽 아래 / Outside bottom
    OutsideBottom,
    /// 안쪽 위 / Inside top
    InsideTop,
    /// 안쪽 아래 / Inside bottom
    InsideBottom,
}

impl CtrlHeader {
    /// CtrlHeader를 바이트 배열에서 파싱합니다. / Parse CtrlHeader from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 4바이트의 데이터 / At least 4 bytes of data
    ///
    /// # Returns
    /// 파싱된 CtrlHeader 구조체 / Parsed CtrlHeader structure
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        if data.len() < 4 {
            return Err(format!(
                "CtrlHeader must be at least 4 bytes, got {} bytes",
                data.len()
            ));
        }

        // UINT32 컨트롤 ID / UINT32 control ID
        let ctrl_id_value = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // 컨트롤 ID를 ASCII 문자열로 변환 (4바이트) / Convert control ID to ASCII string (4 bytes)
        // pyhwp처럼 바이트를 리버스해서 읽음 / Read bytes in reverse order like pyhwp
        // pyhwp: chr(bytes[3]) + chr(bytes[2]) + chr(bytes[1]) + chr(bytes[0])
        let ctrl_id_bytes = [data[3], data[2], data[1], data[0]];
        // 공백까지 포함해서 파싱 (trim_end 제거) / Parse including spaces (remove trim_end)
        let ctrl_id = String::from_utf8_lossy(&ctrl_id_bytes)
            .trim_end_matches('\0')
            .to_string();

        // 나머지 데이터 파싱 / Parse remaining data
        let remaining_data = if data.len() > 4 { &data[4..] } else { &[] };

        // 컨트롤 ID에 따라 다른 구조로 파싱 / Parse different structure based on CtrlID
        // 공백까지 포함해서 분기 처리 / Branch based on CtrlID including spaces
        // pyhwp: CHID.TBL = 'tbl ', CHID.GSO = 'gso '
        // 컨트롤 ID 상수 사용 / Use control ID constants
        let ctrl_id_str = ctrl_id.as_str();
        let parsed_data = if ctrl_id_str == CtrlId::TABLE || ctrl_id_str == CtrlId::SHAPE_OBJECT {
            // 개체 공통 속성 (표 69) / Object common properties (Table 69)
            parse_object_common(remaining_data)?
        } else if ctrl_id_str == CtrlId::COLUMN_DEF {
            CtrlHeaderData::ColumnDefinition
        } else if ctrl_id_str == CtrlId::HEADER_FOOTER || ctrl_id_str == CtrlId::FOOTNOTE {
            CtrlHeaderData::HeaderFooter
        } else if ctrl_id_str == CtrlId::PAGE_NUMBER || ctrl_id_str == CtrlId::PAGE_NUMBER_POS {
            // 쪽 번호 위치 (표 147) / Page number position (Table 147)
            parse_page_number_position(remaining_data)?
        } else if ctrl_id_str == CtrlId::FIELD_START {
            // 필드 시작 (표 152) / Field start (Table 152)
            parse_field(remaining_data)?
        } else if ctrl_id_str == CtrlId::SECTION_DEF {
            // 구역 정의 (표 129) / Section definition (Table 129)
            parse_section_definition(remaining_data)?
        } else if ctrl_id_str == CtrlId::AUTO_NUMBER {
            // 자동번호 (표 142) / Auto number (Table 142)
            parse_auto_number(remaining_data)?
        } else if ctrl_id_str == CtrlId::NEW_NUMBER {
            // 새 번호 지정 (표 144) / New number specification (Table 144)
            parse_new_number(remaining_data)?
        } else if ctrl_id_str == CtrlId::HIDE {
            // 감추기 (표 145) / Hide (Table 145)
            parse_hide(remaining_data)?
        } else if ctrl_id_str == CtrlId::PAGE_ADJUST {
            // 홀/짝수 조정 (표 146) / Page adjustment (Table 146)
            parse_page_adjust(remaining_data)?
        } else if ctrl_id_str == CtrlId::BOOKMARK_MARKER {
            // 찾아보기 표식 (표 149) / Bookmark marker (Table 149)
            parse_bookmark_marker(remaining_data)?
        } else if ctrl_id_str == CtrlId::OVERLAP {
            // 글자 겹침 (표 150) / Character overlap (Table 150)
            parse_overlap(remaining_data)?
        } else if ctrl_id_str == CtrlId::COMMENT {
            // 덧말 (표 151) / Comment (Table 151)
            parse_comment(remaining_data)?
        } else if ctrl_id_str == CtrlId::HIDDEN_DESC {
            // 숨은 설명 / Hidden description
            CtrlHeaderData::HiddenDescription
        } else {
            // 표 127, 128의 다른 컨트롤 ID들 (현재는 Other로 처리) / Other control IDs from Table 127, 128 (currently handled as Other)
            CtrlHeaderData::Other
        };

        Ok(CtrlHeader {
            ctrl_id,
            ctrl_id_value,
            data: parsed_data,
        })
    }
}

/// 필드 파싱 (표 152) / Parse field (Table 152)
fn parse_field(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 15바이트 필요 (ctrl ID + attribute + other_attr + command_len + id)
    // Need at least 15 bytes (ctrl ID + attribute + other_attr + command_len + id)
    if data.len() < 15 {
        return Err(format!(
            "Field data must be at least 15 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 ctrl ID (4 bytes) - 표 128의 필드 컨트롤 ID / Field control ID from Table 128
    // 바이트를 리버스해서 읽음 / Read bytes in reverse order
    let field_type_bytes = [
        data[offset + 3],
        data[offset + 2],
        data[offset + 1],
        data[offset],
    ];
    let field_type = String::from_utf8_lossy(&field_type_bytes)
        .trim_end_matches('\0')
        .to_string();
    offset += 4;

    // UINT 속성 (4 bytes) - 표 153 참조 / Attribute (4 bytes) - see Table 153
    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // BYTE 기타 속성 (1 byte) / Other attributes (1 byte)
    let other_attr = UINT8::from_le_bytes([data[offset]]);
    offset += 1;

    // WORD command 길이 (2 bytes) / Command length (2 bytes)
    let command_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    // WCHAR array[len] command (2×len bytes) / Command (2×len bytes)
    let command = if command_len > 0 && offset + (command_len * 2) <= data.len() {
        let command_bytes = &data[offset..offset + (command_len * 2)];
        decode_utf16le(command_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += command_len * 2;

    // UINT32 id (4 bytes) - 문서 내 고유 아이디 / Unique ID in document
    let id = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };

    Ok(CtrlHeaderData::Field {
        field_type,
        attribute,
        other_attr,
        command_len: command_len as UINT16,
        command,
        id,
    })
}

/// 개체 공통 속성 파싱 (표 69) / Parse object common properties (Table 69)
fn parse_object_common(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 표 69 구조 분석:
    // 컨트롤 ID 제외 후: attribute(4) + offset_y(4) + offset_x(4) + width(4) + height(4) + z_order(4) + margin(8) + instance_id(4) + page_divide(4) = 40바이트
    // description_len(2) + description(2×len) = 추가 바이트
    // 따라서 40바이트는 유효한 크기 (page_divide까지, description 없음)
    // Table 69 structure analysis:
    // After excluding control ID: attribute(4) + offset_y(4) + offset_x(4) + width(4) + height(4) + z_order(4) + margin(8) + instance_id(4) + page_divide(4) = 40 bytes
    // description_len(2) + description(2×len) = additional bytes
    // Therefore, 40 bytes is a valid size (up to page_divide, without description)
    if data.len() < 40 {
        return Err(format!(
            "Object common properties must be at least 40 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 속성 (표 70 참조) / UINT32 attribute (see Table 70)
    let attribute_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // SHWPUNIT 세로 오프셋 값 / SHWPUNIT vertical offset value
    // 주의: 스펙 문서(표 69)에서는 HWPUNIT (unsigned)로 명시되어 있지만, 실제 파일에서는 SHWPUNIT (signed)로 파싱해야 합니다.
    // Note: Spec (Table 69) specifies HWPUNIT (unsigned), but actual files require SHWPUNIT (signed) parsing.
    // 참고: pyhwp는 DIFFSPEC으로 표시하고 SHWPUNIT을 사용합니다.
    // Reference: pyhwp marks this as DIFFSPEC and uses SHWPUNIT.
    let offset_y = SHWPUNIT::from(INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    // SHWPUNIT 가로 오프셋 값 / SHWPUNIT horizontal offset value
    // 주의: 스펙 문서(표 69)에서는 HWPUNIT (unsigned)로 명시되어 있지만, 실제 파일에서는 SHWPUNIT (signed)로 파싱해야 합니다.
    // Note: Spec (Table 69) specifies HWPUNIT (unsigned), but actual files require SHWPUNIT (signed) parsing.
    // 참고: pyhwp는 DIFFSPEC으로 표시하고 SHWPUNIT을 사용합니다.
    // Reference: pyhwp marks this as DIFFSPEC and uses SHWPUNIT.
    let offset_x = SHWPUNIT::from(INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    // HWPUNIT width 오브젝트의 폭 / HWPUNIT object width
    let width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    // HWPUNIT height 오브젝트의 높이 / HWPUNIT object height
    let height = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    // INT32 z-order / INT32 z-order
    let z_order = INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // HWPUNIT16 array[4] 오브젝트의 바깥 4방향 여백 / HWPUNIT16 array[4] object outer margins
    let margin_bottom = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_left = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_right = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_top = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    // UINT32 문서 내 각 개체에 대한 고유 아이디 / UINT32 unique ID for each object in document
    let instance_id = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // INT32 쪽나눔 방지 on(1) / off(0) / INT32 page break prevention on(1) / off(0)
    let page_divide = INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // WORD 개체 설명문 글자 길이(len) / WORD object description text length
    // 데이터가 부족할 수 있으므로 안전하게 처리 / Handle safely as data may be insufficient
    let description = if offset + 2 <= data.len() {
        let description_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;

        // WCHAR array[len] 개체 설명문 글자 / WCHAR array[len] object description text
        if description_len > 0 && offset + (description_len * 2) <= data.len() {
            let description_bytes = &data[offset..offset + (description_len * 2)];
            match decode_utf16le(description_bytes) {
                Ok(text) if !text.is_empty() => Some(text),
                _ => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    // 속성 파싱 (표 70) / Parse attribute (Table 70)
    let attribute = parse_object_attribute(attribute_value);

    Ok(CtrlHeaderData::ObjectCommon {
        attribute,
        offset_y,
        offset_x,
        width,
        height,
        z_order,
        margin: Margin {
            top: margin_top,
            right: margin_right,
            bottom: margin_bottom,
            left: margin_left,
        },
        instance_id,
        page_divide,
        description,
    })
}

/// 쪽 번호 위치 파싱 (표 147) / Parse page number position (Table 147)
fn parse_page_number_position(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 12바이트 필요 / Need at least 12 bytes
    if data.len() < 12 {
        return Err(format!(
            "PageNumberPosition must be at least 12 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 속성 (표 148) / UINT32 attribute (Table 148)
    let flags_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // bit 0-7: 번호 모양 / bit 0-7: number shape
    let shape = (flags_value & 0xFF) as u8;

    // bit 8-11: 번호의 표시 위치 / bit 8-11: number display position
    let position = match (flags_value >> 8) & 0x0F {
        0 => PageNumberPosition::None,
        1 => PageNumberPosition::TopLeft,
        2 => PageNumberPosition::TopCenter,
        3 => PageNumberPosition::TopRight,
        4 => PageNumberPosition::BottomLeft,
        5 => PageNumberPosition::BottomCenter,
        6 => PageNumberPosition::BottomRight,
        7 => PageNumberPosition::OutsideTop,
        8 => PageNumberPosition::OutsideBottom,
        9 => PageNumberPosition::InsideTop,
        10 => PageNumberPosition::InsideBottom,
        _ => PageNumberPosition::None,
    };

    let flags = PageNumberPositionFlags { shape, position };

    // WCHAR 사용자 기호 / WCHAR user symbol
    let user_symbol = decode_utf16le(&data[offset..offset + 2])?;
    offset += 2;

    // WCHAR 앞 장식 문자 / WCHAR prefix decoration character
    let prefix = decode_utf16le(&data[offset..offset + 2])?;
    offset += 2;

    // WCHAR 뒤 장식 문자 / WCHAR suffix decoration character
    let suffix = decode_utf16le(&data[offset..offset + 2])?;
    offset += 2;

    // WCHAR 항상 "-" / WCHAR always "-"
    // 읽지만 사용하지 않음 / Read but not used

    Ok(CtrlHeaderData::PageNumberPosition {
        flags,
        user_symbol,
        prefix,
        suffix,
    })
}

/// 개체 속성 파싱 (표 70) / Parse object attribute (Table 70)
fn parse_object_attribute(value: UINT32) -> ObjectAttribute {
    // bit 0: 글자처럼 취급 여부 / bit 0: treat as character
    let like_letters = (value & 0x01) != 0;

    // bit 2: 줄 간격에 영향을 줄지 여부 / bit 2: affect line spacing
    let affect_line_spacing = (value & 0x04) != 0;

    // bit 3-4: 세로 위치의 기준 (VertRelTo) / bit 3-4: vertical position reference
    let vert_rel_to = match (value >> 3) & 0x03 {
        0 => VertRelTo::Paper,
        1 => VertRelTo::Page,
        2 => VertRelTo::Para,
        _ => VertRelTo::Para,
    };

    // bit 5-7: 세로 위치의 기준에 대한 상대적인 배열 방식 / bit 5-7: vertical alignment relative to reference
    let vert_relative = ((value >> 5) & 0x07) as UINT8;

    // bit 8-9: 가로 위치의 기준 (HorzRelTo) / bit 8-9: horizontal position reference
    let horz_rel_to = match (value >> 8) & 0x03 {
        0 | 1 => HorzRelTo::Page,
        2 => HorzRelTo::Column,
        3 => HorzRelTo::Para,
        _ => HorzRelTo::Page,
    };

    // bit 10-12: HorzRelTo에 대한 상대적인 배열 방식 / bit 10-12: horizontal alignment relative to reference
    let horz_relative = ((value >> 10) & 0x07) as UINT8;

    // bit 13: VertRelTo이 'para'일 때 오브젝트의 세로 위치를 본문 영역으로 제한할지 여부 / bit 13: limit vertical position to body area when VertRelTo is 'para'
    let vert_rel_to_para_limit = (value & 0x2000) != 0;

    // bit 14: 다른 오브젝트와 겹치는 것을 허용할지 여부 / bit 14: allow overlap with other objects
    let overlap = (value & 0x4000) != 0;

    // bit 15-17: 오브젝트 폭의 기준 / bit 15-17: object width reference
    let object_width_standard = match (value >> 15) & 0x07 {
        0 => ObjectWidthStandard::Paper,
        1 => ObjectWidthStandard::Page,
        2 => ObjectWidthStandard::Column,
        3 => ObjectWidthStandard::Para,
        4 => ObjectWidthStandard::Absolute,
        _ => ObjectWidthStandard::Absolute,
    };

    // bit 18-19: 오브젝트 높이의 기준 / bit 18-19: object height reference
    let object_height_standard = match (value >> 18) & 0x03 {
        0 => ObjectHeightStandard::Paper,
        1 => ObjectHeightStandard::Page,
        2 => ObjectHeightStandard::Absolute,
        _ => ObjectHeightStandard::Absolute,
    };

    // bit 21-23: 오브젝트 텍스트 옵션 / bit 21-23: object text option
    let object_text_option = match (value >> 21) & 0x07 {
        0 => ObjectTextOption::Square,
        1 => ObjectTextOption::Tight,
        2 => ObjectTextOption::Through,
        3 => ObjectTextOption::TopAndBottom,
        4 => ObjectTextOption::BehindText,
        5 => ObjectTextOption::InFrontOfText,
        _ => ObjectTextOption::Square,
    };

    // bit 24-25: 오브젝트 텍스트 위치 옵션 / bit 24-25: object text position option
    let object_text_position_option = match (value >> 24) & 0x03 {
        0 => ObjectTextPositionOption::BothSides,
        1 => ObjectTextPositionOption::LeftOnly,
        2 => ObjectTextPositionOption::RightOnly,
        3 => ObjectTextPositionOption::LargestOnly,
        _ => ObjectTextPositionOption::BothSides,
    };

    // bit 26-28: 오브젝트 카테고리 / bit 26-28: object category
    let object_category = match (value >> 26) & 0x07 {
        0 => ObjectCategory::None,
        1 => ObjectCategory::Figure,
        2 => ObjectCategory::Table,
        3 => ObjectCategory::Equation,
        _ => ObjectCategory::None,
    };

    // bit 20: 크기 보호 / bit 20: size protection
    let size_protect = (value & 0x100000) != 0;

    ObjectAttribute {
        like_letters,
        affect_line_spacing,
        vert_rel_to,
        vert_relative,
        horz_rel_to,
        horz_relative,
        vert_rel_to_para_limit,
        overlap,
        object_width_standard,
        object_height_standard,
        object_text_option,
        object_text_position_option,
        object_category,
        size_protect,
    }
}

/// 구역 정의 파싱 (표 129) / Parse section definition (Table 129)
fn parse_section_definition(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 24바이트 필요 (기본 필드만) / Need at least 24 bytes (basic fields only)
    // 실제 파일에서는 하위 레코드가 별도로 저장되므로 기본 필드만 파싱 / In actual files, sub-records are stored separately, so only parse basic fields
    if data.len() < 24 {
        return Err(format!(
            "Section definition must be at least 24 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 속성 (표 130 참조) / UINT32 attribute (see Table 130)
    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // HWPUNIT16 동일한 페이지에서 서로 다른 단 사이의 간격 / Column spacing
    let column_spacing = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // HWPUNIT16 세로로 줄맞춤 / Vertical alignment
    let vertical_alignment = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // HWPUNIT16 가로로 줄맞춤 / Horizontal alignment
    let horizontal_alignment = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // HWPUNIT 기본 팁 간격 / Default tip spacing
    let default_tip_spacing = if offset + 4 <= data.len() {
        HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]))
    } else {
        HWPUNIT::from(0)
    };
    offset += 4;

    // UINT16 번호 문단 모양 ID / Number paragraph shape ID
    let number_para_shape_id = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // UINT16 쪽 번호 / Page number
    let page_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // UINT16 array[3] 그림, 표, 수식 번호 / Figure, table, equation numbers
    let figure_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;
    let table_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;
    let equation_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    // UINT16 대표Language / Representative Language
    let language = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    // 나머지 하위 레코드는 별도 레코드로 저장되므로 여기서는 파싱하지 않음 / Remaining sub-records are stored as separate records, so not parsed here

    Ok(CtrlHeaderData::SectionDefinition {
        attribute,
        column_spacing,
        vertical_alignment,
        horizontal_alignment,
        default_tip_spacing,
        number_para_shape_id,
        page_number,
        figure_number,
        table_number,
        equation_number,
        language,
    })
}

/// 자동번호 파싱 (표 142) / Parse auto number (Table 142)
fn parse_auto_number(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 12바이트 필요 / Need at least 12 bytes
    if data.len() < 12 {
        return Err(format!(
            "Auto number must be at least 12 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 속성 (표 143 참조) / UINT32 attribute (see Table 143)
    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // UINT16 번호 / Number
    let number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    // WCHAR 사용자 기호 / User symbol
    let user_symbol = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();
    offset += 2;

    // WCHAR 앞 장식 문자 / Prefix decoration character
    let prefix = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();
    offset += 2;

    // WCHAR 뒤 장식 문자 / Suffix decoration character
    let suffix = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();
    offset += 2;

    Ok(CtrlHeaderData::AutoNumber {
        attribute,
        number,
        user_symbol,
        prefix,
        suffix,
    })
}

/// 새 번호 지정 파싱 (표 144) / Parse new number specification (Table 144)
fn parse_new_number(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 8바이트 필요 / Need at least 8 bytes
    if data.len() < 8 {
        return Err(format!(
            "New number must be at least 8 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 속성 (bit 0-3: 번호 종류, 표 143 참조) / Attribute (bit 0-3: number type, see Table 143)
    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    // UINT16 번호 / Number
    let number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    Ok(CtrlHeaderData::NewNumber { attribute, number })
}

/// 감추기 파싱 (표 145) / Parse hide (Table 145)
fn parse_hide(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 2바이트 필요 / Need at least 2 bytes
    if data.len() < 2 {
        return Err(format!(
            "Hide must be at least 2 bytes, got {} bytes",
            data.len()
        ));
    }

    // UINT 속성 (감출 대상) / Attribute (hide target)
    let attribute = UINT16::from_le_bytes([data[0], data[1]]);

    Ok(CtrlHeaderData::Hide { attribute })
}

/// 홀/짝수 조정 파싱 (표 146) / Parse page adjustment (Table 146)
fn parse_page_adjust(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 4바이트 필요 / Need at least 4 bytes
    if data.len() < 4 {
        return Err(format!(
            "Page adjust must be at least 4 bytes, got {} bytes",
            data.len()
        ));
    }

    // UINT32 속성 (bit 0-1: 홀/짝수 구분) / Attribute (bit 0-1: odd/even page distinction)
    let attribute = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);

    Ok(CtrlHeaderData::PageAdjust { attribute })
}

/// 찾아보기 표식 파싱 (표 149) / Parse bookmark marker (Table 149)
fn parse_bookmark_marker(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 6바이트 필요 (키워드 길이 2개 + dummy) / Need at least 6 bytes (2 keyword lengths + dummy)
    if data.len() < 6 {
        return Err(format!(
            "Bookmark marker must be at least 6 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // WORD 키워드 길이(len1) / Keyword length (len1)
    let keyword1_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    // WCHAR array[len1] 첫 번째 키워드 / First keyword
    let keyword1 = if keyword1_len > 0 && offset + (keyword1_len * 2) <= data.len() {
        let keyword1_bytes = &data[offset..offset + (keyword1_len * 2)];
        decode_utf16le(keyword1_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += keyword1_len * 2;

    // WORD 키워드 길이(len2) / Keyword length (len2)
    let keyword2_len = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize
    } else {
        0
    };
    offset += 2;

    // WCHAR array[len2] 두 번째 키워드 / Second keyword
    let keyword2 = if keyword2_len > 0 && offset + (keyword2_len * 2) <= data.len() {
        let keyword2_bytes = &data[offset..offset + (keyword2_len * 2)];
        decode_utf16le(keyword2_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    // dummy는 읽지 않음 / Don't read dummy

    Ok(CtrlHeaderData::BookmarkMarker { keyword1, keyword2 })
}

/// 글자 겹침 파싱 (표 150) / Parse character overlap (Table 150)
fn parse_overlap(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 10바이트 필요 / Need at least 10 bytes
    if data.len() < 10 {
        return Err(format!(
            "Overlap must be at least 10 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // UINT32 ctrl ID / Control ID
    // 바이트를 리버스해서 읽음 / Read bytes in reverse order
    let ctrl_id_bytes = [
        data[offset + 3],
        data[offset + 2],
        data[offset + 1],
        data[offset],
    ];
    let ctrl_id = String::from_utf8_lossy(&ctrl_id_bytes)
        .trim_end_matches('\0')
        .to_string();
    offset += 4;

    // WORD 겹칠 글자 길이(len) / Overlapping text length (len)
    let text_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    // WCHAR array[len] 겹칠 글자 / Overlapping text
    let text = if text_len > 0 && offset + (text_len * 2) <= data.len() {
        let text_bytes = &data[offset..offset + (text_len * 2)];
        decode_utf16le(text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += text_len * 2;

    // UINT8 테두리 타입 / Border type
    let border_type = if offset < data.len() {
        UINT8::from_le_bytes([data[offset]])
    } else {
        0
    };
    offset += 1;

    // INT8 내부 글자 크기 / Internal text size
    let internal_text_size = if offset < data.len() {
        INT8::from_le_bytes([data[offset]])
    } else {
        0
    };
    offset += 1;

    // UINT8 테두리 내부 글자 펼침 / Border internal text spread
    let border_internal_text_spread = if offset < data.len() {
        UINT8::from_le_bytes([data[offset]])
    } else {
        0
    };
    offset += 1;

    // UINT8 테두리 내부 글자 속성 아이디의 수 (cnt) / Count of border internal text attribute IDs (cnt)
    let cnt = if offset < data.len() {
        UINT8::from_le_bytes([data[offset]]) as usize
    } else {
        0
    };
    offset += 1;

    // UINT array[cnt] 테두리 내부 글자의 charshapeid 의 배열 / Array of charshapeid for border internal text
    let mut char_shape_ids = Vec::new();
    if cnt > 0 && offset + (cnt * 4) <= data.len() {
        for _ in 0..cnt {
            let id = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            char_shape_ids.push(id);
            offset += 4;
        }
    }

    Ok(CtrlHeaderData::Overlap {
        ctrl_id,
        text,
        border_type,
        internal_text_size,
        border_internal_text_spread,
        char_shape_ids,
    })
}

/// 덧말 파싱 (표 151) / Parse comment (Table 151)
fn parse_comment(data: &[u8]) -> Result<CtrlHeaderData, String> {
    // 최소 18바이트 필요 / Need at least 18 bytes
    if data.len() < 18 {
        return Err(format!(
            "Comment must be at least 18 bytes, got {} bytes",
            data.len()
        ));
    }

    let mut offset = 0;

    // WORD main Text 길이 / Main text length
    let main_text_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    // WCHAR main Text / Main text
    let main_text = if main_text_len > 0 && offset + (main_text_len * 2) <= data.len() {
        let main_text_bytes = &data[offset..offset + (main_text_len * 2)];
        decode_utf16le(main_text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += main_text_len.max(1) * 2; // 최소 1 WCHAR / At least 1 WCHAR

    // WORD sub Text 길이 / Sub text length
    let sub_text_len = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize
    } else {
        0
    };
    offset += 2;

    // WCHAR sub Text / Sub text
    let sub_text = if sub_text_len > 0 && offset + (sub_text_len * 2) <= data.len() {
        let sub_text_bytes = &data[offset..offset + (sub_text_len * 2)];
        decode_utf16le(sub_text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += sub_text_len.max(1) * 2; // 최소 1 WCHAR / At least 1 WCHAR

    // UINT 댓말의 위치 / Comment position
    let position = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };
    offset += 4;

    // UINT Fsizeratio / Font size ratio
    let fsize_ratio = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };
    offset += 4;

    // UINT Option / Option
    let option = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };
    offset += 4;

    // UINT Style number / Style number
    let style_number = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };
    offset += 4;

    // UINT 정렬 기준 / Alignment
    let alignment = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };

    Ok(CtrlHeaderData::Comment {
        main_text,
        sub_text,
        position,
        fsize_ratio,
        option,
        style_number,
        alignment,
    })
}
