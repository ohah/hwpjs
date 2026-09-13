const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-collection-prefix.zig").read(a, bytes, limit);
    defer prefix.deinit();
    const value = try core.hwp5.chart_title.readBodyObservedV1(prefix.reader(), prefix.types(), prefix.objects(), .{});
    return serialize(a, prefix.collection.title.object_id, value, prefix.types().definitions.count(), prefix.objects());
}
// Shared result-only wire for a standalone body and the complete Contents.
pub fn serialize(a: std.mem.Allocator, title_id: u32, value: core.hwp5.chart_title.Body, type_count: usize, objects: *const core.hwp5.chart_object_table.Table) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ title_id, value.end, type_count, objects.entries.count(), objects.string_bytes, value.block.object_id }) |v| try int(a, &out, u32, @intCast(v));
    const body = try @import("chart-text-body-probe.zig").serializeNullableBlock(a, value.block, objects);
    defer a.free(body);
    try out.appendSlice(a, body);
    try out.appendSlice(a, &value.section.raw);
    try int(a, &out, u32, @intCast(value.section.end));
    const bd = value.section.backdrop;
    for (bd.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u32, @intCast(bd.end));
    try int(a, &out, u16, bd.fill_suffix);
    try out.appendSlice(a, &bd.raw_backdrop);
    try out.appendSlice(a, &bd.raw_fill);
    try out.appendSlice(a, &bd.raw_picture);
    return out.toOwnedSlice(a);
}
