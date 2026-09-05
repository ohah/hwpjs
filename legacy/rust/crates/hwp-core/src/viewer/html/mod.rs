/// HTML converter for HWP documents
/// HWP 문서를 HTML로 변환하는 모듈
///
/// This module provides functionality to convert HWP documents to HTML format.
/// 이 모듈은 HWP 문서를 HTML 형식으로 변환하는 기능을 제공합니다.
///
/// noori.html 스타일의 정확한 레이아웃 HTML 뷰어
mod common;
mod common_test;
mod ctrl_header;
mod document;
mod document_test;
mod float_utils;
#[cfg(test)]
mod html_test;
mod image;
mod image_test;
mod line_segment;
mod line_segment_test;
mod options;
mod options_test;
mod page;
mod page_test;
mod pagination;
mod pagination_test;
mod paragraph;
mod render;
mod render_test;
mod styles;
mod styles_test;
pub(crate) mod text;
mod text_test;

// Re-export public API
#[allow(deprecated)]
pub use document::to_html;
#[allow(deprecated)]
pub use document::to_html_pages;
pub use document::HtmlPages;
pub use options::HtmlOptions;
pub use page::HtmlPageBreak;
pub use render::HtmlRenderer;
