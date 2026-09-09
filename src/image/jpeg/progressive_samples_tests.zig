const std = @import("std");
const t = std.testing;
const samples = @import("progressive_samples.zig");
const frame = @import("progressive_frame.zig");
const storage = @import("sample_image.zig");

const prefix = [_]u8{ 255, 216, 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64 ++
    .{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0} ++
    .{ 255, 194, 0, 17, 8, 0, 1, 0, 1, 3, 9, 49, 0, 4, 18, 0, 7, 17, 0 };
const initial = prefix ++
    .{ 255, 218, 0, 8, 1, 7, 0, 0, 0, 1, 0x7f } ++
    .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 1, 0x3f } ++
    .{ 255, 218, 0, 8, 1, 4, 0, 0, 0, 1, 0x7f } ++
    .{ 255, 218, 0, 8, 1, 4, 0, 1, 63, 0, 0x7f } ++
    .{ 255, 218, 0, 8, 1, 9, 0, 1, 63, 0, 0x7f } ++
    .{ 255, 218, 0, 8, 1, 7, 0, 1, 63, 0, 0x7f };
const complete = initial ++
    .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 16, 255, 0 } ++
    .{ 255, 218, 0, 8, 1, 7, 0, 0, 0, 16, 0x7f } ++
    .{ 255, 218, 0, 8, 1, 4, 0, 0, 0, 16, 255, 0, 255, 217 };
const partial = initial ++ .{ 255, 217 };

fn successful(a: std.mem.Allocator) !void {
    var result = try samples.decode(a, &complete, .{ .frame = .{ .completion = .require_full }, .max_samples = 3 });
    defer result.deinit(a);
    for (result.image.planes, [_]u8{ 9, 4, 7 }, [_]u8{ 49, 18, 17 }, [_]u16{ 127, 131, 130 }) |plane, id, sampling, value| {
        try t.expectEqual(id, plane.component.id);
        try t.expectEqual(sampling, plane.component.sampling);
        try t.expectEqualSlices(u16, &.{value}, plane.samples);
        try t.expectEqual(@as(u32, 1), plane.extent.width);
        try t.expectEqual(@as(u32, 1), plane.extent.height);
    }
    try t.expectEqual(@as(usize, 192), result.progression.full_coefficients);
    for (result.levels[0..3]) |levels| for (levels) |level| try t.expectEqual(@as(u8, 0), level);
}

test "JPEG progressive samples preserve component order sampling and final point precision" {
    try successful(t.allocator);
    try t.expectError(error.LimitExceeded, samples.decode(t.allocator, &complete, .{ .frame = .{ .completion = .require_full }, .max_samples = 2 }));
}

test "JPEG progressive samples own output and never mutate coefficient input" {
    var bytes = complete;
    var coefficients = try frame.decode(t.allocator, &bytes, .{ .completion = .require_full });
    const before = coefficients.planes[0].grid.values[0];
    var result = try samples.fromCoefficients(t.allocator, &coefficients, .{ .completion = .require_full });
    defer result.deinit(t.allocator);
    try t.expectEqualDeep(before, coefficients.planes[0].grid.values[0]);
    coefficients.deinit(t.allocator);
    @memset(&bytes, 0);
    try t.expectEqual(@as(u16, 127), result.image.planes[0].samples[0]);
    try t.expectEqual(@as(u8, 17), result.image.planes[2].component.sampling);
    try t.expectEqual(@as(u8, 0), result.levels[0][0]);
}

test "JPEG progressive samples keep partial history and reject entirely unseen components" {
    var result = try samples.decode(t.allocator, &partial, .{ .frame = .{ .completion = .preserve_partial } });
    defer result.deinit(t.allocator);
    for (result.image.planes, [_]u16{ 126, 130, 130 }) |plane, expected| try t.expectEqualSlices(u16, &.{expected}, plane.samples);
    try t.expectEqual(@as(usize, 3), result.progression.partial_coefficients);
    try t.expectEqual(@as(u8, 1), result.levels[0][0]);
    try t.expectEqual(@as(u8, 0), result.levels[0][1]);
    try t.expectError(error.IncompleteJpegProgressiveCoefficients, samples.decode(t.allocator, &partial, .{ .frame = .{ .completion = .require_full } }));
    const unseen = prefix ++ .{ 255, 218, 0, 8, 1, 7, 0, 0, 0, 1, 0x7f, 255, 217 };
    try t.expectError(error.UnseenJpegProgressiveComponent, samples.decode(t.allocator, &unseen, .{ .frame = .{ .completion = .preserve_partial } }));
}

test "JPEG progressive samples release every failed allocation and late entropy failure" {
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    const corrupt = initial ++ .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 16, 0xfe, 255, 217 };
    try t.expectError(error.InvalidJpegEntropyPadding, samples.decode(t.allocator, &corrupt, .{ .frame = .{ .completion = .preserve_partial } }));
}

