const std = @import("std");
const runs = @import("hwp5/edit/character_runs.zig");
const Run = @import("model/document.zig").CharacterRun;
fn at(rows: []const Run, unit: u32) u32 {
    var id = rows[0].char_shape_id;
    for (rows) |row| {
        if (row.start_unit > unit) break;
        id = row.char_shape_id;
    }
    return id;
}
test "H5 replacement affinity retains first replaced full style and surviving right boundary" {
    const a = std.testing.allocator;
    const rows = [_]Run{ .{ .start_unit = 0, .char_shape_id = 10 }, .{ .start_unit = 1, .char_shape_id = 20 }, .{ .start_unit = 4, .char_shape_id = 30 } };
    var work: usize = 0;
    const changed = try runs.replaceIndependent(a, &rows, &.{ .{ .start = 1, .end = 3, .added = 2 }, .{ .start = 4, .end = 6, .added = 1 } }, &work);
    defer a.free(changed);
    try std.testing.expectEqual(@as(u32, 10), at(changed, 0));
    try std.testing.expectEqual(@as(u32, 20), at(changed, 1));
    try std.testing.expectEqual(@as(u32, 20), at(changed, 3));
    try std.testing.expectEqual(@as(u32, 30), at(changed, 4));
    try std.testing.expectEqual(@as(u32, 30), at(changed, 5));
    try std.testing.expect(work <= rows.len);
}
test "H5 replacement affinity whole paragraph and zero width retain existing H5 styleAt start contract" {
    const a = std.testing.allocator;
    const rows = [_]Run{ .{ .start_unit = 0, .char_shape_id = 10 }, .{ .start_unit = 1, .char_shape_id = 20 }, .{ .start_unit = 4, .char_shape_id = 30 } };
    var work: usize = 0;
    const whole = try runs.replaceIndependent(a, &rows, &.{.{ .start = 0, .end = 7, .added = 3 }}, &work);
    defer a.free(whole);
    try std.testing.expectEqual(@as(u32, 10), at(whole, 0));
    try std.testing.expectEqual(@as(u32, 10), at(whole, 2));
    try std.testing.expectEqual(@as(u32, 30), at(whole, 3));
    const inserted = try runs.replaceIndependent(a, &rows, &.{.{ .start = 1, .end = 1, .added = 2 }}, &work);
    defer a.free(inserted);
    try std.testing.expectEqual(@as(u32, 20), at(inserted, 1));
    try std.testing.expectEqual(@as(u32, 20), at(inserted, 3));
    const deleted = try runs.replaceIndependent(a, &rows, &.{.{ .start = 1, .end = 4, .added = 0 }}, &work);
    defer a.free(deleted);
    try std.testing.expectEqual(@as(u32, 30), at(deleted, 1));
}
