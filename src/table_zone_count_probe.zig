const std = @import("std");
const Table = @import("hwp5/body/table.zig").Table;

test "observed absent zone count never accepts partial fields or zones" {
    var bytes: [36]u8 = @splat(0);
    bytes[4] = 1;
    bytes[6] = 1;
    const version: @import("hwp5/version.zig").Version = .{ .raw = 0x05000400 };
    for (0..22) |length| try std.testing.expectError(error.UnexpectedEnd, Table.parseWithZoneCountPolicy(bytes[0..length], version, .observed_absent));
    try std.testing.expectError(error.UnexpectedEnd, Table.parse(bytes[0..22], version));
    const absent = try Table.parseWithZoneCountPolicy(bytes[0..22], version, .observed_absent);
    try std.testing.expect(absent.zones == null);
    try std.testing.expectEqual(@as(usize, 0), absent.extra.len);
    try std.testing.expectError(error.UnexpectedEnd, Table.parseWithZoneCountPolicy(bytes[0..23], version, .observed_absent));
    const empty = try Table.parseWithZoneCountPolicy(bytes[0..24], version, .observed_absent);
    try std.testing.expectEqual(@as(usize, 0), empty.zones.?.count());
    bytes[22] = 1;
    for (24..34) |length| try std.testing.expectError(error.UnexpectedEnd, Table.parseWithZoneCountPolicy(bytes[0..length], version, .observed_absent));
    const present = try Table.parseWithZoneCountPolicy(&bytes, version, .observed_absent);
    try std.testing.expectEqual(@as(usize, 1), present.zones.?.count());
    try std.testing.expectEqual(@as(usize, 2), present.extra.len);
}

test "actual empty cell fixture edits without rewriting missing table zone counts" {
    const a = std.testing.allocator;
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/253E164F57A1BC6934-empty.hwp", a, .limited(32 * 1024 * 1024));
    defer a.free(input);
    var fixture_source = try @import("hwp5/text_source.zig").Source.openReadOnly(a, input);
    defer fixture_source.deinit();
    // Match the explicit public normalization path, not implicit editor repair.
    const baseline = fixture_source.file.bytes;
    for ([_]usize{ 1, 2, 3, 5 }) |paragraph| {
        const editor = try Session.open(a, baseline);
        defer editor.close();
        try editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "검증😀" } });
        const saved = try editor.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        const text = try reopened.copyText(a, 0, paragraph);
        defer a.free(text);
        try std.testing.expectEqualSlices(u8, &.{ 0x80, 0xac, 0x9d, 0xc9, 0x3d, 0xd8, 0x00, 0xde, 0x0d, 0 }, text);
        var before = try @import("hwp5/text_source.zig").Source.openReadOnly(a, input);
        defer before.deinit();
        var after = try @import("hwp5/text_source.zig").Source.openReadOnly(a, saved.bytes);
        defer after.deinit();
        const original_section = try before.decodeSection(a, 0);
        defer a.free(original_section);
        const saved_section = try after.decodeSection(a, 0);
        defer a.free(saved_section);
        var original_records = @import("hwp5/record.zig").Iterator.init(original_section, .{});
        var saved_records = @import("hwp5/record.zig").Iterator.init(saved_section, .{});
        var count: usize = 0;
        while (try original_records.next()) |record| {
            if (record.tag != 77) continue;
            const next = while (try saved_records.next()) |candidate| {
                if (candidate.tag == 77) break candidate;
            } else return error.TestExpectedEqual;
            try std.testing.expectEqualSlices(u8, record.raw, next.raw);
            count += 1;
        }
        try std.testing.expectEqual(@as(usize, 2), count);
    }
}
