const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidHideLayout;
    const layout: core.hwp5.page_visibility.HideLayout = if (mode == 0) .spec16 else .observed32;
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], .{ .raw = version }, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.page_visibility_validation.inspect(tree, layout);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        const p = try core.hwp5.page_visibility.parse(h.id, h.properties, layout) orelse continue;
        try int(a, &out, u32, h.id);
        switch (p) {
            .hide => |v| {
                if (mode == 0) try int(a, &out, u16, @intCast(v.attributes)) else try int(a, &out, u32, v.attributes);
                try out.appendSlice(a, v.extra);
            },
            .parity => |v| {
                try int(a, &out, u32, v.attributes);
                try out.appendSlice(a, v.extra);
            },
        }
    }
    return out.toOwnedSlice(a);
}
