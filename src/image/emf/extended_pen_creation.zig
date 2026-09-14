const std = @import("std");
const dib_sections = @import("dib_sections.zig");
const log_pen_ex = @import("log_pen_ex.zig");
const records = @import("records.zig");

pub const minimum_size = 28 + log_pen_ex.fixed_size;

pub const Creation = struct {
    handle: u32,
    pen: log_pen_ex.LogPenEx,
    dib: ?dib_sections.Sections,
};

pub fn parse(record: records.Record) !?Creation {
    if (record.kind != .extcreatepen) return null;
    if (record.size != record.bytes.len or record.bytes.len < minimum_size)
        return error.InvalidEmfExtCreatePenRecordSize;
    const pen = try log_pen_ex.parsePrefix(record.bytes[28..]);
    const fixed_end = 28 + pen.consumed;
    return .{
        .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
        .pen = pen,
        .dib = try dib_sections.parse(record.bytes, fixed_end, .{
            .bmi_offset = std.mem.readInt(u32, record.bytes[12..16], .little),
            .bmi_size = std.mem.readInt(u32, record.bytes[16..20], .little),
            .bits_offset = std.mem.readInt(u32, record.bytes[20..24], .little),
            .bits_size = std.mem.readInt(u32, record.bytes[24..28], .little),
        }),
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn minimumRecord() [minimum_size]u8 {
    var bytes = [_]u8{0} ** minimum_size;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[32..36], 1, .little);
    return bytes;
}

test "extended pen parses minimum and detached packed DIB layouts" {
    const minimum = minimumRecord();
    const plain = (try parse(fixture(.extcreatepen, &minimum))).?;
    try std.testing.expectEqual(@as(u32, 1), plain.handle);
    try std.testing.expect(plain.dib == null);

    var bytes = [_]u8{0} ** 68;
    @memcpy(bytes[0..minimum_size], &minimum);
    std.mem.writeInt(u32, bytes[12..16], 56, .little);
    std.mem.writeInt(u32, bytes[16..20], 8, .little);
    std.mem.writeInt(u32, bytes[20..24], 64, .little);
    std.mem.writeInt(u32, bytes[24..28], 1, .little);
    const with_dib = (try parse(fixture(.extcreatepen, &bytes))).?;
    try std.testing.expectEqual(@as(usize, 4), with_dib.dib.?.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 3), with_dib.dib.?.padding.len);
}

test "extended pen validates declared actual dynamic and DIB boundaries" {
    var bytes = minimumRecord();
    for (0..minimum_size) |cut| try std.testing.expectError(error.InvalidEmfExtCreatePenRecordSize, parse(fixture(.extcreatepen, bytes[0..cut])));
    var wrong_declared = fixture(.extcreatepen, &bytes);
    wrong_declared.size -= 4;
    try std.testing.expectError(error.InvalidEmfExtCreatePenRecordSize, parse(wrong_declared));
    std.mem.writeInt(u32, bytes[48..52], 1, .little);
    try std.testing.expectError(error.TruncatedEmfPenStyleEntries, parse(fixture(.extcreatepen, &bytes)));
    try std.testing.expect((try parse(fixture(.savedc, bytes[0..8]))) == null);
}
