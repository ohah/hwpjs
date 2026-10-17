//! Scalar projection of the existing CharShape parser, without layout defaults.
pub const Values = struct {
    ratio: [7]i16 = @splat(0),
    spacing: [7]i16 = @splat(0),
    relativeSize: [7]i16 = @splat(0),
    offset: [7]i16 = @splat(0),

    pub fn fromRaw(raw: @import("../docinfo/char_shape.zig").CharShape) Values {
        var result: Values = .{};
        for (0..7) |i| {
            result.ratio[i] = raw.ratios[i];
            result.spacing[i] = raw.spacing[i];
            result.relativeSize[i] = raw.relative_sizes[i];
            result.offset[i] = raw.offsets[i];
        }
        return result;
    }
};

pub const Row = struct { id: u32, values: Values };
pub fn encode(a: @import("std").mem.Allocator, shapes: anytype) ![]u8 {
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (rows, shapes) |*row, shape| row.* = .{ .id = shape.id, .values = shape.font_metrics };
    return @import("std").json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .format = "hwp5", .shapes = rows }, .{});
}

test "HWP5 font metrics preserve signed raw extremes and serialize numeric arrays" {
    const std = @import("std");
    var bytes: [68]u8 = @splat(0);
    bytes[14] = 255;
    bytes[21] = 128;
    bytes[28] = 0;
    bytes[35] = 127;
    const raw = try @import("../docinfo/char_shape.zig").CharShape.parse(&bytes, .{ .raw = 0x05000000 });
    const values = Values.fromRaw(raw);
    try std.testing.expectEqual(@as(i16, 255), values.ratio[0]);
    try std.testing.expectEqual(@as(i16, -128), values.spacing[0]);
    try std.testing.expectEqual(@as(i16, 0), values.relativeSize[0]);
    try std.testing.expectEqual(@as(i16, 127), values.offset[0]);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, v: Values) !void {
            const shapes = [_]struct { id: u32, font_metrics: Values }{.{ .id = 7, .font_metrics = v }};
            const output = try encode(a, &shapes);
            defer a.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "\"ratio\":[255,0,0,0,0,0,0]") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "\"spacing\":[-128,0,0,0,0,0,0]") != null);
        }
    }.run, .{values});
}
