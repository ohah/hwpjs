const std = @import("std");
pub const entry_size = 12;
pub const Tag = struct {
    signature: [4]u8,
    offset: usize,
    data: []const u8,
    type_signature: [4]u8,
};
/// Bounds and the common eight-byte tag-type prefix only; content stays borrowed.
pub fn parse(entry: []const u8, bytes: []const u8, table_end: usize) !Tag {
    if (entry.len != entry_size) return error.InvalidIccTagEntrySize;
    const offset: usize = std.mem.readInt(u32, entry[4..8], .big);
    const len: usize = std.mem.readInt(u32, entry[8..12], .big);
    if (offset < table_end or offset % 4 != 0) return error.InvalidIccTagOffset;
    if (offset > bytes.len or len > bytes.len - offset) return error.InvalidIccTagBounds;
    if (len < 8) return error.InvalidIccTagDataSize;
    const data = bytes[offset..][0..len];
    if (!std.mem.allEqual(u8, data[4..8], 0)) return error.InvalidIccTagReserved;
    return .{ .signature = entry[0..4].*, .offset = offset, .data = data, .type_signature = data[0..4].* };
}
