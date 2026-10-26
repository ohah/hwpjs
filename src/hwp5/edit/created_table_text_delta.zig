//! Conservative retained-anchor mapping across derived UTF-16 label changes.
const std = @import("std");
const boundaries = @import("control_boundaries.zig");
pub const Delta = struct {
    start: u32,
    deleted: u32,
    inserted: u32,
    pub fn map(self: Delta, unit: u32) !u32 {
        return @import("../../model/protected_point_splice.zig").unit(unit, self.start, self.deleted, self.inserted);
    }
};

fn isBoundary(bytes: []const u8, unit: usize) !bool {
    const point = std.math.cast(u32, unit) orelse return error.LimitExceeded;
    boundaries.validate(bytes, point, point) catch |err| switch (err) {
        error.SplitSurrogatePair, error.SplitControlToken => return false,
        else => return err,
    };
    return true;
}

pub fn between(before: []const u8, after: []const u8) !Delta {
    try boundaries.validateRetainedText(before);
    try boundaries.validateRetainedText(after);
    try boundaries.validate(before, 0, 0);
    try boundaries.validate(after, 0, 0);
    if (std.mem.eql(u8, before, after)) return .{ .start = 0, .deleted = 0, .inserted = 0 };
    if (before.len < 2 or after.len < 2) return error.UnsupportedParagraphTerminator;
    const old_units = before.len / 2;
    const new_units = after.len / 2;
    var prefix: usize = 0;
    // Retain the final paragraph terminator outside the changed range.
    while (prefix < @min(old_units - 1, new_units - 1) and std.mem.eql(u8, before[prefix * 2 ..][0..2], after[prefix * 2 ..][0..2])) prefix += 1;
    while (!try isBoundary(before, prefix) or !try isBoundary(after, prefix)) prefix -= 1;
    var suffix: usize = 1;
    while (suffix < @min(old_units - prefix, new_units - prefix) and std.mem.eql(u8, before[(old_units - suffix - 1) * 2 ..][0..2], after[(new_units - suffix - 1) * 2 ..][0..2])) suffix += 1;
    while (!try isBoundary(before, old_units - suffix) or !try isBoundary(after, new_units - suffix)) suffix -= 1;
    return .{
        .start = std.math.cast(u32, prefix) orelse return error.LimitExceeded,
        .deleted = std.math.cast(u32, old_units - prefix - suffix) orelse return error.LimitExceeded,
        .inserted = std.math.cast(u32, new_units - prefix - suffix) orelse return error.LimitExceeded,
    };
}
