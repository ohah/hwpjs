const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const mode = try r.readInt(u8);
    const list_mode = try r.readInt(u8);
    if (mode > 2 or list_mode > 1) return error.InvalidMode;
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var groups = try core.hwp5.list_groups.Groups.build(a, tree);
    defer groups.deinit(a);
    const report = try core.hwp5.note_validation.inspect(tree, groups.items, @enumFromInt(mode), if (list_mode == 0) .spec6 else .observed8);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    return out.toOwnedSlice(a);
}
