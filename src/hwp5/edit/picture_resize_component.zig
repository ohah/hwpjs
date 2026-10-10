//! 그림 로컬 축 resize의 component 작성. 개체 표시 크기/보호/Session은 상위 책임입니다.
const std = @import("std");
const affine = @import("../../geometry/affine_row.zig");
const component = @import("../body/shape_component.zig");

pub fn write(a: std.mem.Allocator, payload: []const u8, layout: component.Layout, picture_payload: []const u8, target: [2]u32, limit: usize) ![]u8 {
    const parsed = try component.Component.parse(payload, layout);
    const picture = try @import("../body/shape_picture.zig").Picture.parse(picture_payload, .interleaved, .base73);
    const count = parsed.rendering.pairs.count();
    if (count == 0) return error.MissingPictureMatrix;
    const total = try @import("../body/rendering_affine.zig").compose(parsed.rendering);
    var points: [4][2]f64 = undefined;
    var corners: [4][2]f64 = undefined;
    for (&points, &corners, 0..) |*point, *corner, index| {
        const raw = picture.points.get(index).?;
        point.* = .{ @floatFromInt(raw.x), @floatFromInt(raw.y) };
        corner.* = try affine.transformPoint(total, point.*);
    }
    const before = [2]f64{ std.math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]), std.math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]) };
    const basis = [2][2]f64{ .{ points[1][0] - points[0][0], points[1][1] - points[0][1] }, .{ points[3][0] - points[0][0], points[3][1] - points[0][1] } };
    const change = try @import("../../geometry/resize_axes.zig").correction(basis, before, target);
    const desired = try @import("../../geometry/resize_axes.zig").resizeInBasis(total, points[0], change);
    // Validate both bases before preserving an already matching rendered axis.
    const tolerance = 32 * std.math.floatEps(f64) * @as(f64, @floatFromInt(1 + 6 * count));
    if (@abs(before[0] - @as(f64, @floatFromInt(target[0]))) <= tolerance * @as(f64, @floatFromInt(target[0])) and
        @abs(before[1] - @as(f64, @floatFromInt(target[1]))) <= tolerance * @as(f64, @floatFromInt(target[1])))
    {
        return @import("drawing_current_size_payload.zig").write(a, payload, layout, .{ .width = target[0], .height = target[1] }, limit);
    }
    if (std.meta.eql(change, affine.Matrix{ 1, 0, 0, 0, 1, 0 })) return @import("drawing_current_size_payload.zig").write(a, payload, layout, .{ .width = target[0], .height = target[1] }, limit);
    const unanchored = try affine.multiply(total, change);
    var translation: affine.Matrix = undefined;
    var scale: affine.Matrix = undefined;
    for (parsed.rendering.translation.bits, &translation) |bits, *value| value.* = @bitCast(bits);
    for (parsed.rendering.pairs.get(count - 1).?.scale.bits, &scale) |bits, *value| value.* = @bitCast(bits);
    translation[2] += desired[2] - unanchored[2];
    translation[5] += desired[5] - unanchored[5];
    const resized_scale = try affine.multiply(scale, change);
    const sized = try @import("drawing_current_size_payload.zig").write(a, payload, layout, .{ .width = target[0], .height = target[1] }, limit);
    defer a.free(sized);
    const translated = try @import("drawing_matrix_payload.zig").write(a, sized, layout, .translation, translation, limit);
    defer a.free(translated);
    return @import("drawing_matrix_payload.zig").write(a, translated, layout, .{ .scale = count - 1 }, resized_scale, limit);
}

test "HWP5 picture resize component actual fourteen axes preserve fixed point and all rotations" {
    const a = std.testing.allocator;
    var checked: usize = 0;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
        defer a.free(pictures);
        var tree = try @import("../body/tree.zig").Tree.parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        for (pictures) |picture| {
            const layout = try @import("../body/shape_validation.zig").componentLayout(tree, picture.component_node);
            const payload = tree.nodes[picture.component_node].record.framing.payload;
            const before = try component.Component.parse(payload, layout);
            const changed = try write(a, payload, layout, tree.nodes[picture.picture_node].record.framing.payload, .{ 10000, 6000 }, payload.len);
            defer a.free(changed);
            const after = try component.Component.parse(changed, layout);
            const repeated = try write(a, changed, layout, tree.nodes[picture.picture_node].record.framing.payload, .{ 10000, 6000 }, changed.len);
            defer a.free(repeated);
            try std.testing.expectEqualSlices(u8, changed, repeated);
            const mismatched = try @import("drawing_current_size_payload.zig").write(a, changed, layout, .{ .width = 123, .height = 456 }, changed.len);
            defer a.free(mismatched);
            const repaired = try write(a, mismatched, layout, tree.nodes[picture.picture_node].record.framing.payload, .{ 10000, 6000 }, changed.len);
            defer a.free(repaired);
            try std.testing.expectEqualSlices(u8, changed, repaired);
            if (checked == 0) {
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, input_payload: []const u8, selected_layout: component.Layout, picture_bytes: []const u8, expected: []const u8) !void {
                        const result = try write(allocator, input_payload, selected_layout, picture_bytes, .{ 10000, 6000 }, input_payload.len);
                        defer allocator.free(result);
                        try std.testing.expectEqualSlices(u8, expected, result);
                    }
                }.run, .{ payload, layout, tree.nodes[picture.picture_node].record.framing.payload, changed });
                try std.testing.expectError(error.InvalidResizeAxisSize, write(a, payload, layout, tree.nodes[picture.picture_node].record.framing.payload, .{ 0, 6000 }, payload.len));
                try std.testing.expectError(error.LimitExceeded, write(a, changed, layout, tree.nodes[picture.picture_node].record.framing.payload, .{ 10000, 6000 }, changed.len - 1));
            }
            const old_matrix = try @import("../body/rendering_affine.zig").compose(before.rendering);
            const new_matrix = try @import("../body/rendering_affine.zig").compose(after.rendering);
            var corners: [4][2]f64 = undefined;
            for (picture.points, &corners) |point, *corner| corner.* = try affine.transformPoint(new_matrix, .{ @floatFromInt(point[0]), @floatFromInt(point[1]) });
            const old_origin = try affine.transformPoint(old_matrix, .{ @floatFromInt(picture.points[0][0]), @floatFromInt(picture.points[0][1]) });
            for (old_origin, corners[0]) |old, current| try std.testing.expectApproxEqAbs(old, current, 0.000001);
            try std.testing.expectApproxEqAbs(@as(f64, 10000), std.math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]), 0.000001);
            try std.testing.expectApproxEqAbs(@as(f64, 6000), std.math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]), 0.000001);
            for (0..before.rendering.pairs.count()) |index| try std.testing.expectEqualDeep(before.rendering.pairs.get(index).?.rotation.bits, after.rendering.pairs.get(index).?.rotation.bits);
            try std.testing.expectEqualSlices(u8, before.extra, after.extra);
            checked += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 14), checked);
}
