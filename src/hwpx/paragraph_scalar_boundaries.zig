//! Bounded actual paragraph axis, shared by unordered metadata consumers.
//! No submitted maximum coordinate controls allocation or traversal length.
const std = @import("std");
pub fn build(a: std.mem.Allocator, sites: *const @import("text_sites.zig").Sites, positions: []const @import("paragraph_text_positions.zig").Segment, max_units: usize) ![]bool {
    var cursor = try @import("paragraph_boundary_cursor.zig").Cursor.init(sites, positions);
    if (cursor.total > max_units) return error.LimitExceeded;
    const valid = try a.alloc(bool, try std.math.add(usize, cursor.total, 1));
    errdefer a.free(valid);
    if (positions.len == 0) {
        @memset(valid, false);
        return valid;
    }
    for (valid, 0..) |*value, point| {
        cursor.validate(point) catch |err| switch (err) {
            error.SplitSurrogatePair => {
                value.* = false;
                continue;
            },
            else => return err,
        };
        value.* = true;
    }
    return valid;
}
pub fn validate(valid: []const bool, point: usize) !void {
    if (point >= valid.len or valid.len == 1 and !valid[0]) return error.InvalidTextPosition;
    if (!valid[point]) return error.SplitSurrogatePair;
}
