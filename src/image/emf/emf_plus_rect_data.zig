const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const RectData = union(enum) {
    compressed: geometry.Rect,
    float: geometry.RectF,
};

pub fn read(reader: *binary.Reader, compressed: bool) !RectData {
    return if (compressed)
        .{ .compressed = try geometry.readRect(reader) }
    else
        .{ .float = try geometry.readRectF(reader) };
}

pub fn toRectF(value: RectData) geometry.RectF {
    return switch (value) {
        .compressed => |rect| .{
            .x = @floatFromInt(rect.x),
            .y = @floatFromInt(rect.y),
            .width = @floatFromInt(rect.width),
            .height = @floatFromInt(rect.height),
        },
        .float => |rect| rect,
    };
}

test "EMF+ rectangle data selects integer and floating wire forms exactly" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 16;
    for ([_]i16{ -1, 2, -3, 4 }, 0..) |value, index|
        std.mem.writeInt(i16, bytes[index * 2 ..][0..2], value, .little);
    var integer_reader: binary.Reader = .{ .bytes = &bytes };
    const integer = (try read(&integer_reader, true)).compressed;
    try std.testing.expectEqual(@as(i16, -1), integer.x);
    try std.testing.expectEqual(@as(i16, 2), integer.y);
    try std.testing.expectEqual(@as(i16, -3), integer.width);
    try std.testing.expectEqual(@as(i16, 4), integer.height);
    try std.testing.expectEqual(@as(usize, 8), integer_reader.offset);
    try std.testing.expectEqual(geometry.RectF{ .x = -1, .y = 2, .width = -3, .height = 4 }, toRectF(.{ .compressed = integer }));

    for ([_]f32{ 1.25, -2.5, 3.75, -4.5 }, 0..) |value, index|
        std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(value), .little);
    var float_reader: binary.Reader = .{ .bytes = &bytes };
    const float = (try read(&float_reader, false)).float;
    try std.testing.expectEqual(@as(f32, 1.25), float.x);
    try std.testing.expectEqual(@as(f32, -2.5), float.y);
    try std.testing.expectEqual(@as(f32, 3.75), float.width);
    try std.testing.expectEqual(@as(f32, -4.5), float.height);
    try std.testing.expectEqual(@as(usize, 16), float_reader.offset);
    try std.testing.expectEqual(float, toRectF(.{ .float = float }));
}
