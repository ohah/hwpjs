/// 테이블 컨트롤 처리 및 렌더링 모듈 / Table control processing and rendering module
///
/// 이 모듈은 실제 구현을 `render`와 `process` 서브모듈에 위임하고,
/// 외부에서는 동일한 API(`render_table`, `process_table`, `CaptionInfo`)만 노출합니다.
pub mod cells;
pub mod constants;
pub mod geometry;
pub mod position;
pub mod process;
pub mod render;
pub mod size;
pub mod svg;

pub use process::process_table;
pub use render::{render_table, CaptionData, TablePosition, TableRenderContext};
