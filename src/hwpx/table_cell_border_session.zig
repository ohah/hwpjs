//! Original-cell outer edges share the background intent, checkpoint and COW plan.
const std = @import("std");
const editor = @import("editor_session.zig");
const p = @import("../model/border_fill_patch.zig");

pub fn request(edges: u8, style: p.Style, width: u16, color: u32) !p.Patch {
    if (edges == 0 or edges & 0xf0 != 0) return error.InvalidCellBorderEdges;
    switch (style) {
        .NONE, .SOLID, .DOUBLE_SLIM => {},
        else => return error.UnsupportedBorderLineStyle,
    }
    var patch: p.Patch = .{};
    for (0..4) |i| if (edges & (@as(u8, 1) << @intCast(i)) != 0) {
        patch.border.edges[i] = .{ .style = style, .width_hundredth_mm = width, .color = color };
    };
    try p.validate(patch);
    return patch;
}

/// Clear only fields equal to the source; a background or another edge survives.
pub fn normalized(existing: p.Border, patch: p.Patch, source: p.Value) p.Border {
    var result = existing;
    for (patch.border.edges, 0..) |edge, i| if (edge) |next| {
        var intent = result.edges[i] orelse p.Edge{};
        inline for (.{ "style", "width_hundredth_mm", "color" }) |field| if (@field(next, field)) |value| {
            @field(intent, field) = if (@field(source.edges[i], field) == value) null else value;
        };
        result.edges[i] = if (p.edgeHas(intent)) intent else null;
    };
    return result;
}

pub const Request = @import("hxcell_border_batch.zig").Request;
pub fn applyBatch(session: *editor.Session, requests: []const Request) !bool {
    return @import("hxcell_border_batch.zig").apply(session, requests);
}
pub fn apply(session: *editor.Session, section: usize, table: usize, list: usize, edges: u8, style: p.Style, width: u16, color: u32) !bool {
    return applyBatch(session, &.{.{ .section = section, .table_node = std.math.cast(u32, table) orelse return error.InvalidCellBackgroundOwner, .list_node = std.math.cast(u32, list) orelse return error.InvalidCellBackgroundOwner, .edges = edges, .style = style, .width_hundredth_mm = width, .color = color }});
}
