//! Border wire admission delegates grouped ownership and resource work to one engine.
const std = @import("std");
const engine = @import("h5cell_style_batch.zig");
pub const Request = @import("cell_border_values.zig").Edit;
pub fn apply(a: std.mem.Allocator, current: *@import("cell_background_values.zig").Values, decoded: []const []u8, version: @import("../version.zig").Version, document: *const @import("../../model/document.zig").Document, info: []const u8, requests: []const Request, limit: usize) !void {
    if (requests.len == 0) return;
    if (requests.len > @import("../../model/cell_edit_budget.zig").max_cells) return error.LimitExceeded;
    const patches = try a.alloc(engine.Request, requests.len);
    defer a.free(patches);
    for (requests, patches) |r, *out| out.* = .{ .section = r.section, .table_node = r.table_node, .list_node = r.list_node, .patch = try @import("cell_border_values.zig").toPatch(r) };
    try engine.apply(a, current, decoded, version, document, info, patches, limit);
}
