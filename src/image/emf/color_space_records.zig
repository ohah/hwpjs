const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const Action = union(enum) {
    set: u32,
    delete: u32,
};

pub fn parse(record: records.Record) !?Action {
    const action: enum { set, delete } = switch (record.kind) {
        .setcolorspace => .set,
        .deletecolorspace => .delete,
        else => return null,
    };
    if (!record_extent.hasRequiredPrefix(record, 12)) return switch (action) {
        .set => error.InvalidEmfSetColorSpaceRecordSize,
        .delete => error.InvalidEmfDeleteColorSpaceRecordSize,
    };
    const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
    return switch (action) {
        .set => .{ .set = handle },
        .delete => .{ .delete = handle },
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn handleRecord(handle: u32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    return bytes;
}

test "color-space manipulation records preserve handles" {
    const values = [_]u32{ 0, 1, 0x80000000, std.math.maxInt(u32) };
    for (values) |handle| {
        try std.testing.expectEqual(handle, (try parse(fixture(.setcolorspace, &handleRecord(handle)))).?.set);
        try std.testing.expectEqual(handle, (try parse(fixture(.deletecolorspace, &handleRecord(handle)))).?.delete);
    }
}

test "color-space manipulation records require prefixes and accept trailing data" {
    const short = [_]u8{0} ** 8;
    const long = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfSetColorSpaceRecordSize, parse(fixture(.setcolorspace, &short)));
    try std.testing.expectEqual(@as(u32, 0), (try parse(fixture(.setcolorspace, &long))).?.set);
    try std.testing.expectError(error.InvalidEmfDeleteColorSpaceRecordSize, parse(fixture(.deletecolorspace, &short)));
    try std.testing.expectEqual(@as(u32, 0), (try parse(fixture(.deletecolorspace, &long))).?.delete);

    var mismatched = fixture(.setcolorspace, &short);
    mismatched.size = 12;
    try std.testing.expectError(error.InvalidEmfSetColorSpaceRecordSize, parse(mismatched));
}

test "color-space parser does not claim neighboring object records" {
    const bytes = [_]u8{0} ** 12;
    try std.testing.expect((try parse(fixture(.deleteobject, &bytes))) == null);
    try std.testing.expect((try parse(fixture(.selectobject, &bytes))) == null);
}
