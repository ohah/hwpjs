use crate::paragraph::{Paragraph, SubList};
use crate::types::*;

#[derive(Debug, Clone)]
pub enum Control {
    Column(ColumnControl),
    FieldBegin(Field),
    FieldEnd,
    Bookmark(Bookmark),
    Header(HeaderFooter),
    Footer(HeaderFooter),
    FootNote(Note),
    EndNote(Note),
    AutoNum(AutoNum),
    NewNum(NewNum),
    PageNumCtrl(PageNumCtrl),
    PageHiding(PageHiding),
    Compose(Compose),
    Dutmal(Dutmal),
    HiddenDesc(HiddenDesc),
}

// ── 머리글/꼬리말 ──

#[derive(Debug, Clone, Default)]
pub struct HeaderFooter {
    pub id: u64,
    pub apply_page_type: PageApplyType,
    pub content: SubList,
}

// ── 각주/미주 ──

#[derive(Debug, Clone, Default)]
pub struct Note {
    pub id: u64,
    pub number: Option<u16>,
    pub content: SubList,
}

// ── 자동 번호 ──

#[derive(Debug, Clone, Default)]
pub struct AutoNum {
    pub num_type: AutoNumType,
    pub number_type: NumberType1,
    pub num: u16,
    pub user_char: Option<String>,
    pub prefix_char: Option<String>,
    pub suffix_char: Option<String>,
}

// ── 새 번호 ──

#[derive(Debug, Clone, Default)]
pub struct NewNum {
    pub num_type: NumberingType,
    pub num: u16,
}

// ── 필드 ──

#[derive(Debug, Clone, Default)]
pub struct Field {
    pub id: u64,
    pub field_type: FieldType,
    pub name: Option<String>,
    pub editable: bool,
    pub dirty: bool,
    pub field_id: Option<u32>,
    pub z_order: Option<i32>,
    pub parameters: Vec<FieldParameter>,
    pub sub_list: Option<SubList>,
    pub meta_tag: Option<String>,
}

#[derive(Debug, Clone)]
pub enum FieldParameter {
    Integer { name: String, value: i64 },
    String { name: String, value: String },
    Element { name: String, children: Vec<FieldParameter> },
    List { name: String, items: Vec<FieldParameter> },
}

// ── 책갈피 ──

#[derive(Debug, Clone, Default)]
pub struct Bookmark {
    pub name: String,
}

// ── 쪽 번호 제어 ──

#[derive(Debug, Clone, Default)]
pub struct PageNumCtrl {
    pub page_starts_on: Option<PageStartsOn>,
    pub visible: Option<bool>,
}

// ── 감추기 ──

#[derive(Debug, Clone, Default)]
pub struct PageHiding {
    pub hide_header: bool,
    pub hide_footer: bool,
    pub hide_master_page: bool,
    pub hide_border: bool,
    pub hide_fill: bool,
    pub hide_page_num: bool,
}

// ── 단 ──

#[derive(Debug, Clone, Default)]
pub struct ColumnControl {
    pub id: u64,
    pub column_type: ColumnType,
    pub col_count: u16,
    pub layout: ColumnLayout,
    pub same_size: bool,
    pub same_gap: HwpUnit,
}

// ── 글자 겹침 ──

#[derive(Debug, Clone, Default)]
pub struct Compose {
    pub circle_type: Option<String>,
    pub char_sz: Option<u16>,
    pub compose_type: Option<String>,
    pub compose_text: Option<String>,
    pub char_pr_refs: Vec<u32>,
}

// ── 덧말 ──

#[derive(Debug, Clone, Default)]
pub struct Dutmal {
    pub main_text: String,
    pub sub_text: String,
    pub position: DutmalPosition,
    pub alignment: HAlign,
    pub sz_ratio: Option<u16>,
    pub option: Option<u32>,
    pub style_id_ref: Option<u16>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum DutmalPosition {
    #[default]
    Top,
    Bottom,
    Center,
}

// ── 숨은 설명 ──

#[derive(Debug, Clone, Default)]
pub struct HiddenDesc {
    pub paragraphs: Vec<Paragraph>,
}
