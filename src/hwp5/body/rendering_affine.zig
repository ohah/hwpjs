//! Local renderingInfo only; no group-parent or object-position composition.
const std = @import("std");
const rendering = @import("rendering.zig");
const affine = @import("../../geometry/affine_row.zig");
fn values(matrix: rendering.Matrix) !affine.Matrix {
    var out: affine.Matrix = undefined;
    for (matrix.bits, &out) |bits, *value| value.* = @bitCast(bits);
    return affine.finite(out);
}
pub fn compose(source: rendering.Rendering) !affine.Matrix {
    var result = try values(source.translation);
    for (0..source.pairs.count()) |index| {
        const pair = source.pairs.get(index).?;
        result = try affine.multiply(try affine.multiply(result, try values(pair.rotation)), try values(pair.scale));
    }
    return result;
}
test "HWP5 rendering affine noncommuting scale rotation keeps raw bits and rejects nonfinite" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/matrix.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("tree.zig").Tree.parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.nodes) |node| {
        if (node.record.framing.tag != 76) continue;
        const shape = try @import("shape_component.zig").Component.parse(node.record.framing.payload, .double_id);
        const actual = try compose(shape.rendering);
        if (count == 0) try std.testing.expectEqualSlices(f64, &.{ 1, 0, 0, 0, 2, 0 }, &actual) else {
            try std.testing.expectEqual(@as(f64, -1), actual[1]);
            try std.testing.expectEqual(@as(f64, 0.5), actual[3]);
            const reversed = try affine.multiply(try values(shape.rendering.pairs.get(0).?.scale), try values(shape.rendering.pairs.get(0).?.rotation));
            try std.testing.expect(actual[1] != reversed[1]);
        }
        var invalid = shape.rendering;
        invalid.translation.bits[0] = 0x7ff8000000000001;
        try std.testing.expectError(error.NonFinitePictureMatrix, compose(invalid));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 3), count);
}
