const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const Value = union(enum) { i32: i32, filetime: u64, utf16: []const u8, dictionary: []const u8, unsupported: []const u8 };
pub const Parsed = struct { value: Value, extra: []const u8 };
/// HWP's PID 0 is a dictionary, NOT a TypedPropertyValue even if it starts at 1.
pub fn parse(id: u32, raw: []const u8) !Parsed {
    if (id == 0) return .{ .value = .{ .dictionary = raw }, .extra = &.{} };
    var r: Reader = .{ .bytes = raw };
    const tag = try r.readInt(u32);
    const value: Value = switch (tag) {
        3 => .{ .i32 = try r.readInt(i32) },
        64 => .{ .filetime = try r.readInt(u64) },
        31 => blk: {
            const count = try r.readInt(u32);
            if (count > (raw.len - r.offset) / 2) return error.UnexpectedEnd;
            const bytes = try r.take(@as(usize, count) * 2);
            if (bytes.len != 0 and !std.mem.allEqual(u8, bytes[bytes.len - 2 ..], 0)) return error.InvalidSummaryTerminator;
            const padding = (4 - (bytes.len % 4)) % 4;
            if (!std.mem.allEqual(u8, try r.take(padding), 0)) return error.InvalidSummaryPadding;
            break :blk .{ .utf16 = bytes };
        },
        else => return .{ .value = .{ .unsupported = raw }, .extra = &.{} },
    };
    return .{ .value = value, .extra = raw[r.offset..] };
}
