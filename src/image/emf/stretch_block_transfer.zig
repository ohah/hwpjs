const std = @import("std");
const bit_blt_core = @import("bit_blt_core.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const fixed_size = bit_blt_core.byte_size + 8;
pub const StretchBlt = struct {
    core: bit_blt_core.Core,
    source_size: geometry.SizeL,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?StretchBlt {
    if (record.kind != .stretchblt) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfStretchBltSize;
    const core = bit_blt_core.parse(record.bytes, end) catch |err| switch (err) {
        error.MissingEmfBltSourceBitmap => return error.MissingEmfStretchBltSourceBitmap,
        else => return err,
    };
    return .{
        .core = core,
        .source_size = try geometry.parseSizeL(record.bytes[100..108]),
        .trailing_data = record.bytes[core.semanticEnd(end)..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn sourceRecord() [140]u8 {
    var bytes = [_]u8{0} ** 140;
    std.mem.writeInt(u32, bytes[40..44], 0x00cc0020, .little);
    std.mem.writeInt(i32, bytes[100..104], -7, .little);
    std.mem.writeInt(i32, bytes[104..108], 9, .little);
    std.mem.writeInt(u32, bytes[84..88], 112, .little);
    std.mem.writeInt(u32, bytes[88..92], 18, .little);
    std.mem.writeInt(u32, bytes[92..96], 132, .little);
    std.mem.writeInt(u32, bytes[96..100], 8, .little);
    std.mem.writeInt(u32, bytes[112..116], 12, .little);
    std.mem.writeInt(u16, bytes[116..118], 2, .little);
    std.mem.writeInt(u16, bytes[118..120], 2, .little);
    std.mem.writeInt(u16, bytes[120..122], 1, .little);
    std.mem.writeInt(u16, bytes[122..124], 1, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfStretchBltParseError else |_| return;
}

test "STRETCHBLT adds signed source dimensions and uses its own bitmap boundary" {
    var bytes = sourceRecord();
    std.mem.writeInt(i32, bytes[24..28], -3, .little);
    const value = (try parse(fixture(.stretchblt, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -3), value.core.destination.x);
    try std.testing.expectEqual(@as(i32, -7), value.source_size.width);
    try std.testing.expectEqual(@as(i32, 9), value.source_size.height);
    try std.testing.expectEqual(@as(usize, 4), value.core.bitmap.?.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 2), value.core.bitmap.?.between_bmi_and_bits.len);

    var extended: [144]u8 = undefined;
    @memcpy(extended[0..140], &bytes);
    extended[140..].* = .{ 1, 2, 3, 4 };
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, (try parse(fixture(.stretchblt, &extended))).?.trailing_data);
}

test "STRETCHBLT checks omission every fixed and dynamic cut and unrelated types" {
    var bytes = [_]u8{0} ** fixed_size;
    std.mem.writeInt(u32, bytes[40..44], 0x00f00021, .little);
    try std.testing.expect((try parse(fixture(.stretchblt, &bytes))).?.core.bitmap == null);
    std.mem.writeInt(u32, bytes[40..44], 0x00cc0020, .little);
    try std.testing.expectError(error.MissingEmfStretchBltSourceBitmap, parse(fixture(.stretchblt, &bytes)));
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfStretchBltSize, parse(fixture(.stretchblt, bytes[0..cut])));
    var mismatch = fixture(.stretchblt, &bytes);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfStretchBltSize, parse(mismatch));
    const source = sourceRecord();
    for (fixed_size..source.len) |cut| try expectParseError(fixture(.stretchblt, source[0..cut]));
    try std.testing.expect((try parse(fixture(.bitblt, source[0..fixed_size]))) == null);
}
