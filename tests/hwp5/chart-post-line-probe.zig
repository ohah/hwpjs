const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-line-items-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.previous.previous.reader;
    const types = &prefix.previous.previous.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.previous.previous.objects;
    // Two selected corpus items, not a core count rule.
    for (0..2) |_| _ = try core.hwp5.chart_line_item.readObservedV1(reader, types, objects);
    const block = try core.hwp5.chart_post_line.readObserved(reader, types, objects);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ block.end, types.definitions.count(), objects.entries.count(), block.array.object_id, block.array.first_word, block.array.second_word, block.array.end }) |v| try int(a, &out, u32, @intCast(v));
    try out.appendSlice(a, &block.raw);
    return out.toOwnedSlice(a);
}
