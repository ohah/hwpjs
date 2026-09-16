const binary = @import("../../binary/reader.zig");
const values = @import("emf_plus_values.zig");

pub const TransformMatrix = struct {
    m11: f32,
    m12: f32,
    m21: f32,
    m22: f32,
    dx: f32,
    dy: f32,
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
    const std = @import("std");
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
    const std = @import("std");
    const bytes = [_]u8{0} ** 24;
    for (0..24) |cut| {
        var reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, read(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
}
