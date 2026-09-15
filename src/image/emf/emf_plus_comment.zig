const record = @import("emf_plus_record.zig");

pub const Comment = struct {
    flags: u16,
    private_data: []const u8,
};

pub fn parse(value: record.Record) ?Comment {
    if (value.kind != .comment) return null;
    return .{
        .flags = value.flags,
        .private_data = value.data,
    };
}

test "EMF+ comment preserves arbitrary private data and ignored flags" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u16, bytes[0..2], 0x4003, .little);
    std.mem.writeInt(u16, bytes[2..4], 0xffff, .little);
    std.mem.writeInt(u32, bytes[4..8], 20, .little);
    std.mem.writeInt(u32, bytes[8..12], 8, .little);
    bytes[12..20].* = .{ 0, 1, 2, 3, 0xfc, 0xfd, 0xfe, 0xff };
    var iterator: record.Iterator = .{ .bytes = &bytes };
    const value = parse((try iterator.next()).?).?;
    try std.testing.expectEqual(@as(u16, 0xffff), value.flags);
    try std.testing.expectEqualSlices(u8, bytes[12..20], value.private_data);

    var empty = [_]u8{0} ** 12;
    std.mem.writeInt(u16, empty[0..2], 0x4003, .little);
    std.mem.writeInt(u32, empty[4..8], 12, .little);
    var empty_iterator: record.Iterator = .{ .bytes = &empty };
    try std.testing.expectEqual(@as(usize, 0), parse((try empty_iterator.next()).?).?.private_data.len);

    empty[0] = 0x04;
    var other_iterator: record.Iterator = .{ .bytes = &empty };
    try std.testing.expect(parse((try other_iterator.next()).?) == null);
}
