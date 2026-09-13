const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-post-line-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    defer prefix.deinit();
    return serialize(a, prefix.block, prefix.types().definitions.count(), prefix.objects().entries.count());
}
pub fn serialize(a: std.mem.Allocator, block: core.hwp5.chart_post_line.Block, type_count: usize, object_count: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ block.end, type_count, object_count, block.array.object_id, block.array.first_word, block.array.second_word, block.array.end }) |v| try int(a, &out, u32, @intCast(v));
    try out.appendSlice(a, &block.raw);
    return out.toOwnedSlice(a);
}
