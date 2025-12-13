/// Core viewer module - 공통 로직
/// Core viewer module - Common logic
///
/// 이 모듈은 모든 뷰어(HTML, Markdown, PDF, Image 등)에서 공통으로 사용되는
/// 로직을 제공합니다. 출력 형식만 다른 렌더러 패턴을 사용합니다.
///
/// This module provides common logic used by all viewers (HTML, Markdown, PDF, Image, etc.).
/// Uses a renderer pattern where only the output format differs.
pub mod bodytext;
mod paragraph;
pub mod renderer;

pub use bodytext::process_bodytext;
pub use paragraph::process_paragraph;
pub use renderer::{DocumentParts, Renderer, TextStyles};
