const std = @import("std");

/// One budget for every returned path, including unused directory slots.
pub const PathBuilder = struct {
    allocator: std.mem.Allocator,
    remaining: usize,

    pub fn make(self: *PathBuilder, parent: []const u8, name: []const u8, trailing_slash: bool) ![]const u8 {
        var available = self.remaining;
        const suffix: []const u8 = if (trailing_slash) "/" else "";
        for ([_][]const u8{ parent, name, suffix }) |part| {
            if (part.len > available) return error.LimitExceeded;
            available -= part.len;
        }
        const path = try std.fmt.allocPrint(self.allocator, "{s}{s}{s}", .{ parent, name, suffix });
        self.remaining = available;
        return path;
    }
};
