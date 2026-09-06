const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var links = try core.hwp5.control_links.Links.build(a, tree);
    defer links.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (links.items) |link| inline for (std.meta.fields(@TypeOf(link))) |f| try int(a, &out, u32, @intCast(@field(link, f.name)));
    return out.toOwnedSlice(a);
}
