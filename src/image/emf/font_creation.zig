const std = @import("std");
const extended_font = @import("extended_font.zig");
const records = @import("records.zig");

pub const minimum_size: usize = 12 + extended_font.panose_size;
pub const maximum_size: usize = 12 + extended_font.ex_size + @import("design_vector.zig").maximum_size;
pub const Font = union(enum) { panose: extended_font.LogFontPanose, ex_dv: extended_font.LogFontExDv };
pub const Creation = struct { handle: u32, font: Font };

pub fn parse(record: records.Record) !?Creation {
    if (record.kind != .extcreatefontindirectw) return null;
    if (record.size != record.bytes.len or record.bytes.len < minimum_size or record.bytes.len > maximum_size)
        return error.InvalidEmfFontCreationRecordSize;
    const payload = record.bytes[12..];
    return .{
        .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
        .font = if (payload.len == extended_font.panose_size)
            .{ .panose = try extended_font.parsePanose(payload) }
        else
            .{ .ex_dv = try extended_font.parseExDv(payload) },
    };
}

fn initValidPanoseRecord(bytes: []u8, handle: u32) void {
    std.debug.assert(bytes.len == minimum_size);
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(i32, bytes[28..32], 400, .little);
}

fn fixture(bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = .extcreatefontindirectw, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "font creation distinguishes exact Panose and variable ExDv payloads" {
    var fixed: [minimum_size]u8 = undefined;
    initValidPanoseRecord(&fixed, 7);
    const first = (try parse(fixture(&fixed))).?;
    try std.testing.expectEqual(@as(u32, 7), first.handle);
    try std.testing.expect(first.font == .panose);

    var variable = [_]u8{0} ** (12 + extended_font.ex_size + 12);
    std.mem.writeInt(u32, variable[8..12], 9, .little);
    std.mem.writeInt(i32, variable[28..32], 400, .little);
    std.mem.writeInt(u32, variable[360..364], @import("design_vector.zig").signature, .little);
    std.mem.writeInt(u32, variable[364..368], 1, .little);
    std.mem.writeInt(i32, variable[368..372], -1, .little);
    const second = (try parse(fixture(&variable))).?;
    try std.testing.expectEqual(@as(i32, -1), try second.font.ex_dv.design.valueAt(0));
}

test "font creation rejects every short size gap and declared boundary mismatch" {
    var bytes: [minimum_size]u8 = undefined;
    initValidPanoseRecord(&bytes, 1);
    for (0..minimum_size) |cut| try std.testing.expectError(error.InvalidEmfFontCreationRecordSize, parse(fixture(bytes[0..cut])));
    var wrong = fixture(&bytes);
    wrong.size -= 4;
    try std.testing.expectError(error.InvalidEmfFontCreationRecordSize, parse(wrong));
    var gap = [_]u8{0} ** (minimum_size + 1);
    try std.testing.expectError(error.InvalidEmfLogFontExDvSize, parse(fixture(&gap)));
    try std.testing.expect((try parse(.{ .offset = 0, .kind = .savedc, .size = 8, .bytes = bytes[0..8], .end = 8 })) == null);
}

test "font creation accepts every DesignVector axis count and rejects every Panose-to-ExDv gap" {
    var bytes = [_]u8{0} ** maximum_size;
    std.mem.writeInt(i32, bytes[28..32], 400, .little);
    for (minimum_size + 1..12 + extended_font.ex_size + @import("design_vector.zig").minimum_size) |length|
        try std.testing.expectError(error.InvalidEmfLogFontExDvSize, parse(fixture(bytes[0..length])));
    for (0..@import("design_vector.zig").maximum_axes + 1) |count| {
        const length = 12 + extended_font.ex_size + 8 + count * 4;
        @memset(bytes[12 + extended_font.ex_size .. length], 0);
        std.mem.writeInt(u32, bytes[12 + extended_font.ex_size ..][0..4], @import("design_vector.zig").signature, .little);
        std.mem.writeInt(u32, bytes[12 + extended_font.ex_size + 4 ..][0..4], @intCast(count), .little);
        if (count != 0) std.mem.writeInt(i32, bytes[length - 4 ..][0..4], std.math.minInt(i32), .little);
        const value = (try parse(fixture(bytes[0..length]))).?;
        try std.testing.expectEqual(@as(u32, @intCast(count)), value.font.ex_dv.design.count);
        if (count != 0) try std.testing.expectEqual(@as(i32, std.math.minInt(i32)), try value.font.ex_dv.design.valueAt(count - 1));
    }
}

test "font creation record size classifies all bytes as Panose or ExDv payload" {
    var panose_with_tail: [minimum_size + 4]u8 = undefined;
    initValidPanoseRecord(panose_with_tail[0..minimum_size], 1);
    panose_with_tail[minimum_size..].* = .{ 1, 2, 3, 4 };
    try std.testing.expectError(error.InvalidEmfLogFontExDvSize, parse(fixture(&panose_with_tail)));

    var ex_dv_with_tail = [_]u8{0} ** (12 + extended_font.ex_size + @import("design_vector.zig").minimum_size + 4);
    std.mem.writeInt(i32, ex_dv_with_tail[28..32], 400, .little);
    std.mem.writeInt(u32, ex_dv_with_tail[12 + extended_font.ex_size ..][0..4], @import("design_vector.zig").signature, .little);
    try std.testing.expectError(error.InvalidEmfDesignVectorSize, parse(fixture(&ex_dv_with_tail)));

    const oversized = [_]u8{0} ** (maximum_size + 4);
    try std.testing.expectError(error.InvalidEmfFontCreationRecordSize, parse(fixture(&oversized)));
}
