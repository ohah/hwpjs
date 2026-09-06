const std = @import("std");
const t = std.testing;
const d = @import("decode.zig");
fn fixture(bad_checksum: bool) [308]u8 {
    var bytes = [_]u8{0} ** 308;
    std.mem.writeInt(u32, bytes[0..4], 0x1000001c, .little);
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    var plain = [_]u8{0} ** 48;
    @memcpy(plain[0..6], &[_]u8{ 1, 1, 0, 254, 255, 'A' });
    std.mem.writeInt(u32, plain[16..20], if (bad_checksum) 0 else std.hash.Crc32.hash("A"), .little);
    std.mem.writeInt(u32, plain[32..36], 1, .little);
    const cipher = std.crypto.core.aes.Aes128.initEnc(@import("key.zig").derive(bytes[4..260]));
    for (0..3) |i| cipher.encrypt(bytes[260 + 16 * i ..][0..16], plain[16 * i ..][0..16]);
    return bytes;
}
fn success(a: std.mem.Allocator, bytes: []const u8) !void {
    const output = try d.decode(a, bytes, .{});
    defer a.free(output);
    try t.expectEqualSlices(u8, "A", output);
}
fn failure(a: std.mem.Allocator, bytes: []const u8) !void {
    const output = d.decode(a, bytes, .{}) catch |err| switch (err) {
        error.InvalidChecksum => return,
        else => return err,
    };
    defer a.free(output);
    return error.ExpectedDistributionFailure;
}
test "distribution decoder success and late checksum failure clean all allocations" {
    const good = fixture(false);
    const bad = fixture(true);
    try t.checkAllAllocationFailures(t.allocator, success, .{&good});
    try t.checkAllAllocationFailures(t.allocator, failure, .{&bad});
}
test "distribution rejects short envelope and incomplete blocks without padding input" {
    var good = fixture(false);
    for (0..260) |cut| try t.expectError(error.UnexpectedEnd, d.decode(t.allocator, good[0..cut], .{}));
    for (260..276) |cut| try t.expectError(error.InvalidDistributionBlockSize, d.decode(t.allocator, good[0..cut], .{}));
    try t.expectError(error.LimitExceeded, d.decode(t.allocator, &good, .{ .max_ciphertext_bytes = 47 }));
    try t.expectError(error.LimitExceeded, d.decode(t.allocator, &good, .{ .max_output_bytes = 0 }));
    const plain = try d.decode(t.allocator, &good, .{ .compressed = false, .max_output_bytes = 48 });
    defer t.allocator.free(plain);
    try t.expectEqual(48, plain.len);
    try t.expectEqualSlices(u8, &.{ 1, 1, 0, 254, 255, 'A' }, plain[0..6]);
    try t.expectError(error.LimitExceeded, d.decode(t.allocator, &good, .{ .compressed = false, .max_output_bytes = 47 }));
    std.mem.writeInt(u32, good[0..4], 0x1000041c, .little);
    try t.expectError(error.InvalidDistributionRecord, d.decode(t.allocator, &good, .{}));
}
test "distribution trailer validates every padding position and both checksum fields" {
    var plain = [_]u8{0} ** 48;
    std.mem.writeInt(u32, plain[16..20], std.hash.Crc32.hash("A"), .little);
    std.mem.writeInt(u32, plain[32..36], 1, .little);
    const trailer = @import("trailer.zig");
    try trailer.validate(&plain, 6, "A");
    for (6..48) |i| {
        plain[i] ^= 1;
        const checksum = (i >= 16 and i < 20) or (i >= 32 and i < 36);
        try t.expectError(if (checksum) error.InvalidChecksum else error.InvalidDistributionPadding, trailer.validate(&plain, 6, "A"));
        plain[i] ^= 1;
    }
    try t.expectError(error.UnexpectedEnd, trailer.validate(&plain, 49, "A"));
    try t.expectError(error.TrailingData, trailer.validate(plain[0..47], 6, "A"));
}
