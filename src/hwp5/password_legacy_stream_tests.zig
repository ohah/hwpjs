const std = @import("std");
const stream = @import("password_legacy_stream.zig");

test "legacy password stream preflight refuses malformed keys and limits without allocating" {
    var cipher: [16]u8 = @splat(0);
    @memcpy(cipher[8..12], &[_]u8{ 0x38, 0xa4, 0xce, 0x59 });
    const a = std.testing.failing_allocator;
    try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, &cipher, "", .{ .max_ciphertext_bytes = 15 }));
    try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, &cipher, "12345", .{ .max_password_bytes = 4 }));
    try std.testing.expectError(error.InvalidPasswordUnicode, stream.decryptCompressed(a, &cipher, "\xff", .{}));
    try std.testing.expectError(error.UnexpectedEnd, stream.decryptCompressed(a, &.{}, "", .{}));
}

test "legacy password stream actual five payloads match independent hashes reject corruption and OOM" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var file = try @import("../cfb/reader.zig").File.open(a, input, .{ .strict = true });
    defer file.deinit();
    const paths = [_][]const u8{ "/DocInfo", "/BodyText/Section0", "/Scripts/JScriptVersion", "/Scripts/DefaultJScript", "/BinData/BIN0001.png" };
    const sizes = [_]usize{ 2608, 785, 8, 272, 496 };
    const hashes = [_][]const u8{ "75acbc63c4b1ef474d1da463aaf84a3d8041b59150d81a955e37387261cfc241", "b35387b92f8b3ecdfae822a0a8f74939b8daf6ab3fb5da4b892ff5526b52a7c5", "7c9fa136d4413fa6173637e883b6998d32e1d675f88cddff9dcbcf331820f4b8", "e1f35ff38336598f79448c84b41bcb508d53a552808454a76ee12691cb2c97e4", "7b38ce13e00902226bfc77b85de55e3b8c38167ace771908abd73e8b867ee341" };
    for (paths, sizes, hashes) |path, size, hash| {
        const cipher = try file.readStream(a, path);
        const original = try a.dupe(u8, cipher);
        defer a.free(original);
        const plain = try stream.decryptCompressed(a, cipher, "12345", .{});
        defer {
            std.crypto.secureZero(u8, plain);
            a.free(plain);
        }
        try std.testing.expectEqual(size, plain.len);
        var expected: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&expected, hash);
        var actual: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(plain, &actual, .{});
        try std.testing.expectEqualSlices(u8, &expected, &actual);
        try std.testing.expectError(error.WrongPasswordOrCorruptPayload, stream.decryptCompressed(a, cipher, "wrong", .{}));
        try std.testing.expectError(error.LimitExceeded, stream.decryptCompressed(a, cipher, "12345", .{ .max_output_bytes = size - 1 }));
        const changed = try a.dupe(u8, cipher);
        defer a.free(changed);
        for (0..changed.len - 8) |index| {
            changed[index] ^= 1;
            try std.testing.expectError(error.WrongPasswordOrCorruptPayload, stream.decryptCompressed(a, changed, "12345", .{}));
            changed[index] ^= 1;
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, expected_plain: []const u8) !void {
                const output = try stream.decryptCompressed(allocator, bytes, "12345", .{});
                defer {
                    std.crypto.secureZero(u8, output);
                    allocator.free(output);
                }
                try std.testing.expectEqualSlices(u8, expected_plain, output);
            }
        }.run, .{ cipher, plain });
        try std.testing.expectEqualSlices(u8, original, cipher);
    }
}
