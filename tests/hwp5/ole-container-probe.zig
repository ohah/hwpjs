const std = @import("std");
const core = @import("hwpjs");

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var reader: core.Reader = .{ .bytes = bytes };
    const layout = try reader.readInt(u8);
    if (layout > 1) return error.InvalidMode;
    var file = try core.hwp5.ole_container.open(a, bytes[reader.offset..], @enumFromInt(layout), .{ .max_input_bytes = limit });
    defer file.deinit();
    return a.dupe(u8, file.bytes);
}
