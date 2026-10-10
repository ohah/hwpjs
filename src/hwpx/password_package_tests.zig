const std = @import("std");
const crypto = @import("password_package.zig");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const encrypted = @import("test_password_fixture.zig");
test "HWPX password package atomic ownership preservation budgets and all allocation failures" {
    const a = std.testing.allocator;
    var ciphertext: [16]u8 = undefined;
    _ = try std.fmt.hexToBytes(&ciphertext, "2b799db5d697fae0839bd6ac7445e96b");
    const input = try fixture.storedZip(a, &.{
        .{ .name = "META-INF/manifest.xml", .data = encrypted.manifest },
        .{ .name = "Contents/section0.xml", .data = &ciphertext },
        .{ .name = "opaque.dat", .data = "unrelated\x00payload" },
    });
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = (try crypto.decryptToPlaintext(allocator, source, "123456", .{})) orelse return error.ExpectedEncrypted;
            defer allocator.free(output);
            var archive = try zip.open(allocator, output, .{});
            defer archive.deinit();
            const text = try archive.decode(archive.find("Contents/section0.xml").?, 100);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("hello", text);
            var report = try @import("encryption_manifest.zig").read(allocator, archive, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 0), report.encrypted_paths.len);
            var before = try zip.open(allocator, source, .{});
            defer before.deinit();
            const prior = before.find("opaque.dat").?;
            const current = archive.find("opaque.dat").?;
            try std.testing.expectEqualSlices(u8, source[prior.local_offset..prior.local_end], output[current.local_offset..current.local_end]);
            try std.testing.expect((try crypto.decryptToPlaintext(allocator, output, "ignored", .{})) == null);
        }
    };
    try Probe.run(a, input);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{input});
    try std.testing.expectError(error.LimitExceeded, crypto.decryptToPlaintext(a, input, "123456", .{ .max_output_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, crypto.decryptToPlaintext(a, input, "123456", .{ .max_input_bytes = input.len - 1 }));
    try std.testing.expectError(error.WrongPasswordOrCorruptPayload, crypto.decryptToPlaintext(a, input, "wrong", .{}));
    try std.testing.expectEqualSlices(u8, original, input);
}
