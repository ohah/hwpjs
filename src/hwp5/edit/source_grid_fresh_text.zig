//! Only new SOURCE-grid cell paragraphs use the implicit one-unit terminator.
const std = @import("std");
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), level: u10, text: []const u8, limit: usize) !void {
    try @import("plain_text_content.zig").validatePlain(text);
    if (std.mem.eql(u8, text, &.{ 13, 0 })) return;
    try @import("../record_writer.zig").append(a, out, 67, level, text, limit);
}
