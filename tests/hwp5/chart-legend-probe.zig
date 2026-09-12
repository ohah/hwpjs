const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_name = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const max_stored = try input.readInt(u32);
    var prefix = try @import("chart-legend-prefix.zig").read(a, bytes[input.offset..], limit, max_name, max_objects, max_stored);
    defer prefix.deinit();
    const value = prefix.legend;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.end, value.object_id, value.font.object_id, value.font.name.object_id, @intFromBool(value.font.name_introduced), value.font.name.bytes.len, value.font.name.trailer, prefix.objects.entries.count(), prefix.objects.string_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    for (value.section.backdrop.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u16, value.section.backdrop.fill_suffix);
    try out.appendSlice(a, &value.font.raw);
    try out.appendSlice(a, &value.raw);
    try out.appendSlice(a, &value.section.raw);
    try out.appendSlice(a, &value.section.backdrop.raw_backdrop);
    try out.appendSlice(a, &value.section.backdrop.raw_fill);
    try out.appendSlice(a, &value.section.backdrop.raw_picture);
    try out.appendSlice(a, value.font.name.bytes);
    return out.toOwnedSlice(a);
}
