//! 관측된 압축 배포 envelope의 데이터/헤더/꼬리 형식을 보존합니다.
//! 문서 선택·편집 권한·CFB 저장은 이 스트림 계층의 책임이 아닙니다.
const std = @import("std");
const envelope = @import("envelope.zig");
const trailer = @import("trailer.zig");
const deflate = @import("../../compression/raw_deflate.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_plaintext_bytes: usize = 64 * 1024 * 1024,
    max_original_plaintext_bytes: ?usize = null,
    max_output_bytes: usize = 64 * 1024 * 1024,
};
pub const Encoded = struct { bytes: []u8, original_plaintext_bytes: usize };

pub fn encodeCompressedLike(a: std.mem.Allocator, original: []const u8, plaintext: []const u8, options: Options) ![]u8 {
    return (try encodeCompressedWithReport(a, original, plaintext, options)).bytes;
}

pub fn encodeCompressedWithReport(a: std.mem.Allocator, original: []const u8, plaintext: []const u8, options: Options) !Encoded {
    if (original.len > options.max_input_bytes or plaintext.len > options.max_plaintext_bytes) return error.LimitExceeded;
    const source = try envelope.parse(original, options.max_input_bytes);
    const decoded = try a.alloc(u8, source.ciphertext.len);
    defer a.free(decoded);
    const key = @import("key.zig").derive(source.data);
    const dec = std.crypto.core.aes.Aes128.initDec(key);
    var offset: usize = 0;
    while (offset < decoded.len) : (offset += 16) dec.decrypt(decoded[offset..][0..16], source.ciphertext[offset..][0..16]);
    const old = try deflate.decodePrefix(a, decoded, @min(options.max_plaintext_bytes, options.max_original_plaintext_bytes orelse options.max_plaintext_bytes));
    defer a.free(old.bytes);
    const layout = try trailer.inspect(decoded, old.consumed, old.bytes);
    const compressed = try deflate.encodeStored(a, plaintext, options.max_output_bytes);
    defer a.free(compressed);
    const prefix = original.len - source.ciphertext.len;
    const checksum_offset = if (layout == .compact) compressed.len else std.math.add(usize, compressed.len, (16 - compressed.len % 16) % 16) catch return error.LimitExceeded;
    const payload_end = std.math.add(usize, checksum_offset, if (layout == .compact) 8 else 32) catch return error.LimitExceeded;
    const padded = std.math.add(usize, payload_end, (16 - payload_end % 16) % 16) catch return error.LimitExceeded;
    const total = std.math.add(usize, prefix, padded) catch return error.LimitExceeded;
    if (total > options.max_output_bytes) return error.LimitExceeded;
    const output = try a.alloc(u8, total);
    errdefer a.free(output);
    @memcpy(output[0..prefix], original[0..prefix]);
    const payload = output[prefix..];
    @memset(payload, 0);
    @memcpy(payload[0..compressed.len], compressed);
    std.mem.writeInt(u32, payload[checksum_offset..][0..4], std.hash.Crc32.hash(plaintext), .little);
    const size_offset = checksum_offset + if (layout == .compact) @as(usize, 4) else 16;
    const size = std.math.cast(u32, plaintext.len) orelse return error.LimitExceeded;
    std.mem.writeInt(u32, payload[size_offset..][0..4], size, .little);
    const enc = std.crypto.core.aes.Aes128.initEnc(key);
    offset = 0;
    while (offset < payload.len) : (offset += 16) {
        var block: [16]u8 = undefined;
        enc.encrypt(&block, payload[offset..][0..16]);
        @memcpy(payload[offset..][0..16], &block);
    }
    return .{ .bytes = output, .original_plaintext_bytes = old.bytes.len };
}

