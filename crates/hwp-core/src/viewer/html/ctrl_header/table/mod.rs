/// 테이블 컨트롤 처리 및 렌더링 모듈 / Table control processing and rendering module
///
/// 이 모듈은 실제 구현을 `render`와 `process` 서브모듈에 위임하고,
/// 외부에서는 동일한 API(`render_table`, `process_table`, `CaptionInfo`)만 노출합니다.
mod cells;
mod constants;
mod geometry;
mod position;
mod process;
mod render;
mod size;
mod svg;

pub use process::process_table;
pub use render::{render_table, CaptionInfo};
