/// Common table processing logic
/// 공통 테이블 처리 로직
///
/// 모든 뷰어에서 공통으로 사용되는 테이블 처리 로직을 제공합니다.
/// 실제 렌더링은 Renderer 트레이트를 통해 처리됩니다.
///
/// Provides common table processing logic used by all viewers.
/// Actual rendering is handled through the Renderer trait.
use crate::document::bodytext::Table;
use crate::document::HwpDocument;
use crate::viewer::core::renderer::Renderer;

/// Process table (placeholder - actual rendering is done by renderer)
/// 테이블 처리 (플레이스홀더 - 실제 렌더링은 렌더러에서 수행)
pub fn process_table<R: Renderer>(
    _table: &Table,
    _document: &HwpDocument,
    _renderer: &R,
    _options: &R::Options,
) -> String {
    // 실제 테이블 렌더링은 Renderer::render_table에서 처리
    // Actual table rendering is handled in Renderer::render_table
    String::new()
}

