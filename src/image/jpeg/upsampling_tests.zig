const std = @import("std");
const t = std.testing;
const Sampler = @import("upsampling.zig").Sampler;
const Method = @import("upsampling.zig").Method;

test "JPEG upsampling visible planes preserve corners axes and input lifetime" {
    var source = [_]u16{ 0, 100, 200, 300 };
    const linear = try Sampler.fromDimensions(&source, 2, 2, 3, 3, .bilinear);
    try t.expectEqual(@as(u16, 0), linear.sample(0, 0).?);
    try t.expectEqual(@as(u16, 50), linear.sample(1, 0).?);
    try t.expectEqual(@as(u16, 100), linear.sample(0, 1).?);
    try t.expectEqual(@as(u16, 150), linear.sample(1, 1).?);
    try t.expectEqual(@as(u16, 300), linear.sample(2, 2).?);
    try t.expectEqual(@intFromPtr(&source), @intFromPtr(linear.samples.ptr));
    const nearest = try Sampler.fromDimensions(&source, 2, 2, 3, 3, .nearest);
    try t.expectEqual(@as(u16, 300), nearest.sample(1, 1).?);
    for ([_]Method{ .nearest, .bilinear }) |method| {
        const rectangle = [_]u16{ 7, 29, 103, 301, 997, 4093 };
        for ([_][2]u16{ .{ 3, 2 }, .{ 2, 3 } }) |dimensions| {
            const rectangular = try Sampler.fromDimensions(&rectangle, dimensions[0], dimensions[1], dimensions[0], dimensions[1], method);
            for (0..dimensions[1]) |y| for (0..dimensions[0]) |x| try t.expectEqual(rectangle[y * dimensions[0] + x], rectangular.sample(@intCast(x), @intCast(y)).?);
        }
        const identity = try Sampler.fromDimensions(&source, 2, 2, 2, 2, method);
        for (0..2) |y| for (0..2) |x| try t.expectEqual(source[y * 2 + x], identity.sample(@intCast(x), @intCast(y)).?);
        try t.expect(identity.sample(2, 0) == null);
        try t.expect(identity.sample(0, 2) == null);
        try t.expect(identity.sample(std.math.maxInt(u32), std.math.maxInt(u32)) == null);
    }
}

test "JPEG upsampling rejects mismatched visible storage and downsampling" {
    try t.expectError(error.InvalidJpegSamplePlaneLength, Sampler.fromDimensions(&.{ 1, 2, 3 }, 2, 2, 3, 3, .bilinear));
    try t.expectError(error.InvalidJpegSamplePlaneLength, Sampler.fromDimensions(&.{ 1, 2, 3, 4, 5 }, 2, 2, 3, 3, .nearest));
    try t.expectError(error.InvalidJpegSampleAxis, Sampler.fromDimensions(&.{1}, 0, 1, 1, 1, .nearest));
    try t.expectError(error.InvalidJpegSampleAxis, Sampler.fromDimensions(&.{1}, 1, 1, 0, 1, .nearest));
    try t.expectError(error.InvalidJpegSampleAxis, Sampler.fromDimensions(&.{ 1, 2 }, 2, 1, 1, 1, .bilinear));
    const maximal = try Sampler.fromDimensions(&.{65535}, 1, 1, 65535, 65535, .bilinear);
    try t.expectEqual(@as(u16, 65535), maximal.sample(65534, 65534).?);
}
