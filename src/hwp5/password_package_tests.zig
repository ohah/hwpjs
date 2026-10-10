const std = @import("std");
const package = @import("password_package.zig");
test "HWP5 legacy password package actual conversion independent golden preservation and OOM" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = (try package.decryptToPlaintext(allocator, bytes, "12345", .{})).?;
            defer {
                std.crypto.secureZero(u8, output);
                allocator.free(output);
            }
            var original = try @import("../cfb/reader.zig").File.open(allocator, bytes, .{ .strict = true });
            defer original.deinit();
            var source = try @import("text_source.zig").Source.open(allocator, output);
            defer source.deinit();
            try std.testing.expectEqual(@as(u16, 1), source.section_count);
            try std.testing.expect(!source.header.has(.encrypted));
            try std.testing.expectEqual(@as(u32, 0), source.header.encryptVersion());
            const section = try source.decodeSection(allocator, 0);
            defer allocator.free(section);
            var expected: [32]u8 = undefined;
            _ = try std.fmt.hexToBytes(&expected, "b35387b92f8b3ecdfae822a0a8f74939b8daf6ab3fb5da4b892ff5526b52a7c5");
            var hash: [32]u8 = undefined;
            std.crypto.hash.sha2.Sha256.hash(section, &hash, .{});
            try std.testing.expectEqualSlices(u8, &expected, &hash);
            try std.testing.expectEqual(@as(usize, 785), section.len);
            const paths = [_][]const u8{ "/Scripts/JScriptVersion", "/Scripts/DefaultJScript", "/BinData/BIN0001.png" };
            const hashes = [_][]const u8{ "7c9fa136d4413fa6173637e883b6998d32e1d675f88cddff9dcbcf331820f4b8", "e1f35ff38336598f79448c84b41bcb508d53a552808454a76ee12691cb2c97e4", "7b38ce13e00902226bfc77b85de55e3b8c38167ace771908abd73e8b867ee341" };
            for (paths, hashes) |path, golden| {
                const encoded = try source.file.readStream(allocator, path);
                const plain = try @import("../compression/raw_deflate.zig").decode(allocator, encoded, 4_000_000);
                defer {
                    std.crypto.secureZero(u8, plain);
                    allocator.free(plain);
                }
                _ = try std.fmt.hexToBytes(&expected, golden);
                std.crypto.hash.sha2.Sha256.hash(plain, &hash, .{});
                try std.testing.expectEqualSlices(u8, &expected, &hash);
            }
            var preserved: usize = 0;
            for (original.entries) |entry| {
                if (entry.kind != 2 or std.mem.eql(u8, entry.name, "FileHeader") or std.mem.eql(u8, entry.name, "DocInfo") or std.mem.indexOf(u8, entry.path, "/BodyText/") != null or std.mem.indexOf(u8, entry.path, "/Scripts/") != null or std.mem.indexOf(u8, entry.path, "/BinData/") != null) continue;
                try std.testing.expectEqualSlices(u8, entry.content, try source.file.readStream(allocator, entry.path));
                preserved += 1;
            }
            try std.testing.expectEqual(@as(usize, 2), preserved);
            try std.testing.expect((try package.decryptToPlaintext(allocator, output, "ignored", .{})) == null);
        }
    };
    try Probe.run(a, input);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{input});
    try std.testing.expectError(error.WrongPasswordOrCorruptPayload, package.decryptToPlaintext(a, input, "wrong", .{}));
    try std.testing.expectError(error.LimitExceeded, package.decryptToPlaintext(a, input, "12345", .{ .max_output_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, package.decryptToPlaintext(a, input, "12345", .{ .max_total_plaintext_bytes = 2607 }));
    try std.testing.expectEqualSlices(u8, before, input);
}

test "HWP5 password package all allocation failures preserve input opaque streams and limits" {
    const a = std.testing.allocator;
    const input = try @import("test_password_fixture.zig").make(a);
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = (try package.decryptToPlaintext(allocator, bytes, "123456", .{})).?;
            defer allocator.free(output);
            var source = try @import("text_source.zig").Source.open(allocator, output);
            defer source.deinit();
            try std.testing.expectEqual(@as(u16, 1), source.section_count);
            try std.testing.expect(!source.header.has(.encrypted));
            try std.testing.expectEqual(@as(u32, 0), source.header.encryptVersion());
            try std.testing.expectEqualStrings("preserve\x00me", try source.file.readStream(allocator, "/opaque"));
            const section = try source.decodeSection(allocator, 0);
            defer allocator.free(section);
            try std.testing.expectEqual(@as(usize, 0), section.len);
            try std.testing.expect((try package.decryptToPlaintext(allocator, output, "ignored", .{})) == null);
        }
    };
    try Probe.run(a, input);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{input});
    try std.testing.expectError(error.WrongPasswordOrCorruptPayload, package.decryptToPlaintext(a, input, "wrong", .{}));
    try std.testing.expectError(error.LimitExceeded, package.decryptToPlaintext(a, input, "123456", .{ .max_output_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, package.decryptToPlaintext(a, input, "123456", .{ .max_total_plaintext_bytes = 285 }));
    try std.testing.expectEqualSlices(u8, before, input);
}
