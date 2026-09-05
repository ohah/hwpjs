/// Renderer trait for different output formats
/// 다양한 출력 형식을 위한 렌더러 트레이트
///
/// 각 뷰어(HTML, Markdown, PDF, Image 등)는 이 트레이트를 구현하여
/// HWP 문서를 해당 형식으로 변환합니다.
///
/// Each viewer (HTML, Markdown, PDF, Image, etc.) implements this trait
/// to convert HWP documents to that format.
use crate::document::{bodytext::Table, HwpDocument};

/// Text styling information
/// 텍스트 스타일 정보
#[derive(Debug, Clone, Default)]
pub struct TextStyles {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    pub superscript: bool,
    pub subscript: bool,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub color: Option<String>,
    pub background_color: Option<String>,
}

/// Document parts for rendering
/// 렌더링을 위한 문서 부분들
#[derive(Debug, Clone, Default)]
pub struct DocumentParts {
    pub headers: Vec<String>,
    pub body_lines: Vec<String>,
    pub footers: Vec<String>,
    pub footnotes: Vec<String>,
    pub endnotes: Vec<String>,
}

/// Renderer trait for converting HWP documents to various formats
/// HWP 문서를 다양한 형식으로 변환하는 렌더러 트레이트
pub trait Renderer {
    /// Renderer-specific options type
    /// 렌더러별 옵션 타입
    type Options: Clone;

    // ===== Text Styling =====
    /// Render plain text with optional styles
    /// 스타일이 적용된 일반 텍스트 렌더링
    fn render_text(&self, text: &str, styles: &TextStyles) -> String;

    /// Render bold text
    /// 굵은 텍스트 렌더링
    fn render_bold(&self, text: &str) -> String;

    /// Render italic text
    /// 기울임 텍스트 렌더링
    fn render_italic(&self, text: &str) -> String;

    /// Render underlined text
    /// 밑줄 텍스트 렌더링
    fn render_underline(&self, text: &str) -> String;

    /// Render strikethrough text
    /// 취소선 텍스트 렌더링
    fn render_strikethrough(&self, text: &str) -> String;

    /// Render superscript text
    /// 위첨자 텍스트 렌더링
    fn render_superscript(&self, text: &str) -> String;

    /// Render subscript text
    /// 아래첨자 텍스트 렌더링
    fn render_subscript(&self, text: &str) -> String;

    // ===== Structure Elements =====
    /// Render a paragraph
    /// 문단 렌더링
    fn render_paragraph(&self, content: &str) -> String;

    /// Render a table
    /// 테이블 렌더링
    fn render_table(
        &self,
        table: &Table,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String;

    /// Render an image
    /// 이미지 렌더링
    fn render_image(
        &self,
        image_id: u16,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> Option<String>;

    /// Render a page break
    /// 페이지 구분선 렌더링
    fn render_page_break(&self) -> String;

    // ===== Document Structure =====
    /// Render the complete document
    /// 전체 문서 렌더링
    fn render_document(
        &self,
        parts: &DocumentParts,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String;

    /// Render document header (title, version, etc.)
    /// 문서 헤더 렌더링 (제목, 버전 등)
    fn render_document_header(&self, document: &HwpDocument, options: &Self::Options) -> String;

    /// Render document footer (footnotes, endnotes, etc.)
    /// 문서 푸터 렌더링 (각주, 미주 등)
    fn render_document_footer(&self, parts: &DocumentParts, options: &Self::Options) -> String;

    // ===== Special Elements =====
    /// Render a footnote reference link
    /// 각주 참조 링크 렌더링
    fn render_footnote_ref(&self, id: u32, number: &str, options: &Self::Options) -> String;

    /// Render an endnote reference link
    /// 미주 참조 링크 렌더링
    fn render_endnote_ref(&self, id: u32, number: &str, options: &Self::Options) -> String;

    /// Render a footnote back link
    /// 각주 돌아가기 링크 렌더링
    fn render_footnote_back(&self, ref_id: &str, options: &Self::Options) -> String;

    /// Render an endnote back link
    /// 미주 돌아가기 링크 렌더링
    fn render_endnote_back(&self, ref_id: &str, options: &Self::Options) -> String;

    /// Render outline number
    /// 개요 번호 렌더링
    fn render_outline_number(&self, level: u8, number: u32, content: &str) -> String;
}
