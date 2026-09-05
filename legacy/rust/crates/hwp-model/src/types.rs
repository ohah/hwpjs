use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════
// 기본 단위
// ═══════════════════════════════════════════

/// 1/7200 inch. HWP 5.0과 HWPX 양쪽 동일.
pub type HwpUnit = i32;

/// 16비트 HWPUNIT
pub type HwpUnit16 = i16;

/// 색상. 0x00RRGGBB. None = 투명/없음.
/// HWP 5.0은 0x00BBGGRR(COLORREF) → 파서에서 변환.
/// HWPX는 #RRGGBB 문자열 → 파서에서 변환.
pub type Color = Option<u32>;

// ═══════════════════════════════════════════
// 7개 언어 그룹
// ═══════════════════════════════════════════

/// 7개 언어 그룹 컨테이너. 글꼴, 장평, 자간, 상대크기, 오프셋에 사용.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LangGroup<T> {
    pub hangul: T,
    pub latin: T,
    pub hanja: T,
    pub japanese: T,
    pub other: T,
    pub symbol: T,
    pub user: T,
}

impl<T> LangGroup<T> {
    pub fn new(hangul: T, latin: T, hanja: T, japanese: T, other: T, symbol: T, user: T) -> Self {
        Self {
            hangul,
            latin,
            hanja,
            japanese,
            other,
            symbol,
            user,
        }
    }

    pub fn map<U, F: Fn(&T) -> U>(&self, f: F) -> LangGroup<U> {
        LangGroup {
            hangul: f(&self.hangul),
            latin: f(&self.latin),
            hanja: f(&self.hanja),
            japanese: f(&self.japanese),
            other: f(&self.other),
            symbol: f(&self.symbol),
            user: f(&self.user),
        }
    }
}

impl<T: Copy> LangGroup<T> {
    pub fn all(value: T) -> Self {
        Self {
            hangul: value,
            latin: value,
            hanja: value,
            japanese: value,
            other: value,
            symbol: value,
            user: value,
        }
    }
}

// ═══════════════════════════════════════════
// 값 + 단위 (문단 여백, 줄 간격 전용)
// ═══════════════════════════════════════════

/// 문단 여백, 줄 간격 등에서 단위를 명시해야 하는 경우.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HwpValue {
    pub value: HwpUnit,
    pub unit: ValueUnit,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ValueUnit {
    #[default]
    HwpUnit,
    Char,
}

// ═══════════════════════════════════════════
// 공통 구조
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Margin {
    pub left: HwpUnit,
    pub right: HwpUnit,
    pub top: HwpUnit,
    pub bottom: HwpUnit,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: HwpUnit,
    pub y: HwpUnit,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: HwpUnit,
    pub height: HwpUnit,
}

// ═══════════════════════════════════════════
// 선 관련
// ═══════════════════════════════════════════

/// 선형식 1 (외곽선 등)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineType1 {
    #[default]
    None,
    Solid,
    Dot,
    Thick,
    Dash,
    DashDot,
    DashDotDot,
}

/// 선형식 2 (탭 채움선 등)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineType2 {
    #[default]
    None,
    Solid,
    Dot,
    Dash,
    DashDot,
    DashDotDot,
    LongDash,
    Circle,
    DoubleSlim,
    SlimThick,
    ThickSlim,
    SlimThickSlim,
}

/// 선형식 3 (테두리, 취소선, 밑줄 등)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineType3 {
    #[default]
    None,
    Solid,
    Dot,
    Dash,
    DashDot,
    DashDotDot,
    LongDash,
    Circle,
    DoubleSlim,
    SlimThick,
    ThickSlim,
    SlimThickSlim,
    Wave,
    DoubleWave,
}

/// 선 끝 모양
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineEndCap {
    #[default]
    Flat,
    Round,
}

/// 선 외곽선 스타일
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineOutlineStyle {
    #[default]
    Normal,
    Outer,
    Inner,
}

/// 화살표 모양
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ArrowType {
    #[default]
    Normal,
    Arrow,
    Spear,
    ConcaveArrow,
    EmptyDiamond,
    EmptyCircle,
    EmptyBox,
    FilledDiamond,
    FilledCircle,
    FilledBox,
}

/// 화살표 크기
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ArrowSize {
    SmallSmall,
    SmallMedium,
    SmallLarge,
    MediumSmall,
    #[default]
    MediumMedium,
    MediumLarge,
    LargeSmall,
    LargeMedium,
    LargeLarge,
}

