const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], .{ .raw = version }, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.index_mark_validation.inspect(tree);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != core.hwp5.control_rules.id("idxm")) continue;
        const p = try core.hwp5.index_mark.Properties.parse(h.properties);
        for ([_][]const u8{ p.first, p.second }) |s| {
            try int(a, &out, u16, @intCast(s.len / 2));
            try out.appendSlice(a, s);
        }
        try int(a, &out, u16, p.dummy);
        try out.appendSlice(a, p.extra);
    }
    return out.toOwnedSlice(a);
}