test "JPEG progressive samples crop nonsquare grids before writing visible rows" {
    // Q=8, six +1 DC differences give sample 129..134 in a 3x2 block grid.
    const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
    const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    const raw = [_]u8{ 255, 216 } ++ q ++ h ++
        .{ 255, 194, 0, 11, 8, 0, 9, 0, 17, 1, 9, 17, 0 } ++
        .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 0, 0x55, 0x5f } ++
        .{ 255, 218, 0, 8, 1, 9, 0, 1, 63, 0, 0x03, 255, 217 };
    var result = try samples.decode(t.allocator, &raw, .{ .frame = .{ .completion = .require_full }, .max_samples = 153 });
    defer result.deinit(t.allocator);
    try t.expectEqual(@as(usize, 153), result.image.planes[0].samples.len);
    for (0..9) |y| for (0..17) |x| try t.expectEqual(@as(u16, @intCast(129 + (y / 8) * 3 + x / 8)), result.image.planes[0].samples[y * 17 + x]);
}

test "JPEG progressive samples use precision-specific level shift and no second point scaling" {
    for ([_]u8{ 8, 12 }) |precision| for ([_]u8{ 0x3f, 0x7f }) |entropy| {
        const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
        const dc = [_]u8{ 255, 196, 0, 20, 0, 1 } ++ [_]u8{0} ** 15 ++ .{1};
        const raw = [_]u8{ 255, 216 } ++ q ++ dc ++
            .{ 255, 194, 0, 11, precision, 0, 1, 0, 1, 1, 9, 17, 0 } ++
            .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 3, entropy, 255, 217 };
        var result = try samples.decode(t.allocator, &raw, .{ .frame = .{ .completion = .preserve_partial } });
        defer result.deinit(t.allocator);
        const level: u16 = if (precision == 8) 128 else 2048;
        try t.expectEqual(if (entropy == 0x7f) level + 8 else level - 8, result.image.planes[0].samples[0]);
        try t.expectEqual(@as(u8, 3), result.levels[0][0]);
        try t.expectEqual(@as(u8, 255), result.levels[0][1]);
    };
}

test "JPEG sample image preflight validates bounds before allocating" {
    const descriptors = [_]storage.Descriptor{
        .{ .component = .{ .id = 9, .sampling = 17, .quantization = 0 }, .extent = .{ .width = 65535, .height = 65535 } },
        .{ .component = .{ .id = 4, .sampling = 17, .quantization = 0 }, .extent = .{ .width = 65535, .height = 65535 } },
    };
    try t.expectError(error.LimitExceeded, storage.Image.init(t.allocator, 65535, 65535, 8, &descriptors, 64000000));
    try t.expectError(error.InvalidJpegSampleExtent, storage.Image.init(t.allocator, 1, 1, 8, &descriptors, 64000000));
    try t.expectError(error.InvalidJpegComponentCount, storage.Image.init(t.allocator, 1, 1, 8, &.{}, 64000000));
}

test "JPEG progressive samples preserve both AC orientations at clipped block edges" {
    const expected = [_]u16{ 129, 129, 129, 128, 128, 127, 127, 127 };
    for ([_]u8{ 1, 17 }) |symbol| {
        const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
        const dc = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{0};
        const ac = [_]u8{ 16, 1, 1 } ++ [_]u8{0} ** 14 ++ .{ symbol, 0 };
        const raw = [_]u8{ 255, 216 } ++ q ++ .{ 255, 196, 0, 39 } ++ dc ++ ac ++
            .{ 255, 194, 0, 11, 8, 0, 9, 0, 9, 1, 9, 17, 0 } ++
            .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 0, 0x0f } ++
            .{ 255, 218, 0, 8, 1, 9, 0, 1, 63, 0, 0x66, 0x66, 255, 217 };
        var result = try samples.decode(t.allocator, &raw, .{ .frame = .{ .completion = .require_full } });
        defer result.deinit(t.allocator);
        for (0..9) |y| for (0..9) |x| try t.expectEqual(expected[if (symbol == 1) x % 8 else y % 8], result.image.planes[0].samples[y * 9 + x]);
    }
}

test "JPEG progressive samples use each component last used quantization snapshot" {
    const q8 = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
    const q24 = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{24} ** 64;
    const q40 = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{40} ** 64;
    const tables = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    const raw = [_]u8{ 255, 216 } ++ q8 ++ tables ++
        .{ 255, 194, 0, 14, 8, 0, 1, 0, 1, 2, 9, 17, 0, 4, 17, 0 } ++
        .{ 255, 218, 0, 8, 1, 9, 0, 0, 0, 0, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 9, 0, 1, 63, 0, 0x7f } ++ q24 ++
        .{ 255, 218, 0, 8, 1, 4, 0, 0, 0, 0, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 4, 0, 1, 63, 0, 0x7f } ++ q40 ++ .{ 255, 217 };
    var result = try samples.decode(t.allocator, &raw, .{ .frame = .{ .completion = .require_full } });
    defer result.deinit(t.allocator);
    try t.expectEqual(@as(u16, 129), result.image.planes[0].samples[0]);
    try t.expectEqual(@as(u16, 131), result.image.planes[1].samples[0]);
}
