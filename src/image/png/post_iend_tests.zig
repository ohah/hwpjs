const std = @import("std");
const t = std.testing;
const structure = @import("structure.zig");
const pixels = @import("pixels.zig");

fn withTail(a: std.mem.Allocator, tail: []const u8) ![]u8 {
    const image = try @import("pixels_fixture.zig").image(a, 0);
    defer a.free(image);
    return std.mem.concat(a, u8, &.{ image, tail });
}

fn inspectCompatible(a: std.mem.Allocator, bytes: []const u8) !void {
    const result = try pixels.inspect(a, bytes, .{ .structure = .{ .post_iend = .{ .zero_padding = 2 } } });
    try t.expectEqual(@as(usize, 2), result.structure.post_iend_zero_bytes);
    try t.expect(result.structure.pixels_validated);
}

test "PNG post-IEND zero padding is explicit nonconforming boundary evidence" {
    const valid = try @import("pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(valid);
    const padded = try withTail(t.allocator, &.{ 0, 0 });
    defer t.allocator.free(padded);
    try t.expectError(error.TrailingData, structure.inspect(padded, .{}));
    try t.expectError(error.TrailingData, pixels.inspect(t.allocator, padded, .{}));
    try t.expectError(error.LimitExceeded, structure.inspect(padded, .{ .chunks = .{ .max_bytes = padded.len - 1 }, .post_iend = .{ .zero_padding = 2 } }));
    try t.expectError(error.LimitExceeded, structure.inspect(padded, .{ .post_iend = .{ .zero_padding = 0 } }));
    try t.expectError(error.LimitExceeded, structure.inspect(padded, .{ .post_iend = .{ .zero_padding = 1 } }));
    const boundary = try structure.inspect(padded, .{ .post_iend = .{ .zero_padding = 2 } });
    try t.expectEqual(@as(usize, 2), boundary.post_iend_zero_bytes);
    try t.expect(!boundary.pixels_validated);
    const original = try pixels.inspect(t.allocator, valid, .{});
    const result = try pixels.inspect(t.allocator, padded, .{ .structure = .{ .post_iend = .{ .zero_padding = 2 } } });
    try t.expectEqual(original.decoded_bytes, result.decoded_bytes);
    try t.expectEqual(original.reconstructed_crc32, result.reconstructed_crc32);
    try t.expectEqual(original.structure.chunks, result.structure.chunks);
    try t.expectEqual(@as(usize, 2), result.structure.post_iend_zero_bytes);
    try t.expect(result.structure.pixels_validated);
    try t.checkAllAllocationFailures(t.allocator, inspectCompatible, .{padded});
}

test "PNG post-IEND compatibility does not hide nonzero or corrupt bytes" {
    const padded = try withTail(t.allocator, &.{ 0, 1 });
    defer t.allocator.free(padded);
    const options: pixels.Options = .{ .structure = .{ .post_iend = .{ .zero_padding = 2 } } };
    try t.expectError(error.TrailingData, pixels.inspect(t.allocator, padded, options));
    padded[padded.len - 1] = 0;
    const end = padded.len - 2;
    padded[end - 1] ^= 1; // IEND CRC, not the outer padding.
    try t.expectError(error.InvalidChecksum, pixels.inspect(t.allocator, padded, options));
    padded[end - 1] ^= 1;
    const second = try @import("pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(second);
    const appended = try std.mem.concat(t.allocator, u8, &.{ padded[0..end], second });
    defer t.allocator.free(appended);
    try t.expectError(error.LimitExceeded, pixels.inspect(t.allocator, appended, options));
    try t.expectError(error.TrailingData, pixels.inspect(t.allocator, appended, .{ .structure = .{ .post_iend = .{ .zero_padding = second.len } } }));
}
