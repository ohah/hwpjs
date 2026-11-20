const std = @import("std");
const patcher = @import("line_layout_patch.zig");
const codec = @import("../body/line_segment_writer.zig");
const framing = @import("../record_writer.zig");
const records = @import("../record.zig");
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05000300 };
const text = [_]u8{ 0x00, 0xac, 0x3d, 0xd8, 0x00, 0xde, 65, 0, 10, 0, 0x98, 0xb0, 13, 0 };
fn segment(start: u32, y: i32, flags: u32) codec.Segment {
    return .{ .start = start, .y = y, .height = 100, .text_height = 80, .baseline = 60, .spacing = 20, .x = 0, .width = 500, .flags = codec.line_ends | flags };
}
fn lines() [2]codec.Segment {
    return .{ segment(0, 0, 3), segment(5, 120, 0) };
}
fn fixture(count: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (0..count) |index| {
        var header: [22]u8 = @splat(0);
        std.mem.writeInt(u32, header[0..4], 0x80000007, .little);
        std.mem.writeInt(u16, header[12..14], 1, .little);
        std.mem.writeInt(u32, header[18..22], @intCast(index + 1), .little);
        try framing.append(a, &out, 66, 0, &header, 65536);
        try framing.append(a, &out, 67, 1, &text, 65536);
        try framing.append(a, &out, 68, 1, &@as([8]u8, @splat(0)), 65536);
        // Opaque direct record must retain its exact bytes and relative order.
        try framing.append(a, &out, 507, 1, &.{ 0xde, 0xad, 0xbe, 0xef, @intCast(index) }, 65536);
    }
    return out.toOwnedSlice(a);
}
test "layout segment writer exact table62 field offsets signed values and supported versions" {
    var values = lines();
    values[0].x = -20;
    for ([_]u32{ 0x05000107, 0x05000300, 0x05000304 }) |raw| {
        const bytes = try codec.encode(a, &text, .{ .raw = raw }, &values, 1000);
        defer a.free(bytes);
        try std.testing.expectEqual(@as(usize, 72), bytes.len);
        try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[0..4], .little));
        try std.testing.expectEqual(@as(i32, 100), std.mem.readInt(i32, bytes[8..12], .little));
        try std.testing.expectEqual(@as(i32, 80), std.mem.readInt(i32, bytes[12..16], .little));
        try std.testing.expectEqual(@as(i32, 60), std.mem.readInt(i32, bytes[16..20], .little));
        try std.testing.expectEqual(@as(i32, 20), std.mem.readInt(i32, bytes[20..24], .little));
        try std.testing.expectEqual(@as(i32, -20), std.mem.readInt(i32, bytes[24..28], .little));
        try std.testing.expectEqual(@as(i32, 500), std.mem.readInt(i32, bytes[28..32], .little));
        try std.testing.expectEqual(@as(u32, 0x60003), std.mem.readInt(u32, bytes[32..36], .little));
        try std.testing.expectEqual(@as(u32, 5), std.mem.readInt(u32, bytes[36..40], .little));
    }
    try std.testing.expectError(error.UnsupportedLayoutWriteVersion, codec.encode(a, &text, .{ .raw = 0x05010000 }, &values, 1000));
}
test "layout segment writer rejects surrogate interiors unflowed hard breaks and guessed empty flags" {
    var values = lines();
    values[1].start = 2;
    try std.testing.expectError(error.InvalidLayoutTextCoverage, codec.encode(a, &text, version, &values, 1000));
    values = lines();
    try std.testing.expectError(error.UnflowedHardBreak, codec.encode(a, &text, version, values[0..1], 1000));
    var empty = [_]codec.Segment{segment(0, 0, 3 | (1 << 16))};
    const bytes = try codec.encode(a, &.{ 13, 0 }, version, &empty, 1000);
    a.free(bytes);
    empty[0].flags &= ~@as(u32, 1 << 16);
    try std.testing.expectError(error.WrongLayoutEmptyFlag, codec.encode(a, &.{ 13, 0 }, version, &empty, 1000));
}
test "layout section patch changes only selected header count and tag69 preserves source and opaque neighbors" {
    const source = try fixture(2);
    defer a.free(source);
    const snapshot = try a.dupe(u8, source);
    defer a.free(snapshot);
    const values = lines();
    const result = try patcher.prepare(a, source, version, &.{.{ .header_ordinal = 0, .expected_text = &text, .segments = &values }}, 65536);
    defer result.deinit(a);
    var before = records.Iterator.init(source, .{});
    var after = records.Iterator.init(result.bytes, .{});
    var ordinal: usize = 0;
    while (try before.next()) |old| : (ordinal += 1) {
        if (ordinal == 3) {
            const cache = (try after.next()).?;
            try std.testing.expectEqual(@as(u10, 69), cache.tag);
            try std.testing.expectEqual(@as(u10, 1), cache.level);
            try std.testing.expectEqual(@as(usize, 72), cache.payload.len);
        }
        const current = (try after.next()).?;
        if (ordinal == 0) {
            try std.testing.expectEqualSlices(u8, old.raw[0..20], current.raw[0..20]);
            try std.testing.expectEqual(@as(u16, 2), std.mem.readInt(u16, current.payload[16..18], .little));
            try std.testing.expectEqualSlices(u8, old.payload[18..], current.payload[18..]);
        } else try std.testing.expectEqualSlices(u8, old.raw, current.raw);
    }
    try std.testing.expect((try after.next()) == null);
    try std.testing.expectEqualSlices(u8, snapshot, source);
}
test "layout section patch repeated cache refresh is byte exact and preserves explicit source version" {
    const source = try fixture(1);
    defer a.free(source);
    const values = lines();
    const patches = [_]patcher.Patch{.{ .header_ordinal = 0, .expected_text = &text, .segments = &values }};
    for ([_]u32{ 0x05000107, 0x05000300 }) |raw| {
        const first = try patcher.prepare(a, source, .{ .raw = raw }, &patches, 65536);
        defer first.deinit(a);
        const next = try patcher.prepare(a, first.bytes, .{ .raw = raw }, &patches, 65536);
        defer next.deinit(a);
        try std.testing.expectEqualSlices(u8, first.bytes, next.bytes);
    }
}
test "layout section patch late source mismatch unordered plans and budgets leave original bytes unchanged" {
    const source = try fixture(2);
    defer a.free(source);
    const snapshot = try a.dupe(u8, source);
    defer a.free(snapshot);
    const values = lines();
    try std.testing.expectError(error.LayoutSourceChanged, patcher.prepare(a, source, version, &.{ .{ .header_ordinal = 0, .expected_text = &text, .segments = &values }, .{ .header_ordinal = 4, .expected_text = &.{ 13, 0 }, .segments = &values } }, 65536));
    try std.testing.expectError(error.UnorderedLayoutPatch, patcher.prepare(a, source, version, &.{ .{ .header_ordinal = 4, .expected_text = &text, .segments = &values }, .{ .header_ordinal = 0, .expected_text = &text, .segments = &values } }, 65536));
    try std.testing.expectError(error.LimitExceeded, patcher.prepare(a, source, version, &.{.{ .header_ordinal = 0, .expected_text = &text, .segments = &values }}, source.len));
    try std.testing.expectEqualSlices(u8, snapshot, source);
}
test "layout section patch work stays linear across disjoint edited paragraphs" {
    const values = lines();
    for ([_]usize{ 4, 8 }) |count| {
        const source = try fixture(count);
        defer a.free(source);
        const patches = try a.alloc(patcher.Patch, count);
        defer a.free(patches);
        for (patches, 0..) |*patch, i| patch.* = .{ .header_ordinal = i * 4, .expected_text = &text, .segments = &values };
        const result = try patcher.prepare(a, source, version, patches, 65536);
        defer result.deinit(a);
        try std.testing.expectEqual(count * 7, result.records_visited);
        try std.testing.expectEqual(count, result.patched_paragraphs);
    }
}

test "layout section patch identical layout retains original extended header and cache framing" {
    const source = try fixture(1);
    defer a.free(source);
    const values = lines();
    const patches = [_]patcher.Patch{.{ .header_ordinal = 0, .expected_text = &text, .segments = &values }};
    const first = try patcher.prepare(a, source, version, &patches, 65536);
    defer first.deinit(a);
    var extended: std.ArrayList(u8) = .empty;
    defer extended.deinit(a);
    var iterator = records.Iterator.init(first.bytes, .{});
    while (try iterator.next()) |record| {
        if (record.tag == 66 or record.tag == 69) {
            var frame: [8]u8 = undefined;
            std.mem.writeInt(u32, frame[0..4], @as(u32, record.tag) | (@as(u32, record.level) << 10) | 0xfff00000, .little);
            std.mem.writeInt(u32, frame[4..8], @intCast(record.payload.len), .little);
            try extended.appendSlice(a, &frame);
            try extended.appendSlice(a, record.payload);
        } else try extended.appendSlice(a, record.raw);
    }
    const repeated = try patcher.prepare(a, extended.items, version, &patches, 65536);
    defer repeated.deinit(a);
    try std.testing.expectEqualSlices(u8, extended.items, repeated.bytes);
}
