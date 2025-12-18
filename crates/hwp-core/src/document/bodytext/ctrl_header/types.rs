use crate::types::{HWPUNIT, HWPUNIT16, INT32, INT8, SHWPUNIT, UINT16, UINT32, UINT8};
use serde::{Deserialize, Serialize};

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

/// 캡션 정렬 (표 73) / Caption alignment (Table 73)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptionAlign {
    Left = 0,
    Right = 1,
    Top = 2,
    Bottom = 3,
}

/// 캡션 수직 정렬 (ListHeaderProperty bit 5-6) / Caption vertical alignment (ListHeaderProperty bit 5-6)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptionVAlign {
    Top = 0,
    Middle = 1,
    Bottom = 2,
}

/// 캡션 정보 (표 72) / Caption information (Table 72)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Caption {
    pub align: CaptionAlign,
    pub include_margin: bool,
    pub width: HWPUNIT,
    pub gap: HWPUNIT16,
    pub last_width: HWPUNIT,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<CaptionVAlign>,
}

/// 컨트롤 헤더 데이터 (컨트롤 ID별 구조) / Control header data (structure varies by CtrlID)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "data_type", rename_all = "snake_case")]
pub enum CtrlHeaderData {
    ObjectCommon {
        attribute: ObjectAttribute,
        offset_y: SHWPUNIT,
        offset_x: SHWPUNIT,
        width: HWPUNIT,
        height: HWPUNIT,
        z_order: INT32,
        margin: Margin,
        instance_id: UINT32,
        page_divide: INT32,
        description: Option<String>,
        caption: Option<Caption>,
    },
    ColumnDefinition {
        attribute: ColumnDefinitionAttribute,
        column_spacing: HWPUNIT16,
        column_widths: Vec<HWPUNIT16>,
        attribute_high: UINT16,
        divider_line_type: UINT8,
        divider_line_thickness: UINT8,
        divider_line_color: UINT32,
    },
    FootnoteEndnote {
        number: UINT8,
        reserved: [UINT8; 5],
        attribute: UINT8,
        reserved2: UINT8,
    },
    HeaderFooter {
        attribute: HeaderFooterAttribute,
        text_width: HWPUNIT,
        text_height: HWPUNIT,
        text_ref: UINT8,
        number_ref: UINT8,
    },
    PageNumberPosition {
        flags: PageNumberPositionFlags,
        user_symbol: String,
        prefix: String,
        suffix: String,
    },
    Field {
        field_type: String,
        attribute: UINT32,
        other_attr: UINT8,
        command_len: UINT16,
        command: String,
        id: UINT32,
    },
    SectionDefinition {
        attribute: UINT32,
        column_spacing: HWPUNIT16,
        vertical_alignment: HWPUNIT16,
        horizontal_alignment: HWPUNIT16,
        default_tip_spacing: HWPUNIT,
        number_para_shape_id: UINT16,
        page_number: UINT16,
        figure_number: UINT16,
        table_number: UINT16,
        equation_number: UINT16,
        language: UINT16,
    },
    AutoNumber {
        attribute: UINT32,
        number: UINT16,
        user_symbol: String,
        prefix: String,
        suffix: String,
    },
    NewNumber {
        attribute: UINT32,
        number: UINT16,
    },
    Hide {
        attribute: UINT16,
    },
    PageAdjust {
        attribute: UINT32,
    },
    BookmarkMarker {
        keyword1: String,
        keyword2: String,
    },
    Overlap {
        ctrl_id: String,
        text: String,
        border_type: UINT8,
        internal_text_size: INT8,
        border_internal_text_spread: UINT8,
        char_shape_ids: Vec<UINT32>,
    },
    Comment {
        main_text: String,
        sub_text: String,
        position: UINT32,
        fsize_ratio: UINT32,
        option: UINT32,
        style_number: UINT32,
        alignment: UINT32,
    },
    HiddenDescription,
    Other,
}

/// 개체 속성 / Object attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectAttribute {
    pub like_letters: bool,
    pub affect_line_spacing: bool,
    pub vert_rel_to: VertRelTo,
    pub vert_relative: UINT8,
    pub horz_rel_to: HorzRelTo,
    pub horz_relative: UINT8,
    pub vert_rel_to_para_limit: bool,
    pub overlap: bool,
    pub object_width_standard: ObjectWidthStandard,
    pub object_height_standard: ObjectHeightStandard,
    pub object_text_option: ObjectTextOption,
    pub object_text_position_option: ObjectTextPositionOption,
    pub object_category: ObjectCategory,
    pub size_protect: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VertRelTo {
    Paper,
    Page,
    Para,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HorzRelTo {
    Paper,
    Page,
    Column,
    Para,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectWidthStandard {
    Paper,
    Page,
    Column,
    Para,
    Absolute,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectHeightStandard {
    Paper,
    Page,
    Absolute,
}

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectTextPositionOption {
    BothSides,
    LeftOnly,
    RightOnly,
    LargestOnly,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectCategory {
    None,
    Figure,
    Table,
    Equation,
}

/// 단 정의 속성 (표 139) / Column definition attribute (Table 139)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDefinitionAttribute {
    pub column_type: ColumnType,
    pub column_count: UINT8,
    pub column_direction: ColumnDirection,
    pub equal_width: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnType {
    Normal,
    Distributed,
    Parallel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnDirection {
    Left,
    Right,
    Both,
}

/// 오브젝트의 바깥 4방향 여백 / Object outer margins (4 directions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Margin {
    pub top: HWPUNIT16,
    pub right: HWPUNIT16,
    pub bottom: HWPUNIT16,
    pub left: HWPUNIT16,
}

/// 쪽 번호 위치 속성 (표 148) / Page number position attributes (Table 148)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageNumberPositionFlags {
    pub shape: u8,
    pub position: PageNumberPosition,
}

/// 쪽 번호의 표시 위치 / Page number display position
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageNumberPosition {
    None,
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
    OutsideTop,
    OutsideBottom,
    InsideTop,
    InsideBottom,
}

/// 머리말/꼬리말 속성 (표 141) / Header/Footer attribute (Table 141)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct HeaderFooterAttribute {
    pub apply_page: ApplyPage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyPage {
    Both,
    EvenOnly,
    OddOnly,
}