test "distribution encoder keeps original envelope and trailer through allocation failures" {
    const a = std.testing.allocator;
    for ([_]trailer.Layout{ .compact, .aligned_blocks }) |layout| {
        var source: [308]u8 = @splat(0);
        std.mem.writeInt(u32, source[0..4], 0x1000001c, .little);
        std.mem.writeInt(u32, source[4..8], 1, .little);
        var plain: [48]u8 = @splat(0);
        @memcpy(plain[0..6], &[_]u8{ 1, 1, 0, 254, 255, 'A' });
        const check: usize = if (layout == .compact) 6 else 16;
        std.mem.writeInt(u32, plain[check..][0..4], std.hash.Crc32.hash("A"), .little);
        std.mem.writeInt(u32, plain[check + (if (layout == .compact) @as(usize, 4) else 16) ..][0..4], 1, .little);
        const length: usize = if (layout == .compact) 16 else 48;
        const cipher = std.crypto.core.aes.Aes128.initEnc(@import("key.zig").derive(source[4..260]));
        var at: usize = 0;
        while (at < length) : (at += 16) cipher.encrypt(source[260 + at ..][0..16], plain[at..][0..16]);
        const input = source[0 .. 260 + length];
        const Probe = struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, expected_layout: trailer.Layout) !void {
                const output = try encodeCompressedLike(allocator, bytes, "한😀<&", .{});
                defer allocator.free(output);
                const prefix = bytes.len - (try envelope.parse(bytes, bytes.len)).ciphertext.len;
                try std.testing.expectEqualSlices(u8, bytes[0..prefix], output[0..prefix]);
                const restored = try @import("decode.zig").decode(allocator, output, .{});
                defer allocator.free(restored);
                try std.testing.expectEqualStrings("한😀<&", restored);
                const encoded = try envelope.parse(output, output.len);
                const raw = try allocator.alloc(u8, encoded.ciphertext.len);
                defer allocator.free(raw);
                const decrypt = std.crypto.core.aes.Aes128.initDec(@import("key.zig").derive(encoded.data));
                var offset: usize = 0;
                while (offset < raw.len) : (offset += 16) decrypt.decrypt(raw[offset..][0..16], encoded.ciphertext[offset..][0..16]);
                const inflated = try deflate.decodePrefix(allocator, raw, 100);
                defer allocator.free(inflated.bytes);
                try std.testing.expectEqual(expected_layout, try trailer.inspect(raw, inflated.consumed, inflated.bytes));
            }
        };
        try Probe.run(a, input, layout);
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ @as([]const u8, input), layout });
        try std.testing.expectError(error.LimitExceeded, encodeCompressedLike(a, input, "한😀<&", .{ .max_output_bytes = 260 }));
        try std.testing.expectError(error.LimitExceeded, encodeCompressedLike(a, input, "한😀<&", .{ .max_plaintext_bytes = 1 }));
        try std.testing.expectError(error.LimitExceeded, encodeCompressedLike(a, input, "한😀<&", .{ .max_input_bytes = input.len - 1 }));
        const reference = try encodeCompressedLike(a, input, "한😀<&", .{});
        defer a.free(reference);
        const exact = try encodeCompressedLike(a, input, "한😀<&", .{ .max_output_bytes = reference.len });
        defer a.free(exact);
        try std.testing.expectEqualSlices(u8, reference, exact);
        try std.testing.expectError(error.LimitExceeded, encodeCompressedLike(a, input, "한😀<&", .{ .max_output_bytes = reference.len - 1 }));
        var extended: [312]u8 = @splat(0);
        std.mem.writeInt(u32, extended[0..4], 28 | (0xfff << 20), .little);
        std.mem.writeInt(u32, extended[4..8], 256, .little);
        @memcpy(extended[8..264], input[4..260]);
        @memcpy(extended[264 .. 264 + length], input[260..]);
        try Probe.run(a, extended[0 .. 264 + length], layout);
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ @as([]const u8, extended[0 .. 264 + length]), layout });
        var corrupt = source;
        var bad_plain = plain;
        bad_plain[check] ^= 1;
        at = 0;
        while (at < length) : (at += 16) cipher.encrypt(corrupt[260 + at ..][0..16], bad_plain[at..][0..16]);
        try std.testing.expectError(error.InvalidChecksum, encodeCompressedLike(a, corrupt[0 .. 260 + length], "한😀<&", .{}));
        const report = try encodeCompressedWithReport(a, input, "", .{ .max_original_plaintext_bytes = 1 });
        defer a.free(report.bytes);
        try std.testing.expectEqual(@as(usize, 1), report.original_plaintext_bytes);
        try std.testing.expectError(error.LimitExceeded, encodeCompressedWithReport(a, input, "", .{ .max_original_plaintext_bytes = 0 }));
        const payload: [32]u8 = @splat('X');
        for (0..payload.len + 1) |size| {
            const encoded = try encodeCompressedLike(a, input, payload[0..size], .{});
            defer a.free(encoded);
            const roundtrip = try @import("decode.zig").decode(a, encoded, .{});
            defer a.free(roundtrip);
            try std.testing.expectEqualSlices(u8, payload[0..size], roundtrip);
        }
    }
}

test "distribution encoder reencodes actual compressed ViewText without changing source" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "distribution", "viewtext" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
        defer source.deinit();
        const header_before = source.header.raw;
        const stream = try source.file.readStream(a, "/ViewText/Section0");
        const before = try a.dupe(u8, stream);
        defer a.free(before);
        const plain = try @import("decode.zig").decode(a, stream, .{});
        defer a.free(plain);
        const output = try encodeCompressedLike(a, stream, plain, .{});
        defer a.free(output);
        const restored = try @import("decode.zig").decode(a, output, .{});
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, plain, restored);
        const prefix = stream.len - (try envelope.parse(stream, stream.len)).ciphertext.len;
        try std.testing.expectEqualSlices(u8, stream[0..prefix], output[0..prefix]);
        try std.testing.expectEqualSlices(u8, before, stream);
        try std.testing.expectEqualSlices(u8, &header_before, &source.header.raw);
    }
}
