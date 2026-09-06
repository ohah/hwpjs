const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, false);
}
pub fn runMemo(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, true);
}
fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize, memo: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var groups = try core.hwp5.list_groups.Groups.build(a, tree);
    defer groups.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (memo) {
        const report = try core.hwp5.body.memo_validation.inspect(tree, groups.items);
        inline for (.{ "markers", "paragraphs", "extra_bytes" }) |name| try int(a, &out, u32, @intCast(@field(report, name)));
        return out.toOwnedSlice(a);
    }
    for (groups.items) |group| inline for (.{ "header_node", "parent_node", "begin", "end", "paragraph_count", "intervening_records" }) |name| try int(a, &out, u32, @intCast(@field(group, name)));
    return out.toOwnedSlice(a);
}
