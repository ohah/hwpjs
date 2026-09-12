const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    const count = try input.readInt(u32);
    if (count > 32) return error.LimitExceeded; // Test request bound only.
    const contents = bytes[input.offset..];
    var prefix = try @import("chart-line-items-prefix.zig").read(a, contents, limit, max_objects);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.previous.previous.reader;
    const types = &prefix.previous.previous.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.previous.previous.objects;
    const word = prefix.word;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &@as([20]u8, @splat(0)));
    for (0..count) |_| {
        const item = try core.hwp5.chart_line_item.readObservedV1(reader, types, objects);
        try int(a, &out, u32, item.object_id);
        try int(a, &out, u32, @intCast(item.end));
        try out.appendSlice(a, &item.raw);
    }
    const fields = [_]usize{ word, count, reader.offset, types.definitions.count(), objects.entries.count() };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out.items[i * 4 ..][0..4], @intCast(v), .little);
    return out.toOwnedSlice(a);
}
