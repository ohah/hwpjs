const binary = @import("../../binary/reader.zig");
const custom_line_cap = @import("emf_plus_custom_line_cap.zig");

pub fn read(reader: *binary.Reader, options: custom_line_cap.Options, max_bytes: usize) !custom_line_cap.CustomLineCap {
    var next = reader.*;
    const declared = try next.readInt(u32);
    if (@as(u64, declared) > max_bytes) return error.LimitExceeded;
    const bytes = try next.take(@intCast(declared));
    const result = try custom_line_cap.parse(bytes, options);
    reader.* = next;
    return result;
}

test "EMF+ sized custom cap uses the declared slice and atomic cursor" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 61;
    std.mem.writeInt(u32, bytes[0..4], 56, .little);
    std.mem.writeInt(u32, bytes[4..8], 0xdbc01001, .little);
    bytes[60] = 0xaa;
    var reader: binary.Reader = .{ .bytes = &bytes };
    _ = try read(&reader, .{}, 56);
    try std.testing.expectEqual(@as(usize, 60), reader.offset);
    try std.testing.expectEqual(@as(u8, 0xaa), (try reader.take(1))[0]);

    reader.offset = 0;
    try std.testing.expectError(error.LimitExceeded, read(&reader, .{}, 55));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    reader.bytes = bytes[0..59];
    try std.testing.expectError(error.UnexpectedEnd, read(&reader, .{}, 56));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}
