//! Shared canonical character-style boundaries for text and formatting edits.
const std = @import("std");
const model = @import("../../model/document.zig");

pub fn validate(rows: []const model.CharacterRun, bytes: []const u8, count: usize) !void {
    if (rows.len == 0) return error.UnsupportedMissingCharacterRuns;
    if (rows[0].start_unit != 0) return error.AmbiguousCharacterRuns;
    for (rows, 0..) |r, i| {
        if (r.char_shape_id >= count) return error.InvalidResourceReference;
        try @import("plain_text_content.zig").boundary(bytes, r.start_unit);
        if (i > 0 and r.start_unit <= rows[i - 1].start_unit) return error.AmbiguousCharacterRuns;
    }
}

fn styleAt(rows: []const model.CharacterRun, unit: u32) u32 {
    var id = rows[0].char_shape_id;
    for (rows) |r| {
        if (r.start_unit > unit) break;
        id = r.char_shape_id;
    }
    return id;
}

fn append(a: std.mem.Allocator, rows: *std.ArrayList(model.CharacterRun), at: u32, id: u32) !void {
    if (rows.items.len > 0) {
        const last = &rows.items[rows.items.len - 1];
        if (last.start_unit == at) {
            last.char_shape_id = id;
            if (rows.items.len > 1 and rows.items[rows.items.len - 2].char_shape_id == id) _ = rows.pop();
            return;
        }
        if (last.char_shape_id == id) return;
    }
    try rows.append(a, .{ .start_unit = at, .char_shape_id = id });
}

/// Replace a span's style map; surviving units retain their own styles.
/// A splice inherits at start; a paint supplies an existing resource ID.
pub fn replace(a: std.mem.Allocator, rows: []const model.CharacterRun, start: u32, end: u32, added: u32, id: ?u32) ![]model.CharacterRun {
    var out: std.ArrayList(model.CharacterRun) = .empty;
    errdefer out.deinit(a);
    for (rows) |r| {
        if (r.start_unit >= start) break;
        try append(a, &out, r.start_unit, r.char_shape_id);
    }
    if (added != 0) try append(a, &out, start, id orelse styleAt(rows, start));
    try append(a, &out, start + added, styleAt(rows, end));
    for (rows) |r| {
        if (r.start_unit > end) try append(a, &out, r.start_unit - (end - start) + added, r.char_shape_id);
    }
    if (out.items.len > 65535) return error.LimitExceeded;
    return out.toOwnedSlice(a);
}

/// Join two validated style maps, excluding the left paragraph terminator.
/// Right styles (including its terminator/tail boundary) remain authoritative.
pub fn join(a: std.mem.Allocator, left: []const model.CharacterRun, right: []const model.CharacterRun, left_units: u32) ![]model.CharacterRun {
    if (left.len == 0 or right.len == 0) return error.UnsupportedMissingCharacterRuns;
    if (left[0].start_unit != 0 or right[0].start_unit != 0) return error.AmbiguousCharacterRuns;
    var out: std.ArrayList(model.CharacterRun) = .empty;
    errdefer out.deinit(a);
    for (left) |row| {
        if (row.start_unit >= left_units) break;
        try append(a, &out, row.start_unit, row.char_shape_id);
    }
    for (right) |row| {
        const at = std.math.add(u32, left_units, row.start_unit) catch return error.LimitExceeded;
        try append(a, &out, at, row.char_shape_id);
    }
    if (out.items.len > 65535) return error.LimitExceeded;
    return out.toOwnedSlice(a);
}

test "character run join preserves right affinity empty left tail and allocation failures" {
    const a = std.testing.allocator;
    const left = [_]model.CharacterRun{
        .{ .start_unit = 0, .char_shape_id = 1 },
        .{ .start_unit = 2, .char_shape_id = 2 },
        .{ .start_unit = 4, .char_shape_id = 9 },
    };
    const right = [_]model.CharacterRun{
        .{ .start_unit = 0, .char_shape_id = 3 },
        .{ .start_unit = 2, .char_shape_id = 4 },
    };
    const joined = try join(a, &left, &right, 4);
    defer a.free(joined);
    for (0..7) |unit| {
        const expected = if (unit < 4) styleAt(&left, @intCast(unit)) else styleAt(&right, @intCast(unit - 4));
        try std.testing.expectEqual(expected, styleAt(joined, @intCast(unit)));
    }
    const empty = try join(a, &left, &right, 0);
    defer a.free(empty);
    try std.testing.expectEqualSlices(model.CharacterRun, &right, empty);
    try std.testing.expectError(error.LimitExceeded, join(a, &left, &right, std.math.maxInt(u32)));
    try std.testing.expectError(error.UnsupportedMissingCharacterRuns, join(a, &.{}, &right, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, first: []const model.CharacterRun, second: []const model.CharacterRun) !void {
            const output = try join(allocator, first, second, 4);
            defer allocator.free(output);
        }
    }.run, .{ &left, &right });
}
