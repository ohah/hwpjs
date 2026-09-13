const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-collection-prefix.zig").read(a, bytes, limit);
    defer prefix.deinit();
    const value = try core.hwp5.chart_title.readBodyObservedV1(prefix.reader(), prefix.types(), prefix.objects(), .{});
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ prefix.collection.title.object_id, value.end, prefix.types().definitions.count(), prefix.objects().entries.count(), prefix.objects().string_bytes, value.block.object_id }) |v| try int(a, &out, u32, @intCast(v));
    const body = try @import("chart-text-body-probe.zig").serializeNullableBlock(a, value.block, prefix.objects());
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
