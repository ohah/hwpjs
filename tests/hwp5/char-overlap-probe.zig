const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidOverlapLayout;
    const layout: core.hwp5.char_overlap.Layout = if (mode == 0) .text_only else .full;
    const shapes = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.char_overlap_validation.inspect(tree, layout, shapes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != core.hwp5.control_rules.id("tcps")) continue;
        const p = try core.hwp5.char_overlap.Properties.parse(h.properties, layout);
        try int(a, &out, u16, @intCast(p.text.len / 2));
        try out.appendSlice(a, p.text);
        if (p.attributes) |attr| {
            try int(a, &out, u8, attr.border);
            try int(a, &out, i8, attr.inner_size);
            try int(a, &out, u8, attr.expansion);
            try int(a, &out, u8, @intCast(attr.shapes.count()));
            for (0..attr.shapes.count()) |i| try int(a, &out, u32, attr.shapes.get(i).?.id);
        }
        try out.appendSlice(a, p.extra);
    }
    return out.toOwnedSlice(a);
}
