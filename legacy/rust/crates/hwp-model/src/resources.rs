use serde::{Deserialize, Serialize};

use crate::types::*;

/// DocInfo(HWP 5.0) / refList(HWPX)에 대응하는 공유 자원 모음
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Resources {
    pub fonts: FontFaces,
    pub border_fills: Vec<BorderFill>,
    pub char_shapes: Vec<CharShape>,
    pub tab_defs: Vec<TabDef>,
    pub numberings: Vec<Numbering>,
    pub bullets: Vec<Bullet>,
    pub para_shapes: Vec<ParaShape>,
    pub styles: Vec<Style>,
    pub memo_shapes: Vec<MemoShape>,
}

// ── 글꼴 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FontFaces {
    pub hangul: Vec<Font>,
    pub latin: Vec<Font>,
    pub hanja: Vec<Font>,
    pub japanese: Vec<Font>,
    pub other: Vec<Font>,
    pub symbol: Vec<Font>,
    pub user: Vec<Font>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Font {
    pub id: u16,
    pub face: String,
    pub font_type: FontType,
    pub is_embedded: bool,
    pub binary_item_id: Option<String>,
    pub subst_font: Option<SubstFont>,
    pub type_info: Option<FontTypeInfo>,
    pub default_font_name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SubstFont {
    pub face: String,
    pub font_type: FontType,
    pub is_embedded: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FontTypeInfo {
    pub family_type: FontCategory,
    pub weight: u8,
    pub proportion: u8,
    pub contrast: u8,
    pub stroke_variation: u8,
    pub arm_style: u8,
    pub letterform: u8,
    pub midline: u8,
    pub x_height: u8,
}

// ── 글자 모양 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CharShape {
    pub id: u16,
    pub height: HwpUnit,
    pub text_color: Color,
    pub shade_color: Color,
    pub use_font_space: bool,
    pub use_kerning: bool,
    pub sym_mark: SymMark,
    pub border_fill_id: Option<u16>,

    pub font_ref: LangGroup<u16>,
    pub ratio: LangGroup<u8>,
    pub spacing: LangGroup<i8>,
    pub rel_size: LangGroup<u8>,
    pub offset: LangGroup<i8>,

    pub bold: bool,
    pub italic: bool,
    pub underline: Option<Underline>,
    pub strikeout: Option<Strikeout>,
    pub outline: Option<OutlineType>,
    pub shadow: Option<CharShadow>,
    pub emboss: bool,
    pub engrave: bool,
    pub superscript: bool,
    pub subscript: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Underline {
    pub underline_type: UnderlineType,
    pub shape: LineType3,
    pub color: Color,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Strikeout {
    pub shape: LineType3,
    pub color: Color,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CharShadow {
    pub shadow_type: CharShadowType,
    pub color: Color,
    pub offset_x: i8,
    pub offset_y: i8,
}

// ── 탭 정의 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TabDef {
    pub id: u16,
    pub auto_tab_left: bool,
    pub auto_tab_right: bool,
    pub items: Vec<TabItem>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TabItem {
    pub pos: HwpUnit,
    pub tab_type: TabType,
    pub leader: LineType2,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TabType {
    #[default]
    Left,
    Right,
    Center,
    Decimal,
}

// ── 번호 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Numbering {
    pub id: u16,
    pub start: u16,
    pub levels: Vec<NumberingLevel>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NumberingLevel {
    pub level: u8,
    pub start: u16,
    pub align: HAlign,
    pub use_inst_width: bool,
    pub auto_indent: bool,
    pub width_adjust: HwpUnit,
    pub text_offset_type: ValueUnit,
    pub text_offset: HwpUnit,
    pub num_format: NumberType2,
    pub char_shape_id: Option<u32>,
    pub checkable: bool,
    pub format_string: String,
}

// ── 글머리표 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Bullet {
    pub id: u16,
    pub bullet_char: char,
    pub checked_char: Option<char>,
    pub use_image: bool,
    pub para_head: BulletParaHead,
    pub image: Option<BulletImage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BulletParaHead {
    pub level: u8,
    pub align: HAlign,
    pub use_inst_width: bool,
    pub auto_indent: bool,
    pub width_adjust: HwpUnit,
    pub text_offset_type: ValueUnit,
    pub text_offset: HwpUnit,
    pub char_shape_id: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BulletImage {
    pub binary_item_id: String,
    pub bright: i8,
    pub contrast: i8,
    pub effect: ImageEffect,
}

// ── 문단 모양 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParaShape {
    pub id: u16,
    pub tab_def_id: Option<u16>,
    pub condense: u8,
    pub font_line_height: bool,
    pub snap_to_grid: bool,
    pub suppress_line_numbers: Option<bool>,
    pub text_dir: Option<TextDir>,

    pub align: ParagraphAlign,
    pub heading: Option<Heading>,
    pub break_setting: BreakSetting,
    pub auto_spacing: AutoSpacing,
    pub margin: ParagraphMargin,
    pub line_spacing: LineSpacing,
    pub border: Option<ParagraphBorder>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParagraphAlign {
    pub horizontal: HAlign,
    pub vertical: VAlign,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Heading {
    pub heading_type: HeadingType,
    pub id_ref: u16,
    pub level: u8,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreakSetting {
    pub break_latin_word: BreakLatinWord,
    pub break_non_latin_word: BreakNonLatinWord,
    pub widow_orphan: bool,
    pub keep_with_next: bool,
    pub keep_lines: bool,
    pub page_break_before: bool,
    pub line_wrap: LineWrap,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AutoSpacing {
    pub east_asian_eng: bool,
    pub east_asian_num: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParagraphMargin {
    pub indent: HwpValue,
    pub left: HwpValue,
    pub right: HwpValue,
    pub prev: HwpValue,
    pub next: HwpValue,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LineSpacing {
    pub spacing_type: LineSpacingType,
    pub value: i32,
    pub unit: ValueUnit,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParagraphBorder {
    pub border_fill_id: u16,
    pub offset_left: HwpUnit,
    pub offset_right: HwpUnit,
    pub offset_top: HwpUnit,
    pub offset_bottom: HwpUnit,
    pub connect: bool,
    pub ignore_margin: bool,
}

// ── 테두리/배경 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BorderFill {
    pub id: u16,
    pub three_d: bool,
    pub shadow: bool,
    pub center_line: CenterLineType,
    pub break_cell_separate_line: Option<bool>,
    pub slash: Option<SlashInfo>,
    pub back_slash: Option<SlashInfo>,
    pub left_border: Option<LineSpec>,
    pub right_border: Option<LineSpec>,
    pub top_border: Option<LineSpec>,
    pub bottom_border: Option<LineSpec>,
    pub diagonal: Option<LineSpec>,
    pub fill: Option<FillBrush>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SlashInfo {
    pub slash_type: SlashType,
    pub crooked: bool,
    pub is_counter: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LineSpec {
    pub line_type: LineType3,
    pub width: String,
    pub color: Color,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FillBrush {
    WinBrush {
        face_color: Color,
        hatch_color: Color,
        hatch_style: Option<HatchStyle>,
        alpha: u8,
    },
    Gradation {
        grad_type: GradationType,
        angle: u16,
        center_x: u8,
        center_y: u8,
        step: u8,
        color_num: u16,
        step_center: u8,
        colors: Vec<Color>,
        alpha: u8,
    },
    ImageBrush {
        mode: ImageBrushMode,
        img: ImageRef,
    },
    Combined {
        win_brush: Option<Box<FillBrush>>,
        gradation: Option<Box<FillBrush>>,
        image_brush: Option<Box<FillBrush>>,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImageRef {
    pub binary_item_id: String,
    pub bright: i8,
    pub contrast: i8,
    pub effect: ImageEffect,
    pub alpha: u8,
}

// ── 스타일 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Style {
    pub id: u16,
    pub style_type: StyleType,
    pub name: String,
    pub eng_name: String,
    pub para_shape_id: Option<u16>,
    pub char_shape_id: Option<u16>,
    pub next_style_id: Option<u16>,
    pub lang_id: Option<u16>,
    pub lock_form: Option<bool>,
}

// ── 메모 모양 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoShape {
    pub id: u16,
    pub width: HwpUnit,
    pub line_width: u8,
    pub line_type: LineType3,
    pub line_color: Color,
    pub fill_color: Color,
    pub active_color: Color,
    pub memo_type: MemoType,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum MemoType {
    #[default]
    Normal,
    TrackChange,
}
