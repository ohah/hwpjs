const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_string = try input.readInt(u32);
    const max_total = try input.readInt(u32);
    var prefix = try @import("chart-footnote-prefix.zig").read(a, bytes[input.offset..], limit);
    defer prefix.deinit();
    const value = try core.hwp5.chart_footnote.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, .{ .max_string_bytes = max_string, .max_total_string_bytes = max_total });
    const block = try @import("chart-text-block-probe.zig").serialize(a, value.block);
    defer a.free(block);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(value.end));
    try int(a, &out, u32, value.object_id);
    for (value.section.backdrop.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u16, value.section.backdrop.fill_suffix);
    try out.appendSlice(a, &value.section.raw);
    try out.appendSlice(a, &value.section.backdrop.raw_backdrop);
    try out.appendSlice(a, &value.section.backdrop.raw_fill);
    try out.appendSlice(a, &value.section.backdrop.raw_picture);
    try out.appendSlice(a, block);
    return out.toOwnedSlice(a);
}
