//! Atomic explicit size/matrix changes; callers still own visual resize policy.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");
pub fn apply(session: *editor.Session, section_index: usize, picture: usize, dimensions: @import("picture_dimension_write.zig").Update, matrices: []const @import("picture_matrix_edit_values.zig").Entry, max_bytes: usize) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (matrices.len > 1024) return error.LimitExceeded;
    const tree = &session.sections[section_index].tree;
    for (matrices, 0..) |entry, index| {
        if (@import("picture_matrix_fields.zig").kind(tree, entry.matrix_node) == null) return error.InvalidPictureMatrixNode;
        const rendering = tree.elements[entry.matrix_node].parent orelse return error.InvalidPictureMatrixParent;
        if (tree.elements[rendering].parent != picture) return error.InvalidPictureMatrixOwner;
        for (matrices[0..index]) |previous| if (previous.matrix_node == entry.matrix_node) return error.DuplicatePictureMatrixEdit;
    }
    var before = try checkpoint.capture(session, max_bytes);
    defer before.deinit();
    // These commands never replace source/allocator; exchange is allocation-free.
    errdefer before.rollback(session) catch unreachable;
    var changed = try session.setPictureDimensions(section_index, picture, dimensions);
    for (matrices) |entry| {
        const applied = try session.setPictureMatrix(section_index, entry.matrix_node, entry.values);
        changed = applied or changed;
    }
    _ = try checkpoint.size(session, max_bytes);
    return changed;
}

test "picture geometry transaction rolls back size after a late incomplete matrix error" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic><p:sz width='12' height='8'/><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1'/></p:renderingInfo></p:pic></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const entries = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = 6, .values = .{ 2, 0, 0, 0, 3, 0 } }};
    try std.testing.expectError(error.MissingXmlNumericAttribute, apply(&session, 0, 3, .{ .display = .{ 9, 6 } }, &entries, 4_000_000));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
}

test "picture geometry transaction preserves both owners on every injected allocation failure" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic><p:sz width='12' height='8'/><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo></p:pic></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var session = try editor.open(allocator, source, .{});
            defer session.deinit();
            const entries = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = 6, .values = .{ 2, 0, 0, 0, 3, 0 } }};
            const changed = apply(&session, 0, 3, .{ .display = .{ 9, 6 } }, &entries, 4_000_000) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
                try std.testing.expectEqualSlices(u8, source, session.source);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].picture_dimensions.items.len);
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].picture_matrices.items.len);
            try std.testing.expectEqualSlices(u8, source, session.source);
        }
    }.run, .{bytes});
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const budget = try checkpoint.size(&session, std.math.maxInt(usize));
    const entries = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = 6, .values = .{ 2, 0, 0, 0, 3, 0 } }};
    try std.testing.expectError(error.LimitExceeded, apply(&session, 0, 3, .{ .display = .{ 9, 6 } }, &entries, budget));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
}
