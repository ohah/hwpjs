//! Scalar DocInfo source values; no inferred numbering or current caret state.
const std = @import("std");
pub const Snapshot = struct {
    source_record: usize,
    section_count: u16,
    page_start: u16,
    footnote_start: u16,
    endnote_start: u16,
    picture_start: u16,
    table_start: u16,
    equation_start: u16,
    caret_list: u32,
    caret_paragraph: u32,
    caret_character: u32,
    extra_bytes: usize,
    extra_nonzero: bool,
};
pub fn read(raw: []const u8, version: @import("../version.zig").Version) !Snapshot {
    var iterator = try @import("../docinfo/reader.zig").Iterator.init(raw, version, .{});
    var found: ?Snapshot = null;
    var index: usize = 0;
    while (try iterator.next()) |record| : (index += 1) {
        if (record.value != .properties) continue;
        if (found != null) return error.DuplicateDocumentProperties;
        const p = record.value.properties;
        var nonzero = false;
        for (p.extra) |byte| if (byte != 0) {
            nonzero = true;
            break;
        };
        found = .{ .source_record = index, .section_count = p.section_count, .page_start = p.page_start, .footnote_start = p.footnote_start, .endnote_start = p.endnote_start, .picture_start = p.picture_start, .table_start = p.table_start, .equation_start = p.equation_start, .caret_list = p.caret_list, .caret_paragraph = p.caret_paragraph, .caret_character = p.caret_character, .extra_bytes = p.extra.len, .extra_nonzero = nonzero };
    }
    return found orelse error.MissingDocumentProperties;
}

test "HWP5 document properties snapshot preserves zero and rejects malformed source ownership" {
    var raw = @as([30]u8, @splat(0));
    std.mem.writeInt(u32, raw[0..4], 16 | (26 << 20), .little);
    const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
    const row = try read(&raw, version);
    try std.testing.expectEqual(@as(u16, 0), row.page_start);
    try std.testing.expectEqual(@as(u32, 0), row.caret_list);
    try std.testing.expectError(error.DuplicateDocumentProperties, read(&(raw ++ raw), version));
    try std.testing.expectError(error.MissingDocumentProperties, read(&.{}, version));
    var bad = raw;
    std.mem.writeInt(u32, bad[0..4], 16 | (1 << 10) | (26 << 20), .little);
    try std.testing.expectError(error.InvalidDocInfoLevel, read(&bad, version));
    for (1..raw.len) |length| try std.testing.expectError(error.UnexpectedEnd, read(raw[0..length], version));
}

test "HWP5 document properties snapshot actual source and getter allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("style_preservation.zig").Session.open(a, input);
    defer session.close();
    const expected = try session.documentProperties(a);
    try std.testing.expectEqual(@as(u16, 1), expected.section_count);
    try std.testing.expectEqual(@as(u16, 1), expected.page_start);
    try std.testing.expectEqual(@as(usize, 0), expected.extra_bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("style_preservation.zig").Session, values: Snapshot) !void {
            try std.testing.expectEqualDeep(values, try source.documentProperties(allocator));
        }
    }.run, .{ session, expected });
}
