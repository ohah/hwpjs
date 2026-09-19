const binary = @import("../../binary/reader.zig");
const path = @import("emf_plus_path.zig");

pub fn read(reader: *binary.Reader, options: path.Options, max_path_bytes: usize) !path.Path {
    var next = reader.*;
    const signed_size = try next.readInt(i32);
    if (signed_size < 0) return error.InvalidEmfPlusNestedPathSize;
    const size: usize = @intCast(signed_size);
    if (size > max_path_bytes) return error.LimitExceeded;
    const value = try path.parse(try next.take(size), options);
    reader.* = next;
    return value;
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    @import("std").mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    @import("std").mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

test "EMF+ sized Path delegates the exact declared slice atomically" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 17;
    putI32(&bytes, 0, 12);
    putU32(&bytes, 4, 0xdbc01001);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try read(&reader, .{}, 12);
    try std.testing.expectEqual(@as(u32, 0), value.point_count);
    try std.testing.expectEqual(@as(usize, 16), reader.offset);
    try std.testing.expectEqual(@as(u8, 0), bytes[reader.offset]);

    var invalid = bytes;
    putI32(&invalid, 0, -1);
    reader = .{ .bytes = &invalid };
    try std.testing.expectError(error.InvalidEmfPlusNestedPathSize, read(&reader, .{}, 12));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    putI32(&invalid, 0, 13);
    reader = .{ .bytes = &invalid };
    try std.testing.expectError(error.LimitExceeded, read(&reader, .{}, 12));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    putI32(&invalid, 0, 12);
    reader = .{ .bytes = invalid[0..15] };
    try std.testing.expectError(error.UnexpectedEnd, read(&reader, .{}, 12));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    var malformed = bytes;
    putU32(&malformed, 4, 0);
    reader = .{ .bytes = &malformed };
    try std.testing.expectError(error.InvalidEmfPlusMetafileSignature, read(&reader, .{}, 12));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}
