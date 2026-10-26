//! Atomic explicit size/matrix changes; callers still own visual resize policy.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");
pub fn apply(session: *editor.Session, section_index: usize, picture: usize, dimensions: @import("picture_dimension_write.zig").Update, matrices: []const @import("picture_matrix_edit_values.zig").Entry, max_bytes: usize) !bool {
    return applyWithFrame(session, section_index, picture, dimensions, matrices, null, max_bytes);
}
pub fn applyWithFrame(session: *editor.Session, section_index: usize, picture: usize, dimensions: @import("picture_dimension_write.zig").Update, matrices: []const @import("picture_matrix_edit_values.zig").Entry, frame: ?@import("picture_frame_write.zig").Update, max_bytes: usize) !bool {
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
    if (frame) |update| {
        const section = &session.sections[section_index];
        changed = try @import("picture_frame_values.zig").set(session.allocator, &section.tree, &section.picture_frames, picture, update, session.options.max_xml_bytes) or changed;
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

test "picture frame transaction preserves three owners and saved XML on allocation failure" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic><p:sz width='12' height='8'/><p:pos horzOffset='4294967295' vertOffset='2'/><p:rotationInfo centerX='6' centerY='4'/><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo></p:pic></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var session = try editor.open(allocator, source, .{});
            defer session.deinit();
            var before = try checkpoint.capture(&session, 4_000_000);
            defer before.deinit();
            const entries = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = 8, .values = .{ 2, 0, 0, 0, 3, 0 } }};
            const changed = applyWithFrame(&session, 0, 3, .{ .display = .{ 9, 6 } }, &entries, .{ .offsets = .{ -4, 5 }, .center = .{ 4, 3 } }, 4_000_000) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_frames.items.len);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].picture_frames.items.len);
            const saved = try session.save();
            defer allocator.free(saved);
            var reopened = try editor.open(allocator, saved, .{});
            defer reopened.deinit();
            const geometry = try @import("picture_geometry_values.zig").read(allocator, &reopened.sections[0].tree, 3);
            try std.testing.expectEqual(@as(?i64, -4), geometry.horizontal_offset);
            try std.testing.expectEqual(@as(?i64, 5), geometry.vertical_offset);
            try before.exchange(&session);
            const restored = try session.save();
            defer allocator.free(restored);
            try std.testing.expectEqualSlices(u8, source, restored);
        }
    }.run, .{bytes});
}
