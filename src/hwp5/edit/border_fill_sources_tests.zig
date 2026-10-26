const std = @import("std");
const sources = @import("border_fill_sources.zig");
const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };
const append = @import("../record_writer.zig").append;

test "HWP5 border source preserves IDs interleaved colors and absent additional fields" {
    const a = std.testing.allocator;
    var payload: [48]u8 = @splat(0);
    std.mem.writeInt(u16, payload[0..2], 0x2345, .little);
    for (0..5) |edge| {
        payload[2 + edge * 6] = @intCast(edge);
        payload[3 + edge * 6] = @intCast(edge + 1);
        std.mem.writeInt(u32, payload[4 + edge * 6 ..][0..4], @as(u32, 0x030201) + @as(u32, @intCast(edge)), .little);
    }
    std.mem.writeInt(u32, payload[32..36], 1, .little);
    std.mem.writeInt(u32, payload[36..40], 0xffffffff, .little);
    std.mem.writeInt(i32, payload[44..48], -1, .little);
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try append(a, &raw, 999, 0, &.{}, 4096);
    try append(a, &raw, 20, 1, &payload, 4096);
    const rows = try sources.read(a, raw.items, version, 1);
    defer sources.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(u32, 1), rows[0].id);
    try std.testing.expectEqual(@as(usize, 1), rows[0].record_index);
    try std.testing.expectEqual(@as(u16, 0x2345), rows[0].attributes);
    try std.testing.expectEqual(@as(u32, 0x030205), rows[0].borders[4].color);
    try std.testing.expectEqual(@as(u32, 0xffffffff), rows[0].pattern.?.background);
    try std.testing.expectEqual(@as(i32, -1), rows[0].pattern.?.kind);
    try std.testing.expectEqual(@as(?bool, false), rows[0].additional_present);
    try std.testing.expectError(error.LimitExceeded, sources.read(a, raw.items, version, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, expected: []const sources.Source) !void {
            const actual = try sources.read(allocator, input, version, 1);
            defer sources.deinit(allocator, actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw.items, rows });
}

test "HWP5 border source owns gradient arrays and refuses partial source fields" {
    const a = std.testing.allocator;
    var payload: [70]u8 = @splat(0);
    std.mem.writeInt(u32, payload[32..36], 4, .little);
    payload[36] = 1;
    std.mem.writeInt(u32, payload[53..57], 2, .little);
    std.mem.writeInt(u32, payload[57..61], 0x112233, .little);
    std.mem.writeInt(u32, payload[61..65], 0x445566, .little);
    std.mem.writeInt(u32, payload[65..69], 1, .little);
    payload[69] = 70;
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try append(a, &raw, 20, 1, &payload, 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            const rows = try sources.read(allocator, input, version, 1);
            defer sources.deinit(allocator, rows);
            try std.testing.expectEqualSlices(u32, &.{ 0x112233, 0x445566 }, rows[0].gradient.?.colors);
            try std.testing.expectEqual(@as(?u8, 70), rows[0].gradient.?.blur_center);
        }
    }.run, .{raw.items});
    const rows = try sources.read(a, raw.items, version, 1);
    defer sources.deinit(a, rows);
    @memset(raw.items, 0);
    try std.testing.expectEqual(@as(u32, 0x445566), rows[0].gradient.?.colors[1]);
    raw.clearRetainingCapacity();
    try append(a, &raw, 20, 1, payload[0..68], 4096);
    try std.testing.expectError(error.UnexpectedEnd, sources.read(a, raw.items, version, 1));
}

test "HWP5 border source actual table references resolve to one based resources" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const docinfo = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(docinfo);
    const rows = try sources.read(a, docinfo, source.header.version(), 65535);
    defer sources.deinit(a, rows);
    try std.testing.expect(rows.len > 0);
    for (rows, 0..) |row, index| try std.testing.expectEqual(@as(u32, @intCast(index + 1)), row.id);
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    const cells = try @import("cell_layout_sources.zig").read(a, section, source.header.version());
    defer a.free(cells);
    try std.testing.expect(cells.len > 0);
    for (cells) |cell| {
        const resolved = @import("../docinfo/reference_rules.zig").resolve(.optional_one_based, cell.border_fill_id, rows.len);
        switch (resolved) {
            .ordinal => |ordinal| try std.testing.expectEqual(@as(u32, cell.border_fill_id), rows[ordinal].id),
            .absent => {},
            .invalid => return error.InvalidCellBorderFillReference,
        }
    }
}

test "HWP5 border source unknown fill is distinct from absent fields and repeated resources keep IDs" {
    const a = std.testing.allocator;
    var payload: [40]u8 = @splat(0);
    std.mem.writeInt(u32, payload[32..36], 0x80000001, .little);
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    for (0..2) |_| try append(a, &raw, 20, 1, &payload, 4096);
    const rows = try sources.read(a, raw.items, version, 2);
    defer sources.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqual(@as(u32, 2), rows[1].id);
    try std.testing.expect(!rows[0].fill_known);
    try std.testing.expectEqual(@as(?usize, 4), rows[0].unknown_fill_bytes);
    try std.testing.expectEqual(@as(?bool, null), rows[0].additional_present);
    try std.testing.expectEqual(@as(?@import("../docinfo/fill.zig").Pattern, null), rows[0].pattern);
    try std.testing.expectError(error.LimitExceeded, sources.read(a, raw.items, version, 1));
    try std.testing.expectError(error.UnsupportedVersion, sources.read(a, raw.items, .{ .raw = 0x04000000 }, 2));
    try append(a, &raw, 20, 0, &payload, 4096);
    try std.testing.expectError(error.InvalidDocInfoLevel, sources.read(a, raw.items, version, 3));
}

test "HWP5 border source keeps absent alpha distinct from exact per type bytes and opaque tails" {
    const a = std.testing.allocator;
    var payload: [54]u8 = @splat(0);
    std.mem.writeInt(u32, payload[32..36], 1, .little);
    payload[52] = 123;
    for ([_]usize{ 52, 53, 54 }) |length| {
        var raw: std.ArrayList(u8) = .empty;
        defer raw.deinit(a);
        try append(a, &raw, 20, 1, payload[0..length], 4096);
        const rows = try sources.read(a, raw.items, version, 1);
        defer sources.deinit(a, rows);
        if (length == 53) {
            try std.testing.expectEqual(@as(?u8, 123), rows[0].alpha.?.pattern);
            try std.testing.expectEqual(@as(?u8, null), rows[0].alpha.?.image);
            try std.testing.expectEqual(@as(?usize, 0), rows[0].extra_bytes);
        } else {
            try std.testing.expectEqual(@as(?@import("../docinfo/fill_alpha.zig").Alpha, null), rows[0].alpha);
            try std.testing.expectEqual(@as(?usize, length - 52), rows[0].extra_bytes);
        }
    }
}
