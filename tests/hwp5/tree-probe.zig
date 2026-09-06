const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = core.hwp5.Version{ .raw = try r.readInt(u32) };
    const resources: core.hwp5.paragraphs.Resources = .{ .char_shapes = try r.readInt(u32), .para_shapes = try r.readInt(u32), .styles = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.paragraphs.inspect(tree, resources);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |field| try int(a, &out, u32, @intCast(@field(report, field.name)));
    for (tree.nodes) |node| {
        try int(a, &out, u32, if (node.parent) |p| @intCast(p) else 0xffffffff);
        try int(a, &out, u32, @intCast(node.subtree_end));
    }
    return out.toOwnedSlice(a);
}
