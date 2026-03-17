use serde::{Deserialize, Serialize};

use crate::control::Control;
use crate::hints::LineSegmentInfo;
use crate::shape::ShapeObject;
use crate::types::*;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Paragraph {
    pub id: u64,
    pub para_shape_id: u16,
    pub style_id: u16,
    pub page_break: bool,
    pub column_break: bool,
    pub merged: bool,
    pub para_tc_id: Option<String>,
    pub meta_tag: Option<String>,
    pub runs: Vec<Run>,
    /// 줄 세그먼트 정보 (레이아웃 캐시). HWP와 HWPX 양쪽에 존재.
    pub line_segments: Vec<LineSegmentInfo>,
}

/// 동일 글자 모양의 콘텐츠 단위
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Run {
    pub char_shape_id: u16,
    pub contents: Vec<RunContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RunContent {
    Text(TextContent),
    Control(Control),
    Object(ShapeObject),
}

/// `<t>` 요소에 대응. 텍스트와 특수 요소의 혼합.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TextContent {
    /// t 요소 자체의 charPrIDRef (run과 다를 때)
    pub char_shape_id: Option<u16>,
    pub elements: Vec<TextElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TextElement {
    Text(String),
    Tab {
        width: HwpUnit,
        leader: LineType2,
        tab_type: TabType,
    },
    LineBreak,
    Hyphen,
    /// 묶음 빈칸 (줄바꿈 방지)
    NbSpace,
    /// 고정폭 빈칸
    FwSpace,
    MarkpenBegin {
        color: Color,
    },
    MarkpenEnd,
    TitleMark {
        ignore: bool,
    },
    // 변경추적
    InsertBegin {
        id: String,
        tc_id: Option<String>,
        para_end: bool,
    },
    InsertEnd {
        id: String,
        tc_id: Option<String>,
        para_end: bool,
    },
    DeleteBegin {
        id: String,
        tc_id: Option<String>,
        para_end: bool,
    },
    DeleteEnd {
        id: String,
        tc_id: Option<String>,
        para_end: bool,
    },
}

/// 탭 유형 (TextElement::Tab에서 사용)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TabType {
    #[default]
    Left,
    Right,
    Center,
    Decimal,
}

/// 문단 리스트를 담는 재귀 컨테이너 (캡션, 셀, 머리글 등에서 공통 사용)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SubList {
    pub id: u64,
    pub text_direction: TextDirection,
    pub vert_align: VAlign,
    pub link_list_id: Option<u64>,
    pub link_list_next_id: Option<u64>,
    pub text_width: Option<HwpUnit>,
    pub text_height: Option<HwpUnit>,
    pub has_text_ref: bool,
    pub has_num_ref: bool,
    pub paragraphs: Vec<Paragraph>,
}
