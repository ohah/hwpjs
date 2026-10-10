//! Local-axis resize intent; preserves matrix sequence and original image data.
const std = @import("std");
const editor = @import("editor_session.zig");
const affine = @import("picture_transform_affine.zig");
pub const Plan = struct {
    grouped: bool,
    dimensions: @import("picture_dimension_write.zig").Update,
    matrices: [2]@import("picture_matrix_edit_values.zig").Entry,
};
pub fn build(session: *const editor.Session, section_index: usize, picture: usize, target: [2]u32) !Plan {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    const geometry = try @import("picture_geometry_values.zig").read(a, tree, picture);
    const dimensions = try @import("picture_dimension_edit_values.zig").read(a, tree, &section.picture_dimensions, picture);
    const grouped = try @import("picture_resize_size_policy.zig").grouped(a, tree, picture, dimensions);
    if (!grouped and (geometry.width_relative != 4 or geometry.height_relative != 2)) return error.UnsupportedRelativePictureResize;
    var transform = try @import("picture_transform_values.zig").readCurrent(a, tree, picture, &section.picture_matrices, 1024);
    defer transform.deinit(a);
    const total = try affine.renderingMatrix(&transform);
    const rectangle = try @import("picture_rectangle_values.zig").read(a, tree, picture);
    const corners = try @import("picture_rendering_corners.zig").apply(rectangle, total);
    const axes = [2]f64{ std.math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]), std.math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]) };
    const declared = if (grouped) dimensions.current else dimensions.display;
    const noop = declared[0] == target[0] and declared[1] == target[1] and @abs(axes[0] - @as(f64, @floatFromInt(target[0]))) <= 0.01 and @abs(axes[1] - @as(f64, @floatFromInt(target[1]))) <= 0.01;
    const origin = [2]f64{ @floatFromInt(rectangle.points[0][0].?), @floatFromInt(rectangle.points[0][1].?) };
    const basis = [2][2]f64{
        .{ @as(f64, @floatFromInt(rectangle.points[1][0].?)) - origin[0], @as(f64, @floatFromInt(rectangle.points[1][1].?)) - origin[1] },
        .{ @as(f64, @floatFromInt(rectangle.points[3][0].?)) - origin[0], @as(f64, @floatFromInt(rectangle.points[3][1].?)) - origin[1] },
    };
    const change: affine.Matrix = if (noop) .{ 1, 0, 0, 0, 1, 0 } else try @import("../geometry/resize_axes.zig").correction(basis, axes, target);
    const desired = try @import("../geometry/resize_axes.zig").resizeInBasis(total, origin, change);
    const unanchored = try affine.multiply(total, change);
    var translation = try affine.required(transform.matrices[0]);
    translation[2] += desired[2] - unanchored[2];
    translation[5] += desired[5] - unanchored[5];
    const scale = try affine.multiply(try affine.required(transform.matrices[transform.matrices.len - 2]), change);
    var missing: usize = 0;
    var duplicate: usize = 0;
    const rendering = @import("table_xml_fields.zig").uniqueChild(tree, picture, "renderingInfo", &missing, &duplicate) orelse return error.MissingPictureMatrix;
    var first: ?usize = null;
    var last_scale: ?usize = null;
    var cursor = tree.elements[rendering].first_child;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        const kind = @import("picture_matrix_fields.zig").kind(tree, node) orelse continue;
        if (first == null) first = node;
        if (kind == .scale) last_scale = node;
    }
    _ = try @import("../geometry/affine_row.zig").finite(translation);
    return .{ .grouped = grouped, .dimensions = if (noop) .{} else .{ .display = if (grouped) null else target, .current = target }, .matrices = .{
        .{ .matrix_node = first orelse return error.MissingPictureMatrix, .values = translation },
        .{ .matrix_node = last_scale orelse return error.MissingPictureMatrix, .values = scale },
    } };
}

test "picture resize plan updates all thirteen real picture axes and preserves zero-current no-op" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "shapepict-scaled.hwpx", "sample-5017-pics.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(16_000_000));
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        const tree = &session.sections[0].tree;
        for (tree.elements, 0..) |_, picture| {
            if (!@import("table_xml_fields.zig").childIs(tree, picture, "pic")) continue;
            var original = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
            defer original.deinit();
            const source = try @import("picture_dimension_values.zig").read(a, tree, picture);
            const noop = try build(&session, 0, picture, .{ source.display[0].?, source.display[1].? });
            try std.testing.expect(!noop.grouped);
            try std.testing.expect(!try @import("picture_geometry_transaction.zig").apply(&session, 0, picture, noop.dimensions, &noop.matrices, 4_000_000));
            const plan = try build(&session, 0, picture, .{ 10000, 6000 });
            try std.testing.expect(try @import("picture_geometry_transaction.zig").apply(&session, 0, picture, plan.dimensions, &plan.matrices, 4_000_000));
            const corners = try @import("picture_rendering_corners.zig").readCurrent(a, tree, picture, &session.sections[0].picture_matrices, 1024);
            try std.testing.expectApproxEqAbs(@as(f64, 10000), corners[1][0] - corners[0][0], 0.01);
            try std.testing.expectApproxEqAbs(@as(f64, 6000), corners[3][1] - corners[0][1], 0.01);
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            const after = try @import("picture_rendering_corners.zig").read(a, &reopened.sections[0].tree, picture, 1024);
            try std.testing.expectEqualDeep(corners, after);
            try original.exchange(&session);
            const restored = try session.save();
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, bytes, restored);
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 13), count);
}
