const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");

test "picture matrix checkpoint owns actual edit values budget and source restoration" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var target: ?usize = null;
    for (section.tree.elements, 0..) |_, node| {
        if (@import("picture_matrix_fields.zig").kind(&section.tree, node) == .scale) {
            target = node;
            break;
        }
    }
    const node = target orelse return error.MissingPictureMatrix;
    const budget = try checkpoint.size(&session, std.math.maxInt(usize));
    var before = try checkpoint.capture(&session, 4_000_000);
    defer before.deinit();
    const values: [6]f64 = .{ 2, 0, 0, 0, 3, 0 };
    const rendering = section.tree.elements[node].parent.?;
    const picture = section.tree.elements[rendering].parent.?;
    const matrices = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = node, .values = values }};
    try std.testing.expect(try @import("picture_geometry_transaction.zig").apply(&session, 0, picture, .{ .display = .{ 10000, 6000 }, .current = .{ 10000, 6000 } }, &matrices, 4_000_000));
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    const raw = try @import("picture_matrix_fields.zig").read(a, &reopened.sections[0].tree, node);
    for (values, raw) |expected, actual| try std.testing.expectEqual(@as(?f64, expected), actual);
    const live_corners = try @import("picture_rendering_corners.zig").readCurrent(a, &section.tree, picture, &section.picture_matrices, 1024);
    const saved_corners = try @import("picture_rendering_corners.zig").read(a, &reopened.sections[0].tree, picture, 1024);
    try std.testing.expectEqualDeep(saved_corners, live_corners);
    const sizes = try @import("picture_dimension_values.zig").read(a, &reopened.sections[0].tree, picture);
    try std.testing.expectEqualDeep([2]?u32{ 10000, 6000 }, sizes.display);
    try std.testing.expectEqualDeep(sizes.display, sizes.current);
    try std.testing.expectError(error.LimitExceeded, checkpoint.capture(&session, budget));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var snapshot = try checkpoint.capture(&proxy, 4_000_000);
            defer snapshot.deinit();
            try std.testing.expectEqualDeep(source.sections[0].picture_matrices.items, snapshot.states[0].picture_matrices.items);
            try std.testing.expectEqualDeep(source.sections[0].picture_dimensions.items, snapshot.states[0].picture_dimensions.items);
        }
    }.run, .{&session});
    try before.exchange(&session);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try before.exchange(&session);
    try std.testing.expectEqualDeep(values, section.picture_matrices.items[0].values);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}

test "picture matrix session refuses protected pictures without changing pending state" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic><p:sz width='12' height='8' protect='true'/><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo></p:pic></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expectError(error.PictureSizeProtected, session.setPictureMatrix(0, 6, .{ 2, 0, 0, 0, 3, 0 }));
    try std.testing.expect(!try session.setPictureMatrix(0, 6, .{ 1, 0, 0, 0, 1, 0 }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
}
