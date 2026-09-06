const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const view = try (try core.hwp5.body.ListHeader.parse(bytes)).view(.observed8);
    const flags = core.hwp5.body.CellAttributes.fromList(view);
    const c = try core.hwp5.body.Cell.parse(view.extra);
    const e = try core.hwp5.body.CellExtension.parse(c.extra);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ flags.raw, @intFromBool(flags.hasInnerMargins()), @intFromBool(flags.isProtected()), @intFromBool(flags.isHeader()), @intFromBool(flags.isEditable()), @intFromBool(e.text_width != null), e.text_width orelse 0, @intFromBool(e.marker != null), e.marker orelse 0, @intCast(e.remaining.len) }) |v| try int(a, &out, u32, v);
    try out.appendSlice(a, e.remaining);
    return out.toOwnedSlice(a);
}
