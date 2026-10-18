const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.rectangle_validation.inspect(tree, @fromBackingInt(@intCast(mode)));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (@typeInfo(@TypeOf(report)).@"struct".field_names) |f| try int(a, &out, u32, @intCast(@field(report, f)));
    return out.toOwnedSlice(a);
}
