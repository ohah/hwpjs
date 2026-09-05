const std = @import("std");
const cfb = @import("reader.zig");
const h = @import("header.zig");

fn put(comptime T: type, bytes: []u8, offset: usize, value: T) void {
    std.mem.writeInt(T, bytes[offset..][0..@sizeOf(T)], value, .little);
}

fn emptyFile() [1536]u8 {
    var data = [_]u8{0} ** 1536;
    @memcpy(data[0..8], &[_]u8{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 });
    put(u16, &data, 24, 0x3e);
    put(u16, &data, 26, 3);
    put(u16, &data, 28, 0xfffe);
    put(u16, &data, 30, 9);
    put(u16, &data, 32, 6);
    put(u32, &data, 44, 1);
    put(u32, &data, 48, 1);
    put(u32, &data, 56, 4096);
    put(u32, &data, 60, h.end);
    put(u32, &data, 68, h.end);
    @memset(data[76..512], 255);
    put(u32, &data, 76, 0);
    @memset(data[512..1024], 255);
    put(u32, &data, 512, h.fat_sector);
    put(u32, &data, 516, h.end);
    for ("Root Entry", 0..) |c, i| put(u16, &data, 1024 + i * 2, c);
    put(u16, &data, 1088, 22);
    data[1090] = 5;
    data[1091] = 1;
    put(u32, &data, 1092, h.free);
    put(u32, &data, 1096, h.free);
    put(u32, &data, 1100, h.free);
    put(u32, &data, 1140, h.end);
    return data;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = miniFile();
    var file = try cfb.File.open(a, &bytes, .{});
    defer file.deinit();
    try std.testing.expectEqual(@as(?usize, 0), try file.find(a, "/"));
    try std.testing.expectEqualStrings("x", try file.readStream(a, "x"));
}

fn miniFile() [2560]u8 {
    var bytes = [_]u8{0} ** 2560;
    const base = emptyFile();
    @memcpy(bytes[0..1536], &base);
    put(u32, &bytes, 60, 2);
    put(u32, &bytes, 64, 1);
    put(u32, &bytes, 520, h.end);
    put(u32, &bytes, 524, h.end);
    put(u32, &bytes, 1100, 1);
    put(u32, &bytes, 1140, 3);
    put(u32, &bytes, 1144, 64);
    const o = 1152;
    put(u16, &bytes, o, 'x');
    put(u16, &bytes, o + 64, 4);
    bytes[o + 66] = 2;
    bytes[o + 67] = 1;
    put(u32, &bytes, o + 68, h.free);
    put(u32, &bytes, o + 72, h.free);
    put(u32, &bytes, o + 76, h.free);
    put(u32, &bytes, o + 120, 1);
    @memset(bytes[1536..2048], 255);
    put(u32, &bytes, 1536, h.end);
    bytes[2048] = 'x';
    return bytes;
}

test "MiniFAT content, aliases, limits, bad mini links and failed stream queries" {
    var bytes = miniFile();
    var file = try cfb.File.open(std.testing.allocator, &bytes, .{});
    defer file.deinit();
    try std.testing.expectEqualStrings("x", try file.readStream(std.testing.allocator, "/X"));
    try std.testing.expectError(error.NotAStream, file.readStream(std.testing.allocator, "/"));
    try std.testing.expectError(error.StreamNotFound, file.readStream(std.testing.allocator, "missing"));
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_stream_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_total_stream_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_entries = 0 }));
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_path_bytes = 0 }));
    put(u32, &bytes, 1536, 0);
    try std.testing.expectError(error.InvalidMiniChain, cfb.File.open(std.testing.allocator, &bytes, .{}));
    bytes = miniFile();
    put(u32, &bytes, 1152 + 116, 1000);
    try std.testing.expectError(error.InvalidMiniSector, cfb.File.open(std.testing.allocator, &bytes, .{}));
}

test "allocation failures release all parser and lookup allocations" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationCase, .{});
}

test "truncation, header validation, resource bounds and cyclic directory chain" {
    var bytes = emptyFile();
    for ([_]usize{ 0, 7, 511, 512, 1024, 1400 }) |size| {
        if (cfb.File.open(std.testing.allocator, bytes[0..size], .{})) |parsed| {
            var file = parsed;
            file.deinit();
            return error.ExpectedRejection;
        } else |_| {}
    }
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_input_bytes = 100 }));
    put(u32, &bytes, 516, 1);
    try std.testing.expectError(error.CyclicOrSharedSector, cfb.File.open(std.testing.allocator, &bytes, .{}));
    bytes = emptyFile();
    put(u32, &bytes, 1100, 0);
    try std.testing.expectError(error.CyclicDirectory, cfb.File.open(std.testing.allocator, &bytes, .{}));
    bytes = emptyFile();
    put(u32, &bytes, 1100, 1000);
    try std.testing.expectError(error.InvalidDirectoryReference, cfb.File.open(std.testing.allocator, &bytes, .{}));
}
