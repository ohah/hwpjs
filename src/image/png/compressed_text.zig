const std = @import("std");
const keyword = @import("keyword.zig");
const text = @import("text.zig");
const zlib = @import("../../compression/zlib.zig");
pub const Value = struct {
    /// Borrows the original payload; only text is owned.
    keyword: []const u8,
    text: []u8,
    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        a.free(self.text);
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8, max_output: usize) !Value {
    const prefix = try keyword.split(bytes);
    if (prefix.remaining.len == 0) return error.MissingPngTextCompressionMethod;
    if (prefix.remaining[0] != 0) return error.UnsupportedPngTextCompressionMethod;
    const decoded = try zlib.decode(a, prefix.remaining[1..], max_output);
    errdefer a.free(decoded);
    try text.validateLatin1(decoded);
    return .{ .keyword = prefix.keyword, .text = decoded };
}
