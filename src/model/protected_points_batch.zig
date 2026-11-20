//! Right-affinity anchor map on the original bounded text axis. The scalar and
//! control boundary policy stays with the format adapter. No sorting or dense
//! loop over an unverified coordinate supplied by a client is allowed here.
const std = @import("std");
const independent = @import("independent_text_edits.zig");
const invalid = std.math.maxInt(u32);
pub const Mapping = struct {
    values: []u32,
    pub fn deinit(self: *Mapping, a: std.mem.Allocator) void {
        a.free(self.values);
        self.* = undefined;
    }
    pub fn map(self: Mapping, point: u32) !u32 {
        if (point >= self.values.len) return error.InvalidTextPosition;
        const result = self.values[point];
        if (result == invalid) return error.ProtectedCreatedTableAnchor;
        return result;
    }
};

/// before_units must be measured from the actual model text by the caller.
/// Identity edits do not move/protect anchors, matching the text writer no-op.
pub fn prepare(a: std.mem.Allocator, before_units: u32, edits: []const independent.Edit) !Mapping {
    if (before_units > @import("text_transaction.zig").limits.text_units) return error.LimitExceeded;
    _ = try independent.validate(edits, before_units, .{});
    const values = try a.alloc(u32, @as(usize, before_units) + 1);
    errdefer a.free(values);
    var cursor: usize = 0;
    var delta: i64 = 0;
    for (edits) |edit| {
        const expected = edit.expected orelse return error.MissingExpectedText;
        if (std.mem.eql(u8, expected, edit.text)) continue;
        const inserted = try independent.utf16Units(edit.text);
        while (cursor < edit.start) : (cursor += 1)
            values[cursor] = @intCast(@as(i64, @intCast(cursor)) + delta);
        while (cursor < edit.end) : (cursor += 1) {
            const mapped = @import("protected_point_splice.zig").unit(@intCast(cursor), edit.start, edit.end - edit.start, inserted) catch |err| switch (err) {
                error.ProtectedCreatedTableAnchor => {
                    values[cursor] = invalid;
                    continue;
                },
                else => return err,
            };
            values[cursor] = @intCast(@as(i64, mapped) + delta);
        }
        delta += @as(i64, inserted) - @as(i64, edit.end - edit.start);
    }
    while (cursor < values.len) : (cursor += 1)
        values[cursor] = @intCast(@as(i64, @intCast(cursor)) + delta);
    return .{ .values = values };
}

test "document text batch anchors retain right affinity and reject protected interiors" {
    const a = std.testing.allocator;
    var mapping = try prepare(a, 8, &.{
        .{ .start = 1, .end = 3, .text = "X", .expected = "ab" },
        .{ .start = 3, .end = 3, .text = "Y", .expected = "" },
        .{ .start = 5, .end = 7, .text = "cd", .expected = "cd" },
    });
    defer mapping.deinit(a);
    try std.testing.expectEqual(@as(u32, 0), try mapping.map(0));
    try std.testing.expectEqual(@as(u32, 2), try mapping.map(1));
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, mapping.map(2));
    try std.testing.expectEqual(@as(u32, 3), try mapping.map(3));
    try std.testing.expectEqual(@as(u32, 6), try mapping.map(6));
    try std.testing.expectEqual(@as(u32, 8), try mapping.map(8));
    try std.testing.expectError(error.InvalidTextPosition, mapping.map(0xfffffffe));
    try std.testing.expectError(error.LimitExceeded, prepare(a, 0xfffffffe, &.{}));
}
