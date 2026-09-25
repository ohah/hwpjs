const std = @import("std");
const h = @import("header.zig");
const writer = @import("writer.zig");
const cfb = @import("reader.zig");
const repairs = @import("observed_repairs.zig");

fn fixtureVersion(a: std.mem.Allocator, version: u16) ![]u8 {
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Contents", .parent = 0, .content = "unchanged stream" },
    };
    return writer.write(a, &nodes, .{ .version = version });
}

fn fixture(a: std.mem.Allocator) ![]u8 {
    return fixtureVersion(a, 3);
}

test "CFB observed repairs preserve v4 stream bytes" {
    const a = std.testing.allocator;
    const bytes = try fixtureVersion(a, 4);
    defer a.free(bytes);
    const pos = try locations(bytes);
    std.mem.writeInt(u64, bytes[pos.root + 100 ..][0..8], 17, .little);
    std.mem.writeInt(u32, bytes[pos.fat_tail..][0..4], 0, .little);
    try std.testing.expectError(error.InvalidFat, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(u16, 4), result.file.header.major);
    try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
}

fn locations(bytes: []const u8) !struct { root: usize, fat_tail: usize, mini_tail: usize } {
    const header = try h.Header.parse(bytes);
    const count = bytes.len / header.sector_size - 1;
    const fat = try h.int(u32, bytes, 76);
    return .{
        .root = (@as(usize, header.directory_start) + 1) * header.sector_size,
        .fat_tail = (@as(usize, fat) + 1) * header.sector_size + count * 4,
        .mini_tail = (@as(usize, header.mini_start) + 1) * header.sector_size + 4,
    };
}

test "CFB observed repairs restore strict reading without changing original bytes" {
    const a = std.testing.allocator;
    for ([_]struct { root: bool, fat: bool, mini: bool }{ .{ .root = true, .fat = false, .mini = false }, .{ .root = false, .fat = true, .mini = false }, .{ .root = false, .fat = false, .mini = true }, .{ .root = true, .fat = true, .mini = true } }) |variant| {
        const bytes = try fixture(a);
        defer a.free(bytes);
        const pos = try locations(bytes);
        if (variant.root) std.mem.writeInt(u64, bytes[pos.root + 100 ..][0..8], 17, .little);
        if (variant.fat) std.mem.writeInt(u32, bytes[pos.fat_tail..][0..4], 0, .little);
        if (variant.mini) std.mem.writeInt(u32, bytes[pos.mini_tail..][0..4], 0, .little);
        const original = try a.dupe(u8, bytes);
        defer a.free(original);
        try std.testing.expectError(if (variant.fat) error.InvalidFat else if (variant.root) error.InvalidRoot else error.UnclaimedMiniSector, cfb.File.open(a, bytes, .{ .strict = true }));
        var result = try repairs.open(a, bytes, .{});
        defer result.deinit();
        try std.testing.expectEqual(@as(u64, if (variant.root) 17 else 0), result.deviations.original_root_created);
        try std.testing.expectEqual(@as(usize, @intFromBool(variant.fat)), result.deviations.zero_fat_tail_slots);
        try std.testing.expectEqual(@as(usize, @intFromBool(variant.mini)), result.deviations.zero_mini_tail_slots);
        try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
        try std.testing.expectEqualSlices(u8, original, bytes);
    }
}

test "CFB observed repairs reject other changes and respect byte limits" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const pos = try locations(bytes);
    try std.testing.expectError(error.NoObservedDeviation, repairs.open(a, bytes, .{}));
    std.mem.writeInt(u64, bytes[pos.root + 100 ..][0..8], 17, .little);
    try std.testing.expectError(error.LimitExceeded, repairs.open(a, bytes, .{ .max_input_bytes = bytes.len - 1 }));
    std.mem.writeInt(u32, bytes[pos.fat_tail..][0..4], 42, .little);
    try std.testing.expectError(error.UnsupportedObservedDeviation, repairs.open(a, bytes, .{}));
    std.mem.writeInt(u32, bytes[pos.fat_tail..][0..4], h.free, .little);
    std.mem.writeInt(u32, bytes[pos.mini_tail..][0..4], 42, .little);
    try std.testing.expectError(error.UnsupportedObservedDeviation, repairs.open(a, bytes, .{}));
    std.mem.writeInt(u32, bytes[pos.mini_tail..][0..4], h.free, .little);
    bytes[pos.root] ^= 1;
    try std.testing.expectError(error.UnsupportedObservedDeviation, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs do not hide corruption in a live FAT slot" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const header = try h.Header.parse(bytes);
    const pos = try locations(bytes);
    std.mem.writeInt(u64, bytes[pos.root + 100 ..][0..8], 17, .little);
    const fat_sector = try h.int(u32, bytes, 76);
    const live_fat_slot = (@as(usize, fat_sector) + 1) * header.sector_size + @as(usize, fat_sector) * 4;
    std.mem.writeInt(u32, bytes[live_fat_slot..][0..4], h.free, .little);
    try std.testing.expectError(error.InvalidFat, cfb.File.open(a, bytes, .{ .strict = true }));
    try std.testing.expectError(error.InvalidFat, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs free all allocations on success and failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try fixture(a);
            defer a.free(bytes);
            const pos = try locations(bytes);
            std.mem.writeInt(u64, bytes[pos.root + 100 ..][0..8], 17, .little);
            var result = try repairs.open(a, bytes, .{});
            result.deinit();
        }
    }.run, .{});
}
