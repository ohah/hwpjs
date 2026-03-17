use serde::{Deserialize, Serialize};

use crate::paragraph::SubList;
use crate::resources::{FillBrush, ImageRef};
use crate::table::Table;
use crate::types::*;

// ═══════════════════════════════════════════
// 개체 공통 (AbstractShapeObjectType)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeCommon {
    pub id: u64,
    pub z_order: i32,
    pub numbering_type: NumberingType,
    pub text_wrap: TextWrap,
    pub text_flow: TextFlow,
    pub lock: bool,
    pub dropcap_style: Option<DropcapStyle>,

    pub size: ShapeSize,
    pub position: ShapePosition,
    pub out_margin: Option<Margin>,
    pub caption: Option<Caption>,
    pub comment: Option<String>,
    pub meta_tag: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeSize {
    pub width: HwpUnit,
    pub width_rel_to: SizeRelation,
    pub height: HwpUnit,
    pub height_rel_to: SizeRelation,
    pub protect: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapePosition {
    pub treat_as_char: bool,
    pub affect_line_spacing: bool,
    pub flow_with_text: bool,
    pub allow_overlap: bool,
    pub hold_anchor_and_so: bool,
    pub vert_rel_to: RelativeTo,
    pub horz_rel_to: RelativeTo,
    pub vert_align: VAlign,
    pub horz_align: HAlign,
    pub vert_offset: HwpUnit,
    pub horz_offset: HwpUnit,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Caption {
    pub side: CaptionSide,
    pub full_size: bool,
    pub width: HwpUnit,
    pub gap: HwpUnit,
    pub last_width: Option<HwpUnit>,
    pub content: SubList,
}

// ═══════════════════════════════════════════
// 도형 요소 추가 (AbstractShapeComponentType)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeComponentData {
    pub href: Option<String>,
    pub group_level: u32,
    pub inst_id: Option<u64>,
    pub offset: Option<Point>,
    pub org_size: Option<Size>,
    pub cur_size: Option<Size>,
    pub flip: Option<Flip>,
    pub rotation: Option<Rotation>,
    pub rendering_info: Option<RenderingInfo>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Flip {
    pub horizontal: bool,
    pub vertical: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Rotation {
    pub angle: f32,
    pub center_x: HwpUnit,
    pub center_y: HwpUnit,
    pub rotate_image: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RenderingInfo {
    pub trans_matrix: [f32; 6],
    pub sca_matrix: [f32; 6],
    pub rot_matrix: [f32; 6],
}

// ═══════════════════════════════════════════
// 선/테두리 (도형용, 개체 공통 LineShape)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeLineInfo {
    pub color: Color,
    pub width: HwpUnit,
    pub style: LineType1,
    pub end_cap: LineEndCap,
    pub head_style: ArrowType,
    pub tail_style: ArrowType,
    pub head_fill: bool,
    pub tail_fill: bool,
    pub head_size: ArrowSize,
    pub tail_size: ArrowSize,
    pub outline_style: LineOutlineStyle,
    pub alpha: u8,
}

// ═══════════════════════════════════════════
// 도형 그림자 (도형 개체용)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeShadow {
    pub shadow_type: ShapeShadowType,
    pub color: Color,
    pub offset_x: HwpUnit,
    pub offset_y: HwpUnit,
    pub alpha: u8,
}

// ═══════════════════════════════════════════
// 개체 타입 enum
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShapeObject {
    Table(Box<Table>),
    Picture(Box<Picture>),
    Line(Box<LineObject>),
    Rectangle(Box<RectObject>),
    Ellipse(Box<EllipseObject>),
    Arc(Box<ArcObject>),
    Polygon(Box<PolygonObject>),
    Curve(Box<CurveObject>),
    ConnectLine(Box<ConnectLineObject>),
    TextArt(Box<TextArtObject>),
    Container(Box<ContainerObject>),
    Ole(Box<OleObject>),
    Equation(Box<EquationObject>),
    Chart(Box<ChartObject>),
    Video(Box<VideoObject>),
}

// ═══════════════════════════════════════════
// 개별 도형
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Picture {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub reverse: Option<bool>,
    pub line_shape: Option<ShapeLineInfo>,
    pub img_rect: Option<[Point; 4]>,
    pub img_clip: Option<Margin>,
    pub in_margin: Option<Margin>,
    pub img_dim: Option<Size>,
    pub img: ImageRef,
    pub effects: Option<PictureEffects>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PictureEffects {
    pub shadow: Option<PicEffectShadow>,
    pub glow: Option<PicEffectGlow>,
    pub soft_edge: Option<PicEffectSoftEdge>,
    pub reflection: Option<PicEffectReflection>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PicEffectShadow {
    pub style: ShadowStyle,
    pub alpha: f32,
    pub radius: HwpUnit,
    pub direction: f32,
    pub distance: HwpUnit,
    pub color: Option<EffectsColor>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PicEffectGlow {
    pub alpha: f32,
    pub radius: HwpUnit,
    pub color: Option<EffectsColor>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PicEffectSoftEdge {
    pub radius: HwpUnit,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PicEffectReflection {
    pub align: HAlign,
    pub radius: HwpUnit,
    pub direction: f32,
    pub distance: HwpUnit,
    pub alpha_start: f32,
    pub alpha_end: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EffectsColor {
    pub color_type: EffectsColorType,
    pub value: String,
    pub adjustments: Vec<ColorAdjustment>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum EffectsColorType {
    #[default]
    Rgb,
    Cmyk,
    Scheme,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorAdjustment {
    pub adjustment_type: String,
    pub value: f32,
}

// ── 선 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LineObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub start_pt: Point,
    pub end_pt: Point,
    pub is_reverse_hv: Option<bool>,
    pub line_shape: ShapeLineInfo,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

// ── 사각형 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RectObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub ratio: u8,
    pub points: [Point; 4],
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

// ── 타원 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EllipseObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub center: Point,
    pub axis1: Point,
    pub axis2: Point,
    pub start1: Point,
    pub end1: Point,
    pub start2: Point,
    pub end2: Point,
    pub has_arc: bool,
    pub arc_type: ArcType,
    pub interval_dirty: Option<bool>,
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

// ── 호 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArcObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub arc_type: ArcType,
    pub center: Point,
    pub axis1: Point,
    pub axis2: Point,
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

// ── 다각형 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PolygonObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub points: Vec<Point>,
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

// ── 곡선 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CurveObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub segments: Vec<CurveSegment>,
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
    pub draw_text: Option<SubList>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CurveSegment {
    pub segment_type: CurveSegmentType,
    pub x1: HwpUnit,
    pub y1: HwpUnit,
    pub x2: HwpUnit,
    pub y2: HwpUnit,
}

// ── 연결선 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConnectLineObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub connect_type: ConnectLineType,
    pub start_pt: ConnectPoint,
    pub end_pt: ConnectPoint,
    pub control_points: Vec<ControlPoint>,
    pub line_shape: ShapeLineInfo,
    pub shadow: Option<ShapeShadow>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ControlPoint {
    pub x: HwpUnit,
    pub y: HwpUnit,
    pub point_type: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConnectPoint {
    pub x: HwpUnit,
    pub y: HwpUnit,
    pub subject_id: Option<u64>,
    pub subject_idx: Option<u16>,
}

// ── 글맵시 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TextArtObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub text: String,
    pub font_name: Option<String>,
    pub font_style: Option<String>,
    pub font_type: Option<String>,
    pub text_shape: Option<String>,
    pub line_spacing: Option<i32>,
    pub char_spacing: Option<i32>,
    pub align: Option<HAlign>,
    pub points: [Point; 4],
    pub outline: Vec<Point>,
    pub line_shape: ShapeLineInfo,
    pub fill: Option<FillBrush>,
    pub shadow: Option<ShapeShadow>,
}

// ── 묶음 개체 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContainerObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub children: Vec<ShapeObject>,
}

// ── OLE ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OleObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
    pub object_type: OleObjectType,
    pub presentation: OlePresentation,
    pub extent: Size,
    pub binary_item_id: Option<String>,
    pub has_moniker: bool,
    pub eq_baseline: Option<i16>,
    pub line_shape: Option<ShapeLineInfo>,
}

// ── 수식 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EquationObject {
    pub common: ShapeCommon,
    pub line_mode: EquationLineMode,
    pub script: String,
    pub base_unit: HwpUnit,
    pub text_color: Color,
    pub baseline: i16,
    pub version: Option<String>,
    pub font: Option<String>,
}

// ── 차트 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChartObject {
    pub common: ShapeCommon,
    pub component: ShapeComponentData,
}

// ── 비디오 ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VideoObject {
    pub common: ShapeCommon,
    pub video_type: VideoType,
    pub file_id_ref: Option<String>,
    pub image_id_ref: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum VideoType {
    #[default]
    Local,
    Web,
}
