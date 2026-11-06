//! Original single-cell outer edges; shared background Values owns all state.
const patch = @import("../../model/border_fill_patch.zig");
pub const Edit = struct {
    section: usize,
    table_node: u32,
    list_node: u32,
    edges: u8,
    style: patch.Style,
    width_hundredth_mm: u16,
    color: u32,
};
pub fn toPatch(edit: Edit) !patch.Patch {
    if (edit.edges == 0 or edit.edges & ~@as(u8, 15) != 0) return error.InvalidCellBorderEdges;
    _ = try patch.hwp5Style(edit.style);
    _ = try patch.widthCode(edit.width_hundredth_mm);
    try @import("../../model/rgb_color.zig").validate(edit.color);
    var out: patch.Patch = .{};
    for (&out.border.edges, 0..) |*edge, index| {
        if (edit.edges & (@as(u8, 1) << @intCast(index)) != 0)
            edge.* = .{ .style = edit.style, .width_hundredth_mm = edit.width_hundredth_mm, .color = edit.color };
    }
    return out;
}
