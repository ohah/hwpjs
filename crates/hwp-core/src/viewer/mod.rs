#[allow(missing_docs)] // TODO: Implement Canvas viewer
pub mod canvas;
/// Viewer module for converting HWP documents to various formats
/// HWP 문서를 다양한 형식으로 변환하는 뷰어 모듈
///
/// This module provides functionality to convert parsed HWP documents
/// into different output formats like Markdown, HTML, Canvas, PDF, etc.
/// 이 모듈은 파싱된 HWP 문서를 마크다운, HTML, Canvas, PDF 등 다양한 출력 형식으로 변환하는 기능을 제공합니다.
pub mod core;
/// Document(hwp-model) 기반 HTML viewer — HWP/HWPX 공통
pub mod doc_html;
/// Document(hwp-model) 기반 Markdown viewer — HWP/HWPX 공통
pub mod doc_markdown;
pub mod html;
pub mod markdown;
pub use core::renderer::{DocumentParts, Renderer, TextStyles};
pub use doc_html::doc_to_html;
pub use doc_markdown::doc_to_markdown;
pub use html::{to_html, to_html_pages, HtmlOptions, HtmlPages};
pub use markdown::{to_markdown, MarkdownOptions};
