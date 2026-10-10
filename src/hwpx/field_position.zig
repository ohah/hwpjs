//! 현재 문단이 소유하는 폭 없는 필드 마커 값입니다.
pub const Position = struct {
    element_index: usize,
    begin_element: usize,
    kind: @import("field_markers.zig").Kind,
    unit: usize,
};
