use crate::paragraph::Paragraph;
use crate::types::*;

#[derive(Debug, Clone, Default)]
pub struct Section {
    pub definition: SectionDef,
    pub paragraphs: Vec<Paragraph>,
}

#[derive(Debug, Clone, Default)]
pub struct SectionDef {
    pub id: u64,
    pub text_direction: TextDirection,
    pub space_columns: HwpUnit,
    pub tab_stop: HwpUnit,
    pub outline_shape_id: Option<u16>,
    pub memo_shape_id: Option<u16>,
    pub master_page_cnt: Option<u16>,

    pub start_num: Option<StartNum>,
    pub grid: Option<Grid>,
    pub visibility: Option<Visibility>,
    pub page: PageDef,
    pub footnote: Option<FootNoteDef>,
    pub endnote: Option<EndNoteDef>,
    pub page_border_fills: Vec<PageBorderFill>,
    pub columns: Option<ColumnDef>,
    pub line_number: Option<LineNumberShape>,
    pub master_pages: Vec<MasterPage>,
}

#[derive(Debug, Clone, Default)]
pub struct StartNum {
    pub page_starts_on: PageStartsOn,
    pub page: u16,
    pub pic: u16,
    pub tbl: u16,
    pub equation: u16,
}

#[derive(Debug, Clone, Default)]
pub struct Grid {
    pub line_grid: u16,
    pub char_grid: u16,
    pub wonggoji_format: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Visibility {
    pub hide_first_header: bool,
    pub hide_first_footer: bool,
    pub hide_first_master_page: bool,
    pub border: VisibilityValue,
    pub fill: VisibilityValue,
    pub hide_first_page_num: bool,
    pub hide_first_empty_line: bool,
    pub show_line_number: bool,
}

#[derive(Debug, Clone, Default)]
pub struct PageDef {
    pub landscape: Landscape,
    pub width: HwpUnit,
    pub height: HwpUnit,
    pub gutter_type: GutterType,
    pub margin: PageMargin,
}

#[derive(Debug, Clone, Default)]
pub struct PageMargin {
    pub left: HwpUnit,
    pub right: HwpUnit,
    pub top: HwpUnit,
    pub bottom: HwpUnit,
    pub header: HwpUnit,
    pub footer: HwpUnit,
    pub gutter: HwpUnit,
}

// ── 각주/미주 설정 ──

#[derive(Debug, Clone, Default)]
pub struct FootNoteDef {
    pub numbering_type: FootnoteNumbering,
    pub placement: FootnotePlacement,
    pub beneath_text: bool,
    pub number_format: NumberType1,
    pub start_number: u16,
    pub superscript: bool,
    pub user_char: Option<char>,
    pub prefix_char: Option<char>,
    pub suffix_char: Option<char>,
    pub note_line: Option<NoteLine>,
    pub note_spacing: Option<NoteSpacing>,
}

#[derive(Debug, Clone, Default)]
pub struct EndNoteDef {
    pub numbering_type: EndnoteNumbering,
    pub placement: EndnotePlacement,
    pub beneath_text: bool,
    pub number_format: NumberType1,
    pub start_number: u16,
    pub superscript: bool,
    pub user_char: Option<char>,
    pub prefix_char: Option<char>,
    pub suffix_char: Option<char>,
    pub note_line: Option<NoteLine>,
    pub note_spacing: Option<NoteSpacing>,
}

#[derive(Debug, Clone, Default)]
pub struct NoteLine {
    pub length: u16,
    pub line_type: LineType3,
    pub width: String,
    pub color: Color,
}

#[derive(Debug, Clone, Default)]
pub struct NoteSpacing {
    pub between_notes: u16,
    pub below_line: u16,
    pub above_line: u16,
}

// ── 쪽 테두리/배경 ──

#[derive(Debug, Clone, Default)]
pub struct PageBorderFill {
    pub border_fill_id: u16,
    pub text_border: PageBorderRef,
    pub header_inside: bool,
    pub footer_inside: bool,
    pub fill_area: FillArea,
    pub offset: Margin,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum PageBorderRef {
    #[default]
    Paper,
    Text,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum FillArea {
    #[default]
    Paper,
    Text,
    PaperLine,
}

// ── 단 정의 ──

#[derive(Debug, Clone, Default)]
pub struct ColumnDef {
    pub id: u64,
    pub column_type: ColumnType,
    pub col_count: u16,
    pub layout: ColumnLayout,
    pub same_size: bool,
    pub same_gap: HwpUnit,
    pub col_sizes: Vec<ColumnSize>,
    pub col_line: Option<ColumnLine>,
}

#[derive(Debug, Clone, Default)]
pub struct ColumnSize {
    pub width: HwpUnit,
    pub gap: HwpUnit,
}

#[derive(Debug, Clone, Default)]
pub struct ColumnLine {
    pub line_type: LineType3,
    pub width: String,
    pub color: Color,
}

// ── 줄 번호 ──

#[derive(Debug, Clone, Default)]
pub struct LineNumberShape {
    pub restart_type: LineNumberRestart,
    pub count_by: u16,
    pub distance: HwpUnit,
    pub start_number: u16,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum LineNumberRestart {
    #[default]
    RestartBySection,
    RestartByPage,
    KeepContinue,
}

// ── 바탕쪽 ──

#[derive(Debug, Clone, Default)]
pub struct MasterPage {
    pub id_ref: Option<u16>,
}