// ═══════════════════════════════════════════
// 정렬
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum HAlign {
    #[default]
    Justify,
    Left,
    Right,
    Center,
    Distribute,
    DistributeSpace,
    /// 개체 위치용
    Inside,
    /// 개체 위치용
    Outside,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum VAlign {
    #[default]
    Top,
    Center,
    Bottom,
    Baseline,
    /// 개체 위치용
    Inside,
    /// 개체 위치용
    Outside,
}

// ═══════════════════════════════════════════
// 텍스트 방향
// ═══════════════════════════════════════════

/// 섹션/개체의 텍스트 방향
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TextDirection {
    #[default]
    Horizontal,
    Vertical,
    /// 세로쓰기 (모든 문자)
    VerticalAll,
}

/// 문단의 텍스트 방향 (LTR/RTL)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TextDir {
    #[default]
    Ltr,
    Rtl,
}

// ═══════════════════════════════════════════
// 개체 배치
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TextWrap {
    Square,
    Tight,
    Through,
    TopAndBottom,
    BehindText,
    #[default]
    InFrontOfText,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TextFlow {
    #[default]
    BothSides,
    LeftOnly,
    RightOnly,
    LargestOnly,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum RelativeTo {
    #[default]
    Paper,
    Page,
    Column,
    Para,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum SizeRelation {
    #[default]
    Absolute,
    Paper,
    Page,
    Column,
    Para,
    Percent,
}

// ═══════════════════════════════════════════
// 번호
// ═══════════════════════════════════════════

/// 번호유형 1 (각주/미주 등)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum NumberType1 {
    #[default]
    Digit,
    CircledDigit,
    RomanCapital,
    RomanSmall,
    LatinCapital,
    LatinSmall,
    CircledLatinCapital,
    CircledLatinSmall,
    HangulSyllable,
    CircledHangulSyllable,
    HangulJamo,
    CircledHangulJamo,
    HangulPhonetic,
    Ideograph,
    CircledIdeograph,
}

/// 번호유형 2 (문단 번호 등, NumberType1 + 4개)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum NumberType2 {
    #[default]
    Digit,
    CircledDigit,
    RomanCapital,
    RomanSmall,
    LatinCapital,
    LatinSmall,
    CircledLatinCapital,
    CircledLatinSmall,
    HangulSyllable,
    CircledHangulSyllable,
    HangulJamo,
    CircledHangulJamo,
    HangulPhonetic,
    Ideograph,
    CircledIdeograph,
    DecagonCircle,
    DecagonCircleHanja,
    Symbol,
    UserChar,
}

/// 자동 번호 범주
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum NumberingType {
    #[default]
    None,
    Picture,
    Table,
    Equation,
}

/// 자동 번호 대상 (각주/미주/쪽번호 등)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum AutoNumType {
    Page,
    Footnote,
    Endnote,
    #[default]
    Picture,
    Table,
    Equation,
    TotalPage,
}

