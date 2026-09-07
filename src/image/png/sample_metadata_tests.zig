const std = @import("std");
const t = std.testing;
const physical = @import("physical.zig");
const significant = @import("significant_bits.zig");
const Header = @import("header.zig").Header;
const State = @import("metadata.zig").State;
const Chunk = @import("chunks.zig").Chunk;
fn chunk(name: *const [4]u8, bytes: []const u8) Chunk {
    return .{ .name = name.*, .payload = bytes, .raw = &.{} };
}
test "PNG sample metadata physical axes full unit byte and size boundaries" {
    var bytes: [9]u8 = @splat(0);
    for (0..256) |unit| {
        bytes[8] = @intCast(unit);
        if (unit <= 1) {
            const value = try physical.parse(&bytes);
            try t.expectEqual(unit, value.unit);
            try t.expectEqual(@as(u32, 0), value.x);
        } else try t.expectError(error.UnsupportedPngPhysicalUnit, physical.parse(&bytes));
    }
    bytes[8] = 1;
    for ([_]usize{ 0, 4 }) |offset| for ([_]u32{ 0, 1, 3780, 0x7fffffff, 0x80000000, 0xffffffff }) |axis| {
        @memset(bytes[0..8], 0);
        std.mem.writeInt(u32, bytes[offset..][0..4], axis, .big);
        if (axis <= 0x7fffffff) {
            const value = try physical.parse(&bytes);
            try t.expectEqual(axis, if (offset == 0) value.x else value.y);
        } else try t.expectError(error.InvalidPngPhysicalValue, physical.parse(&bytes));
    };
    for (0..9) |len| try t.expectError(error.InvalidPngPhysicalSize, physical.parse(bytes[0..len]));
    try t.expectError(error.InvalidPngPhysicalSize, physical.parse(&(bytes ++ [_]u8{0})));
}
test "PNG sample metadata significant bits every position and byte value" {
    for ([_]u8{ 0, 2, 3, 4, 6 }) |color| for ([_]u8{ 1, 2, 4, 8, 16 }) |depth| {
        const h: Header = .{ .width = 1, .height = 1, .color_type = color, .bit_depth = depth, .interlace = 0 };
        h.validate() catch continue;
        const count: usize = switch (color) {
            0 => 1,
            2, 3 => 3,
            4 => 2,
            6 => 4,
            else => unreachable,
        };
        const max: u8 = if (color == 3) 8 else depth;
        var bytes: [4]u8 = @splat(1);
        for (0..count) |i| for (0..256) |candidate| {
            @memset(&bytes, 1);
            bytes[i] = @intCast(candidate);
            if (candidate > 0 and candidate <= max) {
                const value = try significant.parse(h, bytes[0..count]);
                try t.expectEqual(candidate, value.bits[i]);
                try t.expectEqual(count, value.count);
            } else try t.expectError(error.InvalidPngSignificantBitsValue, significant.parse(h, bytes[0..count]));
        };
        try t.expectError(error.InvalidPngSignificantBitsSize, significant.parse(h, bytes[0 .. count - 1]));
        try t.expectError(error.InvalidPngSignificantBitsSize, significant.parse(h, &.{ 1, 1, 1, 1, 1 }));
    };
}
test "PNG sample metadata ordering and failed state remain atomic" {
    const h: Header = .{ .width = 1, .height = 1, .color_type = 3, .bit_depth = 1, .interlace = 0 };
    var state: State = .{};
    try t.expectError(error.InvalidPngPhysicalSize, state.consume(h, 2, chunk("pHYs", &.{})));
    try t.expectEqual(@as(usize, 0), state.validated_chunks);
    try state.consume(h, 2, chunk("sBIT", &.{ 8, 7, 6 }));
    try state.consume(h, 2, chunk("PLTE", &.{}));
    try state.consume(h, 2, chunk("pHYs", &.{ 0, 0, 0, 0, 0, 0, 0, 0, 0 }));
    try t.expectError(error.DuplicatePngPhysical, state.consume(h, 2, chunk("pHYs", &.{})));
    try t.expectError(error.DuplicatePngSignificantBits, state.consume(h, 2, chunk("sBIT", &.{ 1, 1, 1 })));
    try t.expectEqual(@as(usize, 2), state.validated_chunks);
    var late: State = .{};
    try late.consume(h, 2, chunk("PLTE", &.{}));
    try t.expectError(error.InvalidPngSignificantBitsOrder, late.consume(h, 2, chunk("sBIT", &.{ 1, 1, 1 })));
    try late.consume(h, 2, chunk("IDAT", &.{}));
    try t.expectError(error.InvalidPngPhysicalOrder, late.consume(h, 2, chunk("pHYs", &.{})));
}
