//! Compatibility wrapper: scalar borders use the shared atomic style planner.
const editor = @import("editor_session.zig");
const border = @import("table_cell_border_session.zig");
const p = @import("../model/border_fill_patch.zig");
const generic = @import("hxcell_style_batch.zig");
pub const Request = struct {
    section: usize,
    table_node: u32,
    list_node: u32,
    edges: u8,
    style: p.Style,
    width_hundredth_mm: u16,
    color: u32,
};

pub fn apply(session: *editor.Session, requests: []const Request) !bool {
    if (requests.len == 0) return false;
    if (requests.len > @import("../model/cell_edit_budget.zig").max_cells) return error.LimitExceeded;
    const patches = try session.allocator.alloc(generic.Request, requests.len);
    defer session.allocator.free(patches);
    for (requests, patches) |r, *patch| patch.* = .{ .section = r.section, .table_node = r.table_node, .list_node = r.list_node, .patch = try border.request(r.edges, r.style, r.width_hundredth_mm, r.color) };
    return generic.apply(session, patches) catch |err| switch (err) {
        error.DuplicateCellStyleTarget => error.DuplicateCellBorderTarget,
        else => err,
    };
}
