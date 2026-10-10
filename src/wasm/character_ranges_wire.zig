//! Read-only HCR1 ranges; no current-text ownership or source parsing.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, spans: anytype) ![]u8 {
    const count = std.math.cast(u32, spans.len) orelse return error.LimitExceeded;
    const row_bytes = std.math.mul(usize, spans.len, 16) catch return error.LimitExceeded;
    const length = std.math.add(usize, row_bytes, 8) catch return error.LimitExceeded;
    const bytes = try a.alloc(u8, length);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], "HCR1");
    std.mem.writeInt(u32, bytes[4..8], count, .little);
    for (spans, 0..) |span, index| {
        const row = bytes[8 + index * 16 ..][0..16];
        std.mem.writeInt(u32, row[0..4], std.math.cast(u32, span.start_unit) orelse return error.LimitExceeded, .little);
        std.mem.writeInt(u32, row[4..8], std.math.cast(u32, span.end_unit) orelse return error.LimitExceeded, .little);
        std.mem.writeInt(u32, row[8..12], span.char_shape_id orelse 0, .little);
        std.mem.writeInt(u32, row[12..16], @intFromBool(span.char_shape_id != null), .little);
    }
    return bytes;
}
