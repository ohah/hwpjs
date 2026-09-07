const std = @import("std");
const t = std.testing;
const trns = @import("transparency.zig");
const Header = @import("header.zig").Header;
const State = @import("metadata.zig").State;
const Chunk = @import("chunks.zig").Chunk;
fn header(color: u8, depth: u8) Header {
    return .{ .width = 1, .height = 1, .bit_depth = depth, .color_type = color, .interlace = 0 };
}
fn chunk(name: *const [4]u8, bytes: []const u8) Chunk {
    return .{ .name = name.*, .payload = bytes, .raw = &.{} };
}
test "PNG transparency grayscale full raw domain preserves and masks samples" {
    for ([_]u8{ 1, 2, 4, 8, 16 }) |depth| for (0..65536) |raw| {
        var bytes: [2]u8 = undefined;
        std.mem.writeInt(u16, &bytes, @intCast(raw), .big);
        const value = try trns.parse(header(0, depth), 0, &bytes);
        try t.expectEqual(raw, value.grayscale.raw);
        try t.expectEqual(raw % std.math.pow(usize, 2, depth), value.grayscale.value);
    };
    const rgb8 = try trns.parse(header(2, 8), 0, &.{ 255, 1, 128, 2, 64, 3 });
    for (rgb8.truecolor, 1..) |value, i| try t.expectEqual(i, value.value);
    const rgb16 = try trns.parse(header(2, 16), 0, &.{ 0, 1, 0, 2, 0, 3 });
    try t.expectEqual(@as(u16, 2), rgb16.truecolor[1].value);
}
test "PNG transparency palette missing entries are opaque and values own storage" {
    var bytes: [256]u8 = undefined;
    for (&bytes, 0..) |*byte, i| byte.* = @intCast(i);
    for (0..257) |len| {
        const value = try trns.parse(header(3, 8), 256, bytes[0..len]);
        try t.expectEqual(len, value.indexed.count);
        for (value.indexed.alpha, 0..) |alpha, i| try t.expectEqual(if (i < len) @as(u8, @intCast(i)) else 255, alpha);
    }
    const owned = try trns.parse(header(3, 8), 256, &bytes);
    bytes[0] = 255;
    try t.expectEqual(@as(u8, 0), owned.indexed.alpha[0]);
    try t.expectError(error.InvalidPngTransparencySize, trns.parse(header(3, 1), 1, &.{ 0, 1 }));
    try t.expectError(error.InvalidPngPalette, trns.parse(header(3, 1), 3, &.{}));
    for ([_]u8{ 4, 6 }) |color| try t.expectError(error.InvalidPngTransparencyColor, trns.parse(header(color, 8), 0, &.{}));
    try t.expectError(error.UnsupportedPngFormat, trns.parse(header(3, 0), 1, &.{}));
}
test "PNG transparency ordering is atomic and empty present remains distinct" {
    var state: State = .{};
    const h = header(3, 1);
    try t.expectError(error.InvalidPngTransparencyOrder, state.consume(h, 1, chunk("tRNS", &.{})));
    try t.expect(state.transparency == null);
    try state.consume(h, 1, chunk("PLTE", &.{ 0, 0, 0 }));
    try t.expectError(error.InvalidPngTransparencySize, state.consume(h, 1, chunk("tRNS", &.{ 0, 1 })));
    try t.expectEqual(@as(usize, 0), state.validated_chunks);
    try state.consume(h, 1, chunk("tRNS", &.{}));
    try t.expectEqual(@as(u16, 0), state.transparency.?.indexed.count);
    try t.expectError(error.DuplicatePngTransparency, state.consume(h, 1, chunk("tRNS", &.{0})));
    try t.expectEqual(@as(usize, 1), state.validated_chunks);
    try t.expectError(error.InvalidPngTransparencyOrder, state.consume(h, 1, chunk("PLTE", &.{ 0, 0, 0 })));
    var late: State = .{};
    try late.consume(header(0, 8), 0, chunk("IDAT", &.{}));
    try t.expectError(error.InvalidPngTransparencyOrder, late.consume(header(0, 8), 0, chunk("tRNS", &.{ 0, 0 })));
}

fn allocation(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    var result = try pixels.decode(a, good, .{});
    defer result.deinit(a);
    try t.expectEqual(@as(usize, 0), result.report.structure.ancillary_chunks_deferred);
    try t.expectEqual(@as(u8, 127), result.report.transparency.?.indexed.alpha[0]);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedTransparencyFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngTransparencySize, err),
    }
}
test "PNG transparency integrated allocation failure cleanup and owned report" {
    const fixture = @import("pixels_fixture.zig");
    const good = try fixture.withTransparency(t.allocator, 0, &.{127});
    defer t.allocator.free(good);
    const bad = try fixture.withTransparency(t.allocator, 0, &.{ 0, 1 });
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocation, .{ good, bad });
}
