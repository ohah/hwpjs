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
    /// 머리말 / Header
    pub const HEADER: &str = "head";
    /// 꼬리말 / Footer
    pub const FOOTER: &str = "foot";
    /// 각주 / Footnote (공백 포함)
    pub const FOOTNOTE: &str = "fn  ";
    /// 미주 / Endnote (공백 포함)
    pub const ENDNOTE: &str = "en  ";
    /// 머리말/꼬리말 (레거시 호환용) / Header/Footer (legacy compatibility)
    #[deprecated(note = "Use HEADER or FOOTER instead")]
    pub const HEADER_FOOTER: &str = "head";

    /// 자동번호 / Auto numbering
    ///
    /// NOTE:
    /// - 실제 파일/레거시 구현에서 `"atno"`로 나타나는 경우가 있습니다.
    /// - 따라서 파서는 `"autn"`과 `"atno"` 모두를 자동번호 컨트롤로 처리합니다.
    pub const AUTO_NUMBER: &str = "autn";
    /// 자동번호(대체 CHID) / Auto numbering (alternate CHID)
    pub const AUTO_NUMBER_ALT: &str = "atno";
    /// 새 번호 지정 / New number specification
    pub const NEW_NUMBER: &str = "newn";
    /// 감추기 / Hide
    pub const HIDE: &str = "pghd";
    /// 홀/짝수 조정 / Odd/Even page adjustment
    pub const PAGE_ADJUST: &str = "pgad";
    /// 쪽 번호 위치 / Page number position
    pub const PAGE_NUMBER: &str = "pgno";
    /// 쪽 번호 위치 (pgnp) / Page number position (pgnp)
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
    pub const FIELD_UNKNOWN: &str = "%unk";
    pub const FIELD_DATE: &str = "%dte";
    pub const FIELD_DOC_DATE: &str = "%ddt";
    pub const FIELD_PATH: &str = "%pat";
    pub const FIELD_BOOKMARK: &str = "%bmk";
    pub const FIELD_CROSS_REF: &str = "%xrf";
    pub const FIELD_FORMULA: &str = "%eqr";
    pub const FIELD_DOCSUMMARY: &str = "%dsm";
    pub const FIELD_USER: &str = "%usr";
    pub const FIELD_MAIL_MERGE: &str = "%mmg";
    pub const FIELD_HYPERLINK: &str = "%hlk";
    pub const FIELD_REVISION: &str = "%rvs";
    pub const FIELD_OUTLINE: &str = "%out";
    pub const FIELD_TABLE_OF_CONTENTS: &str = "%toc";
    pub const FIELD_INDEXMARK: &str = "%idx";
    pub const FIELD_PAGECTRL: &str = "%pgc";
    pub const FIELD_HWP_SUMMARY: &str = "%hsm";
    pub const FIELD_KOGL: &str = "%kgl";
    pub const FIELD_GLOSSARY: &str = "%gls";
    pub const FIELD_INPUT: &str = "%inp";
    pub const FIELD_CHANGE: &str = "%chg";
    pub const FIELD_FILE: &str = "%fil";
    pub const FIELD_PAGE_NUM: &str = "%pgn";
    pub const FIELD_DOC_TITLE: &str = "%ttl";
    pub const FIELD_DOC_AUTHOR: &str = "%aut";
    pub const FIELD_DOC_KEYWORD: &str = "%key";
    pub const FIELD_DOC_SUBJECT: &str = "%sub";
    pub const FIELD_DOC_COMMENT: &str = "%cmt";
    pub const FIELD_DOC_LASTSAVEDBY: &str = "%lsb";
    pub const FIELD_DOC_REVISION: &str = "%rev";
    pub const FIELD_DOC_LASTPRINTED: &str = "%lpt";
    pub const FIELD_DOC_CREATED: &str = "%crt";
    pub const FIELD_DOC_LASTSAVED: &str = "%sav";
    pub const FIELD_DOC_PAGECOUNT: &str = "%pgc";
    pub const FIELD_DOC_WORDCOUNT: &str = "%wct";
    pub const FIELD_DOC_CHARCOUNT: &str = "%cct";
    pub const FIELD_PRIVATE_INFO_SECURITY: &str = "%cpr";
    pub const FIELD_TABLE_OF_CONTENTS_ALT: &str = "%oc";
}
