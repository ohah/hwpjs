const std = @import("std");
const stream = @import("password_stream.zig");

test "HWP5 password stream rejects independently rechecksummed inner corruption with OOM" {
    // Node-generated vectors with a VALID outer plaintext CRC; failure must
    // occur in DEFLATE or the inner alignment/CRC32/ISIZE envelope.
    const vectors = [_][]const u8{
        "040b348fe766575040e04c91c764299e7e4ca67fd7e1bca8324c9e03947fe737fea5b9b5fb7d629c6d8cfe08e804336338a4ce595b307ea1",
        "b2cfaeb8dfd914945535e58b5096e5aa8893183f61bc2dc55f19348c4274b859ffd0ba848ad2e879a0f2e00f38bc02c538a4ce59f076d63c",
        "b2cfaeb8dfd91495fc960c0005e9d12a68884030a050ee807b2918bbbee8aaca9fcd739b0e3242b8acd924697468d15138a4ce598c839f86",
        "b2cfaeb8dfd91495fc960c0005e9d12af4bfc5bb9c68468685cf884d48ee4475d9cfabb354c35fc649f5361514db575438a4ce594c1b74d5",
        "b2cfaeb8dfd91495fc960c0005e9d12af4bfc5bb9d663b456a45387a43f74f621270afab52bc4a34d90a0a0034f3bcd238a4ce59d6aaf000",
        "b2cfaeb8dfd91495fc960c0005e9d12af4bfc5bb9d663b456a45387a43f74f6215af0dad1fb18581e08bc531d76a960e38a4ce593eaa644f",
    };
    const Probe = struct {
        fn run(a: std.mem.Allocator, cipher: []const u8) !void {
            const output = stream.decryptCompressed(a, cipher, "123456", 4, .{}) catch |err| switch (err) {
                error.WrongPasswordOrCorruptPayload => return,
                else => return err,
            };
            a.free(output);
            return error.InnerCorruptionAccepted;
        }
    };
    for (vectors) |hex| {
        var cipher: [56]u8 = undefined;
        _ = try std.fmt.hexToBytes(&cipher, hex);
        // Prove the outer validation actually passes independently of the
        // product error mapping, so this cannot be an outer-CRC-only test.
        var raw: [48]u8 = undefined;
        var key = try @import("password_key.zig").derive("123456", 4096);
        defer std.crypto.secureZero(u8, &key);
        try @import("../crypto/aes128_cfb1.zig").transform(key, @splat(0), cipher[0..48], &raw, .decrypt);
        try @import("password_footer.zig").validate(&cipher, &raw);
        try Probe.run(std.testing.allocator, &cipher);
        try @import("../testing/allocation_failures.zig").check(Probe.run, .{&cipher});
    }
}

test "HWP5 password stream independent Node fixture OOM mutations truncation exact limits" {
    const a = std.testing.allocator;
    // Node crypto AES-CFB1 + zlib raw-DEFLATE, independently constructed.
    var cipher: [56]u8 = undefined;
    _ = try std.fmt.hexToBytes(&cipher, "b2cfaeb8dfd91495fc960c0005e9d12af4bfc5bb9d663b456a45387a43f74f6215af0dad1e821dc4bddfbcf79de7ce0a38a4ce5951e6c1d4");
    const original = cipher;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = try stream.decryptCompressed(allocator, bytes, "123456", 4, .{ .max_ciphertext_bytes = 56, .max_password_bytes = 6, .max_output_bytes = 5 });
            defer allocator.free(output);
            try std.testing.expectEqualStrings("hello", output);
        }
    };
    try Probe.run(a, &cipher);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&cipher});
    try std.testing.expectError(error.WrongPasswordOrCorruptPayload, stream.decryptCompressed(a, &cipher, "wrong", 4, .{}));
    try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, &cipher, "123456", 4, .{ .max_output_bytes = 4 }));
    try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, &cipher, "123456", 4, .{ .max_ciphertext_bytes = 55 }));
    try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, &cipher, "123456", 4, .{ .max_password_bytes = 5 }));
    for (0..cipher.len) |index| {
        cipher[index] ^= 1;
        try std.testing.expectError(if (index >= 48 and index < 52) error.InvalidPasswordFooter else error.WrongPasswordOrCorruptPayload, stream.decryptCompressed(a, &cipher, "123456", 4, .{}));
        cipher[index] ^= 1;
    }
    for (0..cipher.len) |len| {
        if (stream.decryptCompressed(a, cipher[0..len], "123456", 4, .{})) |output| {
            a.free(output);
            return error.TruncatedCipherAccepted;
        } else |_| {}
    }
    try std.testing.expectEqualSlices(u8, &original, &cipher);
}
