/// CtrlHeader 구조체 / CtrlHeader structure
///
/// 스펙 문서 매핑: 표 64 - 컨트롤 헤더 / Spec mapping: Table 64 - Control header
use crate::types::{decode_utf16le, HWPUNIT, HWPUNIT16, INT32, UINT16, UINT32, UINT8};
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
    pub const SECTION_DEF: &str = "secd";
    /// 단 정의 / Column definition
    pub const COLUMN_DEF: &str = "cold";
    /// 머리말/꼬리말 / Header/Footer
    pub const HEADER_FOOTER: &str = "head";
    /// 각주/미주 / Footnote/Endnote
    pub const FOOTNOTE: &str = "foot";
    /// 자동번호 / Auto numbering
    pub const AUTO_NUMBER: &str = "autn";
    /// 새 번호 지정 / New number specification
    pub const NEW_NUMBER: &str = "newn";
    /// 감추기 / Hide
    pub const HIDE: &str = "pghd";
    /// 홀/짝수 조정 / Odd/Even page adjustment
    pub const PAGE_ADJUST: &str = "pgad";
    /// 쪽 번호 위치 / Page number position
    pub const PAGE_NUMBER: &str = "pgno";
    /// 쪽 번호 위치 (pgnp) / Page number position (pgnp)
    /// 실제 파일에서는 'pgnp'로 저장되는 경우가 있음 / Some files store this as 'pgnp'
    pub const PAGE_NUMBER_POS: &str = "pgnp";
    /// 찾아보기 표식 / Bookmark marker
    pub const BOOKMARK_MARKER: &str = "bkmk";
    /// 글자 겹침 / Character overlap
    pub const OVERLAP: &str = "over";
    /// 덧말 / Comment
    pub const COMMENT: &str = "cmtt";
    /// 숨은 설명 / Hidden description
    pub const HIDDEN_DESC: &str = "hide";
    /// 필드 시작 / Field start
    pub const FIELD_START: &str = "%%%%";

    // 표 128: 필드 컨트롤 ID / Table 128: Field Control IDs
    /// 필드: 알 수 없음 / Field: Unknown
    pub const FIELD_UNKNOWN: &str = "%unk";
    /// 필드: 날짜 / Field: Date
    pub const FIELD_DATE: &str = "%dte";
    /// 필드: 문서 날짜 / Field: Document date
    pub const FIELD_DOC_DATE: &str = "%ddt";
    /// 필드: 경로 / Field: Path
    pub const FIELD_PATH: &str = "%pat";
    /// 필드: 책갈피 / Field: Bookmark
    pub const FIELD_BOOKMARK: &str = "%bkm";
    /// 필드: 메일 머지 / Field: Mail merge
    pub const FIELD_MAILMERGE: &str = "%mmg";
    /// 필드: 상호 참조 / Field: Cross reference
    pub const FIELD_CROSSREF: &str = "%crf";
    /// 필드: 수식 / Field: Formula
    pub const FIELD_FORMULA: &str = "%fml";
    /// 필드: 하이퍼링크 / Field: Hyperlink
    pub const FIELD_HYPERLINK: &str = "%hlk";
    /// 필드: 변경 추적 서명 / Field: Revision sign
    pub const FIELD_REVISION_SIGN: &str = "%%sg";
    /// 필드: 변경 추적 삭제 / Field: Revision delete
    pub const FIELD_REVISION_DELETE: &str = "%%de";
    /// 필드: 변경 추적 삽입 / Field: Revision insert
    pub const FIELD_REVISION_INSERT: &str = "%%in";
    /// 필드: 변경 추적 변경 / Field: Revision change
    pub const FIELD_REVISION_CHANGE: &str = "%%ch";
    /// 필드: 변경 추적 첨부 / Field: Revision attach
    pub const FIELD_REVISION_ATTACH: &str = "%%at";
    /// 필드: 변경 추적 하이퍼링크 / Field: Revision hyperlink
    pub const FIELD_REVISION_HYPERLINK: &str = "%%h";
    /// 필드: 변경 추적 줄 첨부 / Field: Revision line attach
    pub const FIELD_REVISION_LINE_ATTACH: &str = "%%A";
    /// 필드: 변경 추적 줄 링크 / Field: Revision line link
    pub const FIELD_REVISION_LINE_LINK: &str = "%%l";
    /// 필드: 변경 추적 줄 전송 / Field: Revision line transfer
    pub const FIELD_REVISION_LINE_TRANSFER: &str = "%%t";
    /// 필드: 메모 / Field: Memo
    pub const FIELD_MEMO: &str = "%%me";
    /// 필드: 개인정보 보안 / Field: Private info security
    pub const FIELD_PRIVATE_INFO_SECURITY: &str = "%cpr";
    /// 필드: 목차 / Field: Table of contents
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
        offset_y: HWPUNIT,
        /// 가로 오프셋 값 / Horizontal offset value
        offset_x: HWPUNIT,
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

    // HWPUNIT 세로 오프셋 값 / HWPUNIT vertical offset value
    let offset_y = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    // HWPUNIT 가로 오프셋 값 / HWPUNIT horizontal offset value
    let offset_x = HWPUNIT::from(UINT32::from_le_bytes([
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
    // offset += 2; // 읽지만 사용하지 않음 / Read but not used

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
