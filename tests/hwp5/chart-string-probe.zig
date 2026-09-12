const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var reader: core.Reader = .{ .bytes = bytes };
    const max_utf8 = try reader.readInt(u32);
    const max_scalars = try reader.readInt(u32);
    var value = try core.hwp5.chart_string_value.readObservedDual(a, bytes[reader.offset..], .{
        .max_bytes = limit,
        .max_utf8_bytes = max_utf8,
        .max_scalars = max_scalars,
    });
    defer value.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.legacy_bytes.len, value.utf16_offset, value.utf16le.len, value.scalar_count, value.utf8.len }) |field|
        try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, value.legacy_bytes);
    try out.appendSlice(a, value.utf16le);
    try out.appendSlice(a, value.utf8);
    return out.toOwnedSlice(a);
}
