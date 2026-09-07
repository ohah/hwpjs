const std = @import("std");
const t = std.testing;
const table = @import("tag_table.zig");
const f = @import("tag_fixture.zig");
test "ICC tag table unsorted descriptors exact shared data and borrowed payloads" {
    const bytes = try f.make(t.allocator, 192, &.{
        .{ .signature = "zTag".*, .offset = 180, .size = 12 },
        .{ .signature = "aTag".*, .offset = 168, .size = 12 },
        .{ .signature = "bTag".*, .offset = 180, .size = 12 },
    });
    defer t.allocator.free(bytes);
    var result = try table.parse(t.allocator, bytes, .{ .policy = .icc_2022 });
    defer result.deinit(t.allocator);
    try t.expectEqualStrings("zTag", &result.tags[0].signature);
    try t.expectEqualStrings("aTag", &result.tags[1].signature);
    try t.expectEqual(@as(usize, 2), result.storage.unique_elements);
    try t.expectEqual(@as(usize, 1), result.storage.shared_entries);
    try t.expectEqual(@as(usize, 0), result.storage.unreferenced_bytes);
    try t.expect(result.storage.layout_validated);
    try t.expectEqual(@intFromPtr(bytes.ptr) + 180, @intFromPtr(result.tags[0].data.ptr));
    bytes[188] = 99;
    try t.expectEqual(@as(u8, 99), result.tags[2].data[8]);
}
test "ICC tag layout explicit policy zero padding gaps and partial overlap" {
    const padded = try f.make(t.allocator, 176, &.{ .{ .signature = "aTag".*, .offset = 156, .size = 9 }, .{ .signature = "bTag".*, .offset = 168, .size = 8 } });
    defer t.allocator.free(padded);
    var p = try table.parse(t.allocator, padded, .{ .policy = .icc_2022 });
    defer p.deinit(t.allocator);
    try t.expectEqual(@as(usize, 3), p.storage.padding_bytes_validated);
    padded[165] = 1;
    try t.expectError(error.InvalidIccTagPadding, table.parse(t.allocator, padded, .{ .policy = .icc_2022 }));
    var b = try table.parse(t.allocator, padded, .{ .policy = .bounded });
    defer b.deinit(t.allocator);
    try t.expect(!b.storage.layout_validated);
    try t.expectEqual(@as(usize, 3), b.storage.unreferenced_bytes);
    const gap = try f.make(t.allocator, 160, &.{.{ .signature = "aTag".*, .offset = 148, .size = 8 }});
    defer t.allocator.free(gap);
    try t.expectError(error.InvalidIccTagGap, table.parse(t.allocator, gap, .{ .policy = .icc_2022 }));
    var g = try table.parse(t.allocator, gap, .{ .policy = .bounded });
    defer g.deinit(t.allocator);
    try t.expectEqual(@as(usize, 8), g.storage.unreferenced_bytes);
    for ([_]u32{ 156, 168 }) |second_offset| {
        const overlap = try f.make(t.allocator, 180, &.{ .{ .signature = "aTag".*, .offset = 156, .size = 24 }, .{ .signature = "bTag".*, .offset = second_offset, .size = 8 } });
        defer t.allocator.free(overlap);
        try t.expectError(error.InvalidIccTagOverlap, table.parse(t.allocator, overlap, .{ .policy = .icc_2022 }));
        var o = try table.parse(t.allocator, overlap, .{ .policy = .bounded });
        defer o.deinit(t.allocator);
        try t.expectEqual(@as(usize, 1), o.storage.overlapping_elements);
        try t.expectEqual(@as(usize, 0), o.storage.shared_entries);
    }
}
test "ICC tag table duplicate bounds malformed prefix and count quotas" {
    const bytes = try f.make(t.allocator, 164, &.{ .{ .signature = "aTag".*, .offset = 156, .size = 8 }, .{ .signature = "aTag".*, .offset = 156, .size = 8 } });
    defer t.allocator.free(bytes);
    try t.expectError(error.DuplicateIccTag, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
    bytes[144] = 'b';
    try t.expectError(error.LimitExceeded, table.parse(t.allocator, bytes, .{ .policy = .bounded, .max_tags = 1 }));
    try t.expectError(error.LimitExceeded, table.parse(t.allocator, bytes, .{ .policy = .bounded, .max_bytes = 163 }));
    for ([_]u32{ 0, 128, 152, 157, 0xffffffff }) |offset| {
        std.mem.writeInt(u32, bytes[136..140], offset, .big);
        try t.expectError(error.InvalidIccTagOffset, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
    }
    std.mem.writeInt(u32, bytes[136..140], 156, .big);
    for ([_]u32{ 0, 1, 7 }) |size| {
        std.mem.writeInt(u32, bytes[140..144], size, .big);
        try t.expectError(error.InvalidIccTagDataSize, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
    }
    std.mem.writeInt(u32, bytes[140..144], 0xffffffff, .big);
    try t.expectError(error.InvalidIccTagBounds, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
    std.mem.writeInt(u32, bytes[140..144], 8, .big);
    bytes[160] = 1;
    try t.expectError(error.InvalidIccTagReserved, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
    std.mem.writeInt(u32, bytes[128..132], 3, .big);
    try t.expectError(error.InvalidIccTagTable, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
}
fn allocations(a: std.mem.Allocator, bytes: []const u8) !void {
    var good = try table.parse(a, bytes, .{ .policy = .bounded });
    defer good.deinit(a);
    if (table.parse(a, bytes, .{ .policy = .icc_2022 })) |value| {
        var wrong = value;
        wrong.deinit(a);
        return error.ExpectedFailure;
    } else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidIccTagGap, err),
    }
}
test "ICC tag table allocation cleanup and zero tag structural boundary" {
    const gap = try f.make(t.allocator, 160, &.{.{ .signature = "aTag".*, .offset = 148, .size = 8 }});
    defer t.allocator.free(gap);
    try t.checkAllAllocationFailures(t.allocator, allocations, .{gap});
    const empty = try f.make(t.allocator, 132, &.{});
    defer t.allocator.free(empty);
    var table_only = try table.parse(t.allocator, empty, .{ .policy = .icc_2022, .max_tags = 0 });
    defer table_only.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), table_only.tags.len);
    // Required tags and header semantics are NOT validated by the table layer.
}

test "ICC tag interval grid against independent byte occupancy oracle" {
    var checked: usize = 0;
    var reserved_rejected: usize = 0;
    for (0..8) |i| for (0..8) |j| for (0..8) |x| for (0..8) |y| {
        const a = 156 + i * 4;
        const b = 156 + j * 4;
        const alen = 8 + x * 4;
        const blen = 8 + y * 4;
        if (alen > 192 - a or blen > 192 - b) continue;
        const bytes = try f.make(t.allocator, 192, &.{
            .{ .signature = "zTag".*, .offset = @intCast(a), .size = @intCast(alen) },
            .{ .signature = "aTag".*, .offset = @intCast(b), .size = @intCast(blen) },
        });
        defer t.allocator.free(bytes);
        if (!std.mem.allEqual(u8, bytes[a + 4 ..][0..4], 0) or !std.mem.allEqual(u8, bytes[b + 4 ..][0..4], 0)) {
            try t.expectError(error.InvalidIccTagReserved, table.parse(t.allocator, bytes, .{ .policy = .bounded }));
            reserved_rejected += 1;
            continue;
        }
        var used: [36]bool = @splat(false);
        for (a..a + alen) |at| used[at - 156] = true;
        var overlaps = false;
        for (b..b + blen) |at| {
            overlaps = overlaps or used[at - 156];
            used[at - 156] = true;
        }
        var gaps: usize = 0;
        for (used) |present| if (!present) {
            gaps += 1;
        };
        const shared = a == b and alen == blen;
        var result = try table.parse(t.allocator, bytes, .{ .policy = .bounded });
        defer result.deinit(t.allocator);
        try t.expectEqual(a, result.tags[0].offset);
        try t.expectEqual(b, result.tags[1].offset);
        try t.expectEqual(gaps, result.storage.unreferenced_bytes);
        try t.expectEqual(@as(usize, @intFromBool(shared)), result.storage.shared_entries);
        try t.expectEqual(@as(usize, @intFromBool(overlaps and !shared)), result.storage.overlapping_elements);
        const strict_ok = gaps == 0 and (!overlaps or shared);
        if (table.parse(t.allocator, bytes, .{ .policy = .icc_2022 })) |value| {
            var strict = value;
            defer strict.deinit(t.allocator);
            try t.expect(strict_ok and strict.storage.layout_validated);
        } else |err| {
            try t.expect(!strict_ok);
            try t.expect(err == error.InvalidIccTagGap or err == error.InvalidIccTagOverlap);
        }
        checked += 1;
    };
    try t.expectEqual(@as(usize, 960), checked);
    try t.expectEqual(@as(usize, 336), reserved_rejected);
}

test "ICC tag final padding trailing storage and aligned out of range offsets" {
    const short_pad = try f.make(t.allocator, 153, &.{.{ .signature = "aTag".*, .offset = 144, .size = 9 }});
    defer t.allocator.free(short_pad);
    try t.expectError(error.InvalidIccTagPadding, table.parse(t.allocator, short_pad, .{ .policy = .icc_2022 }));
    const tail = try f.make(t.allocator, 156, &.{.{ .signature = "aTag".*, .offset = 144, .size = 8 }});
    defer t.allocator.free(tail);
    try t.expectError(error.InvalidIccTagGap, table.parse(t.allocator, tail, .{ .policy = .icc_2022 }));
    for ([_]u32{ 156, 160, 0xfffffffc }) |offset| {
        std.mem.writeInt(u32, tail[136..140], offset, .big);
        try t.expectError(error.InvalidIccTagBounds, table.parse(t.allocator, tail, .{ .policy = .bounded }));
    }
    const padded = try f.make(t.allocator, 156, &.{.{ .signature = "aTag".*, .offset = 144, .size = 9 }});
    defer t.allocator.free(padded);
    for (153..156) |at| {
        padded[at] = 1;
        try t.expectError(error.InvalidIccTagPadding, table.parse(t.allocator, padded, .{ .policy = .icc_2022 }));
        padded[at] = 0;
    }
    for (148..152) |at| for (1..256) |value| {
        padded[at] = @intCast(value);
        try t.expectError(error.InvalidIccTagReserved, table.parse(t.allocator, padded, .{ .policy = .bounded }));
        padded[at] = 0;
    };
    const empty = try f.make(t.allocator, 136, &.{});
    defer t.allocator.free(empty);
    try t.expectError(error.InvalidIccTagGap, table.parse(t.allocator, empty, .{ .policy = .icc_2022 }));
}
