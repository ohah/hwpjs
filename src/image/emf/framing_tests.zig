const std = @import("std");
const t = std.testing;
const framing = @import("framing.zig");

fn fixture() [108]u8 {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    std.mem.writeInt(u32, bytes[4..8], 88, .little);
    std.mem.writeInt(i32, bytes[8..12], -1, .little);
    std.mem.writeInt(i32, bytes[20..24], 20, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x464d4520, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 2, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(i32, bytes[72..76], 1920, .little);
    std.mem.writeInt(i32, bytes[76..80], 1080, .little);
    std.mem.writeInt(i32, bytes[80..84], 508, .little);
    std.mem.writeInt(i32, bytes[84..88], 285, .little);
    std.mem.writeInt(u32, bytes[88..92], 14, .little);
    std.mem.writeInt(u32, bytes[92..96], 20, .little);
    std.mem.writeInt(u32, bytes[104..108], 20, .little);
    return bytes;
}

test "EMF framing validates header declarations and terminal EOF" {
    const bytes = fixture();
    const value = try framing.validate(&bytes);
    try t.expectEqual(@as(usize, 2), value.records);
    try t.expectEqual(@as(u32, 108), value.header.bytes);
    try t.expectEqual(@as(i32, -1), value.header.bounds.left);
    try t.expectEqual(@as(i32, 20), value.header.bounds.bottom);
    try t.expectEqual(@as(i32, 1920), value.header.device.width);
    try t.expectEqual(@as(i32, 285), value.header.millimeters.height);
}

test "EMF framing rejects fixed header and EOF invariant drift" {
    var bytes = fixture();
    bytes[40] = 0;
    try t.expectError(error.InvalidEmfSignature, framing.validate(&bytes));
    bytes = fixture();
    bytes[58] = 1;
    try t.expectError(error.InvalidEmfHeaderReserved, framing.validate(&bytes));
    bytes = fixture();
    bytes[48] -= 1;
    try t.expectError(error.InvalidEmfDeclaredBytes, framing.validate(&bytes));
    bytes = fixture();
    bytes[52] = 3;
    try t.expectError(error.InvalidEmfDeclaredRecords, framing.validate(&bytes));
    bytes = fixture();
    bytes[104] = 19;
    try t.expectError(error.InvalidEmfEofSizeLast, framing.validate(&bytes));
}

test "EMF record iterator rejects truncation alignment and data after EOF" {
    const bytes = fixture();
    try t.expectError(error.MissingEmfHeader, framing.validate(bytes[0..0]));
    for (1..88) |cut| try t.expectError(error.TruncatedEmfRecord, framing.validate(bytes[0..cut]));
    var header_only = bytes[0..88].*;
    std.mem.writeInt(u32, header_only[48..52], header_only.len, .little);
    try t.expectError(error.MissingEmfEof, framing.validate(&header_only));
    for (89..108) |cut| {
        var truncated = bytes;
        std.mem.writeInt(u32, truncated[48..52], @intCast(cut), .little);
        try t.expectError(error.TruncatedEmfRecord, framing.validate(truncated[0..cut]));
    }
    var invalid = bytes;
    invalid[4] = 87;
    try t.expectError(error.InvalidEmfRecordSize, framing.validate(&invalid));
    invalid = bytes;
    std.mem.writeInt(u32, invalid[92..96], 16, .little);
    try t.expectError(error.InvalidEmfEofSize, framing.validate(&invalid));

    var trailing = bytes ++ [_]u8{0} ** 4;
    std.mem.writeInt(u32, trailing[48..52], trailing.len, .little);
    try t.expectError(error.DataAfterEmfEof, framing.validate(&trailing));
}
