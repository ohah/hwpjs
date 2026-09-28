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
        try std.testing.expectEqual(@as(usize, 0), result.deviations.zero_unused_entries);
        try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
        try std.testing.expectEqualSlices(u8, original, bytes);
    }
}

test "CFB observed repairs normalize only fully zero unused directory entries" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const pos = try locations(bytes);
    const unused = bytes[pos.root + 2 * 128 ..][0..128];
    try std.testing.expectEqual(@as(u8, 0), unused[66]);
    @memset(unused[68..80], 0);
    const original = try a.dupe(u8, bytes);
    defer a.free(original);
    try std.testing.expectError(error.InvalidUnusedEntry, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.deviations.zero_unused_entries);
    try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
    try std.testing.expectEqualSlices(u8, original, bytes);
    unused[67] = 1;
    try std.testing.expectError(error.NoObservedDeviation, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs normalize inactive stale directory metadata only" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const pos = try locations(bytes);
    const unused = bytes[pos.root + 2 * 128 ..][0..128];
    unused[67] = 1;
    std.mem.writeInt(u32, unused[116..120], h.end, .little);
    std.mem.writeInt(u32, unused[120..124], 1234, .little);
    const original = try a.dupe(u8, bytes);
    defer a.free(original);
    try std.testing.expectError(error.InvalidUnusedEntry, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.deviations.stale_unused_entries);
    try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
    try std.testing.expectEqualSlices(u8, original, bytes);
    unused[0] = 'x';
    try std.testing.expectError(error.NoObservedDeviation, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs accept only the observed last FAT off by one marker" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const head = try h.Header.parse(bytes);
    const sector_count = bytes.len / head.sector_size - 1;
    const fat_sector = try h.int(u32, bytes, 76);
    try std.testing.expectEqual(sector_count - 1, fat_sector);
    const offset = (@as(usize, fat_sector) + 1) * head.sector_size + @as(usize, fat_sector) * 4;
    std.mem.writeInt(u32, bytes[offset..][0..4], @intCast(sector_count), .little);
    try std.testing.expectError(error.InvalidFat, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.deviations.off_by_one_fat_markers);
    try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
    std.mem.writeInt(u32, bytes[offset..][0..4], @intCast(sector_count + 1), .little);
    try std.testing.expectError(error.NoObservedDeviation, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs clear only unclaimed zero and end FAT markers" {
    const a = std.testing.allocator;
    const base = try fixture(a);
    defer a.free(base);
    const head = try h.Header.parse(base);
    const old_count = base.len / head.sector_size - 1;
    const bytes = try a.alloc(u8, base.len + head.sector_size);
    defer a.free(bytes);
    @memcpy(bytes[0..base.len], base);
    @memset(bytes[base.len..], 0);
    const fat_sector = try h.int(u32, bytes, 76);
    const offset = (@as(usize, fat_sector) + 1) * head.sector_size + old_count * 4;
    for ([_]u32{ 0, h.end }) |marker| {
        std.mem.writeInt(u32, bytes[offset..][0..4], marker, .little);
        const original = try a.dupe(u8, bytes);
        defer a.free(original);
        try std.testing.expectError(error.UnclaimedSector, cfb.File.open(a, bytes, .{ .strict = true }));
        var result = try repairs.open(a, bytes, .{});
        defer result.deinit();
        try std.testing.expectEqual(@as(usize, @intFromBool(marker == 0)), result.deviations.zero_unclaimed_fat_slots);
        try std.testing.expectEqual(@as(usize, @intFromBool(marker == h.end)), result.deviations.orphan_end_fat_slots);
        try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
        try std.testing.expectEqualSlices(u8, original, bytes);
    }
    std.mem.writeInt(u32, bytes[offset..][0..4], 17, .little);
    try std.testing.expectError(error.UnsupportedObservedDeviation, repairs.open(a, bytes, .{}));
}

test "CFB observed repairs normalize unclaimed MiniFAT zero cells within capacity" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const pos = try locations(bytes);
    const head = try h.Header.parse(bytes);
    try std.testing.expectEqual(@as(u32, 1), head.mini_count);
    std.mem.writeInt(u32, bytes[pos.root + 120 ..][0..4], 128, .little);
    std.mem.writeInt(u32, bytes[pos.mini_tail..][0..4], 0, .little);
    try std.testing.expectError(error.UnclaimedMiniSector, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.deviations.zero_unclaimed_mini_slots);
    try std.testing.expectEqualStrings("unchanged stream", result.file.entries[1].content);
}

test "CFB observed repairs follow multiple MiniFAT sectors" {
    const a = std.testing.allocator;
    const content = try a.alloc(u8, 3800);
    defer a.free(content);
    @memset(content, 'x');
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "One", .parent = 0, .content = content },
        .{ .name = "Two", .parent = 0, .content = content },
        .{ .name = "Three", .parent = 0, .content = content },
    };
    const bytes = try writer.write(a, &nodes, .{});
    defer a.free(bytes);
    const head = try h.Header.parse(bytes);
    try std.testing.expect(head.mini_count > 1);
    const fat_sector = try h.int(u32, bytes, 76);
    const fat_offset = (@as(usize, fat_sector) + 1) * head.sector_size;
    const second_mini = try h.int(u32, bytes, fat_offset + @as(usize, head.mini_start) * 4);
    const second_offset = (@as(usize, second_mini) + 1) * head.sector_size;
    const root_offset = (@as(usize, head.directory_start) + 1) * head.sector_size;
    const capacity = (try h.int(u32, bytes, root_offset + 120) + 63) / 64;
    const slot = capacity - head.sector_size / 4;
    const tail_offset = second_offset + @as(usize, slot) * 4;
    std.mem.writeInt(u32, bytes[tail_offset..][0..4], 0, .little);
    try std.testing.expectError(error.UnclaimedMiniSector, cfb.File.open(a, bytes, .{ .strict = true }));
    var result = try repairs.open(a, bytes, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.deviations.zero_mini_tail_slots);
    try std.testing.expectEqualSlices(u8, content, result.file.entries[1].content);
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

test "CFB observed repairs release allocations in orphan FAT and MiniFAT paths" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const base = try fixture(a);
            defer a.free(base);
            const head = try h.Header.parse(base);
            const count = base.len / head.sector_size - 1;
            const bytes = try a.alloc(u8, base.len + head.sector_size);
            defer a.free(bytes);
            @memcpy(bytes[0..base.len], base);
            @memset(bytes[base.len..], 0);
            const fat_sector = try h.int(u32, bytes, 76);
            const offset = (@as(usize, fat_sector) + 1) * head.sector_size + count * 4;
            std.mem.writeInt(u32, bytes[offset..][0..4], 0, .little);
            var orphan = try repairs.open(a, bytes, .{});
            orphan.deinit();
            const pos = try locations(base);
            std.mem.writeInt(u32, base[pos.root + 120 ..][0..4], 128, .little);
            std.mem.writeInt(u32, base[pos.mini_tail..][0..4], 0, .little);
            var mini = try repairs.open(a, base, .{});
            mini.deinit();
        }
    }.run, .{});
}
