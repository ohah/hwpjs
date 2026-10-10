//! Synthetic container builder for ownership/failure tests, not an oracle.
const std = @import("std");
pub fn make(a: std.mem.Allocator) ![]u8 {
    var header: [256]u8 = @splat(0);
    @memcpy(header[0..17], "HWP Document File");
    std.mem.writeInt(u32, header[32..36], 0x05010100, .little);
    std.mem.writeInt(u32, header[36..40], 3, .little);
    std.mem.writeInt(u32, header[44..48], 4, .little);
    var doc: [286]u8 = @splat(0);
    std.mem.writeInt(u32, doc[0..4], (282 << 20) | 16, .little);
    @memset(doc[4..260], 0xbe);
    std.mem.writeInt(u16, doc[260..262], 1, .little);
    const encrypted_doc = try envelope(a, &doc);
    defer a.free(encrypted_doc);
    const encrypted_body = try envelope(a, "");
    defer a.free(encrypted_body);
    return @import("../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = encrypted_doc },
        .{ .name = "BodyText", .kind = 1, .parent = 0 },
        .{ .name = "Section0", .parent = 3, .content = encrypted_body },
        .{ .name = "opaque", .parent = 0, .content = "preserve\x00me" },
    }, .{});
}

fn envelope(a: std.mem.Allocator, plaintext: []const u8) ![]u8 {
    const compressed = try @import("../compression/raw_deflate.zig").encodeStored(a, plaintext, 4096);
    defer a.free(compressed);
    const aligned = (compressed.len + 15) / 16 * 16;
    const raw = try a.alloc(u8, aligned + 32);
    defer a.free(raw);
    @memset(raw, 0);
    @memcpy(raw[0..compressed.len], compressed);
    std.mem.writeInt(u32, raw[aligned..][0..4], std.hash.Crc32.hash(plaintext), .little);
    std.mem.writeInt(u32, raw[aligned + 16 ..][0..4], @intCast(plaintext.len), .little);
    const cipher = try a.alloc(u8, raw.len + 8);
    errdefer a.free(cipher);
    var key = try @import("password_key.zig").derive("123456", 4096);
    defer std.crypto.secureZero(u8, &key);
    try @import("../crypto/aes128_cfb1.zig").transform(key, @splat(0), raw, cipher[0..raw.len], .encrypt);
    std.mem.writeInt(u32, cipher[raw.len..][0..4], 0x59cea438, .little);
    std.mem.writeInt(u32, cipher[raw.len + 4 ..][0..4], std.hash.Crc32.hash(raw), .little);
    return cipher;
}
