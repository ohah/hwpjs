const std = @import("std");
const dib_colors = @import("dib_colors.zig");
const dib_payload = @import("dib_payload.zig");
const dib_sections = @import("dib_sections.zig");
const records = @import("records.zig");

pub const fixed_size = 32;
pub const Kind = enum { monochrome, dib_pattern };
pub const Creation = struct {
    kind: Kind,
    handle: u32,
    sections: dib_sections.Sections,
    dib: dib_payload.Payload,
};

pub fn parse(record: records.Record) !?Creation {
    const kind: Kind = switch (record.kind) {
        .createmonobrush => .monochrome,
        .createdibpatternbrushpt => .dib_pattern,
        else => return null,
    };
    if (record.size != record.bytes.len or record.bytes.len < fixed_size)
        return error.InvalidEmfBitmapBrushRecordSize;
    const usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[12..16], .little));
    const sections = (try dib_sections.parse(record.bytes, fixed_size, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[16..20], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[20..24], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[24..28], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[28..32], .little),
    })) orelse return error.MissingEmfBitmapBrushDib;
    return .{
        .kind = kind,
        .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
        .sections = sections,
        .dib = try dib_payload.parse(sections.bmi, sections.bits, usage, .{ .require_monochrome = kind == .monochrome }),
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn monochromeRecord() [60]u8 {
    var bytes = [_]u8{0} ** 60;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[16..20], 32, .little);
    std.mem.writeInt(u32, bytes[20..24], 18, .little);
    std.mem.writeInt(u32, bytes[24..28], 50, .little);
    std.mem.writeInt(u32, bytes[28..32], 8, .little);
    std.mem.writeInt(u32, bytes[32..36], 12, .little);
    std.mem.writeInt(u16, bytes[36..38], 2, .little);
    std.mem.writeInt(u16, bytes[38..40], 2, .little);
    std.mem.writeInt(u16, bytes[40..42], 1, .little);
    std.mem.writeInt(u16, bytes[42..44], 1, .little);
    return bytes;
}

test "both bitmap brush records share DIB framing and differ in mono policy" {
    const bytes = monochromeRecord();
    const mono = (try parse(fixture(.createmonobrush, &bytes))).?;
    try std.testing.expectEqual(Kind.monochrome, mono.kind);
    try std.testing.expectEqual(@as(u16, 1), mono.dib.header.bit_count);
    const pattern = (try parse(fixture(.createdibpatternbrushpt, &bytes))).?;
    try std.testing.expectEqual(Kind.dib_pattern, pattern.kind);
}

test "bitmap brush rejects missing malformed non-mono and wrong record boundaries" {
    var bytes = monochromeRecord();
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfBitmapBrushRecordSize, parse(fixture(.createmonobrush, bytes[0..cut])));
    var wrong_declared = fixture(.createdibpatternbrushpt, &bytes);
    wrong_declared.size -= 4;
    try std.testing.expectError(error.InvalidEmfBitmapBrushRecordSize, parse(wrong_declared));

    var missing = [_]u8{0} ** fixed_size;
    try std.testing.expectError(error.MissingEmfBitmapBrushDib, parse(fixture(.createmonobrush, &missing)));
    std.mem.writeInt(u32, bytes[12..16], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.createdibpatternbrushpt, &bytes)));
    std.mem.writeInt(u32, bytes[12..16], 0, .little);
    std.mem.writeInt(u16, bytes[42..44], 4, .little);
    try std.testing.expectError(error.InvalidEmfMonochromeBrushBitCount, parse(fixture(.createmonobrush, &bytes)));
    try std.testing.expect((try parse(fixture(.savedc, bytes[0..8]))) == null);
}
