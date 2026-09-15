const std = @import("std");
const record_type = @import("emf_plus_record_type.zig");

pub const header_size = 12;

pub const Record = struct {
    offset: usize,
    kind: record_type.RecordType,
    flags: u16,
    size: u32,
    data_size: u32,
    data: []const u8,
    bytes: []const u8,
};

pub const Iterator = struct {
    bytes: []const u8,
    offset: usize = 0,

    pub fn next(self: *Iterator) !?Record {
        if (self.offset == self.bytes.len) return null;
        if (self.bytes.len - self.offset < header_size) return error.TruncatedEmfPlusRecordHeader;

        const start = self.offset;
        const kind = try record_type.parse(std.mem.readInt(u16, self.bytes[start..][0..2], .little));
        const flags = std.mem.readInt(u16, self.bytes[start..][2..4], .little);
        const size = std.mem.readInt(u32, self.bytes[start..][4..8], .little);
        const data_size = std.mem.readInt(u32, self.bytes[start..][8..12], .little);
        if (size < header_size or size % 4 != 0) return error.InvalidEmfPlusRecordSize;
        if (@as(u64, data_size) + header_size != size) return error.InvalidEmfPlusDataSize;
        if (size > self.bytes.len - start) return error.TruncatedEmfPlusRecord;
        const end = start + @as(usize, size);

        self.offset = end;
        return .{
            .offset = start,
            .kind = kind,
            .flags = flags,
            .size = size,
            .data_size = data_size,
            .data = self.bytes[start + header_size .. end],
            .bytes = self.bytes[start..end],
        };
    }
};

test "EMF+ iterator preserves fields and advances atomically" {
    var bytes = [_]u8{0} ** 32;
    std.mem.writeInt(u16, bytes[0..2], 0x4003, .little);
    std.mem.writeInt(u16, bytes[2..4], 0xa55a, .little);
    std.mem.writeInt(u32, bytes[4..8], 16, .little);
    std.mem.writeInt(u32, bytes[8..12], 4, .little);
    bytes[12..16].* = .{ 1, 2, 3, 4 };
    std.mem.writeInt(u16, bytes[16..18], 0x4004, .little);
    std.mem.writeInt(u32, bytes[20..24], 16, .little);
    std.mem.writeInt(u32, bytes[24..28], 4, .little);
    bytes[28..32].* = .{ 5, 6, 7, 8 };
    var iterator: Iterator = .{ .bytes = &bytes };
    const first = (try iterator.next()).?;
    try std.testing.expectEqual(record_type.RecordType.comment, first.kind);
    try std.testing.expectEqual(@as(u16, 0xa55a), first.flags);
    try std.testing.expectEqualSlices(u8, bytes[12..16], first.data);
    try std.testing.expectEqual(@as(usize, 16), iterator.offset);
    _ = (try iterator.next()).?;
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ iterator rejects all malformed framing without advancing" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u16, bytes[0..2], 0x4003, .little);
    std.mem.writeInt(u32, bytes[4..8], 16, .little);
    std.mem.writeInt(u32, bytes[8..12], 4, .little);
    var empty_iterator: Iterator = .{ .bytes = bytes[0..0] };
    try std.testing.expect((try empty_iterator.next()) == null);
    for (1..header_size) |cut| {
        var iterator: Iterator = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, iterator.next());
        try std.testing.expectEqual(@as(usize, 0), iterator.offset);
    }
    const cases = [_]struct { size: u32, data_size: u32, expected: anyerror }{
        .{ .size = 8, .data_size = 0, .expected = error.InvalidEmfPlusRecordSize },
        .{ .size = 13, .data_size = 1, .expected = error.InvalidEmfPlusRecordSize },
        .{ .size = 16, .data_size = 1, .expected = error.InvalidEmfPlusDataSize },
        .{ .size = 16, .data_size = 0, .expected = error.InvalidEmfPlusDataSize },
        .{ .size = 20, .data_size = 8, .expected = error.TruncatedEmfPlusRecord },
        .{ .size = 0xfffffffC, .data_size = 0xfffffff0, .expected = error.TruncatedEmfPlusRecord },
    };
    for (cases) |case| {
        std.mem.writeInt(u32, bytes[4..8], case.size, .little);
        std.mem.writeInt(u32, bytes[8..12], case.data_size, .little);
        var iterator: Iterator = .{ .bytes = &bytes };
        try std.testing.expectError(case.expected, iterator.next());
        try std.testing.expectEqual(@as(usize, 0), iterator.offset);
    }
}
