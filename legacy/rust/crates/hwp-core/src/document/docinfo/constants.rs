/// DocInfo 태그 상수 정의 / DocInfo tag constants definition
///
/// 스펙 문서 매핑: 표 13 - 문서 정보의 데이터 레코드 / Spec mapping: Table 13 - Document information data records
use crate::document::constants::HWPTAG_BEGIN;

/// DocInfo 태그 상수 / DocInfo tag constants
pub struct HwpTag;

impl HwpTag {
    /// 문서 속성 / Document properties
    pub const DOCUMENT_PROPERTIES: u16 = HWPTAG_BEGIN;

    /// 아이디 매핑 헤더 / ID mappings header
    pub const ID_MAPPINGS: u16 = HWPTAG_BEGIN + 1;

    /// 바이너리 데이터 / Binary data
    pub const BIN_DATA: u16 = HWPTAG_BEGIN + 2;

    /// 글꼴 (Typeface Name) / Face name (Typeface Name)
    pub const FACE_NAME: u16 = HWPTAG_BEGIN + 3;

    /// 테두리/배경 / Border/fill
    pub const BORDER_FILL: u16 = HWPTAG_BEGIN + 4;

    /// 글자 모양 / Character shape
    pub const CHAR_SHAPE: u16 = HWPTAG_BEGIN + 5;

    /// 탭 정의 / Tab definition
    pub const TAB_DEF: u16 = HWPTAG_BEGIN + 6;

    /// 번호 정의 / Numbering definition
    pub const NUMBERING: u16 = HWPTAG_BEGIN + 7;

    /// 불릿 정의 / Bullet definition
    pub const BULLET: u16 = HWPTAG_BEGIN + 8;

    /// 문단 모양 / Paragraph shape
    pub const PARA_SHAPE: u16 = HWPTAG_BEGIN + 9;

    /// 스타일 / Style
    pub const STYLE: u16 = HWPTAG_BEGIN + 10;

    /// 문서의 임의의 데이터 / Document arbitrary data
    pub const DOC_DATA: u16 = HWPTAG_BEGIN + 11;

    /// 배포용 문서 데이터 / Distribution document data
    pub const DISTRIBUTE_DOC_DATA: u16 = HWPTAG_BEGIN + 12;

    /// 예약 / Reserved
    pub const RESERVED: u16 = HWPTAG_BEGIN + 13;

    /// 호환 문서 / Compatible document
    pub const COMPATIBLE_DOCUMENT: u16 = HWPTAG_BEGIN + 14;

    /// 레이아웃 호환성 / Layout compatibility
    pub const LAYOUT_COMPATIBILITY: u16 = HWPTAG_BEGIN + 15;

    /// 변경 추적 정보 / Track change information
    pub const TRACKCHANGE: u16 = HWPTAG_BEGIN + 16;

    /// 메모 모양 / Memo shape
    pub const MEMO_SHAPE: u16 = HWPTAG_BEGIN + 76;

    /// 금칙처리 문자 / Forbidden character
    pub const FORBIDDEN_CHAR: u16 = HWPTAG_BEGIN + 78;

    /// 변경 추적 내용 및 모양 / Track change content and shape
    pub const TRACK_CHANGE: u16 = HWPTAG_BEGIN + 80;

    /// 변경 추적 작성자 / Track change author
    pub const TRACK_CHANGE_AUTHOR: u16 = HWPTAG_BEGIN + 81;
}
