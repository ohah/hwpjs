const std = @import("std");
const t = std.testing;
const planes = @import("sample_planes.zig");

// Three 1x1 components; Q=8 and DC delta +/-1 make distinct exact samples.
const fixture = [_]u8{ 255, 216, 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64 ++
    .{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0} ++
    .{ 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 9, 17, 0, 4, 17, 0, 7, 17, 0 } ++
    .{ 255, 218, 0, 8, 1, 7, 0, 0, 63, 0, 0x5f } ++
    .{ 255, 218, 0, 8, 1, 9, 0, 0, 63, 0, 0x1f } ++
    .{ 255, 218, 0, 8, 1, 4, 0, 0, 63, 0, 0x5f, 255, 217 };

fn successful(allocator: std.mem.Allocator) !void {
    var image = try planes.decode(allocator, &fixture, .{ .max_samples = 3 });
    defer image.deinit(allocator);
    try t.expectEqual(@as(u16, 1), image.width);
    try t.expectEqual(@as(u16, 1), image.height);
    try t.expectEqual(@as(u8, 8), image.precision);
    try t.expectEqual(@as(usize, 3), image.planes.len);
    for (image.planes, [_]u8{ 9, 4, 7 }, [_]u16{ 127, 129, 129 }) |plane, id, value| {
        try t.expectEqual(id, plane.component.id);
        try t.expectEqual(@as(u8, 17), plane.component.sampling);
        try t.expectEqual(@as(u32, 1), plane.extent.width);
        try t.expectEqual(@as(u32, 1), plane.extent.height);
        try t.expectEqualSlices(u16, &.{value}, plane.samples);
    }
}

test "JPEG sample planes preserve frame order and release every failed allocation" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    try t.expectError(error.LimitExceeded, planes.decode(t.allocator, &fixture, .{ .max_samples = 2 }));
}

test "JPEG sample planes clean up after a late final padding error" {
    var bad = fixture;
    bad[bad.len - 3] = 0x40;
    try t.expectError(error.InvalidJpegEntropyPadding, planes.decode(t.allocator, &bad, .{}));
}

test "JPEG sample planes do not borrow the input after decoding" {
    var bytes = fixture;
    var image = try planes.decode(t.allocator, &bytes, .{});
    defer image.deinit(t.allocator);
    @memset(&bytes, 0);
    try t.expectEqual(@as(u16, 127), image.planes[0].samples[0]);
    try t.expectEqual(@as(u8, 7), image.planes[2].component.id);
}

test "JPEG sample planes retain sampling factors even for identical one-pixel extents" {
    var bytes = fixture;
    // SOF payload follows SOI, DQT and DHT; change only borrowed component
    // sampling bytes. Single-component scans still each encode one block.
    const sof_payload = 2 + 69 + 40 + 4;
    for ([_]u8{ 49, 18, 17 }, 0..) |sampling, i| bytes[sof_payload + 7 + i * 3] = sampling;
    var image = try planes.decode(t.allocator, &bytes, .{});
    defer image.deinit(t.allocator);
    @memset(&bytes, 0);
    for (image.planes, [_]u8{ 49, 18, 17 }) |plane, sampling| {
        try t.expectEqual(sampling, plane.component.sampling);
        try t.expectEqual(@as(u32, 1), plane.extent.width);
        try t.expectEqual(@as(u32, 1), plane.extent.height);
    }
}

test "JPEG sample planes keep nonconstant horizontal and vertical sample positions" {
    // DC=0, one AC +1 with Q=8, then EOB. AC code0 has size1,
    // EOB code10. Run0 addresses horizontal frequency1; run1 vertical1.
    const q_segment = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
    const dc = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    const ac = [_]u8{ 16, 1, 1 } ++ [_]u8{0} ** 14 ++ .{ 1, 0 };
    const image_bytes = [_]u8{ 255, 216 } ++ q_segment ++ .{ 255, 196, 0, 39 } ++ dc ++ ac ++
        .{ 255, 192, 0, 11, 8, 0, 8, 0, 8, 1, 9, 17, 0 } ++
        .{ 255, 218, 0, 8, 1, 9, 0, 0, 63, 0, 0x37, 255, 217 };
    const expected = [_]u16{ 129, 129, 129, 128, 128, 127, 127, 127 };
    for ([_]u8{ 1, 17 }) |symbol| {
        var bytes = image_bytes;
        bytes[2 + q_segment.len + 4 + dc.len + 17] = symbol;
        var image = try planes.decode(t.allocator, &bytes, .{});
        defer image.deinit(t.allocator);
        for (image.planes[0].samples, 0..) |value, i|
            try t.expectEqual(expected[if (symbol == 1) i % 8 else i / 8], value);
    }
}
