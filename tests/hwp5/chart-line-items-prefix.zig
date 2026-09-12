const std = @import("std");
const previous = @import("chart-nullable-title-prefix.zig");
pub const Prefix = struct {
    previous: previous.Prefix,
    word: u16,
    pub fn deinit(self: *Prefix) void {
        self.previous.deinit();
        self.* = undefined;
    }
};
// Selected corpus prefix only; raw word is not an inferred item count.
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize, max_objects: usize) !Prefix {
    var prefix = try previous.read(a, contents, limit, 65535, 7 * 65535, max_objects, 16 * 1024 * 1024);
    errdefer prefix.deinit();
    const word = try prefix.previous.previous.previous.reader.readInt(u16);
    return .{ .previous = prefix, .word = word };
}
