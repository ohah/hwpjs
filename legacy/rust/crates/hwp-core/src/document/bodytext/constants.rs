/// BodyText 레코드 태그 상수 정의 / BodyText record tag constants definition
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드 / Spec mapping: Table 57 - BodyText data records
use crate::document::constants::HWPTAG_BEGIN;

/// BodyText 태그 상수 / BodyText tag constants
pub struct HwpTag;

impl HwpTag {
    /// 문단 헤더 / Paragraph header
    pub const PARA_HEADER: u16 = HWPTAG_BEGIN + 50;

    /// 문단의 텍스트 / Paragraph text
    pub const PARA_TEXT: u16 = HWPTAG_BEGIN + 51;

    /// 문단의 글자 모양 / Paragraph character shape
    pub const PARA_CHAR_SHAPE: u16 = HWPTAG_BEGIN + 52;

    /// 문단의 레이아웃 / Paragraph line segment
    pub const PARA_LINE_SEG: u16 = HWPTAG_BEGIN + 53;

    /// 문단의 영역 태그 / Paragraph range tag
    pub const PARA_RANGE_TAG: u16 = HWPTAG_BEGIN + 54;

    /// 컨트롤 헤더 / Control header
    pub const CTRL_HEADER: u16 = HWPTAG_BEGIN + 55;

    /// 문단 리스트 헤더 / Paragraph list header
    pub const LIST_HEADER: u16 = HWPTAG_BEGIN + 56;

    /// 용지 설정 / Page definition
    pub const PAGE_DEF: u16 = HWPTAG_BEGIN + 57;

    /// 각주/미주 모양 / Footnote/endnote shape
    pub const FOOTNOTE_SHAPE: u16 = HWPTAG_BEGIN + 58;

    /// 쪽 테두리/배경 / Page border/fill
    pub const PAGE_BORDER_FILL: u16 = HWPTAG_BEGIN + 59;

    /// 개체 / Shape component
    pub const SHAPE_COMPONENT: u16 = HWPTAG_BEGIN + 60;

    /// 표 개체 / Table object
    pub const TABLE: u16 = HWPTAG_BEGIN + 61;

    /// 직선 개체 / Line shape component
    pub const SHAPE_COMPONENT_LINE: u16 = HWPTAG_BEGIN + 62;

    /// 사각형 개체 / Rectangle shape component
    pub const SHAPE_COMPONENT_RECTANGLE: u16 = HWPTAG_BEGIN + 63;

    /// 타원 개체 / Ellipse shape component
    pub const SHAPE_COMPONENT_ELLIPSE: u16 = HWPTAG_BEGIN + 64;

    /// 호 개체 / Arc shape component
    pub const SHAPE_COMPONENT_ARC: u16 = HWPTAG_BEGIN + 65;

    /// 다각형 개체 / Polygon shape component
    pub const SHAPE_COMPONENT_POLYGON: u16 = HWPTAG_BEGIN + 66;

    /// 곡선 개체 / Curve shape component
    pub const SHAPE_COMPONENT_CURVE: u16 = HWPTAG_BEGIN + 67;

    /// OLE 개체 / OLE shape component
    pub const SHAPE_COMPONENT_OLE: u16 = HWPTAG_BEGIN + 68;

    /// 그림 개체 / Picture shape component
    pub const SHAPE_COMPONENT_PICTURE: u16 = HWPTAG_BEGIN + 69;

    /// 컨테이너 개체 / Container shape component
    pub const SHAPE_COMPONENT_CONTAINER: u16 = HWPTAG_BEGIN + 70;

    /// 컨트롤 임의의 데이터 / Control arbitrary data
    pub const CTRL_DATA: u16 = HWPTAG_BEGIN + 71;

    /// 수식 개체 / Equation editor
    pub const EQEDIT: u16 = HWPTAG_BEGIN + 72;

    /// 예약 / Reserved
    pub const RESERVED: u16 = HWPTAG_BEGIN + 73;

    /// 글맵시 / Text art shape component
    pub const SHAPE_COMPONENT_TEXTART: u16 = HWPTAG_BEGIN + 74;

    /// 양식 개체 / Form object
    pub const FORM_OBJECT: u16 = HWPTAG_BEGIN + 75;

    /// 메모 모양 / Memo shape
    pub const MEMO_SHAPE: u16 = HWPTAG_BEGIN + 76;

    /// 메모 리스트 헤더 / Memo list header
    pub const MEMO_LIST: u16 = HWPTAG_BEGIN + 77;

    /// 차트 데이터 / Chart data
    pub const CHART_DATA: u16 = HWPTAG_BEGIN + 79;

    /// 비디오 데이터 / Video data
    pub const VIDEO_DATA: u16 = HWPTAG_BEGIN + 82;

    /// Unknown 개체 / Unknown shape component
    pub const SHAPE_COMPONENT_UNKNOWN: u16 = HWPTAG_BEGIN + 99;
}
