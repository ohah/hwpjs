const Reader = @import("../../binary/reader.zig").Reader;
const utf16 = @import("../utf16_string.zig");
pub const tag: u10 = 94;
/// Explicit observed layout, not a complete normative FORBIDDEN_CHAR grammar.
/// Four DWORD code-unit counts precede all four UTF-16LE lists.
/// Ordinals stay uninterpreted; empty, NUL and invalid Unicode are not normalized.
pub const Lists = struct {
    lists: [4][]const u8,
    extra: []const u8,
    pub fn parseObserved(bytes: []const u8) !Lists {
        var r: Reader = .{ .bytes = bytes };
        var counts: [4]u32 = undefined;
        for (&counts) |*count| count.* = try r.readInt(u32);
        var lists: [4][]const u8 = undefined;
        for (&lists, counts) |*list, count| list.* = try utf16.readUnits(&r, count);
        return .{ .lists = lists, .extra = bytes[r.offset..] };
    }
};
