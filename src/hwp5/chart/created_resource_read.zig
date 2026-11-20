//! A request-local fresh resource index basis when pending chart bytes exist.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
pub const View = struct {
    bytes: ?[]u8 = null,
    source: ?Source = null,
    pub fn get(self: *const View, original: *const Source) *const Source {
        if (self.source) |*value| return value;
        return original;
    }
    pub fn deinit(self: *View, a: std.mem.Allocator) void {
        if (self.source) |*value| value.deinit();
        if (self.bytes) |bytes| a.free(bytes);
        self.* = .{};
    }
};
pub fn prepare(a: std.mem.Allocator, session: anytype, has_pending: bool) !View {
    if (!has_pending) return .{};
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    errdefer a.free(saved.bytes);
    const source = try Source.open(a, saved.bytes);
    return .{ .bytes = saved.bytes, .source = source };
}
