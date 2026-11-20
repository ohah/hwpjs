//! One original-axis map for metadata owned by a paragraph text candidate.
//! The existing single-splice SSOT defines affinity and protected boundaries.
//! Callers still prove metadata ownership and install it with the text draft.
const std = @import("std");
const Edit = @import("text_splice_many.zig").EffectiveEdit;
const Affinity = @import("zero_width_coordinate.zig").Affinity;
const PointChange = @import("../model/point_splice.zig").Change;
pub const Mapping = struct {
    left: []u32,
    right: []u32,
    interior: []bool,
    after_units: u32,
    pub fn deinit(self: *Mapping, a: std.mem.Allocator) void {
        a.free(self.left);
        a.free(self.right);
        a.free(self.interior);
        self.* = undefined;
    }
    pub fn map(self: Mapping, unit: usize, affinity: Affinity) !u32 {
        if (unit >= self.left.len) return error.InvalidTextPosition;
        return if (affinity == .left) self.left[unit] else self.right[unit];
    }
    pub fn mapProtected(self: Mapping, unit: usize, affinity: Affinity) !u32 {
        if (unit >= self.interior.len) return error.InvalidTextPosition;
        if (self.interior[unit]) return error.ProtectedMetadataBoundary;
        return self.map(unit, affinity);
    }
};

/// Input must be the Native text preparation's effective edits. before_units is
/// measured from that actual paragraph, never an unchecked maximum coordinate.
/// Work/memory are linear in bounded actual units + edits + later metadata rows.
pub fn prepare(a: std.mem.Allocator, before_units: u32, edits: []const Edit) !Mapping {
    const limit = @import("../model/text_transaction.zig").limits.text_units;
    if (before_units > limit or edits.len > @import("../model/text_transaction.zig").limits.edits_count) return error.LimitExceeded;
    var after: i64 = before_units;
    var previous: ?Edit = null;
    for (edits) |edit| {
        if (edit.start > edit.end or edit.end > before_units) return error.InvalidTextPosition;
        if (previous) |old| if (edit.start < old.end or (edit.start == old.start and old.start == old.end)) return error.OverlappingTextEdits;
        if (edit.changed) after += @as(i64, edit.inserted_units) - @as(i64, edit.end - edit.start);
        previous = edit;
    }
    if (after < 0 or after > limit) return error.LimitExceeded;
    const count = @as(usize, before_units) + 1;
    const left = try a.alloc(u32, count);
    errdefer a.free(left);
    const right = try a.alloc(u32, count);
    errdefer a.free(right);
    const interior = try a.alloc(bool, count);
    errdefer a.free(interior);
    var cursor: usize = 0;
    var delta: i64 = 0;
    for (0..count) |unit| {
        var insertion_left: ?u32 = null;
        while (cursor < edits.len and (!edits[cursor].changed or edits[cursor].end <= unit)) : (cursor += 1) {
            const edit = edits[cursor];
            if (!edit.changed) continue;
            if (edit.start == unit and edit.end == unit)
                insertion_left = @intCast(@as(i64, @intCast(unit)) + delta);
            delta += @as(i64, edit.inserted_units) - @as(i64, edit.end - edit.start);
        }
        const base: u32 = @intCast(@as(i64, @intCast(unit)) + delta);
        left[unit] = insertion_left orelse base;
        right[unit] = base;
        interior[unit] = false;
        if (cursor < edits.len and edits[cursor].start <= unit) {
            const edit = edits[cursor];
            const change = try PointChange.init(edit.start, edit.end - edit.start, edit.inserted_units);
            left[unit] = @intCast(@as(i64, @intCast(try change.map(unit, .left))) + delta);
            right[unit] = @intCast(@as(i64, @intCast(try change.map(unit, .right))) + delta);
            interior[unit] = change.contains(unit);
        }
    }
    return .{ .left = left, .right = right, .interior = interior, .after_units = @intCast(after) };
}

/// Detached page metadata only. The caller validates partition membership both
/// before preparation and on the complete after-candidate before publication.
pub fn pageAreas(a: std.mem.Allocator, mapping: Mapping, input: []const @import("page_area_position.zig").Position) ![]@import("page_area_position.zig").Position {
    const output = try a.dupe(@import("page_area_position.zig").Position, input);
    errdefer a.free(output);
    for (output) |*position| {
        position.unit = mapping.mapProtected(position.unit, position.affinity) catch |err| return if (err == error.ProtectedMetadataBoundary) error.ProtectedPageAreaBoundary else err;
        position.affinity = @import("page_area_position.zig").canonicalAffinity(position.unit);
    }
    return output;
}

/// Detached title positions retain their source identities and affinity. Titles
/// use point_splice's collapse rule, while page declarations protect interiors.
pub fn titles(a: std.mem.Allocator, mapping: Mapping, input: []const @import("title_mark_position.zig").Position) ![]@import("title_mark_position.zig").Position {
    const output = try a.dupe(@import("title_mark_position.zig").Position, input);
    errdefer a.free(output);
    for (output) |*position|
        position.unit = try mapping.map(position.unit, if (position.affinity == .left) .left else .right);
    return output;
}

pub fn protectedPositions(a: std.mem.Allocator, mapping: Mapping, input: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]@import("paragraph_structure_values.zig").ProtectedPosition {
    const output = try a.dupe(@import("paragraph_structure_values.zig").ProtectedPosition, input);
    errdefer a.free(output);
    for (output) |*position| position.unit = mapping.mapProtected(position.unit, .right) catch |err|
        return if (err == error.ProtectedMetadataBoundary) error.ProtectedInlineControl else err;
    return output;
}

test "document text HX bulk metadata matches existing reverse original-axis splice affinity" {
    const a = std.testing.allocator;
    const patterns = [_][]const Edit{
        &.{},
        &.{ .{ .start = 1, .end = 3, .changed = true, .inserted_units = 1 }, .{ .start = 3, .end = 3, .changed = true, .inserted_units = 2 } },
        &.{ .{ .start = 0, .end = 0, .changed = true, .inserted_units = 2 }, .{ .start = 4, .end = 6, .changed = true, .inserted_units = 0 } },
        &.{ .{ .start = 1, .end = 3, .changed = false }, .{ .start = 4, .end = 6, .changed = true, .inserted_units = 3 } },
    };
    for (patterns) |edits| {
        var mapping = try prepare(a, 8, edits);
        defer mapping.deinit(a);
        for (0..9) |unit| for ([_]Affinity{ .left, .right }) |affinity| {
            var expected: usize = unit;
            var index = edits.len;
            var length: u32 = 8;
            var protected: ?u32 = @intCast(unit);
            while (index != 0) {
                index -= 1;
                const edit = edits[index];
                if (!edit.changed) continue;
                const change = try PointChange.init(edit.start, edit.end - edit.start, edit.inserted_units);
                expected = try change.map(expected, if (affinity == .left) .left else .right);
                if (protected) |point| protected = @import("zero_width_coordinate.zig").splice(point, affinity, edit.start, edit.end, edit.inserted_units, length) catch |err| switch (err) {
                    error.ProtectedMetadataBoundary => null,
                    else => return err,
                };
                length = length - (edit.end - edit.start) + edit.inserted_units;
            }
            try std.testing.expectEqual(expected, try mapping.map(unit, affinity));
            if (protected) |point| try std.testing.expectEqual(point, try mapping.mapProtected(unit, affinity)) else try std.testing.expectError(error.ProtectedMetadataBoundary, mapping.mapProtected(unit, affinity));
        };
    }
    try std.testing.expectError(error.LimitExceeded, prepare(a, 0xfffffffe, &.{}));
}
