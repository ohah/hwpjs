const std = @import("std");
const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const values = @import("emf_plus_values.zig");

pub const TransformMatrix = struct {
    m11: f32,
    m12: f32,
    m21: f32,
    m22: f32,
    dx: f32,
    dy: f32,

    pub const identity: TransformMatrix = .{
        .m11 = 1,
        .m12 = 0,
        .m21 = 0,
        .m22 = 1,
        .dx = 0,
        .dy = 0,
    };

    pub fn product(left: TransformMatrix, right: TransformMatrix) TransformMatrix {
        return .{
            .m11 = left.m11 * right.m11 + left.m12 * right.m21,
            .m12 = left.m11 * right.m12 + left.m12 * right.m22,
            .m21 = left.m21 * right.m11 + left.m22 * right.m21,
            .m22 = left.m21 * right.m12 + left.m22 * right.m22,
            .dx = left.dx * right.m11 + left.dy * right.m21 + right.dx,
            .dy = left.dx * right.m12 + left.dy * right.m22 + right.dy,
        };
    }

    pub fn multiplied(self: TransformMatrix, operand: TransformMatrix, post_multiply: bool) TransformMatrix {
        return if (post_multiply) product(self, operand) else product(operand, self);
    }

    pub fn translation(dx: f32, dy: f32) TransformMatrix {
        var result = identity;
        result.dx = dx;
        result.dy = dy;
        return result;
    }

    pub fn scaling(sx: f32, sy: f32) TransformMatrix {
        var result = identity;
        result.m11 = sx;
        result.m22 = sy;
        return result;
    }

    pub fn rotation(angle_degrees: f32) TransformMatrix {
        const radians = angle_degrees * (@as(f32, std.math.pi) / 180.0);
        const cosine = @cos(radians);
        const sine = @sin(radians);
        return .{
            .m11 = cosine,
            .m12 = sine,
            .m21 = -sine,
            .m22 = cosine,
            .dx = 0,
            .dy = 0,
        };
    }

    pub fn mapPoint(self: TransformMatrix, point: geometry.PointF) geometry.PointF {
        return .{
            .x = point.x * self.m11 + point.y * self.m21 + self.dx,
            .y = point.x * self.m12 + point.y * self.m22 + self.dy,
        };
    }
};

pub fn read(reader: *binary.Reader) !TransformMatrix {
    var next = reader.*;
    const result: TransformMatrix = .{
        .m11 = try values.readFloat(&next),
        .m12 = try values.readFloat(&next),
        .m21 = try values.readFloat(&next),
        .m22 = try values.readFloat(&next),
        .dx = try values.readFloat(&next),
        .dy = try values.readFloat(&next),
    };
    reader.* = next;
    return result;
}

test "EMF+ transform matrix maps all six values in wire order" {
    var bytes = [_]u8{0} ** 24;
    for ([_]f32{ 1, 2, 3, 4, 5, 6 }, 0..) |value, index|
        std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(value), .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try read(&reader);
    try std.testing.expectEqual(@as(f32, 1), value.m11);
    try std.testing.expectEqual(@as(f32, 2), value.m12);
    try std.testing.expectEqual(@as(f32, 3), value.m21);
    try std.testing.expectEqual(@as(f32, 4), value.m22);
    try std.testing.expectEqual(@as(f32, 5), value.dx);
    try std.testing.expectEqual(@as(f32, 6), value.dy);
    try std.testing.expectEqual(@as(usize, 24), reader.offset);
}

test "EMF+ transform matrix truncation is atomic" {
    const bytes = [_]u8{0} ** 24;
    for (0..24) |cut| {
        var reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, read(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
}

test "EMF+ transform matrix uses GDI+ row-vector product and distinguishes pre from post" {
    const scale = TransformMatrix.scaling(2, 3);
    const translate = TransformMatrix.translation(5, 7);
    try std.testing.expectEqualDeep(TransformMatrix{
        .m11 = 2,
        .m12 = 0,
        .m21 = 0,
        .m22 = 3,
        .dx = 5,
        .dy = 7,
    }, scale.multiplied(translate, true));
    try std.testing.expectEqualDeep(TransformMatrix{
        .m11 = 2,
        .m12 = 0,
        .m21 = 0,
        .m22 = 3,
        .dx = 10,
        .dy = 21,
    }, scale.multiplied(translate, false));
}

test "EMF+ transform matrix constructors preserve identity scale translation and rotation semantics" {
    try std.testing.expectEqualDeep(TransformMatrix.identity, TransformMatrix.identity.multiplied(TransformMatrix.identity, true));
    try std.testing.expectEqualDeep(TransformMatrix.translation(-2, 4), TransformMatrix.translation(-2, 4));
    try std.testing.expectEqualDeep(TransformMatrix.scaling(2, -3), TransformMatrix.scaling(2, -3));
    const quarter_turn = TransformMatrix.rotation(90);
    try std.testing.expectApproxEqAbs(@as(f32, 0), quarter_turn.m11, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 1), quarter_turn.m12, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, -1), quarter_turn.m21, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 0), quarter_turn.m22, 0.000001);
}

test "EMF+ transform matrix applies row-vector scale shear and translation to a point" {
    const matrix: TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const point = matrix.mapPoint(.{ .x = 17, .y = 19 });
    try std.testing.expectEqual(@as(f32, 140), point.x);
    try std.testing.expectEqual(@as(f32, 197), point.y);
}