// ═══════════════════════════════════════════
// 섹션 / 페이지
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[allow(clippy::enum_variant_names)]
pub enum Landscape {
    #[default]
    Portrait,
    Landscape,
    Widely,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum GutterType {
    #[default]
    LeftOnly,
    LeftRight,
    TopBottom,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum PageStartsOn {
    #[default]
    Both,
    Even,
    Odd,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum VisibilityValue {
    HideFirst,
    ShowFirst,
    #[default]
    ShowAll,
}

/// 쪽 번호 위치
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum PageNumPos {
    #[default]
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

// ═══════════════════════════════════════════
// 단 정의
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ColumnType {
    #[default]
    Newspaper,
    BalancedNewspaper,
    Parallel,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ColumnLayout {
    #[default]
    Left,
    Right,
    Mirror,
}

// ═══════════════════════════════════════════
// 각주 / 미주
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum FootnoteNumbering {
    #[default]
    Continuous,
    OnSection,
    OnPage,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[allow(clippy::enum_variant_names)]
pub enum FootnotePlacement {
    #[default]
    EachColumn,
    MergedColumn,
    RightMostColumn,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum EndnoteNumbering {
    #[default]
    Continuous,
    OnSection,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum EndnotePlacement {
    #[default]
    EndOfDocument,
    EndOfSection,
}

// ═══════════════════════════════════════════
// 글자 모양
// ═══════════════════════════════════════════

/// 강조점 종류
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum SymMark {
    #[default]
    None,
    DotAbove,
    RingAbove,
    Tilde,
    Caron,
    Side,
    Colon,
    GraveAccent,
    AcuteAccent,
    Circumflex,
    Macron,
    HookAbove,
    DotBelow,
}

/// 밑줄 위치
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum UnderlineType {
    #[default]
    Bottom,
    Center,
    Top,
}

/// 그림자 종류 (글자 모양)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum CharShadowType {
    #[default]
    None,
    Drop,
    Continuous,
}

/// 외곽선 종류
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum OutlineType {
    #[default]
    None,
    Solid,
    Dot,
    Thick,
    Dash,
    DashDot,
    DashDotDot,
}

// ═══════════════════════════════════════════
// 문단 모양
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineSpacingType {
    #[default]
    Percent,
    Fixed,
    AtLeast,
    Between,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum HeadingType {
    #[default]
    None,
    Outline,
    Number,
    Bullet,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum BreakLatinWord {
    #[default]
    KeepWord,
    Hyphenation,
    BreakWord,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum BreakNonLatinWord {
    #[default]
    KeepWord,
    BreakWord,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LineWrap {
    #[default]
    Break,
    Squeeze,
    Keep,
}

// ═══════════════════════════════════════════
// 표
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum TablePageBreak {
    Table,
    Cell,
    #[default]
    None,
}

/// 페이지 적용 유형 (머리글/꼬리말)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum PageApplyType {
    #[default]
    Both,
    Even,
    Odd,
    First,
}

// ═══════════════════════════════════════════
// 채우기
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum HatchStyle {
    #[default]
    Horizontal,
    Vertical,
    BackSlash,
    Slash,
    Cross,
    CrossDiagonal,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum GradationType {
    #[default]
    Linear,
    Radial,
    Conical,
    Square,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ImageBrushMode {
    Tile,
    TileHorzTop,
    TileHorzBottom,
    TileVertLeft,
    TileVertRight,
    #[default]
    Total,
    Center,
    CenterTop,
    CenterBottom,
    LeftCenter,
    LeftTop,
    LeftBottom,
    RightCenter,
    RightTop,
    RightBottom,
    Zoom,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ImageEffect {
    #[default]
    RealPic,
    GrayScale,
    BlackWhite,
}

// ═══════════════════════════════════════════
// 테두리/배경
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum CenterLineType {
    #[default]
    None,
    Left,
    Right,
    Both,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum SlashType {
    #[default]
    None,
    Center,
    CenterBelow,
    CenterAbove,
    All,
}

// ═══════════════════════════════════════════
// 도형
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ArcType {
    #[default]
    Normal,
    Pie,
    Chord,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum CurveSegmentType {
    #[default]
    Curve,
    Line,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum DropcapStyle {
    #[default]
    None,
    DoubleLine,
    TripleLine,
    Margin,
}

/// 도형 그림자 종류 (글자 그림자와 별개)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ShapeShadowType {
    #[default]
    None,
    ParellelLeftTop,
    ParellelRightTop,
    ParellelLeftBottom,
    ParellelRightBottom,
    ShearLeftTop,
    ShearRightTop,
    ShearLeftBottom,
    ShearRightBottom,
    PersLeftTop,
    PersRightTop,
    PersLeftBottom,
    PersRightBottom,
    ScaleNarrow,
    ScaleEnlarge,
}

/// 도형 그림자 스타일 (그림 효과용)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ShadowStyle {
    #[default]
    Outside,
    Inside,
}

/// 캡션 방향
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum CaptionSide {
    Left,
    Right,
    #[default]
    Top,
    Bottom,
}

/// 연결선 유형
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ConnectLineType {
    #[default]
    StraightNoArrow,
    StraightOneWay,
    StraightBoth,
    StrokeNoArrow,
    StrokeOneWay,
    StrokeBoth,
    ArcNoArrow,
    ArcOneWay,
    ArcBoth,
}

/// 수식 줄 모드
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum EquationLineMode {
    #[default]
    Line,
    Char,
}

// ═══════════════════════════════════════════
// OLE
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum OleObjectType {
    #[default]
    Unknown,
    Embedded,
    Link,
    Static,
    Equation,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum OlePresentation {
    #[default]
    Content,
    ThumbNail,
    Icon,
    DocPrint,
}

// ═══════════════════════════════════════════
// 필드
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum FieldType {
    #[default]
    ClickHere,
    Hyperlink,
    Bookmark,
    Formula,
    Summary,
    UserInfo,
    Date,
    DocDate,
    Path,
    CrossRef,
    MailMerge,
    Memo,
    ProofreadingMarks,
    PrivateInfo,
    MetaTag,
    Outline,
}

// ═══════════════════════════════════════════
// 스타일
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum StyleType {
    #[default]
    Para,
    Char,
}

// ═══════════════════════════════════════════
// 글꼴
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum FontType {
    Rep,
    #[default]
    Ttf,
    Ttc,
    Hft,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum FontCategory {
    #[default]
    Unknown,
    Myungjo,
    Gothic,
    SSerif,
    BrushScript,
    NonRectMj,
    NonRectGt,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum LangType {
    #[default]
    Hangul,
    Latin,
    Hanja,
    Japanese,
    Other,
    Symbol,
    User,
}

// ═══════════════════════════════════════════
// 호환성
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum CompatibleDocument {
    #[default]
    Hwp201X,
    Hwp200X,
    MsWord,
}
