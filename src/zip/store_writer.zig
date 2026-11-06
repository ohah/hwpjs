//! Bounded deterministic ZIP32 STORED output. Payloads are borrowed for write;
//! the caller owns the returned bytes. No clock or filesystem dependencies.
const std = @import("std");
const archive = @import("archive.zig");

pub const Source = struct { name: []const u8, bytes: []const u8 };
pub const Options = struct { max_output_bytes: usize = 128 * 1024 * 1024 };

pub fn write(a: std.mem.Allocator, sources: []const Source, options: Options) ![]u8 {
    // ZIP64 sentinel counts/sizes are deliberately excluded.
    if (sources.len >= 0xffff) return error.UnsupportedZip64;
    const limit = @min(options.max_output_bytes, 0xfffffffe);
    if (limit < 22) return error.LimitExceeded;
    var names: std.StringHashMapUnmanaged(void) = .empty;
    defer names.deinit(a);
    var total: usize = 22;
    var local_size: usize = 0;
    for (sources) |source| {
        if (!archive.validPath(source.name) or !std.unicode.utf8ValidateSlice(source.name)) return error.InvalidEntryName;
        if (source.name.len > 0xffff or source.bytes.len >= 0xffffffff) return error.UnsupportedZip64;
        const result = try names.getOrPut(a, source.name);
        if (result.found_existing) return error.DuplicateEntryName;
        // Subtraction checks keep all later size arithmetic bounded even on wasm32.
        for ([_]usize{ 76, source.name.len, source.name.len, source.bytes.len }) |length| {
            if (length > limit - total) return error.LimitExceeded;
            total += length;
        }
        local_size += 30 + source.name.len + source.bytes.len;
    }
    const bytes = try a.alloc(u8, total);
    @memset(bytes, 0);
    var local: usize = 0;
    var central = local_size;
    for (sources) |source| {
        const crc = std.hash.Crc32.hash(source.bytes);
        put32(bytes, local, 0x04034b50);
        put16(bytes, local + 4, 20);
        put16(bytes, local + 6, 0x0800); // UTF-8 names; no descriptor/encryption.
        put16(bytes, local + 12, 0x0021); // Fixed valid DOS date: 1980-01-01.
        put32(bytes, local + 14, crc);
        put32(bytes, local + 18, @intCast(source.bytes.len));
        put32(bytes, local + 22, @intCast(source.bytes.len));
        put16(bytes, local + 26, @intCast(source.name.len));
        @memcpy(bytes[local + 30 ..][0..source.name.len], source.name);
        @memcpy(bytes[local + 30 + source.name.len ..][0..source.bytes.len], source.bytes);
        put32(bytes, central, 0x02014b50);
        put16(bytes, central + 4, 20);
        put16(bytes, central + 6, 20);
        put16(bytes, central + 8, 0x0800);
        put16(bytes, central + 14, 0x0021);
        put32(bytes, central + 16, crc);
        put32(bytes, central + 20, @intCast(source.bytes.len));
        put32(bytes, central + 24, @intCast(source.bytes.len));
        put16(bytes, central + 28, @intCast(source.name.len));
        put32(bytes, central + 42, @intCast(local));
        @memcpy(bytes[central + 46 ..][0..source.name.len], source.name);
        local += 30 + source.name.len + source.bytes.len;
        central += 46 + source.name.len;
    }
    put32(bytes, central, 0x06054b50);
    put16(bytes, central + 8, @intCast(sources.len));
    put16(bytes, central + 10, @intCast(sources.len));
    put32(bytes, central + 12, @intCast(central - local_size));
    put32(bytes, central + 16, @intCast(local_size));
    return bytes;
}

fn put16(bytes: []u8, offset: usize, value: u16) void {
    std.mem.writeInt(u16, bytes[offset..][0..2], value, .little);
}

fn put32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}
