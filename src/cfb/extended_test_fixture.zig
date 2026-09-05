//! Independent test encoder; never imports parser constants or decoding logic.
const std = @import("std");

pub fn put(comptime T: type, bytes: []u8, offset: usize, value: T) void {
    std.mem.writeInt(T, bytes[offset..][0..@sizeOf(T)], value, .little);
}

pub fn make(a: std.mem.Allocator, extended: bool) ![]u8 {
    const fats: u32 = if (extended) 237 else 1;
    const difats: u32 = if (extended) 2 else 0;
    const dir = fats + difats;
    const first = dir + 8;
    const bytes = try a.alloc(u8, (first + 16 + 1) * 512);
    @memset(bytes, 0);
    @memcpy(bytes[0..8], &[_]u8{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 });
    put(u16, bytes, 24, 62);
    put(u16, bytes, 26, 3);
    put(u16, bytes, 28, 65534);
    put(u16, bytes, 30, 9);
    put(u16, bytes, 32, 6);
    put(u32, bytes, 44, fats);
    put(u32, bytes, 48, dir);
    put(u32, bytes, 56, 4096);
    put(u32, bytes, 60, 0xfffffffe);
    put(u32, bytes, 68, if (extended) fats else 0xfffffffe);
    put(u32, bytes, 72, difats);
    @memset(bytes[76..512], 255);
    for (0..@min(fats, 109)) |i| put(u32, bytes, 76 + i * 4, @intCast(i));
    @memset(bytes[512 .. (dir + 1) * 512], 255);
    for (0..difats) |d| {
        const offset = (fats + d + 1) * 512;
        for (0..127) |j| {
            const id = 109 + d * 127 + j;
            if (id < fats) put(u32, bytes, offset + j * 4, @intCast(id));
        }
        put(u32, bytes, offset + 508, if (d + 1 < difats) @intCast(fats + d + 1) else 0xfffffffe);
    }
    for (0..first + 16) |id| {
        const next: u32 = if (id < fats) 0xfffffffd else if (id < dir) 0xfffffffc else if (id == first - 1 or id == first + 7 or id == first + 15) 0xfffffffe else @intCast(id + 1);
        put(u32, bytes, 512 + id * 4, next);
    }
    for (0..23) |i| {
        const offset = (dir + 1) * 512 + i * 128;
        const name: u16 = if (i == 0) 'R' else if (i < 21) 'd' else if (i == 21) 1 else 'y';
        put(u16, bytes, offset, name);
        put(u16, bytes, offset + 64, 4);
        bytes[offset + 66] = if (i == 0) 5 else if (i < 21) 1 else 2;
        bytes[offset + 67] = 1;
        put(u32, bytes, offset + 68, 0xffffffff);
        put(u32, bytes, offset + 72, if (i == 21) 22 else 0xffffffff);
        put(u32, bytes, offset + 76, if (i < 21) @intCast(i + 1) else 0xffffffff);
        put(u32, bytes, offset + 116, if (i < 21) 0xfffffffe else first + @as(u32, @intCast(i - 21)) * 8);
        put(u32, bytes, offset + 120, if (i < 21) 0 else 4096);
    }
    for (bytes[(first + 1) * 512 ..], 0..) |*b, i| b.* = @intCast(i % 251);
    return bytes;
}
