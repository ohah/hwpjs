const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.ruby_validation.inspect(tree);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != core.hwp5.control_rules.id("tdut")) continue;
        const p = try core.hwp5.ruby.Properties.parse(h.properties);
        inline for (.{ p.main_text, p.sub_text }) |text| {
            try int(a, &out, u16, @intCast(text.len / 2));
            try out.appendSlice(a, text);
        }
        inline for (.{ "position", "size_ratio", "option", "style_number", "alignment" }) |f| try int(a, &out, u32, @field(p, f));
        try out.appendSlice(a, p.extra);
    }
    return out.toOwnedSlice(a);
}
