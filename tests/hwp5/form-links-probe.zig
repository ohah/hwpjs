const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var report = try core.hwp5.form_links.collectObservedUnits(a, tree, .{});
    defer report.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (report.links, 0..) |link, i| {
        try int(a, &out, u32, @intCast(i));
        inline for (.{ "paragraph_node", "text_node", "control_node", "start_unit", "code", "id", "header_id" }) |field| try int(a, &out, u32, @intCast(@field(link, field)));
    }
    return out.toOwnedSlice(a);
}
