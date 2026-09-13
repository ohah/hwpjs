const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const header_size = 5 * @sizeOf(u32);
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
    try out.appendSlice(a, &@as([header_size]u8, @splat(0)));
    for (0..count) |_| {
        const item = try core.hwp5.chart_line_item.readObservedV1(reader, types, objects);
        try appendItem(a, &out, item);
    }
    header(out.items, word, count, reader.offset, types.definitions.count(), objects.entries.count());
    return out.toOwnedSlice(a);
}
fn header(out: []u8, word: u16, count: usize, end: usize, type_count: usize, object_count: usize) void {
    const fields = [_]usize{ word, count, end, type_count, object_count };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
}
fn appendItem(a: std.mem.Allocator, out: *std.ArrayList(u8), item: core.hwp5.chart_line_item.Item) !void {
    try int(a, out, u32, item.object_id);
    try int(a, out, u32, @intCast(item.end));
    try out.appendSlice(a, &item.raw);
}
pub fn serialize(a: std.mem.Allocator, word: u16, items: []const core.hwp5.chart_line_item.Item, end: usize, type_count: usize, object_count: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &@as([header_size]u8, @splat(0)));
    header(out.items, word, items.len, end, type_count, object_count);
    for (items) |item| try appendItem(a, &out, item);
    return out.toOwnedSlice(a);
}
