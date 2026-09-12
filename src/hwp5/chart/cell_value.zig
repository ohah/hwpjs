const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;

pub const Value = union(enum) {
    empty,
    string: struct { bytes: []const u8, trailer: u8 },
    number: struct { bits: u64, trailer: u16 },
};

/// Observed v1 payload only; no type/base references. Strings borrow the input
/// and remain byte-exact, without decoding, trimming or fallback. Float bits
/// preserve NaNs, signed zero and infinities without arithmetic conversion.
pub fn read(reader: *Reader, name: []const u8, max_string_bytes: usize) !Value {
    var next = reader.*;
    const value: Value = if (std.mem.eql(u8, name, "VtString\x00")) blk: {
        const count = try next.readInt(u16);
        if (count > max_string_bytes) return error.LimitExceeded;
        const bytes = try next.take(count);
        break :blk .{ .string = .{ .bytes = bytes, .trailer = try next.readInt(u8) } };
    } else if (std.mem.eql(u8, name, "VtDouble\x00"))
        .{ .number = .{ .bits = try next.readInt(u64), .trailer = try next.readInt(u16) } }
    else
        return error.UnsupportedChartClass;
    reader.* = next;
    return value;
}
